import { createServerFn } from "@tanstack/react-start";
import type { PoolClient } from "pg";
import { z } from "zod";

import { getPool, iso } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import {
  requireAgentOwnership,
  requireBusinessMembership,
  requireBusinessRole,
} from "@/lib/auth/access";
import type { Database } from "@/lib/db/types";
import { deriveAgentRuntime, type AgentRuntime } from "@/lib/voice/runtime-status";

export type AgentConfigRow = Database["public"]["Tables"]["agent_configs"]["Row"];

const businessInput = z.object({ businessId: z.string().uuid() });

/** Lists the agent configs for a workspace, oldest first. */
export const listAgentConfigs = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string }) => businessInput.parse(raw))
  .handler(async ({ data, context }): Promise<AgentConfigRow[]> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const { rows } = await getPool().query<AgentConfigRow>(
      `SELECT * FROM agent_configs WHERE business_id = $1 ORDER BY created_at ASC`,
      [data.businessId],
    );
    return rows;
  });

/** Creates a paused, untitled agent in the workspace. */
export const createAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string }) => businessInput.parse(raw))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO agent_configs (business_id, name, greeting, primary_language, enabled)
       VALUES ($1, 'Untitled agent', 'Hi, thanks for calling. How can I help you today?', 'en', false)
       RETURNING id`,
      [data.businessId],
    );
    return { id: rows[0]!.id };
  });

const blankToUndefined = (value: unknown) => (value === null || value === "" ? undefined : value);

// Short names older dashboard builds saved for the same providers.
const PROVIDER_ALIASES: Record<string, string> = { openai: "openai_realtime", gemini: "gemini_live" };

/** The agent_configs columns the dashboard may change. Anything else in the draft is dropped. */
const editableFields = z
  .object({
    name: z.string().trim().min(1, "Give the agent a name.").max(120),
    enabled: z.boolean(),
    greeting: z.string().max(2000),
    personality: z.string().max(2000),
    business_description: z.string().max(4000).nullable(),
    system_instructions: z.string().max(20000).nullable(),
    primary_language: z.string().min(2).max(10),
    model_provider: z.preprocess(
      (value) => (typeof value === "string" ? (PROVIDER_ALIASES[value] ?? value) : value),
      z.enum(["openai_realtime", "gemini_live"]),
    ),
    model_name: z.string().min(1).max(100),
    voice_name: z.string().min(1).max(50),
    voice_speed: z.preprocess(blankToUndefined, z.coerce.number().min(0.5).max(2).optional()),
    escalation_enabled: z.boolean(),
    escalation_rules: z.string().max(4000).nullable(),
    after_hours_response: z.string().max(2000).nullable(),
    max_call_seconds: z.preprocess(blankToUndefined, z.coerce.number().int().min(30).max(7200).optional()),
    recording_enabled: z.boolean(),
  })
  .partial();

type EditableFields = z.infer<typeof editableFields>;

const saveInput = z.object({
  agentConfigId: z.string().uuid(),
  changes: z.record(z.unknown()),
});

async function applyChanges(client: PoolClient, agentConfigId: string, changes: EditableFields) {
  const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  // Column names come from the editableFields allowlist, never from the client.
  const assignments = entries.map(([column], i) => `${column} = $${i + 2}`);
  await client.query(
    `UPDATE agent_configs SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1`,
    [agentConfigId, ...entries.map(([, value]) => value)],
  );
}

/** Saves the editable fields of an agent draft. */
export const saveAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { agentConfigId: string; changes: Record<string, unknown> }) => saveInput.parse(raw))
  .handler(async ({ data, context }): Promise<void> => {
    await requireAgentOwnership(context.userId, data.agentConfigId);
    const changes = editableFields.parse(data.changes);
    const client = await getPool().connect();
    try {
      await applyChanges(client, data.agentConfigId, changes);
    } finally {
      client.release();
    }
  });

/** Saves the draft, bumps the version and stores a snapshot. Owners and managers only. */
export const publishAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { agentConfigId: string; changes: Record<string, unknown> }) => saveInput.parse(raw))
  .handler(async ({ data, context }): Promise<{ version: number }> => {
    const { businessId } = await requireAgentOwnership(context.userId, data.agentConfigId);
    await requireBusinessRole(context.userId, businessId, ["owner", "manager"]);
    const changes = editableFields.parse(data.changes);

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await applyChanges(client, data.agentConfigId, changes);
      const { rows } = await client.query<{ version: number }>(
        `UPDATE agent_configs
         SET version = version + 1, is_draft = false, published_at = now()
         WHERE id = $1
         RETURNING version`,
        [data.agentConfigId],
      );
      await client.query(
        `INSERT INTO agent_config_versions (agent_config_id, business_id, version, config_snapshot, published_by)
         SELECT id, business_id, version, to_jsonb(agent_configs.*), $2
         FROM agent_configs
         WHERE id = $1`,
        [data.agentConfigId, context.userId],
      );
      await client.query("COMMIT");
      return { version: rows[0]!.version };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

/** Live per-agent state, derived from the last 24 hours of calls. */
export const getAgentRuntime = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string }) => businessInput.parse(raw))
  .handler(async ({ data, context }): Promise<Record<string, AgentRuntime>> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const { rows } = await getPool().query(
      `SELECT agent_config_id, status, escalation_required, started_at, answered_at, ended_at
       FROM calls
       WHERE business_id = $1 AND started_at >= now() - interval '24 hours'
       ORDER BY started_at DESC
       LIMIT 300`,
      [data.businessId],
    );
    return deriveAgentRuntime(
      rows.map((row) => ({
        agent_config_id: row.agent_config_id,
        status: row.status,
        escalation_required: row.escalation_required,
        started_at: iso(row.started_at),
        answered_at: iso(row.answered_at),
        ended_at: iso(row.ended_at),
      })),
    );
  });
