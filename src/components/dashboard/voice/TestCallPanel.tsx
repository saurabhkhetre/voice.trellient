import { Mic, MicOff, PhoneOff, PhoneCall } from "lucide-react";

import { Panel } from "@/components/dashboard/Shell";
import { cn } from "@/lib/utils";
import { useVoiceSession } from "@/lib/voice/useVoiceSession";
import { AGENT_STATE_LABELS, STATUS_LABELS } from "@/lib/voice/contract";

const BARS = [0.35, 0.6, 0.9, 0.7, 1, 0.55, 0.8, 0.45, 0.3];

/** Live browser test call against the selected agent. */
export function TestCallPanel({ agentId, agentName }: { agentId: string | null; agentName: string }) {
  const { status, agentState, micEnabled, error, missingConfig, transcript, level, connect, disconnect, toggleMic } =
    useVoiceSession();

  const live = status === "connected" || status === "waiting-for-agent" || status === "reconnecting";
  const busy = status === "requesting-mic" || status === "issuing-token" || status === "connecting";

  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Test your agent</p>
        <span className="text-[0.72rem] text-muted-foreground">{STATUS_LABELS[status]}</span>
      </div>

      <div className="mt-4 flex h-16 items-end justify-center gap-1">
        {BARS.map((weight, i) => {
          const active = live ? Math.max(0.12, level * weight * 3) : 0.12;
          return (
            <span
              key={i}
              className={cn("w-1.5 rounded-full transition-[height] duration-150", live ? "bg-brass" : "bg-ink/15")}
              style={{ height: `${8 + active * 48}px` }}
            />
          );
        })}
      </div>

      <p className="mt-3 text-center text-[0.8rem] text-muted-foreground">
        {live ? AGENT_STATE_LABELS[agentState] : `Speak with ${agentName} from your browser`}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {live || busy ? (
          <>
            <button
              type="button"
              onClick={() => void disconnect()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[0.85rem] text-background"
            >
              <PhoneOff className="size-4" /> End test call
            </button>
            <button
              type="button"
              onClick={() => void toggleMic()}
              disabled={!live}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-[0.85rem] text-ink hover:bg-secondary disabled:opacity-50"
            >
              {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              {micEnabled ? "Mute mic" : "Unmute mic"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!agentId}
            onClick={() => agentId && void connect(agentId)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-[0.85rem] font-medium text-primary-foreground disabled:opacity-50"
          >
            <PhoneCall className="size-4" /> Start web test call
          </button>
        )}
      </div>

      {error ? (
        <p className="mt-3 rounded-[8px] border border-line bg-secondary/60 p-3 text-[0.78rem] text-ink">
          {error}
          {missingConfig.length ? (
            <span className="mt-1 block font-mono text-[0.72rem] text-muted-foreground">
              Missing: {missingConfig.join(", ")}
            </span>
          ) : null}
        </p>
      ) : null}

      {transcript.length ? (
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto border-t border-line pt-3">
          {transcript.map((entry) => (
            <p key={entry.id} className="text-[0.8rem] leading-relaxed">
              <span className="text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
                {entry.role === "agent" ? "Agent" : "You"}
              </span>
              <span className={cn("mt-0.5 block", entry.final ? "text-ink" : "text-muted-foreground")}>
                {entry.text}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
