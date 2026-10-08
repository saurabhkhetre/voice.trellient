import { createFileRoute } from "@tanstack/react-router";

import landingCss from "@/components/landing/landing.css?url";
import { LandingPage } from "@/components/landing/LandingPage";

const title = "Trellient Voice — AI voice agents that answer every call";
const description =
  "Put an AI agent on your business number. It answers 24/7 from your own FAQs, prices and policies, transfers to your team and follows up on WhatsApp. Built for Indian businesses.";

const LANDING_FONTS =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&family=Schibsted+Grotesk:wght@500;600;700&display=swap";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      // The root route sets noindex for the dashboard; the public homepage should be indexed.
      { name: "robots", content: "index, follow" },
      { name: "theme-color", content: "#ffffff" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: landingCss },
      { rel: "stylesheet", href: LANDING_FONTS },
    ],
  }),
  component: LandingPage,
});
