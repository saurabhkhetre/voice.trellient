import { VoiceConsole } from "@/components/VoiceConsole";

export default function Page() {
  return (
    <main className="min-h-screen px-5 py-16 md:px-10 md:py-24">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-[0.72rem] uppercase tracking-[0.24em] text-[#B98A3E]">
          Realtime voice agent
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] md:text-6xl">
          Talk to the agent.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-white/55">
          Low-latency speech over WebRTC. Speak naturally, and interrupt the agent whenever you like
          — it stops immediately and listens.
        </p>
      </header>

      <section className="mt-16">
        <VoiceConsole />
      </section>
    </main>
  );
}
