import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool, iso } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { requireAgentOwnership, requireBusinessMembership } from "@/lib/auth/access";
import { parseOrThrow } from "@/lib/validation";

export interface AgentCall {
  id: string;
  callerNumber: string | null;
  startedAt: string;
  durationSeconds: number | null;
  status: string;
  language: string | null;
  outcome: string | null;
  summary: string | null;
  escalationRequired: boolean;
}

export interface CallSummary {
  id: string;
  callerNumber: string | null;
  destinationNumber: string | null;
  customerName: string | null;
  agentConfigId: string | null;
  roomName: string | null;
  status: string;
  direction: string;
  provider: string;
  startedAt: string;
  durationSeconds: number | null;
  language: string | null;
  intent: string | null;
  outcome: string | null;
  summary: string | null;
  toolsUsed: string[];
  escalationRequired: boolean;
  latencyMs: number | null;
}

export interface TranscriptLine {
  id: string;
  speaker: string;
  text: string;
  timestamp: string | null;
}

export interface CallDetail {
  transcripts: TranscriptLine[];
  events: Array<{ id: string; eventType: string; createdAt: string | null }>;
}

export type CallScope = "recent" | "active" | "finished";

const SCOPE_FILTERS: Record<CallScope, string> = {
  recent: "",
  active: "AND c.status IN ('ringing', 'in_progress')",
  finished: "AND c.status IN ('completed', 'failed', 'missed')",
};

const listInput = z.object({
  businessId: z.string().uuid(),
  scope: z.enum(["recent", "active", "finished"]),
});

/**
 * The 50 most recent calls in the workspace: all of them ("recent"), only
 * live ones ("active"), or only ended ones ("finished").
 */
export const listCalls = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string; scope: CallScope }) => parseOrThrow(listInput, raw))
  .handler(async ({ data, context }): Promise<CallSummary[]> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const { rows } = await getPool().query(
      `SELECT c.id, c.caller_number, c.destination_number, cu.name AS customer_name, c.agent_config_id,
              c.room_name, c.status, c.direction, c.provider, c.started_at, c.duration_seconds, c.language,
              c.intent, c.outcome, c.summary, c.tools_used, c.escalation_required, c.latency_ms
       FROM calls c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       WHERE c.business_id = $1 ${SCOPE_FILTERS[data.scope]}
       ORDER BY c.started_at DESC
       LIMIT 50`,
      [data.businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      callerNumber: row.caller_number,
      destinationNumber: row.destination_number,
      customerName: row.customer_name,
      agentConfigId: row.agent_config_id,
      roomName: row.room_name,
      status: row.status,
      direction: row.direction,
      provider: row.provider,
      startedAt: iso(row.started_at) ?? "",
      durationSeconds: row.duration_seconds,
      language: row.language,
      intent: row.intent,
      outcome: row.outcome,
      summary: row.summary,
      toolsUsed: row.tools_used ?? [],
      escalationRequired: row.escalation_required,
      latencyMs: row.latency_ms,
    }));
  });

/** The 50 most recent calls handled by one agent. */
export const listAgentCalls = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { agentConfigId: string }) => parseOrThrow(z.object({ agentConfigId: z.string().uuid() }), raw))
  .handler(async ({ data, context }): Promise<AgentCall[]> => {
    const { businessId } = await requireAgentOwnership(context.userId, data.agentConfigId);
    const { rows } = await getPool().query(
      `SELECT id, caller_number, started_at, duration_seconds, status, language, outcome, summary,
              escalation_required
       FROM calls
       WHERE agent_config_id = $1 AND business_id = $2
       ORDER BY started_at DESC
       LIMIT 50`,
      [data.agentConfigId, businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      callerNumber: row.caller_number,
      startedAt: iso(row.started_at) ?? "",
      durationSeconds: row.duration_seconds,
      status: row.status,
      language: row.language,
      outcome: row.outcome,
      summary: row.summary,
      escalationRequired: row.escalation_required,
    }));
  });

/** A call's transcript (oldest line first) and its events. */
export const getCallDetail = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { callId: string }) => parseOrThrow(z.object({ callId: z.string().uuid() }), raw))
  .handler(async ({ data, context }): Promise<CallDetail> => {
    const pool = getPool();
    const { rows: callRows } = await pool.query<{ business_id: string }>(
      `SELECT business_id FROM calls WHERE id = $1`,
      [data.callId],
    );
    const call = callRows[0];
    if (!call) throw new Error("Call not found.");
    await requireBusinessMembership(context.userId, call.business_id);

    const [transcripts, events] = await Promise.all([
      pool.query(
        `SELECT id, speaker, text, "timestamp"
         FROM call_transcripts
         WHERE call_id = $1
         ORDER BY "timestamp" ASC`,
        [data.callId],
      ),
      pool.query(
        `SELECT id, event_type, created_at
         FROM call_events
         WHERE call_id = $1
         ORDER BY created_at ASC`,
        [data.callId],
      ),
    ]);

    return {
      transcripts: transcripts.rows.map((row) => ({
        id: row.id,
        speaker: row.speaker,
        text: row.text,
        timestamp: iso(row.timestamp),
      })),
      events: events.rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        createdAt: iso(row.created_at),
      })),
    };
  });
