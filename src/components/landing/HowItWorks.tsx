import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, ArrowRightLeft, Check, FileText, Headphones, MessageCircle, Phone } from "lucide-react";

type StationProps = {
  icon: ReactNode;
  stamp: string;
  title: string;
  delay: string;
  done?: boolean;
  last?: boolean;
  children: ReactNode;
};

function Station({ icon, stamp, title, delay, done = false, last = false, children }: StationProps) {
  const timing = { "--lp-delay": delay } as CSSProperties;
  return (
    <li className="lp-station" data-reveal>
      <div className="lp-station__track" aria-hidden="true">
        <span className={done ? "lp-node lp-node--done" : "lp-node"} style={timing}>
          {icon}
        </span>
        {!last && <span className="lp-signal" style={timing} />}
      </div>
      <p className="lp-stamp">{stamp}</p>
      <h3 className="lp-h3">{title}</h3>
      {children}
    </li>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="lp-section lp-section--paper" aria-labelledby="lp-how-title">
      <div className="lp-container lp-stack-64">
        <div className="lp-section-head" data-reveal>
          <h2 id="lp-how-title" className="lp-display lp-h2">
            From the first ring to the right outcome.
          </h2>
          <p className="lp-lead">
            Every call follows the same path, so you always know what happened and what comes next.
          </p>
        </div>

        <ol className="lp-stations">
          <Station
            icon={<Phone size={22} strokeWidth={2} />}
            stamp="00:00 · RING"
            title="A customer calls your number"
            delay="0s"
          >
            <p className="lp-body">
              The agent picks up on the first ring, day or night. No hold music, no voicemail, no lead left
              waiting.
            </p>
          </Station>

          <Station
            icon={<Headphones size={22} strokeWidth={2} />}
            stamp="00:03 · CONVERSATION"
            title="Your agent handles it"
            delay="1s"
          >
            <p className="lp-body">
              It listens, understands what the caller needs and answers from your own FAQs, prices and
              policies, in a natural voice.
            </p>
          </Station>

          <Station
            icon={<Check size={22} strokeWidth={2.4} />}
            stamp="01:12 · OUTCOME"
            title="The call ends the right way"
            delay="2s"
            done
            last
          >
            <ul className="lp-outcomes">
              <li>
                <span className="lp-outcome__icon lp-outcome__icon--accent" aria-hidden="true">
                  <Check size={16} strokeWidth={2.4} />
                </span>
                <span>
                  <span className="lp-outcome__title">Resolved on the call</span>
                  <span className="lp-outcome__desc">Question answered or booking made.</span>
                </span>
              </li>
              <li>
                <span className="lp-outcome__icon lp-outcome__icon--neutral" aria-hidden="true">
                  <ArrowRightLeft size={16} strokeWidth={2} />
                </span>
                <span>
                  <span className="lp-outcome__title">Transferred to your team</span>
                  <span className="lp-outcome__desc">Warm transfer, with a call summary attached.</span>
                </span>
              </li>
              <li>
                <span className="lp-outcome__icon lp-outcome__icon--wa" aria-hidden="true">
                  <MessageCircle size={16} strokeWidth={2} />
                </span>
                <span>
                  <span className="lp-outcome__title">Followed up on WhatsApp</span>
                  <span className="lp-outcome__desc">Quote, confirmation or payment link sent.</span>
                </span>
              </li>
            </ul>
          </Station>
        </ol>

        <div className="lp-note" data-reveal>
          <p>
            <FileText size={22} strokeWidth={2} aria-hidden="true" />
            Every call lands in your dashboard with its recording, transcript, summary and outcome.
          </p>
          <a href="#features" className="lp-textlink">
            See the call log
            <ArrowRight className="lp-arrow" size={16} strokeWidth={2.2} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
