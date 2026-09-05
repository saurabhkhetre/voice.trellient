import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";
import {
  Menu,
  X,
  Home,
  Bot,
  BookOpen,
  Phone,
  PhoneOutgoing,
  History,
  MessageSquare,
  Users,
  BarChart3,
  Radio,
  ShieldCheck,
  Bell,
  Puzzle,
  CreditCard,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business/useBusiness";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const DASHBOARD_NAV: (NavItem | NavGroup)[] = [
  { to: "/dashboard", label: "Home", icon: Home },
  {
    label: "BUILD",
    items: [
      { to: "/dashboard/agents", label: "Agents", icon: Bot },
      { to: "/dashboard/knowledge", label: "Knowledge Base", icon: BookOpen },
    ],
  },
  {
    label: "DEPLOY",
    items: [
      { to: "/dashboard/phone-numbers", label: "Phone Numbers", icon: Phone },
      { to: "/dashboard/batch-call", label: "Batch Call", icon: PhoneOutgoing },
    ],
  },
  {
    label: "DATA",
    items: [
      { to: "/dashboard/call-history", label: "Call History", icon: History },
      { to: "/dashboard/chat-history", label: "Chat History", icon: MessageSquare },
      { to: "/dashboard/contacts", label: "Contacts", icon: Users },
    ],
  },
  {
    label: "MONITOR",
    items: [
      { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/dashboard/live-monitoring", label: "Live Monitoring", icon: Radio },
      { to: "/dashboard/ai-quality", label: "AI Quality Assurance", icon: ShieldCheck },
      { to: "/dashboard/alerting", label: "Alerting", icon: Bell },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { to: "/dashboard/integrations", label: "Integrations", icon: Puzzle },
      { to: "/dashboard/billing", label: "Billing", icon: CreditCard },
      { to: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

function isGroup(item: NavItem | NavGroup): item is NavGroup {
  return "items" in item;
}

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/dashboard" }}
      className="flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-[0.86rem] text-onnavy-muted transition-colors hover:bg-white/[0.07] hover:text-onnavy"
      activeProps={{ className: "bg-white/[0.1] text-onnavy" }}
      onClick={onClick}
    >
      <Icon className="size-[1.05rem] shrink-0" />
      {item.label}
    </Link>
  );
}

function MobileNavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/dashboard" }}
      className="flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-[0.88rem] text-muted-foreground hover:bg-secondary hover:text-ink"
      activeProps={{ className: "bg-secondary text-ink" }}
      onClick={onClick}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { data } = useBusiness();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [conductorOpen, setConductorOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[100rem] gap-0">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[15.5rem] shrink-0 flex-col border-r border-line bg-navy px-4 py-6 text-onnavy lg:flex">
          <Link to="/dashboard" className="flex items-center gap-2.5 px-2">
            <svg viewBox="0 0 24 24" className="size-5 text-onnavy" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeWidth="1.5" d="M3 5h18M12 5v14M6 9.5h12M8 14h8" />
            </svg>
            <span className="font-display text-[1.1rem] tracking-tight text-onnavy">Trellient</span>
          </Link>

          {/* Workspace label */}
          <div className="mt-5 rounded-[8px] bg-white/[0.06] px-3 py-2">
            <p className="truncate text-[0.78rem] font-medium text-onnavy">
              {data?.business.name ?? "Loading…"}
            </p>
            <p className="truncate text-[0.68rem] text-onnavy-muted">{data?.email ?? ""}</p>
          </div>

          <nav aria-label="Dashboard" className="mt-5 flex-1 space-y-1 overflow-y-auto">
            {DASHBOARD_NAV.map((entry, i) =>
              isGroup(entry) ? (
                <div key={entry.label} className={cn(i > 0 && "mt-5")}>
                  <p className="mb-1.5 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-onnavy-muted/60">
                    {entry.label}
                  </p>
                  <div className="space-y-0.5">
                    {entry.items.map((item) => (
                      <NavLink key={item.to} item={item} />
                    ))}
                  </div>
                </div>
              ) : (
                <NavLink key={entry.to} item={entry} />
              ),
            )}
          </nav>

          <div className="mt-4 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => setConductorOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-[0.86rem] text-onnavy-muted transition-colors hover:bg-white/[0.07] hover:text-onnavy"
            >
              <Sparkles className="size-4" />
              Conductor
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-1 w-full rounded-[8px] px-3 py-2 text-left text-[0.82rem] text-onnavy-muted hover:text-onnavy"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Main area */}
        <div className="min-w-0 flex-1">
          {/* Mobile header */}
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 lg:hidden">
            <span className="font-display text-[1.1rem] tracking-tight text-ink">Trellient</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Conductor" onClick={() => setConductorOpen((v) => !v)}>
                <Sparkles className="size-5 text-muted-foreground" />
              </button>
              <button type="button" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
            </div>
          </header>
          {open ? (
            <nav aria-label="Dashboard" className="grid gap-0.5 border-b border-line bg-card px-4 py-3 lg:hidden">
              {DASHBOARD_NAV.map((entry) =>
                isGroup(entry) ? (
                  <div key={entry.label}>
                    <p className="mb-1 mt-3 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
                      {entry.label}
                    </p>
                    {entry.items.map((item) => (
                      <MobileNavLink key={item.to} item={item} onClick={() => setOpen(false)} />
                    ))}
                  </div>
                ) : (
                  <MobileNavLink key={entry.to} item={entry} onClick={() => setOpen(false)} />
                ),
              )}
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-3 rounded-[8px] px-3 py-2 text-left text-[0.9rem] text-muted-foreground"
              >
                Sign out
              </button>
            </nav>
          ) : null}
          <main className="px-5 py-8 md:px-9 md:py-10">{children}</main>
        </div>

        {/* Conductor panel — lazy-loaded to reduce main bundle */}
        {conductorOpen ? (
          <Suspense fallback={
            <aside className="sticky top-0 hidden h-screen w-[22rem] shrink-0 items-center justify-center border-l border-line bg-card lg:flex">
              <p className="text-[0.88rem] text-muted-foreground">Loading Conductor…</p>
            </aside>
          }>
            <LazyConductorPanel onClose={() => setConductorOpen(false)} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Conductor AI assistant panel (lazy-loaded) ---------- */

const LazyConductorPanel = lazy(() =>
  Promise.resolve({ default: ConductorPanel }),
);

function ConductorPanel({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "Hi! I'm Conductor, your AI assistant. Paste a website URL or describe the agent you want to build, and I'll help you set it up." },
  ]);

  function send() {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setInput("");
    // Simulate an assistant response
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: userMsg.includes("http")
            ? `I'll analyze ${userMsg} to understand your business. Give me a moment to read the site and suggest an agent configuration…`
            : "I can help with that! Let me draft a prompt and configuration for your agent based on what you described.",
        },
      ]);
    }, 800);
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[22rem] shrink-0 flex-col border-l border-line bg-card lg:flex">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-brass" />
          <span className="font-display text-[1rem] tracking-tight text-ink">Conductor</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Conductor">
          <X className="size-4 text-muted-foreground hover:text-ink" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={cn("text-[0.88rem] leading-relaxed", msg.role === "user" ? "text-ink" : "text-muted-foreground")}>
            <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
              {msg.role === "user" ? "You" : "Conductor"}
            </span>
            {msg.text}
          </div>
        ))}
      </div>

      <div className="border-t border-line p-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Paste a URL or describe your agent…"
            className="min-w-0 flex-1 rounded-[8px] border border-line bg-background px-3 py-2 text-[0.88rem] outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={send}
            className="rounded-[8px] bg-primary px-3 py-2 text-[0.82rem] font-medium text-primary-foreground"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Shared UI primitives ---------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        {eyebrow ? <p className="eyebrow text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="font-display mt-2 text-[1.9rem] leading-tight tracking-tight text-ink md:text-[2.2rem]">
          {title}
        </h1>
        {description ? (
          <p className="measure mt-2 text-[0.95rem] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-[12px] border border-line bg-card", className)}>{children}</section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-card px-5 py-5">
      <p className="text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="font-display mt-3 text-[1.9rem] leading-none tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-2 text-[0.8rem] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.72rem] font-medium",
        tone === "neutral" && "border-line text-muted-foreground",
        tone === "good" && "border-ink/20 bg-secondary text-ink",
        tone === "warn" && "border-brass/40 text-brass",
        tone === "bad" && "border-destructive/40 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-[0.9rem] text-muted-foreground">{children}</p>;
}
