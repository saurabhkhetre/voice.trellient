import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Phone, BarChart3, BookOpen, Radio, PhoneOutgoing } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trellient Voice — AI Voice Agents for Business" },
      {
        name: "description",
        content:
          "Deploy intelligent AI voice agents that answer calls, qualify leads, and handle customer inquiries 24/7. Built for Indian businesses.",
      },
      { property: "og:title", content: "Trellient Voice — AI Voice Agents for Business" },
      {
        property: "og:description",
        content: "Deploy intelligent AI voice agents that answer calls, qualify leads, and handle customer inquiries 24/7.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Bot,
    title: "Agent Studio",
    desc: "Build, tune and publish voice agents with prompts, personality, and guardrails — no code required.",
  },
  {
    icon: BookOpen,
    title: "Knowledge Base",
    desc: "Upload docs, FAQs, and pricing sheets. Your agent answers from real data, nothing invented.",
  },
  {
    icon: Phone,
    title: "Phone Numbers",
    desc: "Provision local and toll-free numbers. Route inbound calls to the right agent instantly.",
  },
  {
    icon: BarChart3,
    title: "Analytics & QA",
    desc: "Track call volume, containment rate, response latency, and review AI quality automatically.",
  },
  {
    icon: Radio,
    title: "Live Monitoring",
    desc: "Listen to active calls in real-time. Step in when your agent needs a human touch.",
  },
  {
    icon: PhoneOutgoing,
    title: "Batch Calling",
    desc: "Upload contact lists and launch outbound campaigns. Your AI dials, qualifies, and reports back.",
  },
];

const STEPS = [
  { num: "01", title: "Connect", desc: "Sign up, connect your Supabase backend, and provision a phone number." },
  { num: "02", title: "Configure", desc: "Build your agent with prompts, voice, language, and business knowledge." },
  { num: "03", title: "Go Live", desc: "Publish your agent. Calls are answered instantly, 24/7, in any language." },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="container-x flex items-center justify-between py-5">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 24 24" className="size-5 text-ink" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeWidth="1.5" d="M3 5h18M12 5v14M6 9.5h12M8 14h8" />
          </svg>
          <span className="font-display text-[1.15rem] tracking-tight text-ink">Trellient Voice</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/auth"
            className="text-[0.88rem] font-medium text-muted-foreground hover:text-ink transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="rounded-full bg-primary px-5 py-2 text-[0.88rem] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="container-x section-y text-center">
        <p className="eyebrow text-muted-foreground">Voice AI Platform</p>
        <h1 className="font-display mx-auto mt-4 max-w-[42rem] text-[2.8rem] leading-[1.08] tracking-tight text-ink md:text-[3.8rem]">
          Your phone calls,<br />answered by AI
        </h1>
        <p className="mx-auto mt-5 max-w-[34rem] text-[1.05rem] leading-relaxed text-muted-foreground">
          Deploy intelligent voice agents that handle customer calls 24/7 — answering questions, booking
          appointments, qualifying leads, and escalating when needed. Built for Indian businesses.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/auth"
            className="rounded-full bg-primary px-8 py-3.5 text-[0.95rem] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start building — free
          </Link>
          <a
            href="https://trellient.com"
            className="rounded-full border border-line px-8 py-3.5 text-[0.95rem] font-medium text-ink transition-colors hover:bg-secondary"
          >
            Learn more
          </a>
        </div>
        <p className="mt-4 text-[0.82rem] text-muted-foreground">No credit card required · 100 free minutes</p>
      </section>

      {/* Features */}
      <section className="container-x section-y border-t border-line">
        <p className="eyebrow text-center text-muted-foreground">Platform</p>
        <h2 className="font-display mx-auto mt-3 max-w-[30rem] text-center text-[2rem] tracking-tight text-ink md:text-[2.5rem]">
          Everything you need to deploy voice agents
        </h2>
        <div className="mx-auto mt-12 grid max-w-[72rem] gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-[14px] border border-line bg-card p-7">
              <f.icon className="size-6 text-ink" />
              <h3 className="mt-4 text-[1.1rem] font-medium tracking-tight text-ink">{f.title}</h3>
              <p className="mt-2 text-[0.9rem] leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container-x section-y border-t border-line">
        <p className="eyebrow text-center text-muted-foreground">How it works</p>
        <h2 className="font-display mx-auto mt-3 max-w-[26rem] text-center text-[2rem] tracking-tight text-ink md:text-[2.5rem]">
          Live in three steps
        </h2>
        <div className="mx-auto mt-12 grid max-w-[56rem] gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.num} className="text-center">
              <span className="font-display text-[2.5rem] tracking-tight text-line-strong">{s.num}</span>
              <h3 className="mt-2 text-[1.1rem] font-medium tracking-tight text-ink">{s.title}</h3>
              <p className="mt-2 text-[0.9rem] leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link
            to="/auth"
            className="rounded-full bg-primary px-8 py-3.5 text-[0.95rem] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="container-x border-t border-line py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="size-4 text-muted-foreground" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeWidth="1.5" d="M3 5h18M12 5v14M6 9.5h12M8 14h8" />
            </svg>
            <span className="text-[0.88rem] text-muted-foreground">Trellient Voice</span>
          </div>
          <div className="flex items-center gap-5 text-[0.82rem] text-muted-foreground">
            <a href="https://trellient.com" className="hover:text-ink transition-colors">trellient.com</a>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
