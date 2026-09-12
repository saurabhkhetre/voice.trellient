import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getCurrentUser, signIn, signUp } from "@/lib/auth/auth.functions";

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
  const queryClient = useQueryClient();
  const checkSession = useServerFn(getCurrentUser);
  const signInFn = useServerFn(signIn);
  const signUpFn = useServerFn(signUp);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in: go straight to the dashboard.
  useEffect(() => {
    checkSession()
      .then((user) => {
        if (user) void navigate({ to: "/dashboard", replace: true });
      })
      .catch(() => {
        // Treat a failed check as signed out; the form stays usable.
      });
  }, [checkSession, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpFn({ data: { email, password } });
        toast.success("Account created.");
      } else {
        await signInFn({ data: { email, password } });
      }
      // Another account may have been signed in before; drop its cached data.
      queryClient.clear();
      void navigate({ to: "/dashboard", replace: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not sign in. Try again.";
      toast.error(message);
      if (message.includes("already registered")) setMode("signin");
    } finally {
      setBusy(false);
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

        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block">
            <span className="text-[0.78rem] font-medium text-muted-foreground">Work email</span>
            <input
              type="email"
              required
              autoComplete="email"
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
              minLength={mode === "signup" ? 8 : 1}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
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
