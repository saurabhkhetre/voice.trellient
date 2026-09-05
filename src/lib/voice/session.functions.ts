import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthContext } from "@/lib/supabase/auth-context";

export type TestCallSession =
  | {
      ok: true;
      serverUrl: string;
      token: string;
      roomName: string;
      identity: string;
      expiresAt: number;
    }
  | { ok: false; error: string; missing?: string[] };

const input = z.object({ agentConfigId: z.string().uuid() });

/** Mints a short-lived LiveKit join token for a browser test call with one agent. */
export const createTestCallSession = createServerFn({ method: "POST" })
  // @ts-expect-error -- TanStack Start beta: middleware type inference is incomplete
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { agentConfigId: string }) => input.parse(raw))
  .handler(async ({ data, context: _ctx }): Promise<TestCallSession> => {
    const ctx = _ctx as unknown as AuthContext;
    const { data: agent, error } = await ctx.supabase
      .from("agent_configs")
      .select("id, business_id, name")
      .eq("id", data.agentConfigId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!agent) return { ok: false, error: "That agent is not available in your workspace." };

    const url = process.env["LIVEKIT_URL"];
    const apiKey = process.env["LIVEKIT_API_KEY"];
    const apiSecret = process.env["LIVEKIT_API_SECRET"];
    const missing = [
      !url && "LIVEKIT_URL",
      !apiKey && "LIVEKIT_API_KEY",
      !apiSecret && "LIVEKIT_API_SECRET",
    ].filter(Boolean) as string[];
    if (missing.length) {
      return {
        ok: false,
        error: "Voice runtime is not configured yet.",
        missing,
      };
    }

    // A masked/placeholder paste (bullets, asterisks, or any non-ASCII) can never
    // sign a valid token — fail fast with an actionable message instead of a
    // cryptic "invalid token" from the realtime service.
    const looksMasked = (value: string) => /[^\x21-\x7e]/.test(value) || /^[*•.]+$/.test(value);
    if (looksMasked(apiKey!) || looksMasked(apiSecret!)) {
      return {
        ok: false,
        error:
          "The saved voice API key/secret looks like masked placeholder text, not a real credential. Re-copy the revealed key pair from your voice provider and save it again.",
        missing: ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
      };
    }


    const { AccessToken, RoomServiceClient } = await import("livekit-server-sdk");
    const ttl = 60 * 15;
    const suffix = Math.random().toString(36).slice(2, 10);
    const roomName = `test-${String(agent.id).slice(0, 8)}-${suffix}`;
    const identity = `user-${ctx.userId.slice(0, 8)}-${suffix}`;

    const roomMetadata = JSON.stringify({
      agent_config_id: agent.id,
      business_id: agent.business_id,
      mode: "web-test",
    });

    // Create the room with metadata before the participant joins.
    // The Python agent reads agent_config_id from room metadata to
    // load the correct config for multi-agent businesses.
    try {
      const roomService = new RoomServiceClient(url!, apiKey!, apiSecret!);
      await roomService.createRoom({ name: roomName, metadata: roomMetadata });
    } catch {
      // Room creation might fail if the room already exists (unlikely for
      // random names) — not fatal, the participant join will still work.
    }

    const at = new AccessToken(apiKey!, apiSecret!, {
      identity,
      ttl,
      metadata: roomMetadata,
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    });

    return {
      ok: true,
      serverUrl: url!,
      token: await at.toJwt(),
      roomName,
      identity,
      expiresAt: Date.now() + ttl * 1000,
    };
  });
