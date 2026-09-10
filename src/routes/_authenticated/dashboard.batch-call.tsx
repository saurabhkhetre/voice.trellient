import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Pause, PhoneOutgoing, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageHeader, Panel, Pill, StatCard } from "@/components/dashboard/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business/useBusiness";
import { formatDateTime } from "@/lib/business/useBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/batch-call")({
  component: BatchCallPage,
});

type BatchJob = {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  completed_contacts: number;
  failed_contacts: number;
  agent_config_id: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

function BatchCallPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [agentConfigId, setAgentConfigId] = useState("");

  /* ---- Load agent configs for the selector ---- */
  const agents = useQuery({
    queryKey: ["batch-agents", businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const { data } = await supabase
        .from("agent_configs")
        .select("id, name")
        .eq("business_id", businessId!)
        .eq("enabled", true)
        .order("name");
      return data ?? [];
    },
  });

  /* ---- Load batch jobs ---- */
  const jobsQuery = useQuery({
    queryKey: ["batch-jobs", businessId],
    enabled: Boolean(businessId),
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_jobs")
        .select("id, name, status, total_contacts, completed_contacts, failed_contacts, agent_config_id, created_at, started_at, completed_at")
        .eq("business_id", businessId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BatchJob[];
    },
  });

  const jobs = jobsQuery.data ?? [];
  const totalContacts = jobs.reduce((a, c) => a + c.completed_contacts, 0);
  const totalReached = jobs.reduce((a, c) => a + c.completed_contacts + c.failed_contacts, 0);

  /* ---- Create campaign mutation ---- */
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!businessId || !name.trim() || !agentConfigId) throw new Error("Missing required fields.");
      const lines = csvText.trim().split("\n").filter(Boolean).map((l) => l.trim());
      if (lines.length === 0) throw new Error("Please add at least one phone number.");

      // Create job
      const { data: job, error: jobErr } = await supabase
        .from("batch_jobs")
        .insert({
          business_id: businessId,
          agent_config_id: agentConfigId,
          name: name.trim(),
          total_contacts: lines.length,
        })
        .select("id")
        .single();
      if (jobErr || !job) throw new Error(jobErr?.message ?? "Failed to create campaign.");

      // Insert contacts
      const contacts = lines.map((phone) => ({
        batch_job_id: job.id,
        business_id: businessId,
        phone_number: phone,
      }));
      const { error: contactErr } = await supabase
        .from("batch_job_contacts")
        .insert(contacts);
      if (contactErr) throw new Error(contactErr.message);

      return job.id;
    },
    onSuccess: () => {
      toast.success("Campaign created. Configure your agent and launch when ready.");
      setName("");
      setCsvText("");
      setAgentConfigId("");
      setShowCreate(false);
      void qc.invalidateQueries({ queryKey: ["batch-jobs"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create campaign.");
    },
  });

  /* ---- Toggle status mutation ---- */
  const toggleMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      let newStatus: string;
      if (currentStatus === "running") newStatus = "paused";
      else if (currentStatus === "paused" || currentStatus === "draft" || currentStatus === "queued") newStatus = "running";
      else return;

      const updateData: any = { status: newStatus };
      if (newStatus === "running" && (currentStatus === "draft" || currentStatus === "queued")) {
        updateData["started_at"] = new Date().toISOString();
      }

      const { error } = await supabase
        .from("batch_jobs")
        .update(updateData)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["batch-jobs"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update campaign.");
    },
  });

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate();
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
        <StatCard label="Total Campaigns" value={String(jobs.length)} />
        <StatCard label="Contacts Reached" value={String(totalContacts)} />
        <StatCard
          label="Completion Rate"
          value={totalReached > 0 ? `${Math.round((totalContacts / totalReached) * 100)}%` : "—"}
        />
      </div>

      {/* Create campaign */}
      {showCreate && (
        <Panel className="mt-6 p-6">
          <h2 className="font-display text-[1.15rem] tracking-tight text-ink">Create a campaign</h2>
          <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
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
              <span className="text-[0.82rem] font-medium text-ink">Agent</span>
              <select
                value={agentConfigId}
                onChange={(e) => setAgentConfigId(e.target.value)}
                required
                className="input-base mt-2"
              >
                <option value="">Select an agent…</option>
                {(agents.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
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
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground disabled:opacity-50"
              >
                {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Create Campaign
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

      {/* Campaigns list */}
      <Panel className="mt-6">
        {jobsQuery.isLoading ? (
          <EmptyState>Loading campaigns…</EmptyState>
        ) : jobs.length === 0 ? (
          <EmptyState>No campaigns yet. Create one to start outbound calling.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {jobs.map((job) => {
              const progress = job.total_contacts > 0
                ? Math.round(((job.completed_contacts + job.failed_contacts) / job.total_contacts) * 100)
                : 0;
              return (
                <li key={job.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[0.92rem] font-medium text-ink">{job.name}</p>
                      <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                        {job.total_contacts} contacts · {job.completed_contacts} completed · {job.failed_contacts} failed
                      </p>
                      <p className="text-[0.75rem] text-muted-foreground">
                        Created {formatDateTime(job.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Pill
                        tone={
                          job.status === "running" ? "good"
                            : job.status === "completed" ? "neutral"
                              : job.status === "paused" ? "warn"
                                : job.status === "failed" ? "bad"
                                  : "neutral"
                        }
                      >
                        {job.status}
                      </Pill>
                      {!["completed", "failed"].includes(job.status) && (
                        <button
                          type="button"
                          onClick={() => toggleMutation.mutate({ id: job.id, currentStatus: job.status })}
                          disabled={toggleMutation.isPending}
                          className="rounded-[8px] border border-line px-3 py-1.5 text-[0.82rem] text-ink hover:bg-secondary disabled:opacity-50"
                        >
                          {job.status === "running" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Progress bar */}
                  {job.total_contacts > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full bg-secondary">
                        <div
                          className="h-1.5 rounded-full bg-ink/70 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[0.72rem] text-muted-foreground">{progress}% complete</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
