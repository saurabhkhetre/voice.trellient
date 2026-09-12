import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { requireBusinessMembership } from "@/lib/auth/access";

const monitorInput = z.object({
  callId: z.string().uuid(),
  /** Ignored: the room always comes from the call record. Kept so existing callers still type-check. */
  roomName: z.string().optional(),
});

export type MonitorSession =
  | { ok: true; token: string; serverUrl: string; roomName: string }
  | { ok: false; error: string };

/**
 * Mints a subscribe-only LiveKit token for listening to an active call.
 * The token can subscribe to audio and data (transcripts) but cannot publish.
 */
export const createCallMonitorSession = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { callId: string; roomName?: string }) => monitorInput.parse(raw))
  .handler(async ({ data, context }): Promise<MonitorSession> => {
    const { rows } = await getPool().query<{
      business_id: string;
      status: string;
      room_name: string | null;
    }>(`SELECT business_id, status, room_name FROM calls WHERE id = $1`, [data.callId]);
    const call = rows[0];
    if (!call) {
      return { ok: false, error: "Call not found." };
    }

    // Verify access before revealing anything else about the call.
    try {
      await requireBusinessMembership(context.userId, call.business_id);
    } catch {
      return { ok: false, error: "You do not have access to this call." };
    }

    if (!["ringing", "in_progress"].includes(call.status)) {
      return { ok: false, error: "This call is no longer active." };
    }
    if (!call.room_name) {
      return { ok: false, error: "This call has no voice room to listen to." };
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
      room: call.room_name,
      roomJoin: true,
      canSubscribe: true,
      canPublish: false, // Monitor cannot speak
      canPublishData: false, // Monitor cannot send data
      hidden: true, // Don't show monitor as a participant
    });

    return {
      ok: true,
      token: await at.toJwt(),
      serverUrl: url,
      roomName: call.room_name,
    };
  });
