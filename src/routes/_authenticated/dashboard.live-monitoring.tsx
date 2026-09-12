import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Radio, Phone, Volume2, VolumeX } from "lucide-react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteAudioTrack,
} from "livekit-client";

import { PageHeader, Panel, Pill, StatCard } from "@/components/dashboard/Shell";
import { useBusiness } from "@/lib/business/useBusiness";
import { cn } from "@/lib/utils";
import { listCalls } from "@/lib/voice/calls.functions";
import { createCallMonitorSession, type MonitorSession } from "@/lib/voice/monitor.functions";
import { TRANSCRIPTION_TOPIC, type TranscriptEntry } from "@/lib/voice/contract";

export const Route = createFileRoute("/_authenticated/dashboard/live-monitoring")({
  component: LiveMonitoringPage,
});

type ActiveCall = {
  id: string;
  caller_number: string | null;
  destination_number: string | null;
  agent_config_id: string | null;
  room_name: string | null;
  status: string;
  started_at: string;
  escalation_required: boolean;
};

function LiveMonitoringPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;
  const fetchCalls = useServerFn(listCalls);

  const activeCalls = useQuery({
    queryKey: ["live-calls", businessId],
    enabled: Boolean(businessId),
    refetchInterval: 5_000, // poll every 5s for active calls
    staleTime: 3_000,
    queryFn: async () => {
      const calls = await fetchCalls({ data: { businessId: businessId!, scope: "active" } });
      return calls.map(
        (call): ActiveCall => ({
          id: call.id,
          caller_number: call.callerNumber,
          destination_number: call.destinationNumber,
          agent_config_id: call.agentConfigId,
          room_name: call.roomName,
          status: call.status,
          started_at: call.startedAt,
          escalation_required: call.escalationRequired,
        }),
      );
    },
  });

  const calls = activeCalls.data ?? [];
  const active = calls.filter((c) => c.status === "in_progress").length;
  const ringing = calls.filter((c) => c.status === "ringing").length;

  const [listeningCallId, setListeningCallId] = useState<string | null>(null);
  const listeningCall = calls.find((c) => c.id === listeningCallId) ?? null;

  const handleStopListening = useCallback(() => {
    setListeningCallId(null);
  }, []);

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
                isListening={listeningCallId === call.id}
                onListen={() => setListeningCallId(listeningCallId === call.id ? null : call.id)}
              />
            ))}
          </ul>
        )}
      </Panel>

      {listeningCall && (
        <MonitorPanel call={listeningCall} onStop={handleStopListening} />
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
          disabled={!call.room_name}
          title={call.room_name ? "Listen to this call" : "No room available for monitoring"}
          className={cn(
            "flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[0.82rem] transition-colors",
            !call.room_name
              ? "border-line text-muted-foreground cursor-not-allowed opacity-50"
              : isListening
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
 * Monitor panel — connects to a LiveKit room as a hidden subscriber.
 * Shows real audio waveform and live transcript.
 */
function MonitorPanel({ call, onStop }: { call: ActiveCall; onStop: () => void }) {
  const fetchSession = useServerFn(createCallMonitorSession);
  const roomRef = useRef<Room | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [monitorStatus, setMonitorStatus] = useState<"connecting" | "connected" | "error" | "disconnected">("connecting");
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Connect to monitor session
  useEffect(() => {
    if (!call.room_name) {
      setMonitorStatus("error");
      setMonitorError("This call has no room assigned.");
      return;
    }

    let cancelled = false;

    async function connectMonitor() {
      try {
        const session = await fetchSession({
          data: { callId: call.id, roomName: call.room_name! },
        }) as MonitorSession;

        if (cancelled) return;
        if (!session.ok) {
          setMonitorStatus("error");
          setMonitorError(session.error);
          return;
        }

        const room = new Room({ adaptiveStream: true });
        roomRef.current = room;

        // Attach audio handling
        room.on(RoomEvent.TrackSubscribed, (track, _pub, _participant) => {
          if (track.kind === Track.Kind.Audio) {
            const audioTrack = track as RemoteAudioTrack;
            const el = audioTrack.attach();
            el.volume = 1;

            // Create analyser for waveform
            try {
              const ctx = new AudioContext();
              audioContextRef.current = ctx;
              const source = ctx.createMediaStreamSource(new MediaStream([audioTrack.mediaStreamTrack]));
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 128;
              source.connect(analyser);
              analyserRef.current = analyser;
            } catch {
              // AudioContext may fail in some browsers — waveform just won't show
            }
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setMonitorStatus("disconnected");
          }
        });

        // Register transcript handler
        room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, async (reader, info) => {
          const id = reader.info.id;
          const role: TranscriptEntry["role"] = info.identity?.startsWith("agent") ? "agent" : "user";
          let text = "";
          for await (const chunk of reader) {
            text += chunk;
            upsert({ id, role, text, final: false });
          }
          upsert({ id, role, text, final: true });
        });

        await room.connect(session.serverUrl, session.token);
        if (!cancelled) setMonitorStatus("connected");
      } catch (err) {
        if (!cancelled) {
          setMonitorStatus("error");
          setMonitorError(err instanceof Error ? err.message : "Failed to connect monitor.");
        }
      }
    }

    function upsert(entry: TranscriptEntry) {
      setTranscript((prev) => {
        const idx = prev.findIndex((e) => e.id === entry.id);
        if (idx === -1) return [...prev, entry];
        const next = [...prev];
        next[idx] = entry;
        return next;
      });
    }

    void connectMonitor();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
      analyserRef.current = null;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.disconnect();
    };
  }, [call.id, call.room_name, fetchSession]);

  // Waveform animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      if (!canvas || !ctx2d) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      if (!analyser) {
        // No analyser → flat line
        ctx2d.strokeStyle = "rgba(127,127,127,0.3)";
        ctx2d.beginPath();
        ctx2d.moveTo(0, h / 2);
        ctx2d.lineTo(w, h / 2);
        ctx2d.stroke();
        return;
      }

      const bufferLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufferLen);
      analyser.getByteTimeDomainData(data);

      ctx2d.lineWidth = 2;
      // A canvas can't read CSS variables, so resolve the theme's ink color.
      ctx2d.strokeStyle = getComputedStyle(canvas).getPropertyValue("--ink").trim() || "#1a2b4c";
      ctx2d.beginPath();

      const sliceWidth = w / bufferLen;
      let x = 0;
      for (let i = 0; i < bufferLen; i++) {
        const v = data[i]! / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
        x += sliceWidth;
      }
      ctx2d.lineTo(w, h / 2);
      ctx2d.stroke();
    }

    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [monitorStatus]);

  return (
    <Panel className="mt-6 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className={cn("size-5", monitorStatus === "connected" ? "text-ink animate-pulse" : "text-muted-foreground")} />
          <div>
            <p className="text-[0.92rem] font-medium text-ink">
              {monitorStatus === "connected"
                ? `Listening to ${call.caller_number ?? "browser call"}`
                : monitorStatus === "connecting"
                  ? "Connecting to call…"
                  : monitorStatus === "error"
                    ? "Monitor error"
                    : "Disconnected"}
            </p>
            {monitorError && (
              <p className="mt-0.5 text-[0.82rem] text-destructive">{monitorError}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-1.5 text-[0.82rem] text-ink hover:bg-secondary"
        >
          <VolumeX className="size-3.5" />
          Stop
        </button>
      </div>

      {/* Real waveform canvas */}
      <canvas
        ref={canvasRef}
        width={600}
        height={60}
        className="mt-4 h-12 w-full rounded-[6px] bg-secondary/30"
      />

      {/* Live transcript */}
      {transcript.length > 0 && (
        <div className="mt-4 max-h-48 overflow-y-auto rounded-[8px] border border-line bg-background p-4 space-y-2">
          <h3 className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Live Transcript</h3>
          {transcript.map((entry) => (
            <p key={entry.id} className="text-[0.85rem] leading-relaxed">
              <span className={cn(
                "font-medium",
                entry.role === "agent" ? "text-ink" : "text-muted-foreground",
              )}>
                {entry.role === "agent" ? "Agent" : "Caller"}:
              </span>{" "}
              <span className="text-ink/80">{entry.text}</span>
            </p>
          ))}
        </div>
      )}
    </Panel>
  );
}
