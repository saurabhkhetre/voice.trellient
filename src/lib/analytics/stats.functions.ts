import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool, iso } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { resolveBusinessId } from "@/lib/auth/access";

const timeRangeInput = z.object({
  range: z.enum(["today", "7d", "30d", "90d", "all"]).default("30d"),
});

function rangeToDate(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export interface AnalyticsStats {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  failedCalls: number;
  totalMinutes: number;
  avgDuration: number;
  escalationCount: number;
  escalationRate: number;
  containmentRate: number;
  topIntents: Array<{ intent: string; count: number }>;
  callsByDirection: { inbound: number; outbound: number };
  callsByStatus: Record<string, number>;
}

/** Server-side analytics aggregation — always scoped to the user's workspace. */
export const getAnalyticsStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { range?: string }) => timeRangeInput.parse(raw))
  .handler(async ({ data, context }): Promise<AnalyticsStats> => {
    const businessId = await resolveBusinessId(context.userId);
    const since = rangeToDate(data.range);
    const pool = getPool();

    const [groups, intents] = await Promise.all([
      pool.query<{ status: string; direction: string; calls: number; seconds: number; escalated: number }>(
        `SELECT status, direction,
                COUNT(*)::int AS calls,
                COALESCE(SUM(duration_seconds), 0)::int AS seconds,
                COUNT(*) FILTER (WHERE escalation_required)::int AS escalated
         FROM calls
         WHERE business_id = $1 AND ($2::timestamptz IS NULL OR started_at >= $2)
         GROUP BY status, direction`,
        [businessId, since],
      ),
      pool.query<{ intent: string; count: number }>(
        `SELECT intent, COUNT(*)::int AS count
         FROM calls
         WHERE business_id = $1 AND intent IS NOT NULL AND intent <> ''
           AND ($2::timestamptz IS NULL OR started_at >= $2)
         GROUP BY intent
         ORDER BY count DESC
         LIMIT 10`,
        [businessId, since],
      ),
    ]);

    const callsByStatus: Record<string, number> = {};
    const callsByDirection = { inbound: 0, outbound: 0 };
    let totalCalls = 0;
    let totalSeconds = 0;
    let escalationCount = 0;
    for (const group of groups.rows) {
      totalCalls += group.calls;
      totalSeconds += group.seconds;
      escalationCount += group.escalated;
      callsByStatus[group.status] = (callsByStatus[group.status] ?? 0) + group.calls;
      if (group.direction === "inbound" || group.direction === "outbound") {
        callsByDirection[group.direction] += group.calls;
      }
    }

    const answeredCalls = callsByStatus["completed"] ?? 0;
    const escalationRate = totalCalls > 0 ? Math.round((escalationCount / totalCalls) * 100) : 0;

    return {
      totalCalls,
      answeredCalls,
      missedCalls: callsByStatus["missed"] ?? 0,
      failedCalls: callsByStatus["failed"] ?? 0,
      totalMinutes: Math.round((totalSeconds / 60) * 10) / 10,
      avgDuration: answeredCalls > 0 ? Math.round(totalSeconds / answeredCalls) : 0,
      escalationCount,
      escalationRate,
      containmentRate: totalCalls > 0 ? 100 - escalationRate : 100,
      topIntents: intents.rows,
      callsByDirection,
      callsByStatus,
    };
  });

export interface DashboardStats {
  callsToday: number;
  activeCalls: number;
  activeAgents: number;
  openEscalations: number;
}

/** Dashboard home stats — lighter query, just counts. */
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DashboardStats> => {
    const businessId = await resolveBusinessId(context.userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { rows } = await getPool().query<{
      calls_today: number;
      active_calls: number;
      active_agents: number;
      open_escalations: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM calls WHERE business_id = $1 AND started_at >= $2)::int AS calls_today,
         (SELECT COUNT(*) FROM calls WHERE business_id = $1 AND status IN ('ringing', 'in_progress'))::int AS active_calls,
         (SELECT COUNT(*) FROM agent_configs WHERE business_id = $1 AND enabled)::int AS active_agents,
         (SELECT COUNT(*) FROM escalations WHERE business_id = $1 AND status = 'open')::int AS open_escalations`,
      [businessId, today],
    );
    const row = rows[0];

    return {
      callsToday: row?.calls_today ?? 0,
      activeCalls: row?.active_calls ?? 0,
      activeAgents: row?.active_agents ?? 0,
      openEscalations: row?.open_escalations ?? 0,
    };
  });

export interface RecentCall {
  id: string;
  startedAt: string | null;
  durationSeconds: number | null;
  callerNumber: string | null;
  status: string;
  customerName: string | null;
}

/** The five most recent calls in the user's workspace. */
export const getRecentCalls = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<RecentCall[]> => {
    const businessId = await resolveBusinessId(context.userId);
    const { rows } = await getPool().query(
      `SELECT c.id, c.started_at, c.duration_seconds, c.caller_number, c.status, cu.name AS customer_name
       FROM calls c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       WHERE c.business_id = $1
       ORDER BY c.started_at DESC
       LIMIT 5`,
      [businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      startedAt: iso(row.started_at),
      durationSeconds: row.duration_seconds,
      callerNumber: row.caller_number,
      status: row.status,
      customerName: row.customer_name,
    }));
  });
