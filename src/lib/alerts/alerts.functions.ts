import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool, iso } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { requireBusinessMembership } from "@/lib/auth/access";
import { parseOrThrow } from "@/lib/validation";

export interface AlertRule {
  id: string;
  name: string;
  conditionType: string;
  conditionConfig: Record<string, string | number>;
  notificationChannels: string[];
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string | null;
}

const CONDITION_TYPES = ["drop_rate", "error_count", "escalation", "latency", "custom"] as const;
const CHANNELS = ["email", "sms", "webhook"] as const;

/** Rules saved by an older build stored the channel list as a JSON string. */
function channelsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // A bare channel name rather than JSON.
    }
    return [value];
  }
  return [];
}

async function requireRuleAccess(userId: string, ruleId: string): Promise<void> {
  const { rows } = await getPool().query<{ business_id: string }>(
    `SELECT business_id FROM alert_rules WHERE id = $1`,
    [ruleId],
  );
  const rule = rows[0];
  if (!rule) throw new Error("That alert rule no longer exists.");
  await requireBusinessMembership(userId, rule.business_id);
}

export const listAlertRules = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string }) => parseOrThrow(z.object({ businessId: z.string().uuid() }), raw))
  .handler(async ({ data, context }): Promise<AlertRule[]> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const { rows } = await getPool().query(
      `SELECT id, name, condition_type, condition_config, notification_channels, enabled,
              last_triggered_at, created_at
       FROM alert_rules
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [data.businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      conditionType: row.condition_type,
      conditionConfig: row.condition_config ?? {},
      notificationChannels: channelsOf(row.notification_channels),
      enabled: row.enabled,
      lastTriggeredAt: iso(row.last_triggered_at),
      createdAt: iso(row.created_at),
    }));
  });

const createInput = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Give the rule a name.").max(120),
  conditionType: z.enum(CONDITION_TYPES),
  threshold: z.string().trim().max(40),
  channel: z.enum(CHANNELS),
});

export const createAlertRule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    (raw: { businessId: string; name: string; conditionType: string; threshold: string; channel: string }) =>
      parseOrThrow(createInput, raw),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireBusinessMembership(context.userId, data.businessId);

    const config: Record<string, string | number> = {};
    if (data.threshold) {
      const numeric = Number(data.threshold);
      config["threshold"] = Number.isFinite(numeric) ? numeric : data.threshold;
    }
    if (data.conditionType === "drop_rate") config["window_minutes"] = 60;
    if (data.conditionType === "error_count") config["window_minutes"] = 30;

    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO alert_rules (business_id, name, condition_type, condition_config, notification_channels)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING id`,
      [data.businessId, data.name, data.conditionType, JSON.stringify(config), JSON.stringify([data.channel])],
    );
    return { id: rows[0]!.id };
  });

export const setAlertRuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { ruleId: string; enabled: boolean }) =>
    parseOrThrow(z.object({ ruleId: z.string().uuid(), enabled: z.boolean() }), raw),
  )
  .handler(async ({ data, context }): Promise<void> => {
    await requireRuleAccess(context.userId, data.ruleId);
    await getPool().query(`UPDATE alert_rules SET enabled = $2, updated_at = now() WHERE id = $1`, [
      data.ruleId,
      data.enabled,
    ]);
  });

export const deleteAlertRule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { ruleId: string }) => parseOrThrow(z.object({ ruleId: z.string().uuid() }), raw))
  .handler(async ({ data, context }): Promise<void> => {
    await requireRuleAccess(context.userId, data.ruleId);
    await getPool().query(`DELETE FROM alert_rules WHERE id = $1`, [data.ruleId]);
  });
