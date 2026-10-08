import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Features } from "./Features";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Omnichannel } from "./Omnichannel";
import { Setup } from "./Setup";
import { Ticker } from "./Ticker";
import { BrandGlyph } from "./Waveform";

const COMPANY_URL = "https://trellient.com";

const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#setup", label: "Setup" },
  { href: "#features", label: "Features" },
  { href: "#whatsapp", label: "WhatsApp" },
] as const;

/**
 * Fades sections in as they scroll into view.
 * Elements already on screen are shown immediately so nothing flickers after
 * hydration; without JS (or with reduced motion) everything is simply visible.
 */
function useScrollReveal(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const fold = window.innerHeight * 0.92;
    for (const el of items) {
      if (el.getBoundingClientRect().top < fold) el.classList.add("is-in");
    }
    root.classList.add("lp-js");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    for (const el of items) {
      if (!el.classList.contains("is-in")) observer.observe(el);
    }

    return () => {
      observer.disconnect();
      root.classList.remove("lp-js");
    };
  }, [rootRef]);
}

function Brand({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="lp-brand" style={onDark ? { color: "#ffffff" } : undefined}>
      <span className="lp-brand__mark">
        <BrandGlyph />
      </span>
      <span>
        Trellient <span className="lp-brand__sub">Voice</span>
      </span>
    </span>
  );
}

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollReveal(rootRef);

  return (
    <div className="lp" ref={rootRef}>
      <header className="lp-nav">
        <div className="lp-container lp-nav__inner">
          <a href="#top" aria-label="Trellient Voice home">
            <Brand />
          </a>
          <nav className="lp-nav__links" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="lp-nav__actions">
            <Link to="/auth" className="lp-nav__login">
              Log in
            </Link>
            <Link to="/auth" className="lp-btn lp-btn--dark">
              Start free
              <ArrowRight className="lp-arrow" size={16} strokeWidth={2.2} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <div id="top">
        <Hero />
      </div>
      <Ticker />
      <HowItWorks />
      <Setup />
      <Features />
      <Omnichannel />

      <section className="lp-cta" aria-labelledby="lp-cta-title">
        <div className="lp-cta__rings" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="lp-container lp-cta__inner" data-reveal>
          <div className="lp-cta__copy">
            <h2 id="lp-cta-title" className="lp-display lp-cta__title">
              Put your phone line
              <br />
              on autopilot.
            </h2>
            <p>Set up your first agent today and hear it answer a real call.</p>
          </div>
          <div className="lp-cta__actions">
            <div className="lp-row">
              <Link to="/auth" className="lp-btn lp-btn--white">
                Start free
                <ArrowRight className="lp-arrow" size={18} strokeWidth={2.2} aria-hidden="true" />
              </Link>
              <a href={COMPANY_URL} className="lp-btn lp-btn--outline-light">
                Talk to Trellient
              </a>
            </div>
            <p className="lp-cta__fine">100 free minutes · No credit card required</p>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container lp-footer__inner">
          <div className="lp-footer__top">
            <div className="lp-footer__brand">
              <a href="#top" aria-label="Back to top">
                <Brand onDark />
              </a>
              <p>AI voice agents for Indian businesses. Part of Trellient.</p>
            </div>
            <div className="lp-footer__cols">
              <div className="lp-footer__col">
                <h2>Product</h2>
                <a href="#how">How it works</a>
                <a href="#features">Features</a>
                <a href="#whatsapp">WhatsApp agents</a>
              </div>
              <div className="lp-footer__col">
                <h2>Account</h2>
                <Link to="/auth">Log in</Link>
                <Link to="/auth">Create an account</Link>
              </div>
              <div className="lp-footer__col">
                <h2>Company</h2>
                <a href={COMPANY_URL}>trellient.com</a>
              </div>
            </div>
          </div>
          <div className="lp-footer__bottom">
            <span>© {new Date().getFullYear()} Trellient. All rights reserved.</span>
            <span>Made in India</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
