import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { requireAgentOwnership } from "@/lib/supabase/require-business";

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
  .middleware([requireSupabaseAuth])
  .validator((raw: { agentConfigId: string }) => input.parse(raw))
  .handler(async ({ data, context }): Promise<TestCallSession> => {
    // --- Ownership check: user must belong to the agent's workspace ---
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

    // --- Validate LiveKit credentials ---
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
    // sign a valid token — fail fast with an actionable message.
    const looksMasked = (value: string) => /[^\x21-\x7e]/.test(value) || /^[*•.]+$/.test(value);
    if (looksMasked(apiKey!) || looksMasked(apiSecret!)) {
      return {
        ok: false,
        error:
          "The saved voice API key/secret looks like masked placeholder text. Re-copy the real credentials.",
        missing: ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
      };
    }

    // --- Create call record in DB before minting token ---
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const suffix = Math.random().toString(36).slice(2, 10);
    const roomName = `test-${String(data.agentConfigId).slice(0, 8)}-${suffix}`;
    const identity = `user-${context.userId.slice(0, 8)}-${suffix}`;

    let callId: string | undefined;
    try {
      const { data: callRow, error: callErr } = await supabaseAdmin
        .from("calls")
        .insert({
          business_id: ownership.businessId,
          agent_config_id: data.agentConfigId,
          provider: "browser",
          provider_call_id: roomName,
          direction: "inbound" as const,
          status: "ringing" as const,
        })
        .select("id")
        .single();
      if (!callErr && callRow) callId = callRow.id;
    } catch {
      // Non-fatal: call record creation failing shouldn't block the test call
    }

    // --- Create LiveKit room with metadata ---
    const roomMetadata = JSON.stringify({
      agent_config_id: data.agentConfigId,
      business_id: ownership.businessId,
      call_id: callId,
      mode: "web-test",
    });

    const { AccessToken, RoomServiceClient } = await import("livekit-server-sdk");

    try {
      const roomService = new RoomServiceClient(url!, apiKey!, apiSecret!);
      await roomService.createRoom({ name: roomName, metadata: roomMetadata });
    } catch {
      // Room creation might fail if it already exists — not fatal
    }

    // --- Mint participant token ---
    const ttl = 60 * 15; // 15 minutes
    const at = new AccessToken(apiKey!, apiSecret!, {
      identity,
      ttl,
      metadata: JSON.stringify({ user_id: context.userId, mode: "web-test" }),
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
