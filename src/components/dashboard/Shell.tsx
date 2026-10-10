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
  Users,
  BarChart3,
  Radio,
  ShieldCheck,
  Bell,
  Puzzle,
  Settings,
  Sparkles,
  LogOut,
  type LucideIcon,
} from "lucide-react";

import { apiPost } from "@/lib/api/client";
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
      // The active marker is a violet rail in the gutter plus a one-step
      // surface lift. A filled pill would spend the accent on navigation,
      // which needs to stay available for the page's primary action.
      className="group relative flex items-center gap-2.5 rounded-md py-[0.4rem] pl-3 pr-3 text-small text-text-secondary transition-[color,background-color] duration-[130ms] ease-out hover:bg-surface-overlay hover:text-text-primary"
      activeProps={{
        className:
          "bg-surface-overlay text-text-primary before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-accent-solid",
      }}
      onClick={onClick}
    >
      <Icon className="size-4 shrink-0 opacity-70 transition-opacity duration-[130ms] group-hover:opacity-100" />
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
    // Spring: POST /api/auth/signout — carries the CSRF header, deletes this
    // session's row and clears the cookie. Other sessions for the same user are
    // untouched; ending them all would need SECURITY.md F-05, which is open.
    try {
      await apiPost<void>("/auth/signout");
    } catch {
      // The session may already be gone server-side. Clear locally regardless,
      // so a stale cookie can never strand someone on the dashboard.
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[100rem] gap-0">
        {/* Desktop sidebar */}
        {/* The sidebar sits on the base surface, one step below the content it
            frames: chrome recedes, content comes forward. */}
        <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
          <Link to="/dashboard" className="flex items-center gap-2.5 rounded-md px-2 py-1">
            <span className="flex size-6 items-center justify-center rounded-[6px] bg-accent-solid">
              <svg
                viewBox="0 0 24 24"
                className="size-[0.95rem] text-white"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeWidth="2" strokeLinecap="round" d="M4 6h16M12 6v12M7 10.5h10M9 15h6" />
              </svg>
            </span>
            <span className="text-title text-text-primary">Trellient</span>
          </Link>

          {/* Workspace. The violet dot is the only accent in the chrome. */}
          <div className="mt-5 flex items-center gap-2.5 rounded-md border border-line bg-surface-raised px-2.5 py-2">
            <span className="relative flex size-1.5 shrink-0 items-center justify-center">
              <span className="absolute size-1.5 rounded-full bg-accent-solid pulse-live" />
              <span className="relative size-1.5 rounded-full bg-accent-solid" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.8rem] font-medium leading-tight text-text-primary">
                {data?.business.name ?? "Loading…"}
              </p>
              <p className="truncate text-micro leading-tight text-text-tertiary">{data?.email ?? ""}</p>
            </div>
          </div>

          <nav aria-label="Dashboard" className="mt-6 flex-1 space-y-0.5 overflow-y-auto pr-1">
            {DASHBOARD_NAV.map((entry, i) =>
              isGroup(entry) ? (
                <div key={entry.label} className={cn(i > 0 && "mt-6")}>
                  <p className="label-caps mb-1.5 px-3">{entry.label}</p>
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

          <div className="mt-4 space-y-0.5 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setConductorOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-[0.4rem] text-small text-text-secondary transition-colors duration-[130ms] hover:bg-surface-overlay hover:text-text-primary"
            >
              <Sparkles className="size-4 opacity-70" />
              Conductor
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-[0.4rem] text-left text-small text-text-tertiary transition-colors duration-[130ms] hover:bg-surface-overlay hover:text-text-primary"
            >
              <LogOut className="size-4 opacity-70" />
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
            <nav
              aria-label="Dashboard"
              className="grid gap-0.5 border-b border-line bg-card px-4 py-3 lg:hidden"
            >
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
          <Suspense
            fallback={
              <aside className="sticky top-0 hidden h-screen w-[22rem] shrink-0 items-center justify-center border-l border-line bg-card lg:flex">
                <p className="text-[0.88rem] text-muted-foreground">Loading Conductor…</p>
              </aside>
            }
          >
            <LazyConductorPanel onClose={() => setConductorOpen(false)} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Conductor AI assistant panel (lazy-loaded) ---------- */

const LazyConductorPanel = lazy(() => Promise.resolve({ default: ConductorPanel }));

/**
 * Conductor is not built. This panel describes what it is meant to do and
 * stops there.
 *
 * It used to hold a chat box that, on send, waited 800ms and appended a canned
 * reply -- "I'll analyze <url> to understand your business. Give me a moment to
 * read the site..." -- with nothing behind it. No request was made, no site was
 * read, and the next message never came. Anyone who pasted a URL was left
 * waiting on an analysis that was never going to happen.
 */
function ConductorPanel({ onClose }: { onClose: () => void }) {
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

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <Pill tone="neutral">Not available yet</Pill>
        <p className="mt-4 text-[0.88rem] leading-relaxed text-muted-foreground">
          Conductor is planned as a way to set an agent up by describing it, or by pointing it at your website
          and letting it read the site to draft a prompt and configuration.
        </p>
        <p className="mt-3 text-[0.88rem] leading-relaxed text-muted-foreground">
          It is not built, so there is nothing to type into yet. In the meantime the same settings are all
          editable by hand under <span className="text-ink">Agents</span> — prompt, voice, guardrails and
          tools.
        </p>
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
    <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
      <div>
        {eyebrow ? <p className="label-caps">{eyebrow}</p> : null}
        <h1 className="text-display mt-2.5 text-text-primary">{title}</h1>
        {description ? <p className="measure mt-2.5 text-body text-text-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("surface-card", className)}>{children}</section>;
}

/**
 * A single metric.
 *
 * `tone` tints the value and shows a marker when a number means something is
 * happening — an active call is not the same kind of zero as calls today.
 * Figures are tabular so a count ticking 9 → 10 does not shift the card.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "live" | "warn";
}) {
  const isLive = tone === "live" && value !== "0" && value !== "—";
  const isWarn = tone === "warn" && value !== "0" && value !== "—";
  return (
    <div className="surface-interactive group px-5 py-[1.15rem] hover:border-line-strong">
      <div className="flex items-center gap-2">
        <p className="label-caps">{label}</p>
        {isLive ? (
          <span className="relative flex size-1.5 items-center justify-center">
            <span className="absolute size-1.5 rounded-full bg-success pulse-live" />
            <span className="relative size-1.5 rounded-full bg-success" />
          </span>
        ) : null}
      </div>
      <p
        data-numeric
        className={cn(
          "mt-3 text-[2rem] font-semibold leading-none tracking-[-0.03em]",
          isWarn ? "text-warn" : "text-text-primary",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-micro text-text-tertiary">{hint}</p> : null}
    </div>
  );
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-[0.1rem] text-micro font-medium",
        tone === "neutral" && "border-line bg-surface-overlay text-text-secondary",
        tone === "good" && "border-transparent bg-success-wash text-success",
        tone === "warn" && "border-transparent bg-warn-wash text-warn",
        tone === "bad" && "border-transparent bg-error-wash text-error",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-12 text-center text-small text-text-tertiary">{children}</p>;
}
