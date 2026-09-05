"use client";

import { useVoiceSession } from "@/lib/use-voice-session";
import { StatusBar } from "@/components/StatusBar";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";

export function VoiceConsole() {
  const {
    status,
    agentState,
    micEnabled,
    error,
    transcript,
    agentAudioTrack,
    connect,
    disconnect,
    toggleMic,
  } = useVoiceSession();

  const live = status === "connected" || status === "waiting-for-agent" || status === "reconnecting";
  const busy = status === "requesting-mic" || status === "issuing-token" || status === "connecting";

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="flex flex-col items-center gap-8">
        <VoiceVisualizer track={agentAudioTrack} agentState={agentState} active={live} />

        <div className="flex flex-wrap items-center justify-center gap-3">
          {live || busy ? (
            <>
              <button
                onClick={() => void disconnect()}
                className="rounded-full bg-white px-6 py-3 text-sm font-medium text-[#0B0B0D] transition hover:bg-white/85"
              >
                End conversation
              </button>
              <button
                onClick={() => void toggleMic()}
                disabled={!live}
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-medium transition hover:bg-white/[0.06] disabled:opacity-40"
              >
                {micEnabled ? "Mute mic" : "Unmute mic"}
              </button>
            </>
          ) : (
            <button
              onClick={() => void connect()}
              className="rounded-full bg-[#B98A3E] px-8 py-3.5 text-sm font-medium text-[#0B0B0D] transition hover:bg-[#A67A32]"
            >
              Start conversation
            </button>
          )}
        </div>

        <StatusBar status={status} agentState={agentState} micEnabled={micEnabled} error={error} />
      </div>

      <TranscriptPanel entries={transcript} />
    </div>
  );
}
