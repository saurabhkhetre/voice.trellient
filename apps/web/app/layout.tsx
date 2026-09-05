import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Voice AI — Realtime Voice Agent",
  description:
    "Talk naturally with a realtime AI voice agent. Low-latency speech, instant interruptions, powered by LiveKit WebRTC.",
  openGraph: {
    title: "Voice AI — Realtime Voice Agent",
    description:
      "Talk naturally with a realtime AI voice agent over WebRTC. Interrupt any time.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
