import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { requireAgentOwnership } from "@/lib/auth/access";

const outboundInput = z.object({
  agentConfigId: z.string().uuid(),
  destinationNumber: z
    .string()
    .transform((value) => value.replace(/[\s()-]/g, ""))
    .pipe(z.string().regex(/^\+?[0-9]{6,15}$/, "Enter the number in international format, e.g. +919876543210.")),
  /** Optional: which of the workspace's numbers to call from. */
  phoneNumberId: z.string().uuid().optional(),
});

export type OutboundCallResult =
  | { ok: true; callId: string; roomName: string }
  | { ok: false; error: string };

/**
 * Initiates an outbound call:
 * 1. Validates agent ownership and picks the SIP trunk to dial from
 * 2. Creates the call record
 * 3. Creates a LiveKit room with agent metadata (the Python agent auto-joins)
 * 4. Adds a SIP participant that dials the destination into that room
 */
export const createOutboundCall = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { agentConfigId: string; destinationNumber: string; phoneNumberId?: string }) =>
    outboundInput.parse(raw),
  )
  .handler(async ({ data, context }): Promise<OutboundCallResult> => {
    let ownership: { businessId: string; agentName: string };
    try {
      ownership = await requireAgentOwnership(context.userId, data.agentConfigId);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Access denied." };
    }

    const url = process.env["LIVEKIT_URL"];
    const apiKey = process.env["LIVEKIT_API_KEY"];
    const apiSecret = process.env["LIVEKIT_API_SECRET"];
    if (!url || !apiKey || !apiSecret) {
      return { ok: false, error: "Voice runtime is not configured." };
    }

    const pool = getPool();

    // The SIP trunk that places the call: the chosen number's own trunk, else
    // the workspace-wide default from the environment.
    let trunkId = process.env["LIVEKIT_SIP_OUTBOUND_TRUNK_ID"] || null;
    let fromNumber: string | undefined;
    let phoneNumberId: string | null = null;
    if (data.phoneNumberId) {
      const { rows } = await pool.query<{
        id: string;
        phone_number: string;
        outbound_trunk_id: string | null;
        outbound_enabled: boolean;
      }>(
        `SELECT id, phone_number, outbound_trunk_id, outbound_enabled
         FROM phone_numbers
         WHERE id = $1 AND business_id = $2 AND active`,
        [data.phoneNumberId, ownership.businessId],
      );
      const number = rows[0];
      if (!number) return { ok: false, error: "That phone number isn't active in this workspace." };
      if (!number.outbound_enabled) return { ok: false, error: "Outbound calling is turned off for that number." };
      trunkId = number.outbound_trunk_id || trunkId;
      fromNumber = number.phone_number;
      phoneNumberId = number.id;
    }
    if (!trunkId) {
      return {
        ok: false,
        error:
          "Outbound calling needs a LiveKit SIP trunk. Set LIVEKIT_SIP_OUTBOUND_TRUNK_ID, or add a trunk to the number you're calling from.",
      };
    }

    const suffix = Math.random().toString(36).slice(2, 10);
    const roomName = `outbound-${data.destinationNumber.replace(/\D/g, "").slice(-8)}-${suffix}`;

    const { rows: callRows } = await pool.query<{ id: string }>(
      `INSERT INTO calls
         (business_id, agent_config_id, phone_number_id, provider, provider_call_id, room_name,
          direction, caller_number, destination_number, status)
       VALUES ($1, $2, $3, 'sip', $4, $4, 'outbound', $5, $6, 'ringing')
       RETURNING id`,
      [ownership.businessId, data.agentConfigId, phoneNumberId, roomName, fromNumber ?? null, data.destinationNumber],
    );
    const callId = callRows[0]!.id;

    try {
      const { createRoom } = await import("@/lib/livekit/sip");
      await createRoom(roomName, {
        business_id: ownership.businessId,
        agent_config_id: data.agentConfigId,
        call_id: callId,
        mode: "outbound",
        destination_number: data.destinationNumber,
      });

      const { SipClient } = await import("livekit-server-sdk");
      const sip = new SipClient(url.replace(/^ws/, "http"), apiKey, apiSecret);
      await sip.createSipParticipant(trunkId, data.destinationNumber, roomName, {
        participantIdentity: `sip-${callId.slice(0, 8)}`,
        participantName: data.destinationNumber,
        ...(fromNumber ? { fromNumber } : {}),
      });
    } catch (err) {
      await pool.query(`UPDATE calls SET status = 'failed', ended_at = now() WHERE id = $1`, [callId]);
      return {
        ok: false,
        error: `Could not place the call: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }

    return { ok: true, callId, roomName };
  });
