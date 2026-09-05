/**
 * Contract shared by every frontend (TanStack app in src/, Next.js app in
 * apps/web/) and mirrored by the Python agent's attribute names.
 *
 * Keep this file dependency-free so it can be copied or symlinked anywhere.
 */

export type ConnectionStatus =
  | "idle"
  | "requesting-mic"
  | "issuing-token"
  | "connecting"
  | "waiting-for-agent"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type AgentState =
  | "unknown"
  | "initializing"
  | "listening"
  | "thinking"
  | "speaking";

export interface VoiceSessionCredentials {
  serverUrl: string;
  token: string;
  roomName: string;
  identity: string;
  expiresAt: number;
}

/** Participant attribute the LiveKit Agents SDK publishes agent state on. */
export const AGENT_STATE_ATTRIBUTE = "lk.agent.state";

/** Topic used for realtime transcription text streams. */
export const TRANSCRIPTION_TOPIC = "lk.transcription";

/** POST endpoint contract for the session/token service. */
export const SESSION_ENDPOINT = "/api/token";
