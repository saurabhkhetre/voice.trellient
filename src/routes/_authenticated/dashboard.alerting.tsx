import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, PlusCircle, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel, Pill, EmptyState } from "@/components/dashboard/Shell";

export const Route = createFileRoute("/_authenticated/dashboard/alerting")({
  component: AlertingPage,
});

type AlertRule = {
  id: string;
  name: string;
  trigger: string;
  channel: "email" | "sms" | "webhook";
  enabled: boolean;
};

function AlertingPage() {
  const [rules, setRules] = useState<AlertRule[]>([
    { id: "1", name: "Call Drop Rate High", trigger: "Drop rate > 5% in 1 hour", channel: "email", enabled: true },
    { id: "2", name: "Agent Error Spike", trigger: "Error count > 10 in 30 min", channel: "webhook", enabled: true },
    { id: "3", name: "Escalation Required", trigger: "Any call escalated to human", channel: "sms", enabled: false },
  ]);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("");
  const [newChannel, setNewChannel] = useState<"email" | "sms" | "webhook">("email");

  function createRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newTrigger.trim()) return;
    setRules((r) => [
      ...r,
      { id: crypto.randomUUID(), name: newName.trim(), trigger: newTrigger.trim(), channel: newChannel, enabled: true },
    ]);
    setNewName("");
    setNewTrigger("");
    setNewChannel("email");
    setShowCreate(false);
    toast.success("Alert rule created.");
  }

  function toggleRule(id: string) {
    setRules((r) => r.map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule)));
  }

  function deleteRule(id: string) {
    setRules((r) => r.filter((rule) => rule.id !== id));
    toast.success("Alert rule deleted.");
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
          <form onSubmit={createRule} className="mt-4 grid gap-4 sm:grid-cols-2">
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
              <span className="text-[0.82rem] font-medium text-ink">Notification channel</span>
              <select
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as any)}
                className="input-base mt-2"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="webhook">Webhook</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[0.82rem] font-medium text-ink">Trigger condition</span>
              <input
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                placeholder="e.g., Drop rate > 5% in 1 hour"
                required
                className="input-base mt-2"
              />
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" className="rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground">
                Create Rule
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="text-[0.85rem] text-muted-foreground hover:text-ink">
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        {rules.length === 0 ? (
          <EmptyState>No alert rules configured. Create one to get notified of issues.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Bell className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-[0.92rem] font-medium text-ink">{rule.name}</p>
                    <p className="mt-0.5 text-[0.8rem] text-muted-foreground">{rule.trigger}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Pill tone="neutral">{rule.channel}</Pill>
                  <button type="button" onClick={() => toggleRule(rule.id)} className="text-muted-foreground hover:text-ink">
                    {rule.enabled ? <ToggleRight className="size-5 text-ink" /> : <ToggleLeft className="size-5" />}
                  </button>
                  <button type="button" onClick={() => deleteRule(rule.id)} className="text-muted-foreground hover:text-destructive">
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
