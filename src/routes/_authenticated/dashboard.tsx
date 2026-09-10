import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { DashboardShell } from "@/components/dashboard/Shell";
import { useBusiness } from "@/lib/business/useBusiness";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Trellient" },
      { name: "description", content: "Manage business data, the customer voice agent, calls and approvals." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardLayout,
  errorComponent: ({ error }) => (
    <div className="container-x py-20 text-center">
      <h1 className="font-display text-[1.6rem] text-ink">Something went wrong</h1>
      <p className="mt-3 text-[0.92rem] text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-x py-20 text-center text-muted-foreground">Page not found.</div>
  ),
});

async function fetchProvisionWorkspace() {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/business/provision`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}` 
    },
    body: JSON.stringify({ companyName: "My Workspace" }) // Simple default since UI doesn't collect name yet
  });
  if (!res.ok) throw new Error("Failed to provision workspace");
  return res.json();
}

function DashboardLayout() {
  const { data, isLoading } = useBusiness();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => fetchProvisionWorkspace(),
    onSuccess: () => {
      toast.success("Workspace ready.");
      void queryClient.invalidateQueries({ queryKey: ["business-context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DashboardShell>
      {isLoading ? (
        <p className="text-[0.92rem] text-muted-foreground">Loading your workspace…</p>
      ) : !data ? (
        <div className="rounded-[12px] border border-line bg-card p-8">
          <h1 className="font-display text-[1.5rem] tracking-tight text-ink">No workspace yet</h1>
          <p className="measure mt-3 text-[0.93rem] text-muted-foreground">
            Create your own workspace to get instant access to the Voice Agent Dashboard, products, pricing and
            call history. You’ll be the owner.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="inline-flex rounded-full bg-primary px-6 py-2.5 text-[0.88rem] font-medium text-primary-foreground disabled:opacity-60"
            >
              {create.isPending ? "Setting up…" : "Create my workspace"}
            </button>
            <a href="https://trellient.com/contact" target="_blank" rel="noopener noreferrer" className="text-[0.88rem] text-muted-foreground underline hover:text-ink">
              Contact Trellient
            </a>
          </div>
        </div>
      ) : (
        <Outlet />
      )}

    </DashboardShell>
  );
}
