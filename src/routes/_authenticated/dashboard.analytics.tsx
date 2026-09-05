import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, PageHeader, Panel, StatCard } from "@/components/dashboard/Shell";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration, useBusiness } from "@/lib/business/useBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;

  const stats = useQuery({
    queryKey: ["analytics", businessId],
    enabled: Boolean(businessId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 29 * 864e5);
      const { data } = await supabase
        .from("calls")
        .select("started_at, duration_seconds, intent, language, escalation_required, latency_ms, outcome")
        .eq("business_id", businessId!)
        .gte("started_at", since.toISOString());
      const rows = data ?? [];

      const byDay = new Map<string, number>();
      for (let i = 0; i < 30; i += 1) {
        const day = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10);
        byDay.set(day, 0);
      }
      const tally = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
      const intents = new Map<string, number>();
      const languages = new Map<string, number>();

      for (const row of rows) {
        const day = row.started_at.slice(0, 10);
        if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
        tally(intents, row.intent ?? "unclassified");
        tally(languages, row.language ?? "unknown");
      }

      const durations = rows.map((r) => r.duration_seconds ?? 0).filter((n) => n > 0);
      const latencies = rows.map((r) => r.latency_ms ?? 0).filter((n) => n > 0);

      return {
        total: rows.length,
        byDay: [...byDay.entries()],
        intents: [...intents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
        languages: [...languages.entries()].sort((a, b) => b[1] - a[1]),
        avgDuration: durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null,
        avgLatency: latencies.length
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : null,
        containment: rows.length
          ? Math.round((rows.filter((r) => !r.escalation_required).length / rows.length) * 100)
          : null,
      };
    },
  });

  const d = stats.data;
  const peak = d ? Math.max(1, ...d.byDay.map(([, count]) => count)) : 1;

  return (
    <div>
      <PageHeader title="Analytics" description="Call volume, intents, languages and responsiveness over 30 days." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Calls (30d)" value={d ? String(d.total) : "—"} />
        <StatCard label="Avg. handle time" value={d?.avgDuration != null ? formatDuration(d.avgDuration) : "—"} />
        <StatCard label="Containment" value={d?.containment != null ? `${d.containment}%` : "—"} />
        <StatCard label="Avg. response latency" value={d?.avgLatency != null ? `${d.avgLatency} ms` : "—"} />
      </div>

      <Panel className="mt-6 px-5 py-6">
        <h2 className="text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Daily call volume</h2>
        {!d || d.total === 0 ? (
          <EmptyState>No call data yet.</EmptyState>
        ) : (
          <div className="mt-6 flex h-40 items-end gap-1">
            {d.byDay.map(([day, count]) => (
              <div key={day} className="flex-1" title={`${day}: ${count}`}>
                <div
                  className="w-full rounded-t-[2px] bg-ink/80 transition-[height] duration-700"
                  style={{ height: `${Math.round((count / peak) * 140)}px` }}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="px-5 py-6">
          <h2 className="text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Top intents</h2>
          {!d || d.intents.length === 0 ? (
            <EmptyState>No intents recorded.</EmptyState>
          ) : (
            <ul className="mt-5 space-y-3">
              {d.intents.map(([intent, count]) => (
                <li key={intent}>
                  <div className="flex items-center justify-between text-[0.88rem]">
                    <span className="text-ink">{intent.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-secondary">
                    <div
                      className="h-1 rounded-full bg-ink/80"
                      style={{ width: `${Math.round((count / (d.intents[0]?.[1] ?? 1)) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="px-5 py-6">
          <h2 className="text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Languages</h2>
          {!d || d.languages.length === 0 ? (
            <EmptyState>No language data.</EmptyState>
          ) : (
            <ul className="mt-5 space-y-3">
              {d.languages.map(([lang, count]) => (
                <li key={lang} className="flex items-center justify-between text-[0.88rem]">
                  <span className="text-ink">{lang.toUpperCase()}</span>
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
