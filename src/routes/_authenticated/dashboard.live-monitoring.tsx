import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio, Phone, Volume2 } from "lucide-react";

import { PageHeader, Panel, Pill, StatCard } from "@/components/dashboard/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business/useBusiness";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/live-monitoring")({
  component: LiveMonitoringPage,
});

type ActiveCall = {
  id: string;
  caller_number: string | null;
  destination_number: string | null;
  agent_config_id: string | null;
  status: string;
  started_at: string;
  escalation_required: boolean;
};

function LiveMonitoringPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;

  const activeCalls = useQuery({
    queryKey: ["live-calls", businessId],
    enabled: Boolean(businessId),
    refetchInterval: 5_000, // poll every 5s for active calls
    staleTime: 3_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("id, caller_number, destination_number, agent_config_id, status, started_at, escalation_required")
        .eq("business_id", businessId!)
        .in("status", ["in_progress", "ringing"])
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ActiveCall[];
    },
  });

  const calls = activeCalls.data ?? [];
  const active = calls.filter((c) => c.status === "in_progress").length;
  const ringing = calls.filter((c) => c.status === "ringing").length;

  const [listening, setListening] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Live Monitoring"
        description="Observe active calls in real-time."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active Calls" value={String(active)} />
        <StatCard label="Ringing" value={String(ringing)} />
        <StatCard label="Escalated" value={String(calls.filter((c) => c.escalation_required).length)} />
      </div>

      <Panel className="mt-6">
        {activeCalls.isLoading ? (
          <p className="px-5 py-10 text-center text-[0.9rem] text-muted-foreground">
            Loading active calls…
          </p>
        ) : calls.length === 0 ? (
          <p className="px-5 py-10 text-center text-[0.9rem] text-muted-foreground">
            No active calls right now. Calls will appear here when they start.
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {calls.map((call) => (
              <LiveCallRow
                key={call.id}
                call={call}
                isListening={listening === call.id}
                onListen={() => setListening(listening === call.id ? null : call.id)}
              />
            ))}
          </ul>
        )}
      </Panel>

      {listening && (
        <Panel className="mt-6 p-5">
          <div className="flex items-center gap-3">
            <Radio className="size-5 text-ink animate-pulse" />
            <div>
              <p className="text-[0.92rem] font-medium text-ink">
                Listening to {calls.find((c) => c.id === listening)?.caller_number ?? "unknown caller"}
              </p>
              <p className="mt-0.5 text-[0.82rem] text-muted-foreground">
                Live audio is not yet connected — this will use LiveKit room observation when configured.
              </p>
            </div>
          </div>
          <WaveformVisualizer />
        </Panel>
      )}
    </div>
  );
}

/** A single call row that self-manages its own duration timer. */
function LiveCallRow({
  call,
  isListening,
  onListen,
}: {
  call: ActiveCall;
  isListening: boolean;
  onListen: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(call.started_at).getTime();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [call.started_at]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const time = `${m}:${s.toString().padStart(2, "0")}`;

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Phone className="size-5 text-muted-foreground" />
          {call.status === "in_progress" && (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>
        <div>
          <p className="text-[0.92rem] font-medium text-ink">
            {call.caller_number ?? "Browser test call"}
          </p>
          <p className="mt-0.5 text-[0.8rem] text-muted-foreground">{time}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {call.escalation_required && <Pill tone="warn">escalated</Pill>}
        <Pill tone={call.status === "in_progress" ? "good" : "warn"}>
          {call.status === "in_progress" ? "active" : call.status}
        </Pill>
        <button
          type="button"
          onClick={onListen}
          className={cn(
            "flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[0.82rem] transition-colors",
            isListening
              ? "border-ink bg-ink text-primary-foreground"
              : "border-line text-ink hover:bg-secondary",
          )}
        >
          <Volume2 className="size-3.5" />
          {isListening ? "Listening…" : "Listen"}
        </button>
      </div>
    </li>
  );
}

/**
 * CSS-driven waveform visualizer. Bar heights are pre-computed once via
 * useMemo so React doesn't recalculate on every render. The CSS animation
 * handles the visual motion.
 *
 * When real audio observation is connected (LiveKit room listen mode),
 * this component can be upgraded to use an AnalyserNode. For now it
 * provides a visual placeholder that doesn't lie about being "real audio".
 */
function WaveformVisualizer() {
  const heights = useMemo(
    () => Array.from({ length: 40 }, () => 15 + Math.random() * 85),
    [],
  );

  return (
    <div className="mt-4 flex h-12 items-end gap-0.5">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm bg-ink/20"
          style={{
            height: `${h}%`,
            animation: "pulse 1.5s ease-in-out infinite",
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
    </div>
  );
}
