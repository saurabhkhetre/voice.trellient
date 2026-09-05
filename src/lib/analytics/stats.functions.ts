import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { resolveBusinessId } from "@/lib/supabase/require-business";

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
  .middleware([requireSupabaseAuth])
  .validator((raw: { range?: string }) => timeRangeInput.parse(raw))
  .handler(async ({ data, context }): Promise<AnalyticsStats> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const businessId = await resolveBusinessId(context.supabase, context.userId);

    let query = supabaseAdmin
      .from("calls")
      .select("id, direction, status, duration_seconds, intent, escalation_required")
      .eq("business_id", businessId);

    const since = rangeToDate(data.range);
    if (since) {
      query = query.gte("started_at", since.toISOString());
    }

    const { data: calls, error } = await query;
    if (error) throw new Error(error.message);
    if (!calls || calls.length === 0) {
      return {
        totalCalls: 0, answeredCalls: 0, missedCalls: 0, failedCalls: 0,
        totalMinutes: 0, avgDuration: 0, escalationCount: 0,
        escalationRate: 0, containmentRate: 100,
        topIntents: [], callsByDirection: { inbound: 0, outbound: 0 },
        callsByStatus: {},
      };
    }

    const totalCalls = calls.length;
    const answeredCalls = calls.filter((c) => c.status === "completed").length;
    const missedCalls = calls.filter((c) => c.status === "missed").length;
    const failedCalls = calls.filter((c) => c.status === "failed").length;
    const totalSeconds = calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
    const totalMinutes = Math.round(totalSeconds / 60 * 10) / 10;
    const avgDuration = answeredCalls > 0 ? Math.round(totalSeconds / answeredCalls) : 0;
    const escalationCount = calls.filter((c) => c.escalation_required).length;
    const escalationRate = totalCalls > 0 ? Math.round((escalationCount / totalCalls) * 100) : 0;
    const containmentRate = totalCalls > 0 ? 100 - escalationRate : 100;

    // Top intents
    const intentMap: Record<string, number> = {};
    for (const c of calls) {
      if (c.intent) {
        intentMap[c.intent] = (intentMap[c.intent] || 0) + 1;
      }
    }
    const topIntents = Object.entries(intentMap)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // By direction
    const inbound = calls.filter((c) => c.direction === "inbound").length;
    const outbound = calls.filter((c) => c.direction === "outbound").length;

    // By status
    const callsByStatus: Record<string, number> = {};
    for (const c of calls) {
      callsByStatus[c.status] = (callsByStatus[c.status] || 0) + 1;
    }

    return {
      totalCalls, answeredCalls, missedCalls, failedCalls,
      totalMinutes, avgDuration, escalationCount, escalationRate, containmentRate,
      topIntents, callsByDirection: { inbound, outbound }, callsByStatus,
    };
  });

/** Dashboard home stats — lighter query, just counts and recent. */
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const businessId = await resolveBusinessId(context.supabase, context.userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [callsToday, activeCalls, agents, escalations] = await Promise.all([
      supabaseAdmin
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .gte("started_at", today.toISOString()),
      supabaseAdmin
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .in("status", ["ringing", "in_progress"]),
      supabaseAdmin
        .from("agent_configs")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("enabled", true),
      supabaseAdmin
        .from("escalations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "open"),
    ]);

    return {
      callsToday: callsToday.count ?? 0,
      activeCalls: activeCalls.count ?? 0,
      activeAgents: agents.count ?? 0,
      openEscalations: escalations.count ?? 0,
    };
  });
