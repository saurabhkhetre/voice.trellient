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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Look up the dialed number in phone_numbers — this is the source of
        // truth for agent assignment and business ownership.
        const { data: phoneRow } = await supabaseAdmin
          .from("phone_numbers")
          .select("id, business_id, agent_config_id, active")
          .eq("phone_number", destination)
          .eq("active", true)
          .maybeSingle();

        if (!phoneRow) {
          // Fallback: try matching on businesses.phone for backwards compatibility
          const { data: business } = await supabaseAdmin
            .from("businesses")
            .select("id")
            .eq("phone", destination)
            .maybeSingle();
          if (!business) return json({ error: "Unknown destination number" }, 404);
          // Legacy path — no agent assignment from phone_numbers
          var businessId = business.id;
          var agentConfigId: string | null = null;
        } else {
          var businessId = phoneRow.business_id;
          var agentConfigId = phoneRow.agent_config_id;
        }

        // If no agent assigned via phone number, fall back to the first enabled agent
        if (!agentConfigId) {
          const { data: config } = await supabaseAdmin
            .from("agent_configs")
            .select("id, enabled")
            .eq("business_id", businessId)
            .eq("enabled", true)
            .limit(1)
            .maybeSingle();

          if (!config) {
            return json({ action: "reject", reason: "no_active_agent" });
          }
          agentConfigId = config.id;
        } else {
          // Verify the assigned agent is still enabled
          const { data: config } = await supabaseAdmin
            .from("agent_configs")
            .select("id, enabled")
            .eq("id", agentConfigId)
            .maybeSingle();

          if (config && !config.enabled) {
            return json({ action: "reject", reason: "agent_disabled" });
          }
        }

        let customerId: string | null = null;
        if (inbound.callerNumber) {
          const { data: existing } = await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("business_id", businessId)
            .eq("phone", inbound.callerNumber)
            .maybeSingle();
          if (existing) {
            customerId = existing.id;
          } else {
            const { data: created } = await supabaseAdmin
              .from("customers")
              .insert({ business_id: businessId, phone: inbound.callerNumber })
              .select("id")
              .single();
            customerId = created?.id ?? null;
          }
        }

        const { data: call, error } = await supabaseAdmin
          .from("calls")
          .insert({
            business_id: businessId,
            customer_id: customerId,
            agent_config_id: agentConfigId,
            provider: provider.name,
            provider_call_id: inbound.providerCallId,
            direction: "inbound",
            caller_number: inbound.callerNumber,
            destination_number: destination,
            status: "in_progress",
          })
          .select("id")
          .single();
        if (error) return json({ error: "Could not record the call" }, 500);

        return json({
          action: "connect",
          room: inbound.roomName,
          call_id: call.id,
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
