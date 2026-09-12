import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { getCallDetail, listAgentCalls } from "@/lib/voice/calls.functions";

/** Call history for the selected agent, with expandable transcripts. */
export function CallHistorySection({ agentId }: { agentId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const fetchCalls = useServerFn(listAgentCalls);
  const fetchDetail = useServerFn(getCallDetail);

  const calls = useQuery({
    queryKey: ["agent-calls", agentId],
    queryFn: () => fetchCalls({ data: { agentConfigId: agentId } }),
  });

  const transcript = useQuery({
    queryKey: ["call-transcript", openId],
    enabled: Boolean(openId),
    queryFn: async () => (await fetchDetail({ data: { callId: openId! } })).transcripts,
  });

  const list = calls.data ?? [];

  return (
    <div className="divide-y divide-line rounded-[10px] border border-line">
      {list.length === 0 ? (
        <p className="px-4 py-6 text-center text-[0.85rem] text-muted-foreground">
          No calls for this agent yet. Run a web test call or dial your number.
        </p>
      ) : (
        list.map((call) => {
          const open = openId === call.id;
          return (
            <div key={call.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : call.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/60"
              >
                {open ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.88rem] text-ink">
                    {call.callerNumber ?? "Web test call"}
                  </span>
                  <span className="text-[0.75rem] text-muted-foreground">
                    {new Date(call.startedAt).toLocaleString()} ·{" "}
                    {call.durationSeconds != null ? `${call.durationSeconds}s` : "—"} ·{" "}
                    {(call.language ?? "en").toUpperCase()}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[0.72rem]",
                    call.escalationRequired ? "border-brass text-brass" : "border-line text-muted-foreground",
                  )}
                >
                  {call.escalationRequired ? "escalated" : call.status}
                </span>
              </button>

              {open ? (
                <div className="space-y-3 border-t border-line bg-secondary/40 px-4 py-4">
                  {call.summary ? <p className="text-[0.85rem] text-ink">{call.summary}</p> : null}
                  {transcript.isLoading ? (
                    <p className="text-[0.8rem] text-muted-foreground">Loading transcript…</p>
                  ) : (transcript.data ?? []).length === 0 ? (
                    <p className="text-[0.8rem] text-muted-foreground">No transcript saved for this call.</p>
                  ) : (
                    <div className="space-y-2">
                      {(transcript.data ?? []).map((line) => (
                        <p key={line.id} className="text-[0.83rem] leading-relaxed">
                          <span className="text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
                            {line.speaker}
                          </span>
                          <span className="mt-0.5 block text-ink">{line.text}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
