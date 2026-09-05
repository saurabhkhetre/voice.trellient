import { supabase } from "@/integrations/supabase/client";

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

/** Derives live per-agent runtime state from recent call activity. */
export async function fetchAgentRuntime(businessId: string): Promise<Record<string, AgentRuntime>> {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
  const { data, error } = await supabase
    .from("calls")
    .select("agent_config_id, status, escalation_required, started_at, answered_at, ended_at")
    .eq("business_id", businessId)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(300);
  if (error) throw error;

  const map: Record<string, AgentRuntime> = {};
  for (const call of data ?? []) {
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
