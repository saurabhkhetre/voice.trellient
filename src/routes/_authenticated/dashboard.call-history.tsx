import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { EmptyState, PageHeader, Panel, Pill } from "@/components/dashboard/Shell";
import { formatDateTime, formatDuration, useBusiness } from "@/lib/business/useBusiness";
import { cn } from "@/lib/utils";
import { getCallDetail, listCalls } from "@/lib/voice/calls.functions";

export const Route = createFileRoute("/_authenticated/dashboard/call-history")({
  component: CallsPage,
});

function CallsPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;
  const [selected, setSelected] = useState<string | null>(null);
  const fetchCalls = useServerFn(listCalls);
  const fetchDetail = useServerFn(getCallDetail);

  const calls = useQuery({
    queryKey: ["calls", businessId],
    enabled: Boolean(businessId),
    staleTime: 60_000,
    queryFn: () => fetchCalls({ data: { businessId: businessId!, scope: "recent" } }),
  });

  const detail = useQuery({
    queryKey: ["call-detail", selected],
    enabled: Boolean(selected),
    queryFn: () => fetchDetail({ data: { callId: selected! } }),
  });

  const current = calls.data?.find((c) => c.id === selected) ?? null;

  return (
    <div>
      <PageHeader title="Calls" description="Every conversation, with transcript, summary and the tools used." />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel>
          {calls.isLoading ? (
            <EmptyState>Loading…</EmptyState>
          ) : (calls.data ?? []).length === 0 ? (
            <EmptyState>No calls recorded yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-line/70">
              {calls.data!.map((call) => (
                <li key={call.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(call.id)}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary",
                      selected === call.id && "bg-secondary",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[0.92rem] text-ink">
                        {call.customerName ?? call.callerNumber ?? "Web test call"}
                      </p>
                      <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                        {formatDateTime(call.startedAt)} · {formatDuration(call.durationSeconds)} ·{" "}
                        {call.language?.toUpperCase() ?? "—"}
                      </p>
                    </div>
                    <Pill tone={call.escalationRequired ? "warn" : call.status === "completed" ? "good" : "neutral"}>
                      {call.escalationRequired ? "Escalated" : call.status}
                    </Pill>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="min-h-[20rem]">
          {!current ? (
            <EmptyState>Select a call to read its transcript.</EmptyState>
          ) : (
            <div>
              <header className="border-b border-line px-5 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.22em] text-muted-foreground">
                  {current.direction} · {current.provider}
                </p>
                <h2 className="font-display mt-2 text-[1.25rem] tracking-tight text-ink">
                  {current.customerName ?? current.callerNumber ?? "Web test call"}
                </h2>
                <p className="mt-1 text-[0.82rem] text-muted-foreground">
                  {formatDateTime(current.startedAt)} · {formatDuration(current.durationSeconds)}
                  {current.intent ? ` · ${current.intent}` : ""}
                </p>
                {current.summary ? (
                  <p className="mt-3 text-[0.9rem] text-ink">{current.summary}</p>
                ) : null}
                {current.toolsUsed.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {current.toolsUsed.map((tool) => (
                      <Pill key={tool}>{tool}</Pill>
                    ))}
                  </div>
                ) : null}
              </header>
              <div className="max-h-[32rem] space-y-4 overflow-y-auto px-5 py-5">
                {detail.isLoading ? (
                  <p className="text-[0.9rem] text-muted-foreground">Loading transcript…</p>
                ) : detail.data?.transcripts.length === 0 ? (
                  <p className="text-[0.9rem] text-muted-foreground">No transcript stored for this call.</p>
                ) : (
                  detail.data?.transcripts.map((line) => (
                    <div key={line.id}>
                      <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                        {line.speaker === "agent" ? "Agent" : "Caller"}
                      </p>
                      <p className="mt-1 text-[0.94rem] leading-relaxed text-ink">{line.text}</p>
                    </div>
                  ))
                )}
                {detail.data?.events.length ? (
                  <div className="border-t border-line pt-4">
                    <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Events</p>
                    <ul className="mt-2 space-y-1.5">
                      {detail.data.events.map((event) => (
                        <li key={event.id} className="text-[0.82rem] text-muted-foreground">
                          {formatDateTime(event.createdAt)} — {event.eventType}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
