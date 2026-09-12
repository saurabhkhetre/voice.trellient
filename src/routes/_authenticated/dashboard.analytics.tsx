import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { EmptyState, PageHeader, Panel, StatCard } from "@/components/dashboard/Shell";
import { formatDuration } from "@/lib/business/useBusiness";
import { getAnalyticsStats, type AnalyticsStats } from "@/lib/analytics/stats.functions";

export const Route = createFileRoute("/_authenticated/dashboard/analytics")({
  component: AnalyticsPage,
});

const TIME_RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
] as const;

type RangeValue = (typeof TIME_RANGES)[number]["value"];

function AnalyticsPage() {
  const [range, setRange] = useState<RangeValue>("30d");
  const fetchStats = useServerFn(getAnalyticsStats);

  const stats = useQuery({
    queryKey: ["analytics-stats", range],
    staleTime: 5 * 60_000,
    queryFn: () => fetchStats({ data: { range } }),
  });

  const d: AnalyticsStats | undefined = stats.data;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Call volume, intents, direction breakdown and responsiveness."
        action={
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeValue)}
            className="rounded-[8px] border border-line bg-card px-3 py-2 text-[0.85rem] text-ink outline-none focus:border-ink"
          >
            {TIME_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        }
      />

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Calls" value={d ? String(d.totalCalls) : "—"} />
        <StatCard label="Avg. Handle Time" value={d?.avgDuration ? formatDuration(d.avgDuration) : "—"} />
        <StatCard label="Containment" value={d ? `${d.containmentRate}%` : "—"} hint="Calls resolved without escalation" />
        <StatCard label="Escalation Rate" value={d ? `${d.escalationRate}%` : "—"} hint={d ? `${d.escalationCount} escalated` : ""} />
      </div>

      {/* Call breakdown */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* By Status */}
        <Panel className="px-5 py-6">
          <h2 className="text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Call breakdown</h2>
          {!d || d.totalCalls === 0 ? (
            <EmptyState>No call data yet.</EmptyState>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-[10px] bg-secondary/50 p-4">
                <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Answered</p>
                <p className="mt-1 font-display text-[1.4rem] tracking-tight text-ink">{d.answeredCalls}</p>
              </div>
              <div className="rounded-[10px] bg-secondary/50 p-4">
                <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Missed</p>
                <p className="mt-1 font-display text-[1.4rem] tracking-tight text-ink">{d.missedCalls}</p>
              </div>
              <div className="rounded-[10px] bg-secondary/50 p-4">
                <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Failed</p>
                <p className="mt-1 font-display text-[1.4rem] tracking-tight text-ink">{d.failedCalls}</p>
              </div>
              <div className="rounded-[10px] bg-secondary/50 p-4">
                <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Total Minutes</p>
                <p className="mt-1 font-display text-[1.4rem] tracking-tight text-ink">{d.totalMinutes}</p>
              </div>
            </div>
          )}
        </Panel>

        {/* By Direction */}
        <Panel className="px-5 py-6">
          <h2 className="text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Direction</h2>
          {!d || d.totalCalls === 0 ? (
            <EmptyState>No call data yet.</EmptyState>
          ) : (
            <>
              <div className="mt-5 flex items-end gap-8">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Inbound</p>
                  <p className="mt-1 font-display text-[2rem] tracking-tight text-ink">{d.callsByDirection.inbound}</p>
                </div>
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground">Outbound</p>
                  <p className="mt-1 font-display text-[2rem] tracking-tight text-ink">{d.callsByDirection.outbound}</p>
                </div>
              </div>
              {/* Direction bar */}
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-secondary">
                {d.callsByDirection.inbound > 0 && (
                  <div
                    className="h-full bg-ink/80 transition-all"
                    style={{ width: `${Math.round((d.callsByDirection.inbound / d.totalCalls) * 100)}%` }}
                  />
                )}
              </div>
              <div className="mt-1.5 flex justify-between text-[0.72rem] text-muted-foreground">
                <span>Inbound {d.totalCalls > 0 ? Math.round((d.callsByDirection.inbound / d.totalCalls) * 100) : 0}%</span>
                <span>Outbound {d.totalCalls > 0 ? Math.round((d.callsByDirection.outbound / d.totalCalls) * 100) : 0}%</span>
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* Top intents */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="px-5 py-6">
          <h2 className="text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Top intents</h2>
          {!d || d.topIntents.length === 0 ? (
            <EmptyState>No intents recorded.</EmptyState>
          ) : (
            <ul className="mt-5 space-y-3">
              {d.topIntents.map((item) => (
                <li key={item.intent}>
                  <div className="flex items-center justify-between text-[0.88rem]">
                    <span className="text-ink">{item.intent.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{item.count}</span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-secondary">
                    <div
                      className="h-1 rounded-full bg-ink/80"
                      style={{ width: `${Math.round((item.count / (d.topIntents[0]?.count ?? 1)) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Status breakdown */}
        <Panel className="px-5 py-6">
          <h2 className="text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">By status</h2>
          {!d || Object.keys(d.callsByStatus).length === 0 ? (
            <EmptyState>No status data.</EmptyState>
          ) : (
            <ul className="mt-5 space-y-3">
              {Object.entries(d.callsByStatus)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between text-[0.88rem]">
                    <span className="text-ink capitalize">{status.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{count} calls</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
