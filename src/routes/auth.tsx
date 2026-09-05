import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

const title = "Sign in — Trellient";
const description = "Sign in to the Trellient dashboard to manage your business data and AI voice agent.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Check if Supabase is properly configured
  const isConfigured = Boolean(
    import.meta.env["VITE_SUPABASE_URL"] &&
    import.meta.env["VITE_SUPABASE_URL"] !== "https://placeholder.supabase.co" &&
    (import.meta.env["VITE_SUPABASE_ANON_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]),
  );

  useEffect(() => {
    if (!isConfigured) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        void navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, isConfigured]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConfigured) {
      toast.error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            // When email confirmation is disabled in Supabase,
            // the user is auto-confirmed and data.session is returned.
          },
        });
        if (error) throw error;
        if (data.session) {
          // Auto-confirmed — navigate immediately
          toast.success("Account created! Redirecting…");
          return;
        }
        // Email confirmation is required — show message
        toast.success("Check your email to confirm your account, then sign in.");
        setMode("signin");
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in!");
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Could not sign in.";
      // Provide friendlier error messages
      if (msg.includes("Invalid login credentials")) {
        toast.error("Wrong email or password. Try again or create an account.");
      } else if (msg.includes("already registered")) {
        toast.error("This email is already registered. Try signing in instead.");
        setMode("signin");
      } else if (msg.includes("Password should be")) {
        toast.error("Password must be at least 6 characters.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!isConfigured) {
      toast.error("Supabase is not configured. Add your credentials to the .env file first.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth" },
    });
    if (error) {
      toast.error("Google sign-in failed. Try again.");
    }
  }

  return (
    <div className="container-x flex min-h-[72vh] items-center justify-center py-20">
      <div className="w-full max-w-[26rem] rounded-[14px] border border-line bg-card p-8">
        <p className="eyebrow text-muted-foreground">Trellient dashboard</p>
        <h1 className="font-display mt-3 text-[1.9rem] leading-tight tracking-tight text-ink">
          {mode === "signin" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-2 text-[0.9rem] text-muted-foreground">
          Manage your business data and the customer voice agent.
        </p>

        {!isConfigured && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[0.85rem] text-amber-800">
            <strong>Setup required:</strong> Open your{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-[0.78rem]">.env</code> file and add your
            Supabase <code className="rounded bg-amber-100 px-1 py-0.5 text-[0.78rem]">VITE_SUPABASE_ANON_KEY</code>.
            Get it from your{" "}
            <a
              href="https://supabase.com/dashboard/project/curqreiywlyhesldgmia/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Supabase dashboard → Settings → API
            </a>.
          </div>
        )}

        {/* Google OAuth — hidden for now, enable later */}
        {/* <button
          type="button"
          onClick={() => void google()}
          className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-full border border-input px-5 py-3 text-[0.9rem] font-medium transition-colors hover:bg-secondary"
        >
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <path fill="#4285F4" d="M23 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-4.9 3.4-8.5Z" />
            <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1a7 7 0 0 1-6.6-4.8H1.6v3A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.4 14.6a7.2 7.2 0 0 1 0-4.6v-3H1.6a12 12 0 0 0 0 10.6l3.8-3Z" />
            <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.3-3.3A12 12 0 0 0 1.6 7l3.8 3A7 7 0 0 1 12 4.8Z" />
          </svg>
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div> */}

        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block">
            <span className="text-[0.78rem] font-medium text-muted-foreground">Work email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-1.5 w-full rounded-[8px] border border-input bg-background px-3.5 py-2.5 text-[0.95rem] outline-none focus-visible:border-ink"
            />
          </label>
          <label className="block">
            <span className="text-[0.78rem] font-medium text-muted-foreground">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="mt-1.5 w-full rounded-[8px] border border-input bg-background px-3.5 py-2.5 text-[0.95rem] outline-none focus-visible:border-ink"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary px-6 py-3 text-[0.92rem] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-[0.85rem] text-muted-foreground">
          {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-ink underline decoration-line underline-offset-4"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
        <p className="mt-4 text-center text-[0.8rem] text-muted-foreground">
          <Link to="/">Back to trellient.com</Link>
        </p>
      </div>
    </div>
  );
}
