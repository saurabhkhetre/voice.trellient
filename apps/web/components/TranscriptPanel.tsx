"use client";

import { useEffect, useRef } from "react";

import type { TranscriptEntry } from "@/lib/use-voice-session";

export function TranscriptPanel({ entries }: { entries: TranscriptEntry[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  return (
    <section
      aria-label="Conversation transcript"
      className="h-full max-h-[420px] overflow-y-auto rounded-3xl border border-white/10 bg-white/[0.03] p-5"
    >
      {entries.length === 0 ? (
        <p className="text-sm text-white/40">
          The transcript appears here as you talk. Speak over the agent any time to interrupt it.
        </p>
      ) : (
        <ul className="space-y-4">
          {entries.map((entry) => (
            <li key={entry.id}>
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-white/35">
                {entry.role === "agent" ? "Agent" : "You"}
              </p>
              <p className={`mt-1 text-[0.95rem] ${entry.final ? "text-white/90" : "text-white/60"}`}>
                {entry.text}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div ref={endRef} />
    </section>
  );
}
