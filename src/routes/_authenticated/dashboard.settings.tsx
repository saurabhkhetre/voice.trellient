import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { RecordForm, type Row } from "@/components/dashboard/CrudSection";
import { EmptyState, PageHeader, Panel, Pill } from "@/components/dashboard/Shell";
import { apiGet, apiPatch } from "@/lib/api/client";
import { type TeamMember } from "@/lib/api/contracts";
import { useBusiness } from "@/lib/business/useBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: ctx } = useBusiness();
  const queryClient = useQueryClient();
  const businessId = ctx?.business.id;
  const team = useQuery({
    queryKey: ["team", businessId],
    enabled: Boolean(businessId),
    // Spring: GET /api/business/team?businessId — any member may read it.
    queryFn: () => apiGet<TeamMember[]>("/business/team", { businessId: businessId! }),
  });

  const save = useMutation({
    // Spring: PATCH /api/business/{businessId} — owner/manager only, and the
    // values go in the body rather than nested under `values`. A rejection
    // arrives as an ApiError, which onError already surfaces as its message.
    mutationFn: (values: Row) => apiPatch<void>(`/business/${businessId!}`, values),
    onSuccess: () => {
      toast.success("Business details saved.");
      void queryClient.invalidateQueries({ queryKey: ["business-context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!ctx) return null;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Business identity, timezone and default language. Used by the agent on every call."
        action={<Pill tone="neutral">You are {ctx.role}</Pill>}
      />

      <RecordForm
        submitLabel="Save business"
        busy={save.isPending}
        initial={ctx.business as unknown as Row}
        onSubmit={(values) => save.mutate(values)}
        fields={[
          { name: "name", label: "Business name", type: "text", required: true },
          { name: "legal_name", label: "Legal name", type: "text" },
          { name: "phone", label: "Main phone", type: "text" },
          { name: "email", label: "Contact email", type: "text" },
          { name: "timezone", label: "Timezone", type: "text", help: "IANA name, e.g. Asia/Kolkata." },
          {
            name: "default_language",
            label: "Default language",
            type: "select",
            options: [
              { value: "en", label: "English" },
              { value: "hi", label: "Hindi" },
              { value: "mr", label: "Marathi" },
            ],
          },
          { name: "address", label: "Address", type: "textarea" },
        ]}
      />

      <Panel className="mt-8">
        <header className="border-b border-line px-5 py-3.5">
          <h2 className="text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Team</h2>
        </header>
        {(team.data ?? []).length === 0 ? (
          <EmptyState>No teammates yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {team.data!.map((member) => (
              <li key={member.id} className="flex items-center justify-between px-5 py-4">
                <span className="text-[0.88rem] text-ink">
                  {member.authUserId === ctx.userId ? `${ctx.email ?? "Your account"} (you)` : member.authUserId}
                </span>
                <Pill tone={member.role === "owner" ? "good" : "neutral"}>{member.role}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mt-6 px-5 py-5">
        <h2 className="text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground">Telephony</h2>
        <p className="measure mt-3 text-[0.9rem] text-muted-foreground">
          The agent runtime connects to a phone number through a telephony provider. Exotel is wired and waiting for
          credentials — once your account is ready, we point your number at the Trellient webhook and calls start
          landing here.
        </p>
      </Panel>
    </div>
  );
}
