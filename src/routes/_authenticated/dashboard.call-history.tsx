import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState, PageHeader, Panel, Pill } from "@/components/dashboard/Shell";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatDuration, useBusiness } from "@/lib/business/useBusiness";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/call-history")({
  component: CallsPage,
});

function CallsPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;
  const [selected, setSelected] = useState<string | null>(null);

  const calls = useQuery({
    queryKey: ["calls", businessId],
    enabled: Boolean(businessId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("*, customers(name, phone)")
        .eq("business_id", businessId!)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const detail = useQuery({
    queryKey: ["call-detail", selected],
    enabled: Boolean(selected),
    queryFn: async () => {
      const [transcripts, events] = await Promise.all([
        supabase
          .from("call_transcripts")
          .select("id, speaker, text, timestamp")
          .eq("call_id", selected!)
          .order("timestamp", { ascending: true }),
        supabase
          .from("call_events")
          .select("id, event_type, event_data, created_at")
          .eq("call_id", selected!)
          .order("created_at", { ascending: true }),
      ]);
      return { transcripts: transcripts.data ?? [], events: events.data ?? [] };
    },
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
                        {call.customers?.name ?? call.caller_number ?? "Unknown caller"}
                      </p>
                      <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                        {formatDateTime(call.started_at)} · {formatDuration(call.duration_seconds)} ·{" "}
                        {call.language?.toUpperCase() ?? "—"}
                      </p>
                    </div>
                    <Pill tone={call.escalation_required ? "warn" : call.status === "completed" ? "good" : "neutral"}>
                      {call.escalation_required ? "Escalated" : call.status}
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
                  {current.customers?.name ?? current.caller_number ?? "Unknown caller"}
                </h2>
                <p className="mt-1 text-[0.82rem] text-muted-foreground">
                  {formatDateTime(current.started_at)} · {formatDuration(current.duration_seconds)}
                  {current.intent ? ` · ${current.intent}` : ""}
                </p>
                {current.summary ? (
                  <p className="mt-3 text-[0.9rem] text-ink">{current.summary}</p>
                ) : null}
                {current.tools_used?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {current.tools_used.map((tool) => (
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
                          {formatDateTime(event.created_at)} — {event.event_type}
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
