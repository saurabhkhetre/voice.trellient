import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, Play, Pause, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageHeader, Panel, Pill, StatCard } from "@/components/dashboard/Shell";
import { useBusiness } from "@/lib/business/useBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/batch-call")({
  component: BatchCallPage,
});

function BatchCallPage() {
  const { data: ctx } = useBusiness();
  const [campaigns, setCampaigns] = useState<
    { id: string; name: string; status: "draft" | "running" | "paused" | "completed"; contacts: number; called: number; answered: number; created: string }[]
  >([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [csvText, setCsvText] = useState("");

  function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const lines = csvText.trim().split("\n").filter(Boolean);
    const campaign = {
      id: crypto.randomUUID(),
      name: name.trim(),
      status: "draft" as const,
      contacts: lines.length || 0,
      called: 0,
      answered: 0,
      created: new Date().toISOString(),
    };
    setCampaigns((c) => [campaign, ...c]);
    setName("");
    setCsvText("");
    setShowCreate(false);
    toast.success("Campaign created. Configure your agent and launch when ready.");
  }

  function toggleCampaign(id: string) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: c.status === "running" ? "paused" : c.status === "paused" ? "running" : c.status === "draft" ? "running" : c.status }
          : c,
      ),
    );
  }

  return (
    <div>
      <PageHeader
        title="Batch Call"
        description="Launch outbound calling campaigns. Upload contacts, assign an agent, and let AI dial."
        action={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground"
          >
            <PhoneOutgoing className="size-4" /> New Campaign
          </button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Campaigns" value={String(campaigns.length)} />
        <StatCard label="Contacts Reached" value={String(campaigns.reduce((a, c) => a + c.called, 0))} />
        <StatCard label="Answer Rate" value={campaigns.length ? `${Math.round((campaigns.reduce((a, c) => a + c.answered, 0) / Math.max(1, campaigns.reduce((a, c) => a + c.called, 0))) * 100)}%` : "—"} />
      </div>

      {/* Create campaign */}
      {showCreate && (
        <Panel className="mt-6 p-6">
          <h2 className="font-display text-[1.15rem] tracking-tight text-ink">Create a campaign</h2>
          <form onSubmit={createCampaign} className="mt-4 space-y-4">
            <label className="block">
              <span className="text-[0.82rem] font-medium text-ink">Campaign name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q3 Lead Qualification"
                required
                className="input-base mt-2"
              />
            </label>
            <label className="block">
              <span className="text-[0.82rem] font-medium text-ink">Contact list (one phone number per line)</span>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={5}
                placeholder={"+919876543210\n+919876543211\n+919876543212"}
                className="input-base mt-2 resize-y"
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className="rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground">
                Create Campaign
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="text-[0.85rem] text-muted-foreground hover:text-ink">
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* Campaigns list */}
      <Panel className="mt-6">
        {campaigns.length === 0 ? (
          <EmptyState>No campaigns yet. Create one to start outbound calling.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[0.92rem] font-medium text-ink">{c.name}</p>
                  <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                    {c.contacts} contacts · {c.called} called · {c.answered} answered
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Pill
                    tone={c.status === "running" ? "good" : c.status === "completed" ? "neutral" : c.status === "paused" ? "warn" : "neutral"}
                  >
                    {c.status}
                  </Pill>
                  {c.status !== "completed" && (
                    <button
                      type="button"
                      onClick={() => toggleCampaign(c.id)}
                      className="rounded-[8px] border border-line px-3 py-1.5 text-[0.82rem] text-ink hover:bg-secondary"
                    >
                      {c.status === "running" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
