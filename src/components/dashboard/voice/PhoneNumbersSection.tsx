import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client";
// Type only — the server functions stay until this page is confirmed on Spring.
import { type PhoneNumber } from "@/lib/api/contracts";

/** Assign inbound numbers to agents. */
export function PhoneNumbersSection({
  businessId,
  agentId,
  agents,
}: {
  businessId: string;
  agentId: string;
  agents: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const queryKey = ["phone-numbers", businessId];
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");

  const numbers = useQuery({
    queryKey,
    // Spring: GET /api/phone-numbers?businessId
    queryFn: () => apiGet<PhoneNumber[]>("/phone-numbers", { businessId }),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const add = useMutation({
    // Spring: POST /api/phone-numbers — owner/manager only.
    mutationFn: () =>
      apiPost<{ id: string }>("/phone-numbers", {
        businessId,
        agentConfigId: agentId,
        phoneNumber: number,
        label: label.trim() || null,
      }),
    onSuccess: () => {
      setNumber("");
      setLabel("");
      toast.success("Number added. Point your telephony webhook at Trellient to go live.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    // Spring: PATCH /api/phone-numbers/{id}
    mutationFn: ({ id, patch }: { id: string; patch: { agentConfigId?: string | null; active?: boolean } }) =>
      apiPatch<void>(`/phone-numbers/${id}`, patch),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    // Spring: DELETE /api/phone-numbers/{id} — owner/manager only.
    mutationFn: (id: string) => apiDelete<void>(`/phone-numbers/${id}`),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const list = numbers.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="+91 80 4718 0000"
          className="input-base"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (front desk)"
          className="input-base"
        />
        <button
          type="button"
          onClick={() => add.mutate()}
          disabled={add.isPending}
          className="rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground disabled:opacity-60"
        >
          Add number
        </button>
      </div>

      <div className="divide-y divide-line rounded-[10px] border border-line">
        {list.length === 0 ? (
          <p className="px-4 py-6 text-center text-[0.85rem] text-muted-foreground">
            No numbers yet. Add the number your callers dial.
          </p>
        ) : (
          list.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Phone className="size-4 shrink-0 text-brass" />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[0.88rem] text-ink">{row.phoneNumber}</span>
                <span className="text-[0.75rem] text-muted-foreground">
                  {row.label ?? "Unlabelled"} · {row.provider}
                </span>
              </span>
              <select
                value={row.agentConfigId ?? ""}
                onChange={(e) =>
                  update.mutate({ id: row.id, patch: { agentConfigId: e.target.value || null } })
                }
                className="input-base w-auto py-1.5 text-[0.8rem]"
              >
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => update.mutate({ id: row.id, patch: { active: !row.active } })}
                className="rounded-full border border-line px-3 py-1.5 text-[0.78rem] text-ink hover:bg-secondary"
              >
                {row.active ? "Active" : "Paused"}
              </button>
              <button
                type="button"
                aria-label="Remove number"
                onClick={() => remove.mutate(row.id)}
                className="text-muted-foreground hover:text-ink"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
