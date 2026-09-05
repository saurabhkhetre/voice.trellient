/**
 * TokenManager — server-only. Mints short-lived LiveKit join tokens.
 * Never import this from a Client Component.
 */
import { AccessToken } from "livekit-server-sdk";

import type { VoiceSessionCredentials } from "@shared/voice-contract";

const TOKEN_TTL_SECONDS = 60 * 15;

export class MissingConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing server configuration: ${missing.join(", ")}`);
    this.name = "MissingConfigError";
  }
}

function readConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  const missing = [
    !url && "LIVEKIT_URL",
    !apiKey && "LIVEKIT_API_KEY",
    !apiSecret && "LIVEKIT_API_SECRET",
  ].filter(Boolean) as string[];

  if (missing.length) throw new MissingConfigError(missing);
  return { url: url!, apiKey: apiKey!, apiSecret: apiSecret! };
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

export class TokenManager {
  /** Issues a token scoped to exactly one room with publish + subscribe rights. */
  static async issue(opts: { roomName?: string; identity?: string } = {}): Promise<VoiceSessionCredentials> {
    const { url, apiKey, apiSecret } = readConfig();

    const roomName = opts.roomName ?? `${process.env.VOICE_ROOM_PREFIX ?? "voice"}-${randomSuffix()}`;
    const identity = opts.identity ?? `${process.env.VOICE_IDENTITY_PREFIX ?? "user"}-${randomSuffix()}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: TOKEN_TTL_SECONDS,
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
      serverUrl: url,
      token: await at.toJwt(),
      roomName,
      identity,
      expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
    };
  }
}
