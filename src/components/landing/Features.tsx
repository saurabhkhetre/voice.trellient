import type { CSSProperties } from "react";
import { Check, FileText, Headphones } from "lucide-react";

import { CALL_LOG, HOURLY_VOLUME, KNOWLEDGE_FILES, OUTCOME_LABEL, WAVE } from "./content";
import { Waveform } from "./Waveform";

const isNight = (hour: number) => hour < 6 || hour > 21;

export function Features() {
  return (
    <section id="features" className="lp-section lp-section--paper" aria-labelledby="lp-features-title">
      <div className="lp-container lp-stack-56">
        <div className="lp-section-head" data-reveal>
          <h2 id="lp-features-title" className="lp-display lp-h2">
            Everything your front desk does. On every call.
          </h2>
          <p className="lp-lead">Set it up once. Trellient Voice handles the rest, in every shift.</p>
        </div>

        <div className="lp-bento">
          <article className="lp-card lp-span-4" data-reveal>
            <div className="lp-card__head">
              <div className="lp-card__text" style={{ maxWidth: 420 }}>
                <h3 className="lp-h3">Picks up 24/7</h3>
                <p className="lp-body">
                  Nights, weekends and the lunch rush. No call goes to voicemail, whatever the hour.
                </p>
              </div>
              <span className="lp-float-chip">
                <time>2:14 AM</time>
                Appointment booked
              </span>
            </div>
            <div aria-hidden="true">
              <div className="lp-hours">
                {HOURLY_VOLUME.map((pct, hour) => (
                  <span
                    key={hour}
                    style={{
                      height: `${pct}%`,
                      opacity: isNight(hour) ? 1 : 0.35,
                      animationDelay: `${(hour % 6) * 0.2}s`,
                    }}
                  />
                ))}
              </div>
              <div className="lp-axis">
                <span>12 AM</span>
                <span>6 AM</span>
                <span>12 PM</span>
                <span>6 PM</span>
                <span>11 PM</span>
              </div>
            </div>
          </article>

          <article className="lp-card lp-card--night lp-span-2" data-reveal style={delay(80)}>
            <div className="lp-voicebox">
              <Waveform heights={WAVE.voice} barWidth={4} />
            </div>
            <div className="lp-card__text">
              <h3 className="lp-h3">Sounds like a person</h3>
              <p className="lp-body">
                Natural, low-latency speech that lets callers interrupt without talking over them.
              </p>
            </div>
          </article>

          <article className="lp-card lp-span-2" data-reveal>
            <ul className="lp-doclist" aria-label="Example knowledge sources">
              {KNOWLEDGE_FILES.map((name, i) => (
                <li key={name} className={[undefined, "lp-seq-10", "lp-seq-16"][i]}>
                  <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                  {name}
                </li>
              ))}
            </ul>
            <div className="lp-card__text">
              <h3 className="lp-h3">Trained on your business</h3>
              <p className="lp-body">Answers come from your own documents, not from guesswork.</p>
            </div>
          </article>

          <article className="lp-card lp-span-2" data-reveal style={delay(80)}>
            <div className="lp-livecalls" aria-hidden="true">
              <div className="lp-livecall">
                <span className="lp-livecall__meta">
                  Pricing enquiry
                  <small className="lp-mono">+91 98••• ••210 · 00:52</small>
                </span>
                <Waveform heights={WAVE.tiny} barWidth={2} />
              </div>
              <div className="lp-livecall">
                <span className="lp-livecall__meta">
                  Order status
                  <small className="lp-mono">+91 99••• ••087 · 01:31</small>
                </span>
                <Waveform heights={WAVE.tiny.slice().reverse()} barWidth={2} />
              </div>
              <span className="lp-listen">
                <Headphones size={14} strokeWidth={2.2} />
                Listen in
              </span>
            </div>
            <div className="lp-card__text">
              <h3 className="lp-h3">Live monitoring</h3>
              <p className="lp-body">
                Listen to calls as they happen and step in when a human touch is needed.
              </p>
            </div>
          </article>

          <article className="lp-card lp-span-2" data-reveal style={delay(160)}>
            <div className="lp-chat" style={{ "--lp-cycle": "12s" } as CSSProperties} aria-hidden="true">
              <span className="lp-bubble">Here's your quotation, as discussed on the call.</span>
              <span className="lp-bubble lp-bubble--doc lp-seq-16">
                <FileText size={14} strokeWidth={2} />
                Quotation_500_boxes.pdf
              </span>
              <span className="lp-bubble lp-bubble--out lp-seq-40">Looks good, go ahead.</span>
            </div>
            <div className="lp-card__text">
              <h3 className="lp-h3">WhatsApp, mid-call</h3>
              <p className="lp-body">
                Quotes, confirmations and payment links reach the caller while you're still talking.
              </p>
            </div>
          </article>

          <article className="lp-card lp-span-6" data-reveal>
            <div className="lp-card__head" style={{ alignItems: "flex-end" }}>
              <div className="lp-card__text" style={{ maxWidth: 520 }}>
                <h3 className="lp-h3">Every call on record</h3>
                <p className="lp-body">
                  Recording, transcript, summary and outcome for each conversation, with analytics across all
                  of them.
                </p>
              </div>
              <span className="lp-updating">
                <span className="lp-live-dot" aria-hidden="true" />
                Updating live
              </span>
            </div>
            <div className="lp-table-wrap">
              <table className="lp-table">
                <caption className="lp-sr-only">Example call log</caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Caller</th>
                    <th scope="col">Summary</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">Length</th>
                  </tr>
                </thead>
                <tbody>
                  {CALL_LOG.map((row, i) => (
                    <tr key={row.time} className={i === 0 ? "lp-newrow" : undefined}>
                      <td className="lp-mono">{row.time}</td>
                      <td className="lp-caller">{row.caller}</td>
                      <td>{row.summary}</td>
                      <td>
                        <span
                          className={`lp-badge lp-badge--${row.outcome === "whatsapp" ? "wa" : row.outcome}`}
                        >
                          {OUTCOME_LABEL[row.outcome]}
                        </span>
                      </td>
                      <td className="lp-mono">{row.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function delay(ms: number): CSSProperties {
  return { "--lp-reveal-delay": `${ms}ms` } as CSSProperties;
}
