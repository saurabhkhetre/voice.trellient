import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Phone, BookOpen, PhoneOutgoing, History, BarChart3, ArrowRight } from "lucide-react";

import { EmptyState, PageHeader, Panel, Pill, StatCard } from "@/components/dashboard/Shell";
import { apiGet } from "@/lib/api/client";
// Types only — the server functions stay in place until this page is confirmed
// on Spring, and importing them keeps both response shapes checked in step.
import { type DashboardStats, type RecentCall } from "@/lib/api/contracts";
import { formatDateTime, formatDuration, useBusiness } from "@/lib/business/useBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;

  /* ---- Server-side stats (workspace-scoped, auth-enforced) ---- */
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    staleTime: 2 * 60_000,
    // Spring: GET /api/stats/dashboard
    queryFn: () => apiGet<DashboardStats>("/stats/dashboard"),
  });

  /* ---- Recent calls ---- */
  const recentCalls = useQuery({
    queryKey: ["recent-calls", businessId],
    enabled: Boolean(businessId),
    staleTime: 2 * 60_000,
    // Spring: GET /api/stats/recent-calls (scoped to the caller's workspace)
    queryFn: () => apiGet<RecentCall[]>("/stats/recent-calls"),
  });

  const d = stats.data;
  const calls = recentCalls.data ?? [];

  const QUICK_ACTIONS = [
    { to: "/dashboard/agents", label: "Create Agent", icon: Bot },
    { to: "/dashboard/phone-numbers", label: "Add Phone Number", icon: Phone },
    { to: "/dashboard/knowledge", label: "Upload Knowledge", icon: BookOpen },
    { to: "/dashboard/batch-call", label: "Batch Call", icon: PhoneOutgoing },
    { to: "/dashboard/call-history", label: "View Calls", icon: History },
    { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Home"
        title={`Welcome back${ctx?.business.name ? `, ${ctx.business.name}` : ""}`}
        description="Overview of your voice agent platform."
      />

      {/* Metrics. Staggered in at 40ms intervals — enough to read as a
          sequence, short enough that the row is settled before the eye
          arrives. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Calls Today", value: d ? String(d.callsToday) : "—", tone: "neutral" as const },
          { label: "Active Calls", value: d ? String(d.activeCalls) : "—", hint: "In progress now", tone: "live" as const },
          { label: "Active Agents", value: d ? String(d.activeAgents) : "—", hint: "Enabled configs", tone: "neutral" as const },
          { label: "Open Escalations", value: d ? String(d.openEscalations) : "—", hint: "Awaiting a human", tone: "warn" as const },
        ].map((card, i) => (
          <div key={card.label} className="stagger-in" style={{ animationDelay: `${i * 40}ms` }}>
            <StatCard {...card} />
          </div>
        ))}
      </div>

      {/* Below the metrics the page splits: recent activity is the thing you
          came to read, so it takes the wide column; actions sit beside it. */}
      <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="label-caps">Recent Calls</h2>
            <Link
              to="/dashboard/call-history"
              className="group inline-flex items-center gap-1 text-small text-text-secondary transition-colors duration-[130ms] hover:text-text-primary"
            >
              View all
              <ArrowRight className="size-3.5 transition-transform duration-[130ms] group-hover:translate-x-0.5" />
            </Link>
          </div>

          <Panel className="overflow-hidden">
            {recentCalls.isLoading ? (
              /* Skeleton rows rather than a spinner: the layout does not jump
                 when the data lands. */
              <ul className="divide-y divide-line">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-5 py-[0.95rem]">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-40 animate-pulse rounded bg-surface-overlay" />
                      <div className="h-2.5 w-28 animate-pulse rounded bg-surface-overlay" />
                    </div>
                    <div className="h-4 w-16 animate-pulse rounded-full bg-surface-overlay" />
                  </li>
                ))}
              </ul>
            ) : calls.length === 0 ? (
              <EmptyState>No calls yet. Deploy an agent to start receiving calls.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {calls.map((call) => (
                  <li
                    key={call.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-[0.95rem] transition-colors duration-[130ms] hover:bg-surface-overlay"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-overlay">
                        <Phone className="size-3.5 text-text-tertiary" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-small font-medium text-text-primary">
                          {call.customerName ?? call.callerNumber ?? "Web test call"}
                        </p>
                        <p className="mt-0.5 text-micro text-text-tertiary" data-numeric>
                          {formatDateTime(call.startedAt)} · {formatDuration(call.durationSeconds)}
                        </p>
                      </div>
                    </div>
                    <Pill tone={statusTone(call.status)}>{call.status}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>

        <section>
          <h2 className="label-caps mb-4">Quick Actions</h2>
          <div className="grid gap-2">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                /* Hover lights the edge and the icon, not the whole panel. The
                   arrow only appears on approach. */
                className="group surface-interactive flex items-center gap-3 px-4 py-3 text-small font-medium text-text-secondary hover:border-line-strong hover:bg-surface-overlay hover:text-text-primary"
              >
                <a.icon className="size-4 shrink-0 text-text-tertiary transition-colors duration-[130ms] group-hover:text-accent-solid" />
                {a.label}
                <ArrowRight className="ml-auto size-3.5 shrink-0 text-text-tertiary opacity-0 transition-all duration-[130ms] group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Call status → the semantic colour it should read as. */
function statusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  if (status === "completed") return "good";
  if (status === "failed") return "bad";
  if (status === "in_progress" || status === "ringing") return "warn";
  return "neutral";
}
