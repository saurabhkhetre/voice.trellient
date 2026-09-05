import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CreditCard, Check } from "lucide-react";

import { PageHeader, Panel, StatCard, Pill } from "@/components/dashboard/Shell";

export const Route = createFileRoute("/_authenticated/dashboard/billing")({
  component: BillingPage,
});

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    period: "/month",
    features: ["100 minutes/month", "1 agent", "1 phone number", "Basic analytics", "Email support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹4,999",
    period: "/month",
    features: ["2,000 minutes/month", "5 agents", "5 phone numbers", "Advanced analytics", "Live monitoring", "Priority support"],
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: ["Unlimited minutes", "Unlimited agents", "Unlimited numbers", "Custom integrations", "Dedicated account manager", "SLA guarantee", "On-premise option"],
  },
];

const USAGE_HISTORY = [
  { date: "Aug 2026", minutes: 1847, cost: "₹4,999", status: "paid" },
  { date: "Jul 2026", minutes: 1523, cost: "₹4,999", status: "paid" },
  { date: "Jun 2026", minutes: 892, cost: "₹4,999", status: "paid" },
  { date: "May 2026", minutes: 345, cost: "₹0", status: "free tier" },
];

function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState("free");

  return (
    <div>
      <PageHeader title="Billing" description="Manage your plan, track usage, and update payment methods." />

      {/* Usage stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Current Plan" value={PLANS.find((p) => p.id === currentPlan)?.name ?? "Free"} />
        <StatCard label="Minutes Used" value="47" hint="of 100 this month" />
        <StatCard label="Minutes Remaining" value="53" />
        <StatCard label="Per-Minute Rate" value="₹2.10" hint="Blended rate" />
      </div>

      {/* Usage bar */}
      <Panel className="mt-6 p-5">
        <h2 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Usage this month</h2>
        <div className="mt-4 h-3 rounded-full bg-secondary">
          <div className="h-3 rounded-full bg-ink transition-all" style={{ width: "47%" }} />
        </div>
        <div className="mt-2 flex justify-between text-[0.78rem] text-muted-foreground">
          <span>47 min used</span>
          <span>100 min limit</span>
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
              <button
                type="button"
                onClick={() => setCurrentPlan(plan.id)}
                className={`mt-6 w-full rounded-full px-5 py-2.5 text-[0.85rem] font-medium transition-colors ${
                  currentPlan === plan.id
                    ? "bg-secondary text-ink cursor-default"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
                disabled={currentPlan === plan.id}
              >
                {currentPlan === plan.id ? "Current Plan" : plan.id === "enterprise" ? "Contact Sales" : "Upgrade"}
              </button>
            </Panel>
          ))}
        </div>
      </div>

      {/* Payment method */}
      <Panel className="mt-8 p-6">
        <h2 className="flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">
          <CreditCard className="size-4" /> Payment Method
        </h2>
        <div className="mt-4 flex items-center justify-between rounded-[10px] border border-line p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-[6px] bg-secondary text-[0.82rem] font-medium text-ink">
              VISA
            </div>
            <div>
              <p className="text-[0.92rem] text-ink">•••• •••• •••• 4242</p>
              <p className="text-[0.78rem] text-muted-foreground">Expires 12/28</p>
            </div>
          </div>
          <button className="text-[0.82rem] font-medium text-ink underline underline-offset-4 hover:text-muted-foreground">
            Update
          </button>
        </div>
      </Panel>

      {/* Usage history */}
      <Panel className="mt-8">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Billing History</h2>
        </div>
        <ul className="divide-y divide-line/70">
          {USAGE_HISTORY.map((row) => (
            <li key={row.date} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-[0.92rem] text-ink">{row.date}</p>
                <p className="text-[0.78rem] text-muted-foreground">{row.minutes} minutes used</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[0.92rem] font-medium text-ink">{row.cost}</span>
                <Pill tone={row.status === "paid" ? "good" : "neutral"}>{row.status}</Pill>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
