import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  addAgentTool,
  deleteAgentTool,
  listAgentTools,
  updateAgentTool,
  type AgentTool,
  type AgentToolPatch,
} from "@/lib/voice/agent-tools.functions";

const PRESETS: { type: string; name: string; description: string }[] = [
  { type: "end_call", name: "End call", description: "Hang up politely once the caller's request is resolved." },
  { type: "transfer_call", name: "Transfer to human", description: "Hand the caller to a teammate when asked." },
  {
    type: "book_appointment",
    name: "Book appointment",
    description: "Check availability and create an appointment for the caller.",
  },
  { type: "pricing_lookup", name: "Pricing lookup", description: "Read live prices and discount limits." },
  { type: "create_quote", name: "Create quote", description: "Build a quote from products and services." },
  { type: "custom", name: "Custom function", description: "Describe when the agent should call this." },
];

/** Retell-style per-agent tools/functions builder, persisted to agent_tools. */
export function FunctionsSection({ agentId }: { agentId: string; businessId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["agent-tools", agentId];
  const fetchTools = useServerFn(listAgentTools);
  const addTool = useServerFn(addAgentTool);
  const updateTool = useServerFn(updateAgentTool);
  const removeTool = useServerFn(deleteAgentTool);

  const tools = useQuery({
    queryKey,
    queryFn: () => fetchTools({ data: { agentConfigId: agentId } }),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const add = useMutation({
    mutationFn: (preset: (typeof PRESETS)[number]) =>
      addTool({
        data: { agentConfigId: agentId, name: preset.name, description: preset.description, toolType: preset.type },
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AgentToolPatch }) => updateTool({ data: { toolId: id, patch } }),
    // Apply edits locally right away, so typing in a field doesn't wait on the server.
    onMutate: ({ id, patch }) => {
      queryClient.setQueryData<AgentTool[]>(queryKey, (old) =>
        old?.map((tool) => (tool.id === id ? { ...tool, ...patch } : tool)),
      );
    },
    onError: (e: Error) => {
      toast.error(e.message);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeTool({ data: { toolId: id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const list = tools.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-[0.85rem] text-muted-foreground">
        Functions the agent may call mid-conversation. Every call is still checked against your pricing rules and
        business hours.
      </p>

      <div className="space-y-3">
        {list.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-[0.85rem] text-muted-foreground">
            No functions yet. Add one below.
          </p>
        ) : (
          list.map((tool) => (
            <div key={tool.id} className="rounded-[10px] border border-line p-4">
              <div className="flex items-start gap-3">
                <Wrench className="mt-1 size-4 shrink-0 text-brass" />
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    value={tool.name}
                    onChange={(e) => update.mutate({ id: tool.id, patch: { name: e.target.value } })}
                    className="w-full bg-transparent text-[0.95rem] text-ink outline-none"
                  />
                  <textarea
                    value={tool.description}
                    rows={2}
                    onChange={(e) => update.mutate({ id: tool.id, patch: { description: e.target.value } })}
                    className="input-base resize-y text-[0.85rem]"
                  />
                  <p className="font-mono text-[0.7rem] text-muted-foreground">{tool.toolType}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={tool.enabled ? "Disable function" : "Enable function"}
                    onClick={() => update.mutate({ id: tool.id, patch: { enabled: !tool.enabled } })}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors",
                      tool.enabled ? "bg-ink" : "bg-ink/15",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-4 rounded-full bg-background transition-all",
                        tool.enabled ? "left-[1.15rem]" : "left-0.5",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove function"
                    onClick={() => remove.mutate(tool.id)}
                    className="text-muted-foreground hover:text-ink"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.type}
            type="button"
            onClick={() => add.mutate(preset)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[0.8rem] text-ink hover:bg-secondary"
          >
            <Plus className="size-3.5" /> {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}
