import { createFileRoute } from "@tanstack/react-router";

import { CrudSection } from "@/components/dashboard/CrudSection";
import { PageHeader } from "@/components/dashboard/Shell";
import { LANGUAGE_LABELS, useBusiness } from "@/lib/business/useBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/contacts")({
  component: CustomersPage,
});

function CustomersPage() {
  const { data: ctx } = useBusiness();
  if (!ctx) return null;

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Callers the agent recognises. Repeat callers are matched on phone number."
      />
      <CrudSection
        table="customers"
        businessId={ctx.business.id}
        createLabel="Add customer"
        emptyMessage="No customers yet. They are created automatically when someone calls."
        searchColumns={["name", "phone", "email"]}
        fields={[
          { name: "name", label: "Name", type: "text" },
          { name: "phone", label: "Phone", type: "text", required: true, placeholder: "+9198…" },
          { name: "email", label: "Email", type: "text" },
          {
            name: "preferred_language",
            label: "Preferred language",
            type: "select",
            options: Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label })),
          },
          { name: "notes", label: "Notes", type: "textarea" },
        ]}
        columns={[
          { key: "name", label: "Name", render: (r) => String(r["name"] ?? "Unknown") },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          {
            key: "preferred_language",
            label: "Language",
            render: (r) => LANGUAGE_LABELS[String(r["preferred_language"])] ?? "—",
          },
        ]}
      />
    </div>
  );
}
