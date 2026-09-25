import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { apiGet } from "@/lib/api/client";
import { type CurrentUser } from "@/lib/api/contracts";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Spring: GET /api/auth/me. 204 means "nobody", which the client surfaces
    // as undefined — normalise so a signed-out visitor redirects rather than
    // falling through as a truthy value. Safe to call the browser-only client
    // here because this route is ssr: false.
    const user = (await apiGet<CurrentUser | null>("/auth/me")) ?? null;
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  // Without these, a slow or failed session lookup renders an empty page.
  pendingMs: 0,
  pendingComponent: () => (
    <div className="container-x py-24 text-center text-[0.92rem] text-muted-foreground">
      Checking your session…
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="container-x py-24 text-center">
      <h1 className="font-display text-[1.5rem] tracking-tight text-ink">Couldn’t load your dashboard</h1>
      <p className="mt-3 text-[0.92rem] text-muted-foreground">
        {error instanceof Error && error.message ? error.message : "Please refresh and try again."}
      </p>
      <a
        href="/auth"
        className="mt-6 inline-flex rounded-full bg-primary px-6 py-2.5 text-[0.88rem] font-medium text-primary-foreground"
      >
        Go to sign in
      </a>
    </div>
  ),
  component: () => <Outlet />,
});
