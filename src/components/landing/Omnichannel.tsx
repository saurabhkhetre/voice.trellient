import { Check, FileText, MessageCircle } from "lucide-react";

import { SAMPLE_BUSINESS, WAVE } from "./content";
import { Waveform } from "./Waveform";

const POINTS = [
  "The same answers on every channel",
  "One customer history across calls and chats",
  "Handover mid-conversation, with context intact",
] as const;

export function Omnichannel() {
  return (
    <section id="whatsapp" className="lp-section lp-section--night" aria-labelledby="lp-omni-title">
      <div className="lp-container lp-split">
        <div className="lp-omni__copy" data-reveal>
          <h2 id="lp-omni-title" className="lp-display lp-h2">
            Start on a call.
            <br />
            <span className="lp-omni__accent">Finish on WhatsApp.</span>
          </h2>
          <p className="lp-lead">
            Trellient's voice and WhatsApp agents share one knowledge base and one customer record. A
            conversation that starts on the phone carries on in chat, and your customer never repeats
            themselves.
          </p>
          <ul className="lp-omni__list">
            {POINTS.map((point) => (
              <li key={point}>
                <Check size={18} strokeWidth={2.4} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-omni__visual" data-reveal aria-hidden="true">
          <div className="lp-callpanel">
            <div className="lp-callpanel__top">
              <span>
                <span className="lp-live-dot" />
                Call in progress
              </span>
              <span className="lp-mono" style={{ fontWeight: 400, color: "var(--lp-night-muted)" }}>
                01:12
              </span>
            </div>
            <Waveform heights={WAVE.mini} />
            <p className="lp-turn">
              <span className="lp-turn__who">AGENT</span>
              <span>Shall I WhatsApp you the quotation?</span>
            </p>
          </div>

          <div className="lp-connector">
            <span className="lp-connector__line" />
            <span className="lp-connector__label">SAME CUSTOMER · SAME CONTEXT</span>
            <span className="lp-connector__line" />
          </div>

          <div className="lp-wapanel">
            <div className="lp-wapanel__head">
              <span className="lp-wa-badge">
                <MessageCircle size={16} strokeWidth={2.2} />
              </span>
              <span>
                <strong>{SAMPLE_BUSINESS}</strong>
                <small>WhatsApp · Business account</small>
              </span>
            </div>
            <div className="lp-chat">
              <span className="lp-bubble">
                Hi! As discussed on the call, here's your quotation for 500 printed boxes.
              </span>
              <span className="lp-bubble lp-seq-16">
                <span className="lp-doc">
                  <span className="lp-doc__icon">
                    <FileText size={15} strokeWidth={2} />
                  </span>
                  <span>
                    <strong>Quotation_500_boxes.pdf</strong>
                    <small>PDF document</small>
                  </span>
                </span>
              </span>
              <span className="lp-bubble lp-bubble--out lp-seq-40">
                Looks good. Please go ahead with the order.
              </span>
              <span className="lp-bubble lp-typing lp-typing--lg lp-seq-54">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
