import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { requireAgentOwnership, requireBusinessMembership } from "@/lib/auth/access";
import { parseOrThrow } from "@/lib/validation";

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  toolType: string;
  enabled: boolean;
}

export interface AgentToolPatch {
  name?: string;
  description?: string;
  enabled?: boolean;
}

const TOOL_TYPES = ["end_call", "transfer_call", "book_appointment", "pricing_lookup", "create_quote", "custom"] as const;

const agentInput = z.object({ agentConfigId: z.string().uuid() });
const toolInput = z.object({ toolId: z.string().uuid() });

/** Verifies the user can edit the workspace that owns this tool. */
async function requireToolAccess(userId: string, toolId: string): Promise<void> {
  const { rows } = await getPool().query<{ business_id: string }>(
    `SELECT business_id FROM agent_tools WHERE id = $1`,
    [toolId],
  );
  const tool = rows[0];
  if (!tool) throw new Error("That function no longer exists.");
  await requireBusinessMembership(userId, tool.business_id);
}

/** The functions configured for one agent, in display order. */
export const listAgentTools = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { agentConfigId: string }) => parseOrThrow(agentInput, raw))
  .handler(async ({ data, context }): Promise<AgentTool[]> => {
    const { businessId } = await requireAgentOwnership(context.userId, data.agentConfigId);
    const { rows } = await getPool().query(
      `SELECT id, name, description, tool_type, enabled
       FROM agent_tools
       WHERE agent_config_id = $1 AND business_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [data.agentConfigId, businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      toolType: row.tool_type,
      enabled: row.enabled,
    }));
  });

const addInput = agentInput.extend({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  toolType: z.enum(TOOL_TYPES),
});

/** Adds a function to the end of the agent's list. */
export const addAgentTool = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { agentConfigId: string; name: string; description: string; toolType: string }) =>
    parseOrThrow(addInput, raw),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { businessId } = await requireAgentOwnership(context.userId, data.agentConfigId);
    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO agent_tools (business_id, agent_config_id, name, description, tool_type, sort_order)
       SELECT $1, $2, $3, $4, $5, COALESCE(MAX(sort_order) + 1, 0)
       FROM agent_tools
       WHERE agent_config_id = $2
       RETURNING id`,
      [businessId, data.agentConfigId, data.name, data.description, data.toolType],
    );
    return { id: rows[0]!.id };
  });

const updateInput = toolInput.extend({
  patch: z.object({
    name: z.string().max(120).optional(),
    description: z.string().max(2000).optional(),
    enabled: z.boolean().optional(),
  }),
});

/** Renames, re-describes, or enables/disables a function. */
export const updateAgentTool = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { toolId: string; patch: AgentToolPatch }) => parseOrThrow(updateInput, raw))
  .handler(async ({ data, context }): Promise<void> => {
    await requireToolAccess(context.userId, data.toolId);
    // Keys come from the zod schema above, so they are always real column names.
    const entries = Object.entries(data.patch).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return;
    await getPool().query(
      `UPDATE agent_tools
       SET ${entries.map(([column], i) => `${column} = $${i + 2}`).join(", ")}, updated_at = now()
       WHERE id = $1`,
      [data.toolId, ...entries.map(([, value]) => value)],
    );
  });

export const deleteAgentTool = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { toolId: string }) => parseOrThrow(toolInput, raw))
  .handler(async ({ data, context }): Promise<void> => {
    await requireToolAccess(context.userId, data.toolId);
    await getPool().query(`DELETE FROM agent_tools WHERE id = $1`, [data.toolId]);
  });
