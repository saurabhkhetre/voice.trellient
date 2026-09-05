import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { requireAgentOwnership } from "@/lib/supabase/require-business";

const outboundInput = z.object({
  agentConfigId: z.string().uuid(),
  destinationNumber: z.string().min(5).max(20),
  /** Optional: which phone number to call from. */
  phoneNumberId: z.string().uuid().optional(),
});

export type OutboundCallResult =
  | { ok: true; callId: string; roomName: string }
  | { ok: false; error: string };

/**
 * Initiates an outbound call:
 * 1. Validates agent ownership
 * 2. Creates call record
 * 3. Creates LiveKit room with agent metadata
 * 4. The Python agent auto-joins via dispatch
 * 5. A SIP participant would be created to dial the destination
 */
export const createOutboundCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: { agentConfigId: string; destinationNumber: string; phoneNumberId?: string }) =>
    outboundInput.parse(raw),
  )
  .handler(async ({ data, context }): Promise<OutboundCallResult> => {
    // Verify ownership
    let ownership: { businessId: string; agentName: string };
    try {
      ownership = await requireAgentOwnership(
        context.supabase,
        context.userId,
        data.agentConfigId,
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Access denied." };
    }

    // Validate LiveKit credentials
    const url = process.env["LIVEKIT_URL"];
    const apiKey = process.env["LIVEKIT_API_KEY"];
    const apiSecret = process.env["LIVEKIT_API_SECRET"];
    if (!url || !apiKey || !apiSecret) {
      return { ok: false, error: "Voice runtime is not configured." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const suffix = Math.random().toString(36).slice(2, 10);
    const roomName = `outbound-${data.destinationNumber.replace(/\D/g, "").slice(-8)}-${suffix}`;

    // Create call record
    const { data: callRow, error: callErr } = await supabaseAdmin
      .from("calls")
      .insert({
        business_id: ownership.businessId,
        agent_config_id: data.agentConfigId,
        provider: "sip",
        provider_call_id: roomName,
        direction: "outbound" as const,
        destination_number: data.destinationNumber,
        status: "ringing" as const,
      })
      .select("id")
      .single();

    if (callErr || !callRow) {
      return { ok: false, error: `Failed to create call record: ${callErr?.message}` };
    }

    // Create LiveKit room
    const roomMetadata = JSON.stringify({
      business_id: ownership.businessId,
      agent_config_id: data.agentConfigId,
      call_id: callRow.id,
      mode: "outbound",
      destination_number: data.destinationNumber,
    });

    try {
      const { RoomServiceClient } = await import("livekit-server-sdk");
      const httpUrl = url.replace("wss://", "https://").replace("ws://", "http://");
      const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await roomService.createRoom({ name: roomName, metadata: roomMetadata });
    } catch (err) {
      // Update call status to failed
      await supabaseAdmin
        .from("calls")
        .update({ status: "failed" as const })
        .eq("id", callRow.id);
      return {
        ok: false,
        error: `Failed to create voice room: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }

    // Note: SIP participant creation requires a configured SIP trunk.
    // This would be: roomService.createSIPParticipant(...)
    // For now, the call is in "ringing" state waiting for SIP trunk provisioning.

    return {
      ok: true,
      callId: callRow.id,
      roomName,
    };
  });
