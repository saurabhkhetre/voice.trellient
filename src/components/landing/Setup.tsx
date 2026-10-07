import type { CSSProperties } from "react";
import { Check, FileText, Phone } from "lucide-react";

import { KNOWLEDGE_FILES, SAMPLE_BUSINESS, SETUP_STEPS } from "./content";

export function Setup() {
  return (
    <section id="setup" className="lp-section lp-section--white" aria-labelledby="lp-setup-title">
      <div className="lp-container lp-split">
        <div className="lp-split__copy" data-reveal>
          <div className="lp-split__intro">
            <h2 id="lp-setup-title" className="lp-display lp-h2">
              Live on your number in four steps.
            </h2>
            <p className="lp-lead">
              No code required. Most of the setup is simply telling the agent about your business.
            </p>
          </div>

          <ol className="lp-steps">
            {SETUP_STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="lp-step__num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="lp-step__title">{step.title}</span>
                  <span className="lp-step__desc">{step.desc}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <AgentBuilderMock />
      </div>
    </section>
  );
}

/** Illustration of the dashboard's agent builder. Not interactive. */
function AgentBuilderMock() {
  return (
    <figure className="lp-builder" data-reveal style={{ "--lp-reveal-delay": "120ms" } as CSSProperties}>
      <figcaption className="lp-sr-only">
        Example of the agent builder: business documents being added and a test question answered from the
        price list.
      </figcaption>
      <div aria-hidden="true">
        <div className="lp-builder__head">
          <span className="lp-builder__title">
            <span className="lp-label">Agent builder</span>
            {SAMPLE_BUSINESS} · Sales line
          </span>
          <span className="lp-toggle-row">
            Live
            <span className="lp-toggle" />
          </span>
        </div>

        <div className="lp-tabs">
          <span>Agent</span>
          <span>Knowledge</span>
          <span>Number</span>
          <span>Go live</span>
        </div>

        <div className="lp-builder__body">
          <div className="lp-builder__row">
            Business knowledge
            <small>{KNOWLEDGE_FILES.length} sources</small>
          </div>

          <div className="lp-files">
            {KNOWLEDGE_FILES.map((name, i) => (
              <div className="lp-file" key={name}>
                <span className="lp-file__icon">
                  <FileText size={14} strokeWidth={2} />
                </span>
                <span className="lp-file__name">
                  {name}
                  <span className="lp-progress">
                    <span style={{ "--lp-delay": `${i * 0.8}s` } as CSSProperties} />
                  </span>
                </span>
                <Check className="lp-file__check" size={18} strokeWidth={2.4} />
              </div>
            ))}
          </div>

          <div className="lp-test" style={{ "--lp-cycle": "16s" } as CSSProperties}>
            <span className="lp-label">Test your agent</span>
            <span className="lp-test__q">What's the price for 500 printed boxes?</span>
            <span className="lp-test__a lp-seq-16">
              <span>₹18,500 including GST, delivered in 5 working days.</span>
              <span className="lp-source">Source: Price list 2026.pdf</span>
            </span>
          </div>
        </div>

        <div className="lp-builder__foot">
          <span>
            <Phone size={15} strokeWidth={2} />
            Business line <span className="lp-mono">+91 98••• ••400</span>
          </span>
          <span className="lp-connected">Connected</span>
        </div>
      </div>
    </figure>
  );
}
