/** Shared voice-session vocabulary for the dashboard test-call console. */

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

export type AgentState = "unknown" | "initializing" | "listening" | "thinking" | "speaking";

export interface TranscriptEntry {
  id: string;
  role: "user" | "agent";
  text: string;
  final: boolean;
}

/** Participant attribute the LiveKit Agents SDK publishes agent state on. */
export const AGENT_STATE_ATTRIBUTE = "lk.agent.state";

/** Topic used for realtime transcription text streams. */
export const TRANSCRIPTION_TOPIC = "lk.transcription";

export const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: "Ready",
  "requesting-mic": "Asking for microphone…",
  "issuing-token": "Creating session…",
  connecting: "Connecting…",
  "waiting-for-agent": "Waiting for the agent…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  disconnected: "Ended",
  error: "Error",
};

export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  unknown: "—",
  initializing: "Warming up",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};
