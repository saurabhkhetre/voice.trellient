import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Lock } from "lucide-react";

import { PageHeader, Panel, Pill } from "@/components/dashboard/Shell";

export const Route = createFileRoute("/_authenticated/dashboard/integrations")({
  component: IntegrationsPage,
});

/**
 * None of these are built. The list is kept because it is a useful statement of
 * intent, but every card is inert: there is no connect flow, no stored
 * credential and no status to report.
 *
 * It previously held a `connected` flag, with Twilio and Exotel hardcoded true
 * and a Connect button that flipped local state and fired
 * toast.success("Connected X"). Nothing was connected, nothing persisted, and a
 * reload undid it -- the page claimed an integration the product does not have.
 */
type Integration = {
  id: string;
  name: string;
  description: string;
  category: "CRM" | "Communication" | "Scheduling" | "Automation" | "Analytics";
  icon: string;
};

const INTEGRATIONS: Integration[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Sync contacts, leads, and call logs with Salesforce CRM.",
    category: "CRM",
    icon: "☁️",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Push call data, contacts, and deal updates to HubSpot.",
    category: "CRM",
    icon: "🟠",
  },
  {
    id: "zoho",
    name: "Zoho CRM",
    description: "Connect with Zoho for lead management and call tracking.",
    category: "CRM",
    icon: "🔴",
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "Use Twilio as your telephony provider for inbound and outbound calls.",
    category: "Communication",
    icon: "📞",
  },
  {
    id: "exotel",
    name: "Exotel",
    description: "Indian telephony provider for local numbers and IVR routing.",
    category: "Communication",
    icon: "📱",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "Send follow-up messages and chat via WhatsApp Business API.",
    category: "Communication",
    icon: "💬",
  },
  {
    id: "calendly",
    name: "Calendly",
    description: "Let your AI agent book appointments directly into Calendly.",
    category: "Scheduling",
    icon: "📅",
  },
  {
    id: "cal",
    name: "Cal.com",
    description: "Open-source scheduling integration for appointment booking.",
    category: "Scheduling",
    icon: "🗓️",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect to 5000+ apps with triggers and actions from your voice agent.",
    category: "Automation",
    icon: "⚡",
  },
  {
    id: "make",
    name: "Make (Integromat)",
    description: "Visual automation workflows triggered by call events.",
    category: "Automation",
    icon: "🔧",
  },
  {
    id: "webhook",
    name: "Custom Webhook",
    description: "Send call events, transcripts, and summaries to any URL.",
    category: "Automation",
    icon: "🔗",
  },
  {
    id: "ga4",
    name: "Google Analytics",
    description: "Track call conversions and agent performance in GA4.",
    category: "Analytics",
    icon: "📊",
  },
];

const CATEGORIES = ["All", "CRM", "Communication", "Scheduling", "Automation", "Analytics"] as const;

function IntegrationsPage() {
  const [filter, setFilter] = useState<string>("All");

  const filtered = filter === "All" ? INTEGRATIONS : INTEGRATIONS.filter((i) => i.category === filter);

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Planned connections to CRM, scheduling and communication platforms."
      />

      <Panel className="mb-6 flex items-start gap-3 px-5 py-4">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-[0.88rem] leading-relaxed text-muted-foreground">
          None of these are available yet — this is what we plan to build, not what you can switch on today.
          To connect a phone number now, use <span className="text-ink">Phone Numbers</span>, which is the one
          telephony path that is actually wired.
        </p>
      </Panel>

      {/* Category tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilter(cat)}
            className={`rounded-full border px-4 py-1.5 text-[0.82rem] font-medium transition-colors ${
              filter === cat
                ? "border-ink bg-ink text-primary-foreground"
                : "border-line text-muted-foreground hover:bg-secondary hover:text-ink"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">
          On the roadmap
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  return (
    <Panel className="flex flex-col p-5 opacity-70">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[1.3rem]">{integration.icon}</span>
          <div>
            <p className="text-[0.92rem] font-medium text-ink">{integration.name}</p>
            <Pill tone="neutral">{integration.category}</Pill>
          </div>
        </div>
      </div>
      <p className="mt-3 flex-1 text-[0.82rem] leading-relaxed text-muted-foreground">
        {integration.description}
      </p>
      {/* Rendered as a disabled button rather than plain text so it reads as the
          control it will become, without being clickable. */}
      <button
        type="button"
        disabled
        title="Not available yet"
        className="mt-4 w-full cursor-not-allowed rounded-[8px] border border-line px-4 py-2 text-[0.82rem] font-medium text-muted-foreground"
      >
        Coming soon
      </button>
    </Panel>
  );
}
