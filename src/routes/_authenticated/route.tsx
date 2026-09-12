import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getCurrentUser } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getCurrentUser();
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
