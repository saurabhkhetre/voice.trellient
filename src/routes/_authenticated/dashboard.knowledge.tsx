import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CrudSection } from "@/components/dashboard/CrudSection";
import { PageHeader, Pill } from "@/components/dashboard/Shell";
import { useBusiness } from "@/lib/business/useBusiness";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/knowledge")({
  component: KnowledgePage,
});

function KnowledgePage() {
  const { data: ctx } = useBusiness();
  const [tab, setTab] = useState<"policies" | "notes">("policies");
  if (!ctx) return null;

  return (
    <div>
      <PageHeader
        title="Business knowledge"
        description="Policies and background the agent quotes verbatim. Anything not here, it will not invent."
      />

      <div className="mb-6 inline-flex rounded-full border border-line p-1">
        {(["policies", "notes"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-5 py-2 text-[0.85rem] font-medium transition-colors",
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink",
            )}
          >
            {key === "policies" ? "Policies" : "Knowledge notes"}
          </button>
        ))}
      </div>

      {tab === "policies" ? (
        <CrudSection
          table="business_policies"
          businessId={ctx.business.id}
          createLabel="Add policy"
          emptyMessage="No policies yet. Add returns, warranty, payment and delivery rules."
          searchColumns={["title", "policy_type"]}
          fields={[
            {
              name: "policy_type",
              label: "Type",
              type: "select",
              required: true,
              options: [
                { value: "returns", label: "Returns" },
                { value: "warranty", label: "Warranty" },
                { value: "payment", label: "Payment" },
                { value: "delivery", label: "Delivery" },
                { value: "cancellation", label: "Cancellation" },
                { value: "hours", label: "Hours & location" },
                { value: "other", label: "Other" },
              ],
            },
            { name: "title", label: "Title", type: "text", required: true },
            { name: "content", label: "Policy text (spoken as written)", type: "textarea", required: true },
            { name: "active", label: "Active", type: "boolean" },
          ]}
          columns={[
            { key: "title", label: "Policy" },
            { key: "policy_type", label: "Type" },
            {
              key: "content",
              label: "Content",
              className: "max-w-[30rem]",
              render: (r) => (
                <span className="line-clamp-2 text-muted-foreground">{String(r["content"] ?? "")}</span>
              ),
            },
            {
              key: "active",
              label: "Status",
              render: (r) => <Pill tone={r["active"] ? "good" : "neutral"}>{r["active"] ? "Live" : "Off"}</Pill>,
            },
          ]}
        />
      ) : (
        <CrudSection
          table="agent_knowledge"
          businessId={ctx.business.id}
          createLabel="Add note"
          emptyMessage="No knowledge notes yet."
          searchColumns={["title"]}
          fields={[
            { name: "title", label: "Title", type: "text", required: true },
            { name: "content", label: "Content", type: "textarea", required: true },
            { name: "source_reference", label: "Source (optional)", type: "text" },
            { name: "active", label: "Active", type: "boolean" },
          ]}
          columns={[
            { key: "title", label: "Note" },
            {
              key: "content",
              label: "Content",
              className: "max-w-[30rem]",
              render: (r) => (
                <span className="line-clamp-2 text-muted-foreground">{String(r["content"] ?? "")}</span>
              ),
            },
            {
              key: "active",
              label: "Status",
              render: (r) => <Pill tone={r["active"] ? "good" : "neutral"}>{r["active"] ? "Live" : "Off"}</Pill>,
            },
          ]}
        />
      )}
    </div>
  );
}
