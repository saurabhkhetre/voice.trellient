import { createFileRoute } from "@tanstack/react-router";

import { createExotelProvider } from "@/lib/telephony/exotel";

/**
 * Inbound-call webhook. Exotel calls this when a customer dials the business
 * number. The handler records the call, then answers with the room the agent
 * worker should join. Callers are authenticated with a shared webhook token,
 * because /api/public/* bypasses site auth by design.
 */
export const Route = createFileRoute("/api/public/telephony/exotel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEPHONY_WEBHOOK_TOKEN"];
        const provided = request.headers.get("x-webhook-token");
        if (!token || provided !== token) {
          return json({ error: "Unauthorized" }, 401);
        }

        const contentType = request.headers.get("content-type") ?? "";
        const payload: Record<string, unknown> = contentType.includes("application/json")
          ? ((await request.json()) as Record<string, unknown>)
          : Object.fromEntries(new URLSearchParams(await request.text()));

        const provider = createExotelProvider();
        const inbound = provider.parseInbound(payload);

        const destination = inbound.destinationNumber;
        if (!destination) return json({ error: "Missing destination number" }, 400);

        const { getPool } = await import("@/lib/db/pg.server");
        const pool = getPool();

        // Exotel retries webhooks; answer a repeat with the call already opened.
        const { rows: existing } = await pool.query<{
          id: string;
          business_id: string;
          agent_config_id: string | null;
          room_name: string | null;
        }>(
          `SELECT id, business_id, agent_config_id, room_name
           FROM calls
           WHERE provider = $1 AND provider_call_id = $2
           LIMIT 1`,
          [provider.name, inbound.providerCallId],
        );
        const repeat = existing[0];
        if (repeat) {
          return json({
            action: "connect",
            room: repeat.room_name ?? inbound.roomName,
            call_id: repeat.id,
            business_id: repeat.business_id,
            agent_config_id: repeat.agent_config_id,
          });
        }

        // phone_numbers is the source of truth for agent assignment and
        // business ownership; businesses.phone is the legacy fallback.
        let businessId: string;
        let agentConfigId: string | null = null;
        let phoneNumberId: string | null = null;
        const { rows: numbers } = await pool.query<{
          id: string;
          business_id: string;
          agent_config_id: string | null;
        }>(
          `SELECT id, business_id, agent_config_id
           FROM phone_numbers
           WHERE phone_number = $1 AND active
           LIMIT 1`,
          [destination],
        );
        const number = numbers[0];
        if (number) {
          businessId = number.business_id;
          agentConfigId = number.agent_config_id;
          phoneNumberId = number.id;
        } else {
          const { rows: businesses } = await pool.query<{ id: string }>(
            `SELECT id FROM businesses WHERE phone = $1 LIMIT 1`,
            [destination],
          );
          const business = businesses[0];
          if (!business) return json({ error: "Unknown destination number" }, 404);
          businessId = business.id;
        }

        // Verify the assigned agent is still enabled.
        if (agentConfigId) {
          const { rows } = await pool.query<{ enabled: boolean }>(
            `SELECT enabled FROM agent_configs WHERE id = $1`,
            [agentConfigId],
          );
          const assigned = rows[0];
          if (assigned && !assigned.enabled) {
            return json({ action: "reject", reason: "agent_disabled" });
          }
          if (!assigned) agentConfigId = null;
        }

        // If no agent is assigned to the number, fall back to the first enabled agent.
        if (!agentConfigId) {
          const { rows } = await pool.query<{ id: string }>(
            `SELECT id FROM agent_configs
             WHERE business_id = $1 AND enabled
             ORDER BY created_at ASC
             LIMIT 1`,
            [businessId],
          );
          const fallback = rows[0];
          if (!fallback) return json({ action: "reject", reason: "no_active_agent" });
          agentConfigId = fallback.id;
        }

        let customerId: string | null = null;
        if (inbound.callerNumber) {
          const { rows } = await pool.query<{ id: string }>(
            `INSERT INTO customers (business_id, phone)
             VALUES ($1, $2)
             ON CONFLICT (business_id, phone) DO UPDATE SET phone = EXCLUDED.phone
             RETURNING id`,
            [businessId, inbound.callerNumber],
          );
          customerId = rows[0]?.id ?? null;
        }

        let callId: string;
        try {
          const { rows } = await pool.query<{ id: string }>(
            `INSERT INTO calls
               (business_id, customer_id, agent_config_id, phone_number_id, provider, provider_call_id,
                room_name, direction, caller_number, destination_number, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'inbound', $8, $9, 'in_progress')
             RETURNING id`,
            [
              businessId,
              customerId,
              agentConfigId,
              phoneNumberId,
              provider.name,
              inbound.providerCallId,
              inbound.roomName,
              inbound.callerNumber,
              destination,
            ],
          );
          callId = rows[0]!.id;
        } catch {
          return json({ error: "Could not record the call" }, 500);
        }

        // The agent reads business context from room metadata, so create the
        // room up front. Best effort: the LiveKit SIP dispatch rule must route
        // the caller into this same room name.
        try {
          const { createRoom } = await import("@/lib/livekit/sip");
          await createRoom(inbound.roomName, {
            business_id: businessId,
            agent_config_id: agentConfigId,
            call_id: callId,
            caller_number: inbound.callerNumber,
            provider: provider.name,
            mode: "inbound",
          });
        } catch {
          // LiveKit not configured, or the room already exists — the call can still connect.
        }

        return json({
          action: "connect",
          room: inbound.roomName,
          call_id: callId,
          business_id: businessId,
          agent_config_id: agentConfigId,
        });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
