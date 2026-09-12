import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Phone, PlusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageHeader, Panel, Pill } from "@/components/dashboard/Shell";
import { useBusiness } from "@/lib/business/useBusiness";
import {
  addPhoneNumber,
  deletePhoneNumber,
  listPhoneNumbers,
  updatePhoneNumber,
} from "@/lib/telephony/phone-numbers.functions";
import { listAgentConfigs } from "@/lib/voice/agent-configs.functions";

export const Route = createFileRoute("/_authenticated/dashboard/phone-numbers")({
  component: PhoneNumbersPage,
});

function PhoneNumbersPage() {
  const { data: ctx } = useBusiness();
  const businessId = ctx?.business.id;
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const fetchNumbers = useServerFn(listPhoneNumbers);
  const fetchAgents = useServerFn(listAgentConfigs);
  const addNumber = useServerFn(addPhoneNumber);
  const updateNumber = useServerFn(updatePhoneNumber);
  const removeNumber = useServerFn(deletePhoneNumber);

  const queryKey = ["phone-numbers", businessId];

  const numbers = useQuery({
    queryKey,
    enabled: Boolean(businessId),
    staleTime: 60_000,
    queryFn: () => fetchNumbers({ data: { businessId: businessId! } }),
  });

  const agents = useQuery({
    queryKey: ["agent-configs", businessId],
    enabled: Boolean(businessId),
    staleTime: 5 * 60_000,
    queryFn: () => fetchAgents({ data: { businessId: businessId! } }),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const addMutation = useMutation({
    mutationFn: () =>
      addNumber({ data: { businessId: businessId!, phoneNumber: newNumber, label: newLabel.trim() || null } }),
    onSuccess: () => {
      toast.success("Phone number added. Configure your telephony provider to point at your Trellient webhook.");
      setNewNumber("");
      setNewLabel("");
      setShowAdd(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { agentConfigId?: string | null; active?: boolean } }) =>
      updateNumber({ data: { phoneNumberId: id, ...patch } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeNumber({ data: { phoneNumberId: id } }),
    onSuccess: () => {
      toast.success("Phone number removed.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Phone Numbers"
        description="Manage phone numbers for inbound and outbound calling."
        action={
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground"
          >
            <PlusCircle className="size-4" /> Add Number
          </button>
        }
      />

      {showAdd && (
        <Panel className="mb-6 p-6">
          <h2 className="font-display text-[1.15rem] tracking-tight text-ink">Add a phone number</h2>
          <p className="mt-1 text-[0.82rem] text-muted-foreground">
            Add the phone number your callers dial. Then point your telephony provider's webhook at your Trellient endpoint.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[0.82rem] font-medium text-ink">Phone number</span>
              <input
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="+91 9876543210"
                required
                className="input-base mt-2"
              />
            </label>
            <label className="block">
              <span className="text-[0.82rem] font-medium text-ink">Label (optional)</span>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Main line, Support, etc."
                className="input-base mt-2"
              />
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={addMutation.isPending}
                className="rounded-full bg-primary px-5 py-2.5 text-[0.85rem] font-medium text-primary-foreground disabled:opacity-60"
              >
                {addMutation.isPending ? "Adding…" : "Save"}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-[0.85rem] text-muted-foreground hover:text-ink">
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        {numbers.isLoading ? (
          <EmptyState>Loading…</EmptyState>
        ) : (numbers.data ?? []).length === 0 ? (
          <EmptyState>No phone numbers yet. Add one to start receiving calls.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {numbers.data!.map((num) => (
              <li key={num.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Phone className="size-4 shrink-0 text-brass" />
                  <div>
                    <p className="font-mono text-[0.92rem] font-medium text-ink">{num.phoneNumber}</p>
                    <p className="text-[0.78rem] text-muted-foreground">
                      {num.label ?? "Unlabelled"} · {num.provider}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Agent assignment */}
                  <select
                    value={num.agentConfigId ?? ""}
                    onChange={(e) =>
                      updateMutation.mutate({
                        id: num.id,
                        patch: { agentConfigId: e.target.value || null },
                      })
                    }
                    className="input-base w-auto py-1.5 text-[0.8rem]"
                  >
                    <option value="">Unassigned</option>
                    {(agents.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {/* Active toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      updateMutation.mutate({ id: num.id, patch: { active: !num.active } })
                    }
                    className="rounded-full border border-line px-3 py-1.5 text-[0.78rem] text-ink hover:bg-secondary"
                  >
                    {num.active ? "Active" : "Paused"}
                  </button>
                  <Pill tone={num.active ? "good" : "neutral"}>
                    {num.active ? "Live" : "Inactive"}
                  </Pill>
                  {/* Delete with confirmation */}
                  {confirmDelete === num.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { removeMutation.mutate(num.id); setConfirmDelete(null); }}
                        className="rounded-full bg-destructive px-3 py-1.5 text-[0.78rem] text-white"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="text-[0.78rem] text-muted-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(num.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
