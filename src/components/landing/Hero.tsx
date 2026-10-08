import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowRightLeft, Check, Headphones, MessageCircle } from "lucide-react";

import { SAMPLE_BUSINESS, WAVE } from "./content";
import { Waveform } from "./Waveform";

const ROTATING_WORDS = ["call.", "lead.", "order.", "booking."] as const;

/** The console's scripted call loops every 18s (see .lp-seq-* in landing.css). */
const CALL_LOOP_SECONDS = 18;
const CALL_START_SECONDS = 41;

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Call timer that ticks in step with the console's looping transcript. */
function useCallClock() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000) % CALL_LOOP_SECONDS);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return formatClock(CALL_START_SECONDS + elapsed);
}

export function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-hero__dots" aria-hidden="true" />
      <div className="lp-container lp-hero__inner">
        <div className="lp-hero__copy">
          <span className="lp-pill">
            <span className="lp-ping" aria-hidden="true" />
            AI voice agents for Indian businesses
          </span>

          <h1 id="lp-hero-title" className="lp-display lp-h1">
            <span className="lp-sr-only">Never miss another call.</span>
            <span aria-hidden="true">
              Never miss
              <br />
              another{" "}
              <span className="lp-rotator">
                <span className="lp-rotator__track">
                  {[...ROTATING_WORDS, ROTATING_WORDS[0]].map((word, i) => (
                    <span key={i}>{word}</span>
                  ))}
                </span>
              </span>
            </span>
          </h1>

          <p className="lp-hero__sub">
            Trellient Voice answers your business line with an AI agent that knows your products, prices and
            policies. When a person needs to step in, it transfers the call to your team or follows up on
            WhatsApp.
          </p>

          <div className="lp-row">
            <Link to="/auth" className="lp-btn lp-btn--primary">
              Start free
              <ArrowRight className="lp-arrow" size={18} strokeWidth={2.2} aria-hidden="true" />
            </Link>
            <a href="#how" className="lp-btn lp-btn--ghost">
              See how it works
              <ArrowDown size={18} strokeWidth={2.2} aria-hidden="true" />
            </a>
          </div>

          <ul className="lp-checks">
            <li>
              <Check size={16} strokeWidth={2.4} aria-hidden="true" />
              Answers 24/7
            </li>
            <li>
              <Check size={16} strokeWidth={2.4} aria-hidden="true" />
              Warm transfer to your team
            </li>
            <li>
              <Check size={16} strokeWidth={2.4} aria-hidden="true" />
              WhatsApp follow-up
            </li>
          </ul>
        </div>

        <CallConsole />
      </div>
    </section>
  );
}

function CallConsole() {
  const clock = useCallClock();

  return (
    <figure className="lp-console-wrap" aria-label="Example of a live call handled by a Trellient agent">
      <div className="lp-rings" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="lp-console">
        <div className="lp-console__bar">
          <div className="lp-console__caller">
            <span className="lp-live">LIVE</span>
            <span>Incoming call</span>
            <span className="lp-console__number">+91 98••• ••210</span>
          </div>
          <span className="lp-console__timer" aria-hidden="true">
            {clock}
          </span>
        </div>

        <div className="lp-console__agent">
          <span className="lp-avatar" aria-hidden="true">
            <Headphones size={18} strokeWidth={2} />
          </span>
          <span className="lp-console__agent-name">
            Trellient agent
            <small>{SAMPLE_BUSINESS} · Sales line</small>
          </span>
          <Waveform heights={WAVE.console} />
        </div>

        <div className="lp-transcript">
          <p className="lp-turn lp-seq-02">
            <span className="lp-turn__who">CALLER</span>
            <span>Hi, what would 500 printed boxes cost?</span>
          </p>
          <p className="lp-turn lp-turn--agent lp-seq-16">
            <span className="lp-turn__who">AGENT</span>
            <span>
              <b>₹18,500 with GST</b>, delivered in 5 working days. Shall I WhatsApp you the quotation?
            </span>
          </p>
          <p className="lp-turn lp-seq-40">
            <span className="lp-turn__who">CALLER</span>
            <span>Yes please. And can I speak to someone about a bigger order?</span>
          </p>
          <p className="lp-turn lp-turn--agent lp-seq-54">
            <span className="lp-turn__who">AGENT</span>
            <span>Sent. Connecting you to Rahul in sales. He'll get a summary of this call.</span>
          </p>
        </div>

        <div className="lp-console__actions">
          <span className="lp-chip lp-seq-10">
            <Check size={14} strokeWidth={2.6} aria-hidden="true" />
            Price list checked
          </span>
          <span className="lp-chip lp-chip--wa lp-seq-30">
            <MessageCircle size={14} strokeWidth={2.2} aria-hidden="true" />
            Quote sent on WhatsApp
          </span>
          <span className="lp-chip lp-chip--accent lp-seq-62">
            <ArrowRightLeft size={14} strokeWidth={2.2} aria-hidden="true" />
            Transferring to Rahul
            <span className="lp-typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </span>
        </div>
      </div>

      <div className="lp-toast" aria-hidden="true">
        <div className="lp-toast__card lp-seq-30">
          <span className="lp-wa-badge">
            <MessageCircle size={18} strokeWidth={2.2} />
          </span>
          <span>
            <strong>Quotation delivered on WhatsApp</strong>
            <small>Quotation_500_boxes.pdf</small>
          </span>
        </div>
      </div>
    </figure>
  );
}
