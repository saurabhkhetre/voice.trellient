import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, PlusCircle, Trash2, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel, Pill, EmptyState } from "@/components/dashboard/Shell";
import {
  createAlertRule,
  deleteAlertRule,
  listAlertRules,
  setAlertRuleEnabled,
  type AlertRule,
} from "@/lib/alerts/alerts.functions";
import { useBusiness } from "@/lib/business/useBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/alerting")({
  component: AlertingPage,
});

const CONDITION_TYPES = [
  { value: "drop_rate", label: "Call Drop Rate", description: "Triggers when drop rate exceeds threshold" },
  { value: "error_count", label: "Error Count", description: "Triggers when error count exceeds threshold" },
  { value: "escalation", label: "Escalation", description: "Triggers on any human escalation" },
  { value: "latency", label: "High Latency", description: "Triggers when response latency exceeds threshold" },
  { value: "custom", label: "Custom", description: "Define your own trigger condition" },
];

function AlertingPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;
  const qc = useQueryClient();
  const fetchRules = useServerFn(listAlertRules);
  const createRule = useServerFn(createAlertRule);
  const setRuleEnabled = useServerFn(setAlertRuleEnabled);
  const removeRule = useServerFn(deleteAlertRule);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newConditionType, setNewConditionType] = useState("escalation");
  const [newThreshold, setNewThreshold] = useState("");
  const [newChannel, setNewChannel] = useState<"email" | "sms" | "webhook">("email");

  /* ---- Load alert rules ---- */
  const rulesQuery = useQuery({
    queryKey: ["alert-rules", businessId],
    enabled: Boolean(businessId),
    staleTime: 30_000,
    queryFn: () => fetchRules({ data: { businessId: businessId! } }),
  });

  const rules = rulesQuery.data ?? [];

  /* ---- Create rule ---- */
  const createMutation = useMutation({
    mutationFn: () => {
      if (!businessId) throw new Error("Your workspace is still loading. Please try again.");
      return createRule({
        data: {
          businessId,
          name: newName,
          conditionType: newConditionType,
          threshold: newConditionType === "escalation" ? "" : newThreshold,
          channel: newChannel,
        },
      });
    },
    onSuccess: () => {
      toast.success("Alert rule created.");
      setNewName("");
      setNewThreshold("");
      setNewConditionType("escalation");
      setNewChannel("email");
      setShowCreate(false);
      void qc.invalidateQueries({ queryKey: ["alert-rules"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create alert rule.");
    },
  });

  /* ---- Toggle rule ---- */
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setRuleEnabled({ data: { ruleId: id, enabled: !enabled } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["alert-rules"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update alert rule.");
    },
  });

  /* ---- Delete rule ---- */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeRule({ data: { ruleId: id } }),
    onSuccess: () => {
      toast.success("Alert rule deleted.");
      void qc.invalidateQueries({ queryKey: ["alert-rules"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete alert rule.");
    },
  });

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  function conditionLabel(rule: AlertRule): string {
    const t = CONDITION_TYPES.find((c) => c.value === rule.conditionType);
    const threshold = rule.conditionConfig["threshold"];
    if (threshold != null) {
      return `${t?.label ?? rule.conditionType}: threshold ${threshold}`;
    }
    return t?.description ?? rule.conditionType;
  }

  return (
    <div>
      <PageHeader
        title="Alerting"
        description="Set up notifications for system issues, dropped calls, or specific conversation triggers."
        action={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground"
          >
            <PlusCircle className="size-4" /> New Rule
          </button>
        }
      />

      {showCreate && (
        <Panel className="mb-6 p-6">
          <h2 className="font-display text-[1.15rem] tracking-tight text-ink">Create alert rule</h2>
          <form onSubmit={handleCreateSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[0.82rem] font-medium text-ink">Rule name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="High Error Rate"
                required
                className="input-base mt-2"
              />
            </label>
            <label className="block">
              <span className="text-[0.82rem] font-medium text-ink">Condition type</span>
              <select
                value={newConditionType}
                onChange={(e) => setNewConditionType(e.target.value)}
                className="input-base mt-2"
              >
                {CONDITION_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            {newConditionType !== "escalation" && (
              <label className="block">
                <span className="text-[0.82rem] font-medium text-ink">Threshold</span>
                <input
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                  placeholder={newConditionType === "drop_rate" ? "5 (%)" : newConditionType === "latency" ? "2000 (ms)" : "10"}
                  className="input-base mt-2"
                />
              </label>
            )}
            <label className="block">
              <span className="text-[0.82rem] font-medium text-ink">Notification channel</span>
              <select
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as "email" | "sms" | "webhook")}
                className="input-base mt-2"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="webhook">Webhook</option>
              </select>
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground disabled:opacity-50"
              >
                {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Create Rule
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-[0.85rem] text-muted-foreground hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        {rulesQuery.isLoading ? (
          <EmptyState>Loading alert rules…</EmptyState>
        ) : rules.length === 0 ? (
          <EmptyState>No alert rules configured. Create one to get notified of issues.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Bell className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-[0.92rem] font-medium text-ink">{rule.name}</p>
                    <p className="mt-0.5 text-[0.8rem] text-muted-foreground">{conditionLabel(rule)}</p>
                    {rule.lastTriggeredAt && (
                      <p className="mt-0.5 text-[0.72rem] text-muted-foreground">
                        Last triggered: {new Date(rule.lastTriggeredAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Pill tone="neutral">{rule.notificationChannels[0] ?? "email"}</Pill>
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate({ id: rule.id, enabled: rule.enabled })}
                    disabled={toggleMutation.isPending}
                    aria-label={rule.enabled ? "Turn rule off" : "Turn rule on"}
                    className="text-muted-foreground hover:text-ink disabled:opacity-50"
                  >
                    {rule.enabled ? <ToggleRight className="size-5 text-ink" /> : <ToggleLeft className="size-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(rule.id)}
                    disabled={deleteMutation.isPending}
                    aria-label="Delete rule"
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
