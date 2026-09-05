"use client";

import type { AgentState, ConnectionStatus } from "@shared/voice-contract";

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  idle: "Not connected",
  "requesting-mic": "Requesting microphone",
  "issuing-token": "Creating session",
  connecting: "Connecting",
  "waiting-for-agent": "Waiting for agent",
  connected: "Connected",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
  error: "Error",
};

const AGENT_LABELS: Record<AgentState, string> = {
  unknown: "Idle",
  initializing: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

function Pill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden="true" />
      <span className="text-white/45">{label}</span>
      <span className="font-medium text-white/90">{value}</span>
    </div>
  );
}

export function StatusBar({
  status,
  agentState,
  micEnabled,
  error,
}: {
  status: ConnectionStatus;
  agentState: AgentState;
  micEnabled: boolean;
  error: string | null;
}) {
  const connectionTone =
    status === "connected"
      ? "bg-emerald-400"
      : status === "error"
        ? "bg-red-400"
        : status === "idle" || status === "disconnected"
          ? "bg-white/30"
          : "bg-amber-400 pulse-ring";

  const agentTone =
    agentState === "speaking"
      ? "bg-[#B98A3E]"
      : agentState === "thinking"
        ? "bg-amber-300"
        : agentState === "listening"
          ? "bg-emerald-400"
          : "bg-white/30";

  return (
    <div aria-live="polite" className="w-full">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Pill label="Session" value={CONNECTION_LABELS[status]} tone={connectionTone} />
        <Pill label="Agent" value={AGENT_LABELS[agentState]} tone={agentTone} />
        <Pill
          label="Mic"
          value={micEnabled ? "Live" : "Muted"}
          tone={micEnabled ? "bg-emerald-400" : "bg-red-400"}
        />
      </div>
      {error ? (
        <p
          role="alert"
          className="mx-auto mt-4 max-w-xl rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-center text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
