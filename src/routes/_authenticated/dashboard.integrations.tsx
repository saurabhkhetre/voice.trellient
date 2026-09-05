import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Puzzle, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel, Pill } from "@/components/dashboard/Shell";

export const Route = createFileRoute("/_authenticated/dashboard/integrations")({
  component: IntegrationsPage,
});

type Integration = {
  id: string;
  name: string;
  description: string;
  category: "CRM" | "Communication" | "Scheduling" | "Automation" | "Analytics";
  connected: boolean;
  icon: string;
};

const INTEGRATIONS: Integration[] = [
  { id: "salesforce", name: "Salesforce", description: "Sync contacts, leads, and call logs with Salesforce CRM.", category: "CRM", connected: false, icon: "☁️" },
  { id: "hubspot", name: "HubSpot", description: "Push call data, contacts, and deal updates to HubSpot.", category: "CRM", connected: false, icon: "🟠" },
  { id: "zoho", name: "Zoho CRM", description: "Connect with Zoho for lead management and call tracking.", category: "CRM", connected: false, icon: "🔴" },
  { id: "twilio", name: "Twilio", description: "Use Twilio as your telephony provider for inbound and outbound calls.", category: "Communication", connected: true, icon: "📞" },
  { id: "exotel", name: "Exotel", description: "Indian telephony provider for local numbers and IVR routing.", category: "Communication", connected: true, icon: "📱" },
  { id: "whatsapp", name: "WhatsApp Business", description: "Send follow-up messages and chat via WhatsApp Business API.", category: "Communication", connected: false, icon: "💬" },
  { id: "calendly", name: "Calendly", description: "Let your AI agent book appointments directly into Calendly.", category: "Scheduling", connected: false, icon: "📅" },
  { id: "cal", name: "Cal.com", description: "Open-source scheduling integration for appointment booking.", category: "Scheduling", connected: false, icon: "🗓️" },
  { id: "zapier", name: "Zapier", description: "Connect to 5000+ apps with triggers and actions from your voice agent.", category: "Automation", connected: false, icon: "⚡" },
  { id: "make", name: "Make (Integromat)", description: "Visual automation workflows triggered by call events.", category: "Automation", connected: false, icon: "🔧" },
  { id: "webhook", name: "Custom Webhook", description: "Send call events, transcripts, and summaries to any URL.", category: "Automation", connected: false, icon: "🔗" },
  { id: "ga4", name: "Google Analytics", description: "Track call conversions and agent performance in GA4.", category: "Analytics", connected: false, icon: "📊" },
];

const CATEGORIES = ["All", "CRM", "Communication", "Scheduling", "Automation", "Analytics"] as const;

function IntegrationsPage() {
  const [filter, setFilter] = useState<string>("All");
  const [integrations, setIntegrations] = useState(INTEGRATIONS);

  const filtered = filter === "All" ? integrations : integrations.filter((i) => i.category === filter);

  function toggleConnect(id: string) {
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i)),
    );
    const target = integrations.find((i) => i.id === id);
    toast.success(target?.connected ? `Disconnected ${target.name}.` : `Connected ${target?.name ?? "integration"}.`);
  }

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect Trellient to your CRM, scheduling tools, and communication platforms."
      />

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

      {/* Connected */}
      {filtered.some((i) => i.connected) && (
        <div className="mb-6">
          <h2 className="mb-3 text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Connected</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered
              .filter((i) => i.connected)
              .map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onToggle={() => toggleConnect(integration.id)}
                />
              ))}
          </div>
        </div>
      )}

      {/* Available */}
      <div>
        <h2 className="mb-3 text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">Available</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered
            .filter((i) => !i.connected)
            .map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onToggle={() => toggleConnect(integration.id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ integration, onToggle }: { integration: Integration; onToggle: () => void }) {
  return (
    <Panel className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[1.3rem]">{integration.icon}</span>
          <div>
            <p className="text-[0.92rem] font-medium text-ink">{integration.name}</p>
            <Pill tone="neutral">{integration.category}</Pill>
          </div>
        </div>
        {integration.connected && <Check className="size-4 text-ink" />}
      </div>
      <p className="mt-3 flex-1 text-[0.82rem] leading-relaxed text-muted-foreground">{integration.description}</p>
      <button
        type="button"
        onClick={onToggle}
        className={`mt-4 w-full rounded-[8px] border px-4 py-2 text-[0.82rem] font-medium transition-colors ${
          integration.connected
            ? "border-destructive/30 text-destructive hover:bg-destructive/5"
            : "border-line text-ink hover:bg-secondary"
        }`}
      >
        {integration.connected ? "Disconnect" : "Connect"}
      </button>
    </Panel>
  );
}
