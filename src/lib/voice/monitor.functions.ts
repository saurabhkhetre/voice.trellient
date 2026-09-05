import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { requireBusinessMembership } from "@/lib/supabase/require-business";

const monitorInput = z.object({
  callId: z.string().uuid(),
  roomName: z.string().min(1),
});

export type MonitorSession =
  | { ok: true; token: string; serverUrl: string; roomName: string }
  | { ok: false; error: string };

/**
 * Mints a subscribe-only LiveKit token for listening to an active call.
 * The token can subscribe to audio and data (transcripts) but cannot publish.
 */
export const createCallMonitorSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: { callId: string; roomName: string }) => monitorInput.parse(raw))
  .handler(async ({ data, context }): Promise<MonitorSession> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify call exists and belongs to user's workspace
    const { data: call, error: callErr } = await supabaseAdmin
      .from("calls")
      .select("id, business_id, status")
      .eq("id", data.callId)
      .maybeSingle();

    if (callErr || !call) {
      return { ok: false, error: "Call not found." };
    }

    if (!["ringing", "in_progress"].includes(call.status)) {
      return { ok: false, error: "This call is no longer active." };
    }

    // Verify user has access
    try {
      await requireBusinessMembership(context.supabase, context.userId, call.business_id);
    } catch {
      return { ok: false, error: "You do not have access to this call." };
    }

    // Mint subscriber-only token
    const url = process.env["LIVEKIT_URL"];
    const apiKey = process.env["LIVEKIT_API_KEY"];
    const apiSecret = process.env["LIVEKIT_API_SECRET"];
    if (!url || !apiKey || !apiSecret) {
      return { ok: false, error: "Voice runtime is not configured." };
    }

    const { AccessToken } = await import("livekit-server-sdk");
    const identity = `monitor-${context.userId.slice(0, 8)}-${Date.now()}`;
    const ttl = 60 * 30; // 30 minutes
    const at = new AccessToken(apiKey, apiSecret, { identity, ttl });
    at.addGrant({
      room: data.roomName,
      roomJoin: true,
      canSubscribe: true,
      canPublish: false,        // Monitor cannot speak
      canPublishData: false,    // Monitor cannot send data
      hidden: true,             // Don't show monitor as a participant
    });

    return {
      ok: true,
      token: await at.toJwt(),
      serverUrl: url,
      roomName: data.roomName,
    };
  });
