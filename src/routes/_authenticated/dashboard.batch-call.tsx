import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, PhoneOutgoing, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageHeader, Panel, Pill, StatCard } from "@/components/dashboard/Shell";
import { formatDateTime, useBusiness } from "@/lib/business/useBusiness";
import { listAgentConfigs } from "@/lib/voice/agent-configs.functions";
import { createBatchJob, listBatchJobs, setBatchJobStatus } from "@/lib/voice/batch.functions";

export const Route = createFileRoute("/_authenticated/dashboard/batch-call")({
  component: BatchCallPage,
});

function BatchCallPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;
  const qc = useQueryClient();
  const fetchAgents = useServerFn(listAgentConfigs);
  const fetchJobs = useServerFn(listBatchJobs);
  const createJob = useServerFn(createBatchJob);
  const setJobStatus = useServerFn(setBatchJobStatus);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [agentConfigId, setAgentConfigId] = useState("");

  /* ---- Load agent configs for the selector ---- */
  const agents = useQuery({
    queryKey: ["agent-configs", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchAgents({ data: { businessId: businessId! } }),
  });
  const enabledAgents = (agents.data ?? []).filter((agent) => agent.enabled);

  /* ---- Load batch jobs ---- */
  const jobsQuery = useQuery({
    queryKey: ["batch-jobs", businessId],
    enabled: Boolean(businessId),
    staleTime: 10_000,
    queryFn: () => fetchJobs({ data: { businessId: businessId! } }),
  });

  const jobs = jobsQuery.data ?? [];
  const totalContacts = jobs.reduce((a, c) => a + c.completedContacts, 0);
  const totalReached = jobs.reduce((a, c) => a + c.completedContacts + c.failedContacts, 0);

  /* ---- Create campaign mutation ---- */
  const createMutation = useMutation({
    mutationFn: () => {
      if (!businessId) throw new Error("Your workspace is still loading. Please try again.");
      return createJob({
        data: { businessId, agentConfigId, name, phoneNumbers: csvText.split("\n") },
      });
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
    mutationFn: ({ id, currentStatus }: { id: string; currentStatus: string }) =>
      setJobStatus({ data: { jobId: id, action: currentStatus === "running" ? "pause" : "start" } }),
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
                {enabledAgents.map((a) => (
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
              const progress = job.totalContacts > 0
                ? Math.round(((job.completedContacts + job.failedContacts) / job.totalContacts) * 100)
                : 0;
              return (
                <li key={job.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[0.92rem] font-medium text-ink">{job.name}</p>
                      <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                        {job.totalContacts} contacts · {job.completedContacts} completed · {job.failedContacts} failed
                      </p>
                      <p className="text-[0.75rem] text-muted-foreground">
                        Created {formatDateTime(job.createdAt)}
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
                          aria-label={job.status === "running" ? "Pause campaign" : "Start campaign"}
                          className="rounded-[8px] border border-line px-3 py-1.5 text-[0.82rem] text-ink hover:bg-secondary disabled:opacity-50"
                        >
                          {job.status === "running" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Progress bar */}
                  {job.totalContacts > 0 && (
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
