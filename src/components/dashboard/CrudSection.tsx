import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Panel } from "@/components/dashboard/Shell";
import { cn } from "@/lib/utils";

export type FieldType = "text" | "textarea" | "number" | "boolean" | "select";

export interface CrudField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  max?: number;
}

export type Row = Record<string, unknown>;

export interface CrudColumn {
  key: string;
  label: string;
  render?: (row: Row) => React.ReactNode;
  className?: string;
}

interface CrudSectionProps {
  table: string;
  businessId: string;
  fields: CrudField[];
  columns: CrudColumn[];
  orderBy?: { column: string; ascending?: boolean };
  searchColumns?: string[];
  createLabel?: string;
  emptyMessage?: string;
}

/**
 * Business-scoped CRUD surface. Every read and write is filtered by the
 * business resolved from the session, and row-level security enforces the same
 * boundary server-side.
 */
export function CrudSection({
  table,
  businessId,
  fields,
  columns,
  orderBy = { column: "created_at", ascending: false },
  searchColumns = [],
  createLabel = "Add",
  emptyMessage = "Nothing here yet.",
}: CrudSectionProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const queryKey = useMemo(() => [table, businessId], [table, businessId]);

  const list = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as never)
        .select("*")
        .eq("business_id", businessId)
        .order(orderBy.column, { ascending: orderBy.ascending ?? false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const save = useMutation({
    mutationFn: async (values: Row) => {
      const payload = { ...values, business_id: businessId };
      if (editing?.["id"]) {
        const { error } = await supabase
          .from(table as never)
          .update(payload as never)
          .eq("id", editing["id"] as string);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved.");
      setEditing(null);
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (list.data ?? []).filter((row) => {
    if (!search.trim() || searchColumns.length === 0) return true;
    const needle = search.toLowerCase();
    return searchColumns.some((col) => String(row[col] ?? "").toLowerCase().includes(needle));
  });

  const formOpen = creating || editing !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {searchColumns.length > 0 ? (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full max-w-xs rounded-full border border-input bg-background px-4 py-2 text-[0.9rem] outline-none focus-visible:border-ink"
          />
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
          {createLabel}
        </button>
      </div>

      {formOpen ? (
        <RecordForm
          fields={fields}
          initial={editing ?? {}}
          busy={save.isPending}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(values) => save.mutate(values)}
        />
      ) : null}

      <Panel>
        {list.isLoading ? (
          <EmptyState>Loading…</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState>{emptyMessage}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.9rem]">
              <thead>
                <tr className="border-b border-line text-left">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row["id"])} className="border-b border-line/70 last:border-b-0">
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-5 py-3.5 align-top", col.className)}>
                        {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <button
                        type="button"
                        aria-label="Edit"
                        className="mr-3 text-muted-foreground transition-colors hover:text-ink"
                        onClick={() => {
                          setCreating(false);
                          setEditing(row);
                        }}
                      >
                        <Pencil className="size-4" strokeWidth={1.7} />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        onClick={() => {
                          if (window.confirm("Delete this record?")) remove.mutate(String(row["id"]));
                        }}
                      >
                        <Trash2 className="size-4" strokeWidth={1.7} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function RecordForm({
  fields,
  initial,
  busy,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: {
  fields: CrudField[];
  initial: Row;
  busy?: boolean;
  onSubmit: (values: Row) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Row>(() => {
    const seed: Row = {};
    for (const field of fields) {
      const current = initial[field.name];
      seed[field.name] =
        current ?? (field.type === "boolean" ? true : field.type === "number" ? "" : "");
    }
    return seed;
  });

  function set(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Row = {};
    for (const field of fields) {
      const raw = values[field.name];
      if (field.type === "number") {
        payload[field.name] = raw === "" || raw == null ? null : Number(raw);
      } else if (field.type === "boolean") {
        payload[field.name] = Boolean(raw);
      } else {
        const text = String(raw ?? "").trim();
        payload[field.name] = text === "" ? null : text;
      }
      if (field.required && (payload[field.name] === null || payload[field.name] === "")) {
        toast.error(`${field.label} is required.`);
        return;
      }
    }
    onSubmit(payload);
  }

  return (
    <form onSubmit={submit} className="rounded-[12px] border border-line bg-card p-6">
      <div className="grid gap-5 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field.name} className={cn("block", field.type === "textarea" && "md:col-span-2")}>
            <span className="text-[0.78rem] font-medium text-muted-foreground">{field.label}</span>
            {field.type === "textarea" ? (
              <textarea
                rows={4}
                maxLength={field.max ?? 4000}
                value={String(values[field.name] ?? "")}
                placeholder={field.placeholder}
                onChange={(e) => set(field.name, e.target.value)}
                className="mt-1.5 w-full rounded-[8px] border border-input bg-background px-3.5 py-2.5 text-[0.93rem] outline-none focus-visible:border-ink"
              />
            ) : field.type === "boolean" ? (
              <div className="mt-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(values[field.name])}
                  onClick={() => set(field.name, !values[field.name])}
                  className={cn(
                    "inline-flex h-6 w-11 items-center rounded-full border border-input transition-colors",
                    values[field.name] ? "bg-primary" : "bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "mx-0.5 size-5 rounded-full bg-background transition-transform",
                      values[field.name] ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>
            ) : field.type === "select" ? (
              <select
                value={String(values[field.name] ?? "")}
                onChange={(e) => set(field.name, e.target.value)}
                className="mt-1.5 w-full rounded-[8px] border border-input bg-background px-3.5 py-2.5 text-[0.93rem] outline-none focus-visible:border-ink"
              >
                <option value="">Select…</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "number" ? "number" : "text"}
                step="any"
                maxLength={field.max ?? 300}
                value={String(values[field.name] ?? "")}
                placeholder={field.placeholder}
                onChange={(e) => set(field.name, e.target.value)}
                className="mt-1.5 w-full rounded-[8px] border border-input bg-background px-3.5 py-2.5 text-[0.93rem] outline-none focus-visible:border-ink"
              />
            )}
            {field.help ? <span className="mt-1 block text-[0.75rem] text-muted-foreground">{field.help}</span> : null}
          </label>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-primary px-6 py-2.5 text-[0.88rem] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-input px-6 py-2.5 text-[0.88rem] font-medium transition-colors hover:bg-secondary"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
