import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Check, ExternalLink } from "lucide-react";

import { PageHeader, Panel, StatCard, Pill, EmptyState } from "@/components/dashboard/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business/useBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/billing")({
  component: BillingPage,
});

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    period: "/month",
    minuteLimit: 100,
    features: ["100 minutes/month", "1 agent", "1 phone number", "Basic analytics", "Email support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹4,999",
    period: "/month",
    minuteLimit: 2000,
    features: ["2,000 minutes/month", "5 agents", "5 phone numbers", "Advanced analytics", "Live monitoring", "Priority support"],
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    minuteLimit: Infinity,
    features: ["Unlimited minutes", "Unlimited agents", "Unlimited numbers", "Custom integrations", "Dedicated account manager", "SLA guarantee", "On-premise option"],
  },
];

function BillingPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;

  /* ---- Current usage: total minutes from calls this month ---- */
  const currentUsage = useQuery({
    queryKey: ["billing-usage-current", businessId],
    enabled: Boolean(businessId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data, error } = await supabase
        .from("calls")
        .select("duration_seconds")
        .eq("business_id", businessId!)
        .gte("started_at", monthStart);
      if (error) throw error;

      const totalSeconds = (data ?? []).reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0);
      const totalMinutes = Math.round(totalSeconds / 60 * 10) / 10;
      return { totalMinutes, callCount: data?.length ?? 0 };
    },
  });

  /* ---- Usage history from usage_records ---- */
  const usageHistory = useQuery({
    queryKey: ["billing-history", businessId],
    enabled: Boolean(businessId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_records")
        .select("period_start, period_end, total_calls, total_minutes, total_cost, currency")
        .eq("business_id", businessId!)
        .order("period_start", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  const usage = currentUsage.data;
  const history = usageHistory.data ?? [];

  // Current plan is always free (no subscription table wired yet)
  const currentPlan = PLANS[0]!;
  const minuteLimit = currentPlan.minuteLimit;
  const minutesUsed = usage?.totalMinutes ?? 0;
  const usagePercent = minuteLimit > 0 ? Math.min(100, Math.round((minutesUsed / minuteLimit) * 100)) : 0;

  return (
    <div>
      <PageHeader title="Billing" description="Track usage and explore plans." />

      {/* Usage stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Current Plan" value={currentPlan.name} />
        <StatCard
          label="Minutes Used"
          value={usage ? String(usage.totalMinutes) : "—"}
          hint={`of ${minuteLimit} this month`}
        />
        <StatCard
          label="Minutes Remaining"
          value={usage ? String(Math.max(0, minuteLimit - usage.totalMinutes)) : "—"}
        />
        <StatCard
          label="Calls This Month"
          value={usage ? String(usage.callCount) : "—"}
        />
      </div>

      {/* Usage bar */}
      <Panel className="mt-6 p-5">
        <h2 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Usage this month</h2>
        <div className="mt-4 h-3 rounded-full bg-secondary">
          <div
            className="h-3 rounded-full bg-ink transition-all"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[0.78rem] text-muted-foreground">
          <span>{minutesUsed} min used</span>
          <span>{minuteLimit} min limit</span>
        </div>
      </Panel>

      {/* Plans */}
      <div className="mt-8">
        <h2 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Plans</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Panel
              key={plan.id}
              className={`relative p-6 ${plan.popular ? "ring-2 ring-ink" : ""}`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-0.5 text-[0.72rem] font-medium text-primary-foreground">
                  Most Popular
                </span>
              )}
              <h3 className="font-display text-[1.25rem] tracking-tight text-ink">{plan.name}</h3>
              <p className="mt-2">
                <span className="font-display text-[2rem] tracking-tight text-ink">{plan.price}</span>
                <span className="text-[0.88rem] text-muted-foreground">{plan.period}</span>
              </p>
              <ul className="mt-5 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[0.85rem] text-muted-foreground">
                    <Check className="size-3.5 text-ink" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.id === "free" ? (
                <div className="mt-6 w-full rounded-full bg-secondary px-5 py-2.5 text-center text-[0.85rem] font-medium text-ink">
                  Current Plan
                </div>
              ) : (
                <a
                  href="mailto:sales@trellient.com?subject=Trellient Voice - Plan Upgrade Inquiry"
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="size-3.5" />
                  Contact Sales
                </a>
              )}
            </Panel>
          ))}
        </div>
      </div>

      {/* Payment notice */}
      <Panel className="mt-8 p-6">
        <h2 className="flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">
          <CreditCard className="size-4" /> Payment Method
        </h2>
        <p className="mt-4 text-[0.92rem] text-muted-foreground">
          No payment method configured. Upgrade to a paid plan by contacting our sales team.
        </p>
      </Panel>

      {/* Usage history */}
      <Panel className="mt-8">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Usage History</h2>
        </div>
        {history.length === 0 ? (
          <EmptyState>No usage history yet. Usage is recorded daily.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {history.map((row) => (
              <li key={row.period_start} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-[0.92rem] text-ink">
                    {new Date(row.period_start).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                    {" — "}
                    {new Date(row.period_end).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-[0.78rem] text-muted-foreground">
                    {row.total_calls} calls · {row.total_minutes} minutes
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[0.92rem] font-medium text-ink">
                    {row.currency === "INR" ? "₹" : "$"}{Number(row.total_cost).toFixed(2)}
                  </span>
                  <Pill tone="neutral">recorded</Pill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
