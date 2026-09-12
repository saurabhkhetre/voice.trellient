export type RuntimeState = "idle" | "connecting" | "streaming" | "escalated" | "paused";

export type AgentRuntime = {
  state: RuntimeState;
  updatedAt: string | null;
};

const LABELS: Record<RuntimeState, string> = {
  idle: "Idle",
  connecting: "Connecting",
  streaming: "Streaming",
  escalated: "Escalated",
  paused: "Paused",
};

export function runtimeLabel(state: RuntimeState) {
  return LABELS[state];
}

export function runtimeDotClass(state: RuntimeState) {
  switch (state) {
    case "streaming":
      return "bg-brass animate-pulse";
    case "connecting":
      return "bg-brass/70 animate-pulse";
    case "escalated":
      return "bg-ink";
    case "paused":
      return "bg-muted-foreground/30";
    default:
      return "bg-muted-foreground/45";
  }
}

export function relativeTime(iso: string | null) {
  if (!iso) return "no activity yet";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "no activity yet";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export type RuntimeCallRow = {
  agent_config_id: string | null;
  status: string;
  escalation_required: boolean;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
};

/** Derives live per-agent runtime state from recent call activity, newest call first. */
export function deriveAgentRuntime(calls: RuntimeCallRow[]): Record<string, AgentRuntime> {
  const map: Record<string, AgentRuntime> = {};
  for (const call of calls) {
    const id = call.agent_config_id;
    if (!id) continue;
    const stamp = call.ended_at ?? call.answered_at ?? call.started_at ?? null;
    const active = call.status === "in_progress" || call.status === "ringing";
    let state: RuntimeState = "idle";
    if (active && call.escalation_required) state = "escalated";
    else if (call.status === "in_progress") state = "streaming";
    else if (call.status === "ringing") state = "connecting";

    const current = map[id];
    if (!current) {
      map[id] = { state, updatedAt: stamp };
      continue;
    }
    // Keep the most severe live state; timestamps come from the newest call.
    const rank: RuntimeState[] = ["idle", "paused", "connecting", "streaming", "escalated"];
    if (rank.indexOf(state) > rank.indexOf(current.state)) current.state = state;
  }
  return map;
}
