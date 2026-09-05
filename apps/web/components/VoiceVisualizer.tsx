"use client";

import { useEffect, useRef } from "react";
import type { RemoteAudioTrack } from "livekit-client";

import type { AgentState } from "@shared/voice-contract";

interface Props {
  track: RemoteAudioTrack | null;
  agentState: AgentState;
  active: boolean;
}

/** Radial bar visualizer driven by the agent's live audio. */
export function VoiceVisualizer({ track, agentState, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bars = 48;
    let raf = 0;
    let analyser: AnalyserNode | null = null;
    let audioCtx: AudioContext | null = null;
    let data: Uint8Array | null = null;

    if (track?.mediaStreamTrack) {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      data = new Uint8Array(analyser.frequencyBinCount);
    }

    const draw = (time: number) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.28;

      if (analyser && data) analyser.getByteFrequencyData(data);

      for (let i = 0; i < bars; i += 1) {
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const level = data ? data[Math.floor((i / bars) * data.length)] / 255 : 0;
        const idle = active ? 0.06 + 0.04 * Math.sin(time / 420 + i * 0.4) : 0.03;
        const amplitude = Math.max(idle, level * 0.9);
        const inner = radius;
        const outer = radius + amplitude * radius * 1.5;

        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.strokeStyle = agentState === "speaking" ? "#B98A3E" : "rgba(247,246,242,0.55)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(247,246,242,0.16)";
      ctx.lineWidth = 1;
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      void audioCtx?.close();
    };
  }, [track, agentState, active]);

  return (
    <canvas
      ref={canvasRef}
      width={420}
      height={420}
      className="h-[280px] w-[280px] md:h-[360px] md:w-[360px]"
      role="img"
      aria-label={`Voice agent is ${agentState}`}
    />
  );
}
