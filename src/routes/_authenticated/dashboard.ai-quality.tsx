import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { PageHeader, Panel, Pill, StatCard, EmptyState } from "@/components/dashboard/Shell";
import { useBusiness, formatDateTime, formatDuration } from "@/lib/business/useBusiness";
import { cn } from "@/lib/utils";
import { listCalls } from "@/lib/voice/calls.functions";

export const Route = createFileRoute("/_authenticated/dashboard/ai-quality")({
  component: AIQualityPage,
});

type CallQA = {
  id: string;
  caller_number: string | null;
  started_at: string;
  duration_seconds: number | null;
  status: string;
  escalation_required: boolean;
  intent: string | null;
  outcome: string | null;
  language: string | null;
  latency_ms: number | null;
};

/**
 * Compute a heuristic quality score from available call data.
 * Range: 0–100. Real scoring would come from an LLM evaluation pipeline;
 * this is a transparent heuristic until that exists.
 */
function computeScore(call: CallQA): number {
  let score = 70; // base
  if (call.status === "completed") score += 10;
  if (call.status === "failed") score -= 30;
  if (call.escalation_required) score -= 15;
  if (call.duration_seconds && call.duration_seconds > 10) score += 5;
  if (call.duration_seconds && call.duration_seconds > 300) score -= 5; // too long
  if (call.latency_ms && call.latency_ms < 500) score += 5;
  if (call.latency_ms && call.latency_ms > 2000) score -= 10;
  if (call.outcome === "resolved") score += 10;
  if (call.outcome === "abandoned") score -= 10;
  return Math.max(0, Math.min(100, score));
}

function detectIssues(call: CallQA): string[] {
  const issues: string[] = [];
  if (call.status === "failed") issues.push("Call failed to complete");
  if (call.escalation_required) issues.push("Required human escalation");
  if (call.latency_ms && call.latency_ms > 2000) issues.push("High response latency");
  if (call.duration_seconds && call.duration_seconds > 300) issues.push("Unusually long call duration");
  if (call.outcome === "abandoned") issues.push("Call abandoned by caller");
  return issues;
}

const MIN_CALLS_FOR_QA = 5;

function AIQualityPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;
  const [selected, setSelected] = useState<string | null>(null);

  const fetchCalls = useServerFn(listCalls);

  const callsQuery = useQuery({
    queryKey: ["qa-calls", businessId],
    enabled: Boolean(businessId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const calls = await fetchCalls({ data: { businessId: businessId!, scope: "finished" } });
      return calls.map(
        (call): CallQA => ({
          id: call.id,
          caller_number: call.callerNumber,
          started_at: call.startedAt,
          duration_seconds: call.durationSeconds,
          status: call.status,
          escalation_required: call.escalationRequired,
          intent: call.intent,
          outcome: call.outcome,
          language: call.language,
          latency_ms: call.latencyMs,
        }),
      );
    },
  });

  const calls = callsQuery.data ?? [];
  const current = calls.find((c) => c.id === selected);

  // Computed metrics
  const scores = calls.map((c) => computeScore(c));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const flaggedCount = calls.filter((c) => {
    const issues = detectIssues(c);
    return issues.length > 0;
  }).length;

  if (calls.length < MIN_CALLS_FOR_QA) {
    return (
      <div>
        <PageHeader
          title="AI Quality Assurance"
          description="Review agent performance, check script adherence, and identify areas for improvement."
        />
        <Panel className="p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <Info className="size-10 text-muted-foreground" />
            <div>
              <h2 className="font-display text-[1.25rem] tracking-tight text-ink">Not enough data</h2>
              <p className="mt-2 text-[0.92rem] text-muted-foreground">
                Quality metrics require at least {MIN_CALLS_FOR_QA} completed calls.
                You currently have {calls.length} call{calls.length !== 1 ? "s" : ""}.
              </p>
              <p className="mt-1 text-[0.82rem] text-muted-foreground">
                Deploy your agent and handle more calls to see quality insights here.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="AI Quality Assurance"
        description="Review agent performance, check script adherence, and identify areas for improvement."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Avg. Quality Score" value={`${avgScore}%`} />
        <StatCard label="Calls Analyzed" value={String(calls.length)} />
        <StatCard label="Escalations" value={String(calls.filter((c) => c.escalation_required).length)} />
        <StatCard label="Flagged" value={String(flaggedCount)} hint={flaggedCount > 0 ? "Needs attention" : "All clear"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <ul className="divide-y divide-line/70">
            {calls.map((qa) => {
              const score = computeScore(qa);
              const issues = detectIssues(qa);
              return (
                <li key={qa.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(qa.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary",
                      selected === qa.id && "bg-secondary",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[0.92rem] text-ink">{qa.caller_number ?? "Browser test"}</p>
                      <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                        {formatDateTime(qa.started_at)} · {formatDuration(qa.duration_seconds ?? 0)}
                      </p>
                      {issues.length > 0 && (
                        <p className="mt-1 truncate text-[0.78rem] text-destructive">
                          {issues.length} issue{issues.length > 1 ? "s" : ""} found
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "font-display text-[1.15rem] tracking-tight",
                          score >= 80 ? "text-ink" : score >= 60 ? "text-brass" : "text-destructive",
                        )}
                      >
                        {score}
                      </span>
                      <Pill
                        tone={issues.length === 0 ? "good" : issues.length <= 1 ? "warn" : "bad"}
                      >
                        {issues.length === 0 ? "good" : issues.length <= 1 ? "warning" : "flagged"}
                      </Pill>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel className="min-h-[20rem]">
          {!current ? (
            <EmptyState>Select a call to review the AI quality report.</EmptyState>
          ) : (
            <CallQADetail call={current} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function CallQADetail({ call }: { call: CallQA }) {
  const score = computeScore(call);
  const issues = detectIssues(call);

  const criteria = [
    { label: "Call completed successfully", pass: call.status === "completed" },
    { label: "No escalation needed", pass: !call.escalation_required },
    { label: "Response latency acceptable", pass: !call.latency_ms || call.latency_ms < 2000 },
    { label: "Duration within normal range", pass: !call.duration_seconds || (call.duration_seconds > 5 && call.duration_seconds < 300) },
  ];

  return (
    <div className="p-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-5 text-muted-foreground" />
        <div>
          <h2 className="font-display text-[1.25rem] tracking-tight text-ink">Quality Report</h2>
          <p className="text-[0.82rem] text-muted-foreground">
            {call.caller_number ?? "Browser test"} · {formatDateTime(call.started_at)}
          </p>
        </div>
      </div>

      {/* Score */}
      <div className="mt-6 flex items-center gap-4">
        <div
          className={cn(
            "flex size-16 items-center justify-center rounded-full border-2",
            score >= 80 ? "border-ink" : score >= 60 ? "border-brass" : "border-destructive",
          )}
        >
          <span className="font-display text-[1.5rem] tracking-tight text-ink">{score}</span>
        </div>
        <div>
          <p className="text-[0.92rem] font-medium text-ink">
            {score >= 80 ? "Excellent" : score >= 60 ? "Needs Improvement" : "Poor"}
          </p>
          <p className="text-[0.82rem] text-muted-foreground">Heuristic quality score</p>
        </div>
      </div>

      {/* Call metadata */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        {call.intent && (
          <div className="rounded-[8px] bg-secondary/50 p-3">
            <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Intent</p>
            <p className="mt-1 text-[0.88rem] text-ink">{call.intent.replace(/_/g, " ")}</p>
          </div>
        )}
        {call.outcome && (
          <div className="rounded-[8px] bg-secondary/50 p-3">
            <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Outcome</p>
            <p className="mt-1 text-[0.88rem] text-ink capitalize">{call.outcome}</p>
          </div>
        )}
        {call.language && (
          <div className="rounded-[8px] bg-secondary/50 p-3">
            <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Language</p>
            <p className="mt-1 text-[0.88rem] text-ink uppercase">{call.language}</p>
          </div>
        )}
        {call.latency_ms != null && (
          <div className="rounded-[8px] bg-secondary/50 p-3">
            <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Latency</p>
            <p className="mt-1 text-[0.88rem] text-ink">{call.latency_ms} ms</p>
          </div>
        )}
      </div>

      {/* Checklist */}
      <div className="mt-6 space-y-3">
        <h3 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Criteria</h3>
        {criteria.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-[0.88rem]">
            {c.pass ? (
              <CheckCircle2 className="size-4 text-ink" />
            ) : (
              <AlertTriangle className="size-4 text-destructive" />
            )}
            <span className={c.pass ? "text-ink" : "text-destructive"}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Issues Found</h3>
          <ul className="mt-3 space-y-2">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-[0.88rem] text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
