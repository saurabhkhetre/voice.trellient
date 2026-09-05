import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Phone, BookOpen, PhoneOutgoing, History, BarChart3 } from "lucide-react";

import { PageHeader, Panel, StatCard } from "@/components/dashboard/Shell";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatDuration, useBusiness } from "@/lib/business/useBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;

  const stats = useQuery({
    queryKey: ["home-stats", businessId],
    enabled: Boolean(businessId),
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const [agents, calls, numbers] = await Promise.all([
        supabase.from("agent_configs").select("id, enabled", { count: "exact" }).eq("business_id", businessId!),
        supabase
          .from("calls")
          .select("id, started_at, duration_seconds, caller_number, status, customers(name)", { count: "exact" })
          .eq("business_id", businessId!)
          .order("started_at", { ascending: false })
          .limit(5),
        supabase.from("phone_numbers").select("id", { count: "exact" }).eq("business_id", businessId!),
      ]);
      const agentList = agents.data ?? [];
      return {
        totalAgents: agents.count ?? 0,
        activeAgents: agentList.filter((a) => a.enabled).length,
        totalCalls: calls.count ?? 0,
        recentCalls: calls.data ?? [],
        phoneNumbers: numbers.count ?? 0,
      };
    },
  });

  const d = stats.data;

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

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Agents" value={d ? String(d.activeAgents) : "—"} hint={d ? `${d.totalAgents} total` : ""} />
        <StatCard label="Total Calls" value={d ? String(d.totalCalls) : "—"} />
        <StatCard label="Phone Numbers" value={d ? String(d.phoneNumbers) : "—"} />
        <StatCard label="Remaining Balance" value="∞" hint="Free tier" />
      </div>

      {/* Quick actions */}
      <div className="mt-8">
        <h2 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Quick Actions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex items-center gap-3 rounded-[12px] border border-line bg-card px-5 py-4 text-[0.9rem] font-medium text-ink transition-colors hover:bg-secondary"
            >
              <a.icon className="size-5 shrink-0 text-muted-foreground" />
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent calls */}
      <div className="mt-8">
        <h2 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Recent Calls</h2>
        <Panel className="mt-4">
          {!d || d.recentCalls.length === 0 ? (
            <p className="px-5 py-10 text-center text-[0.9rem] text-muted-foreground">
              No calls yet. Deploy an agent to start receiving calls.
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {d.recentCalls.map((call: any) => (
                <li key={call.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[0.92rem] text-ink">
                      {call.customers?.name ?? call.caller_number ?? "Unknown caller"}
                    </p>
                    <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                      {formatDateTime(call.started_at)} · {formatDuration(call.duration_seconds)}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[0.72rem] font-medium text-muted-foreground">
                    {call.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
