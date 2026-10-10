import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bot, PlusCircle, Sparkles } from "lucide-react";

import { Panel, Pill } from "@/components/dashboard/Shell";
import { CallHistorySection } from "@/components/dashboard/voice/CallHistorySection";
import { FunctionsSection } from "@/components/dashboard/voice/FunctionsSection";
import { PhoneNumbersSection } from "@/components/dashboard/voice/PhoneNumbersSection";
import { TestCallPanel } from "@/components/dashboard/voice/TestCallPanel";
import { useBusiness } from "@/lib/business/useBusiness";
import type { Database } from "@/lib/db/types";
import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  relativeTime,
  runtimeDotClass,
  runtimeLabel,
  type AgentRuntime,
  type RuntimeState,
} from "@/lib/voice/runtime-status";

export const Route = createFileRoute("/_authenticated/dashboard/agents")({
  head: () => ({
    meta: [
      { title: "Voice Agent Dashboard — Trellient" },
      {
        name: "description",
        content: "Configure, test, and monitor your Trellient customer voice agents.",
      },
      { property: "og:title", content: "Voice Agent Dashboard — Trellient" },
      {
        property: "og:description",
        content: "Configure, test, and monitor your Trellient customer voice agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VoiceAgentDashboard,
});

type AgentRow = Database["public"]["Tables"]["agent_configs"]["Row"];

const LANGUAGES = [
  { value: "en", label: "English (en-IN)" },
  { value: "hi", label: "Hindi (hi-IN)" },
  { value: "mr", label: "Marathi (mr-IN)" },
];

// Providers, models and voices come from GET /api/agents/voice-catalog rather
// than a list here. A second copy in the dashboard is what let a Gemini model be
// saved on an OpenAI agent twice: the flat model list offered every model to
// every provider, and the voice list only ever held OpenAI voices, so a Gemini
// agent had no valid voice to choose. The API rejects a bad combination on save
// too, so this only decides what is offered.
type VoiceOption = { value: string; label: string };
type VoiceProvider = {
  value: string;
  label: string;
  models: VoiceOption[];
  voices: VoiceOption[];
};

const TABS = [
  "Prompt",
  "Model & voice",
  "Functions",
  "Call settings",
  "Escalation",
  "Phone numbers",
  "Call history",
] as const;
type Tab = (typeof TABS)[number];

function VoiceAgentDashboard() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["agent-configs", businessId], [businessId]);

  // Static capability list, so it can be cached for the session.
  const catalog = useQuery({
    queryKey: ["voice-catalog", businessId],
    enabled: Boolean(businessId),
    staleTime: Infinity,
    queryFn: () => apiGet<VoiceProvider[]>("/agents/voice-catalog", { businessId: businessId! }),
  });

  const agents = useQuery({
    queryKey,
    enabled: Boolean(businessId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!businessId) return [];
      // Spring: GET /api/agents?businessId
      return await apiGet<AgentRow[]>("/agents", { businessId });
    },
  });

  const runtime = useQuery<Record<string, AgentRuntime>>({
    queryKey: ["agent-runtime", businessId],
    enabled: Boolean(businessId),
    // Spring: GET /api/agents/runtime?businessId
    queryFn: () =>
      businessId
        ? apiGet<Record<string, AgentRuntime>>("/agents/runtime", { businessId })
        : Promise.resolve({} as Record<string, AgentRuntime>),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Prompt");
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const list = agents.data ?? [];
  const selected = list.find((a) => a.id === selectedId) ?? list[0] ?? null;

  useEffect(() => {
    if (selected) {
      setSelectedId(selected.id);
      setDraft({ ...selected });
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Your workspace is still loading. Please try again.");
      // Spring: POST /api/agents to create, then PATCH /api/agents/{id} with
      // the draft as the body. Both are owner/manager only.
      const agentConfigId = selected?.id ?? (await apiPost<{ id: string }>("/agents", { businessId })).id;
      await apiPatch<void>(`/agents/${agentConfigId}`, draft);
    },
    onSuccess: () => {
      toast.success("Agent saved.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!selected?.id) throw new Error("No agent selected.");
      // Saves the draft, bumps the version and stores a snapshot in one transaction.
      // Spring: POST /api/agents/{id}/publish — saves the draft, bumps the
      // version and snapshots it in one transaction. Owner/manager only.
      await apiPost<{ version: number }>(`/agents/${selected.id}/publish`, draft);
    },
    onSuccess: () => {
      toast.success("Published! New calls will use this version.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createAgent = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Your workspace is still loading. Please try again.");
      // Spring: POST /api/agents
      return apiPost<{ id: string }>("/agents", { businessId });
    },
    onSuccess: (row) => {
      setSelectedId(row.id);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));
  const str = (key: string) => (draft[key] == null ? "" : String(draft[key]));

  // The Model & voice tab offers only what the selected provider can run. The
  // catalog is authoritative (GET /api/agents/voice-catalog) and the API
  // re-checks the combination on save, so this is about not offering a choice
  // that cannot work — not the last line of defence.
  const providers = catalog.data ?? [];
  const providerValue = str("model_provider") || providers[0]?.value || "";
  const activeProvider = providers.find((p) => p.value === providerValue);
  const modelValue = str("model_name") || activeProvider?.models[0]?.value || "";
  const voiceValue = str("voice_name") || activeProvider?.voices[0]?.value || "";
  const bool = (key: string) => Boolean(draft[key]);

  if (!ctx || agents.isLoading) {
    return (
      <div className="space-y-5" aria-live="polite" aria-busy="true">
        <div className="h-20 animate-pulse rounded-[8px] bg-secondary" />
        <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)_16rem]">
          <div className="h-40 animate-pulse rounded-[8px] bg-secondary" />
          <div className="h-[32rem] animate-pulse rounded-[8px] bg-secondary" />
          <div className="h-64 animate-pulse rounded-[8px] bg-secondary" />
        </div>
        <span className="sr-only">Loading Voice Agent Dashboard</span>
      </div>
    );
  }

  if (agents.isError) {
    return (
      <Panel className="p-6">
        <h1 className="font-display text-[1.5rem] text-ink">Voice Agent Dashboard could not load</h1>
        <p className="mt-2 text-[0.9rem] text-muted-foreground">
          {agents.error instanceof Error ? agents.error.message : "Please refresh and try again."}
        </p>
        <button
          type="button"
          onClick={() => void agents.refetch()}
          className="mt-5 rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground"
        >
          Try again
        </button>
      </Panel>
    );
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Agent studio</p>
          <h1 className="font-display mt-2 text-[1.9rem] leading-tight tracking-tight text-ink md:text-[2.2rem]">
            Voice Agent Dashboard
          </h1>
          <p className="measure mt-2 text-[0.95rem] text-muted-foreground">
            Build, tune and publish the agent that answers your phone — prompt, voice, guardrails and live
            call metrics in one place.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selected && (
            <span className="text-[0.78rem] text-muted-foreground">
              v{selected.version ?? 1}
              {selected.is_draft ? " · draft" : ""}
              {selected.published_at
                ? ` · published ${new Date(selected.published_at).toLocaleDateString()}`
                : ""}
            </span>
          )}
          <Pill tone={bool("enabled") ? "good" : "warn"}>
            {bool("enabled") ? "Answering calls" : "Paused"}
          </Pill>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-[8px] border border-line px-4 py-2 text-[0.85rem] font-medium text-ink hover:bg-secondary disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => publish.mutate()}
            disabled={publish.isPending}
            className="rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground disabled:opacity-60"
          >
            {publish.isPending ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)_16rem]">
        {/* Agent list */}
        <Panel className="h-fit p-3">
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Agents</p>
            <button
              type="button"
              aria-label="Create an agent"
              onClick={() => createAgent.mutate()}
              className="text-muted-foreground hover:text-ink"
            >
              <PlusCircle className="size-4" />
            </button>
          </div>
          <div className="space-y-1">
            {list.length === 0 ? (
              <p className="px-2 py-4 text-[0.85rem] text-muted-foreground">No agents yet. Create one.</p>
            ) : (
              list.map((agent) => (
                <AgentListItem
                  key={agent.id}
                  agent={agent}
                  runtimeData={runtime.data?.[agent.id]}
                  isSelected={agent.id === selected?.id}
                  onSelect={setSelectedId}
                />
              ))
            )}
          </div>
        </Panel>

        {/* Editor */}
        <div className="min-w-0 space-y-5">
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input
                value={str("name")}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Agent name"
                className="font-display min-w-0 flex-1 bg-transparent text-[1.35rem] tracking-tight text-ink outline-none"
              />
              <span className="font-mono text-[0.72rem] text-muted-foreground">
                agent_{selected?.id ? String(selected.id).slice(0, 8) : "new"}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-1 border-b border-line">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-[0.85rem] transition-colors",
                    tab === t
                      ? "border-ink text-ink"
                      : "border-transparent text-muted-foreground hover:text-ink",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-5">
              {tab === "Prompt" ? (
                <>
                  <Field label="Welcome message" help="First thing the caller hears.">
                    <Textarea value={str("greeting")} onChange={(v) => set("greeting", v)} rows={3} />
                  </Field>
                  <Field label="System prompt" help="Behaviour, boundaries and tone during the call.">
                    <Textarea
                      value={str("system_instructions")}
                      onChange={(v) => set("system_instructions", v)}
                      rows={8}
                    />
                  </Field>
                  <Field label="Personality">
                    <Textarea value={str("personality")} onChange={(v) => set("personality", v)} rows={3} />
                  </Field>
                  <Field label="How to describe the business">
                    <Textarea
                      value={str("business_description")}
                      onChange={(v) => set("business_description", v)}
                      rows={3}
                    />
                  </Field>
                </>
              ) : null}

              {tab === "Model & voice" ? (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Provider">
                      <select
                        value={providerValue}
                        onChange={(e) => {
                          // Switching provider invalidates the model and voice,
                          // so move them to the new provider's defaults in the
                          // same edit. Leaving them behind is what produced
                          // gpt-realtime on gemini_live.
                          const next = providers.find((p) => p.value === e.target.value);
                          set("model_provider", e.target.value);
                          if (next) {
                            set("model_name", next.models[0]?.value ?? "");
                            set("voice_name", next.voices[0]?.value ?? "");
                          }
                        }}
                        className="input-base"
                        disabled={!providers.length}
                      >
                        {providers.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="Realtime model"
                      help={
                        activeProvider ? `Models ${activeProvider.label} can run.` : "Loading the model list…"
                      }
                    >
                      <select
                        value={modelValue}
                        onChange={(e) => set("model_name", e.target.value)}
                        className="input-base"
                        disabled={!activeProvider}
                      >
                        {(activeProvider?.models ?? []).map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                        {/* A value saved before this list existed, or by a
                            direct API call, would otherwise render as blank. */}
                        {modelValue && !activeProvider?.models.some((m) => m.value === modelValue) ? (
                          <option value={modelValue}>{modelValue} — not supported</option>
                        ) : null}
                      </select>
                    </Field>
                    <Field label="Primary language">
                      <select
                        value={str("primary_language") || "en"}
                        onChange={(e) => set("primary_language", e.target.value)}
                        className="input-base"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Voice">
                      <select
                        value={voiceValue}
                        onChange={(e) => set("voice_name", e.target.value)}
                        className="input-base"
                        disabled={!activeProvider}
                      >
                        {(activeProvider?.voices ?? []).map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label}
                          </option>
                        ))}
                        {voiceValue && !activeProvider?.voices.some((v) => v.value === voiceValue) ? (
                          <option value={voiceValue}>{voiceValue} — not supported</option>
                        ) : null}
                      </select>
                    </Field>
                    <Field label="Speaking rate" help="1.0 is a natural pace.">
                      <input
                        type="number"
                        step="0.05"
                        value={str("voice_speed")}
                        onChange={(e) =>
                          set("voice_speed", e.target.value === "" ? null : Number(e.target.value))
                        }
                        className="input-base"
                      />
                    </Field>
                  </div>
                  <Toggle
                    label="Answer incoming calls"
                    value={bool("enabled")}
                    onChange={(v) => set("enabled", v)}
                  />
                </>
              ) : null}

              {tab === "Functions" ? (
                selected?.id && businessId ? (
                  <FunctionsSection agentId={selected.id} businessId={businessId} />
                ) : (
                  <p className="text-[0.85rem] text-muted-foreground">Create an agent first.</p>
                )
              ) : null}

              {tab === "Phone numbers" ? (
                selected?.id && businessId ? (
                  <PhoneNumbersSection
                    businessId={businessId}
                    agentId={selected.id}
                    agents={list.map((a) => ({ id: a.id, name: String(a["name"] ?? "Untitled agent") }))}
                  />
                ) : (
                  <p className="text-[0.85rem] text-muted-foreground">Create an agent first.</p>
                )
              ) : null}

              {tab === "Call history" ? (
                selected?.id ? (
                  <CallHistorySection agentId={selected.id} />
                ) : (
                  <p className="text-[0.85rem] text-muted-foreground">Create an agent first.</p>
                )
              ) : null}

              {tab === "Call settings" ? (
                <>
                  <Field label="Max call length (seconds)">
                    <input
                      type="number"
                      value={str("max_call_seconds")}
                      onChange={(e) =>
                        set("max_call_seconds", e.target.value === "" ? null : Number(e.target.value))
                      }
                      className="input-base"
                    />
                  </Field>
                  <Toggle
                    label="Record calls"
                    value={bool("recording_enabled")}
                    onChange={(v) => set("recording_enabled", v)}
                  />
                  <Field label="After-hours reply">
                    <Textarea
                      value={str("after_hours_response")}
                      onChange={(v) => set("after_hours_response", v)}
                      rows={3}
                    />
                  </Field>
                </>
              ) : null}

              {tab === "Escalation" ? (
                <>
                  <Toggle
                    label="Allow transfer to a human"
                    value={bool("escalation_enabled")}
                    onChange={(v) => set("escalation_enabled", v)}
                  />
                  <Field label="When to escalate">
                    <Textarea
                      value={str("escalation_rules")}
                      onChange={(v) => set("escalation_rules", v)}
                      rows={6}
                    />
                  </Field>
                  <p className="text-[0.85rem] text-muted-foreground">
                    Discounts, price floors and opening hours are enforced by your pricing rules and business
                    hours — the agent cannot talk its way past them.
                  </p>
                </>
              ) : null}
            </div>
          </Panel>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <TestCallPanel agentId={selected?.id ?? null} agentName={String(draft["name"] ?? "your agent")} />

          <Panel className="p-5">
            <p className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Runtime</p>
            <dl className="mt-3 space-y-2.5 text-[0.85rem]">
              <Metric label="Agents" value={String(list.length)} />
              <Metric label="Language" value={(str("primary_language") || "en").toUpperCase()} />
              <Metric label="Recording" value={bool("recording_enabled") ? "On" : "Off"} />
              <Metric label="Handoff" value={bool("escalation_enabled") ? "Enabled" : "Off"} />
            </dl>
          </Panel>

          <Panel className="p-5">
            <p className="flex items-center gap-2 text-[0.85rem] text-ink">
              <Sparkles className="size-4 text-brass" /> Grounded answers
            </p>
            <p className="mt-2 text-[0.83rem] text-muted-foreground">
              This agent answers from your products, pricing rules and policies — nothing invented.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[0.82rem] font-medium text-ink">{label}</span>
      {help ? <span className="mt-0.5 block text-[0.78rem] text-muted-foreground">{help}</span> : null}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Textarea({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="input-base resize-y leading-relaxed"
    />
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-[10px] border border-line px-4 py-3 text-left"
    >
      <span className="text-[0.85rem] text-ink">{label}</span>
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", value ? "bg-ink" : "bg-ink/15")}>
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-background transition-all",
            value ? "left-[1.15rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

/**
 * Memoized agent list item — self-updates its relative time every 30s
 * instead of re-rendering the entire 500+ line parent component.
 */
const AgentListItem = memo(function AgentListItem({
  agent,
  runtimeData,
  isSelected,
  onSelect,
}: {
  agent: AgentRow;
  runtimeData: AgentRuntime | undefined;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const state: RuntimeState = !agent["enabled"] ? "paused" : (runtimeData?.state ?? "idle");
  const stamp =
    runtimeData?.updatedAt ??
    (agent["updated_at"] ? String(agent["updated_at"]) : null) ??
    (agent["created_at"] ? String(agent["created_at"]) : null);

  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[0.88rem] transition-colors",
        isSelected ? "bg-secondary text-ink" : "text-muted-foreground hover:bg-secondary/60",
      )}
    >
      <Bot className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{String(agent["name"] ?? "Untitled agent")}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[0.72rem] text-muted-foreground">
          <span className={cn("size-1.5 shrink-0 rounded-full", runtimeDotClass(state))} />
          <span className="truncate">
            {runtimeLabel(state)} · {relativeTime(stamp)}
          </span>
        </span>
      </span>
    </button>
  );
});
