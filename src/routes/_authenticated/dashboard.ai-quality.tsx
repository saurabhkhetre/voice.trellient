import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle2 } from "lucide-react";

import { PageHeader, Panel, Pill, StatCard, EmptyState } from "@/components/dashboard/Shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/ai-quality")({
  component: AIQualityPage,
});

type QAItem = {
  id: string;
  callId: string;
  caller: string;
  date: string;
  score: number;
  issues: string[];
  status: "reviewed" | "pending" | "flagged";
};

const DEMO_QA: QAItem[] = [
  {
    id: "1", callId: "call_a1b2c3", caller: "Rajesh Kumar", date: "2 hours ago", score: 92,
    issues: [], status: "reviewed",
  },
  {
    id: "2", callId: "call_d4e5f6", caller: "Priya Sharma", date: "5 hours ago", score: 67,
    issues: ["Agent deviated from script", "Provided incorrect pricing"], status: "flagged",
  },
  {
    id: "3", callId: "call_g7h8i9", caller: "Amit Patel", date: "1 day ago", score: 85,
    issues: ["Slow response time"], status: "pending",
  },
  {
    id: "4", callId: "call_j0k1l2", caller: "Sunita Verma", date: "1 day ago", score: 95,
    issues: [], status: "reviewed",
  },
  {
    id: "5", callId: "call_m3n4o5", caller: "Vikram Singh", date: "2 days ago", score: 45,
    issues: ["Failed to answer question", "No escalation when needed", "Hallucinated business hours"], status: "flagged",
  },
];

function AIQualityPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const current = DEMO_QA.find((q) => q.id === selected);

  const avgScore = Math.round(DEMO_QA.reduce((a, q) => a + q.score, 0) / DEMO_QA.length);
  const flagged = DEMO_QA.filter((q) => q.status === "flagged").length;

  return (
    <div>
      <PageHeader
        title="AI Quality Assurance"
        description="Review agent performance, check script adherence, and identify areas for improvement."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Avg. Quality Score" value={`${avgScore}%`} />
        <StatCard label="Calls Reviewed" value={String(DEMO_QA.filter((q) => q.status === "reviewed").length)} />
        <StatCard label="Pending Review" value={String(DEMO_QA.filter((q) => q.status === "pending").length)} />
        <StatCard label="Flagged" value={String(flagged)} hint={flagged > 0 ? "Needs attention" : ""} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <ul className="divide-y divide-line/70">
            {DEMO_QA.map((qa) => (
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
                    <p className="text-[0.92rem] text-ink">{qa.caller}</p>
                    <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                      {qa.callId} · {qa.date}
                    </p>
                    {qa.issues.length > 0 && (
                      <p className="mt-1 truncate text-[0.78rem] text-destructive">
                        {qa.issues.length} issue{qa.issues.length > 1 ? "s" : ""} found
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "font-display text-[1.15rem] tracking-tight",
                        qa.score >= 80 ? "text-ink" : qa.score >= 60 ? "text-brass" : "text-destructive",
                      )}
                    >
                      {qa.score}
                    </span>
                    <Pill
                      tone={qa.status === "reviewed" ? "good" : qa.status === "flagged" ? "bad" : "neutral"}
                    >
                      {qa.status}
                    </Pill>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="min-h-[20rem]">
          {!current ? (
            <EmptyState>Select a call to review the AI quality report.</EmptyState>
          ) : (
            <div className="p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-muted-foreground" />
                <div>
                  <h2 className="font-display text-[1.25rem] tracking-tight text-ink">Quality Report</h2>
                  <p className="text-[0.82rem] text-muted-foreground">{current.caller} · {current.callId}</p>
                </div>
              </div>

              {/* Score */}
              <div className="mt-6 flex items-center gap-4">
                <div
                  className={cn(
                    "flex size-16 items-center justify-center rounded-full border-2",
                    current.score >= 80 ? "border-ink" : current.score >= 60 ? "border-brass" : "border-destructive",
                  )}
                >
                  <span className="font-display text-[1.5rem] tracking-tight text-ink">{current.score}</span>
                </div>
                <div>
                  <p className="text-[0.92rem] font-medium text-ink">
                    {current.score >= 80 ? "Excellent" : current.score >= 60 ? "Needs Improvement" : "Poor"}
                  </p>
                  <p className="text-[0.82rem] text-muted-foreground">Overall quality score</p>
                </div>
              </div>

              {/* Checklist */}
              <div className="mt-6 space-y-3">
                <h3 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Criteria</h3>
                {[
                  { label: "Script adherence", pass: !current.issues.some((i) => i.includes("script")) },
                  { label: "Accurate information", pass: !current.issues.some((i) => i.includes("incorrect") || i.includes("Hallucinated")) },
                  { label: "Response time", pass: !current.issues.some((i) => i.includes("Slow")) },
                  { label: "Proper escalation", pass: !current.issues.some((i) => i.includes("escalation")) },
                  { label: "Question handling", pass: !current.issues.some((i) => i.includes("Failed")) },
                ].map((c) => (
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
              {current.issues.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Issues Found</h3>
                  <ul className="mt-3 space-y-2">
                    {current.issues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-2 text-[0.88rem] text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex gap-3">
                <button className="flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-2 text-[0.82rem] text-ink hover:bg-secondary">
                  <ThumbsUp className="size-3.5" /> Approve
                </button>
                <button className="flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-2 text-[0.82rem] text-ink hover:bg-secondary">
                  <ThumbsDown className="size-3.5" /> Reject
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
