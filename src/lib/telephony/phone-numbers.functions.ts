import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool, iso, isUniqueViolation } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { requireAgentInBusiness, requireBusinessMembership } from "@/lib/auth/access";
import { parseOrThrow } from "@/lib/validation";

export interface PhoneNumber {
  id: string;
  phoneNumber: string;
  label: string | null;
  provider: string;
  agentConfigId: string | null;
  inboundEnabled: boolean;
  active: boolean;
  createdAt: string | null;
}

/**
 * Stored without spaces, dashes or brackets, so it matches the number the
 * carrier sends to the inbound webhook exactly.
 */
const phoneNumber = z
  .string()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{6,15}$/, "Enter the number in international format, e.g. +919876543210."));

const businessInput = z.object({ businessId: z.string().uuid() });

/** Verifies the user can edit the number's workspace; returns that workspace's id. */
async function requireNumberAccess(userId: string, phoneNumberId: string): Promise<string> {
  const { rows } = await getPool().query<{ business_id: string }>(
    `SELECT business_id FROM phone_numbers WHERE id = $1`,
    [phoneNumberId],
  );
  const number = rows[0];
  if (!number) throw new Error("That phone number no longer exists.");
  await requireBusinessMembership(userId, number.business_id);
  return number.business_id;
}

export const listPhoneNumbers = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string }) => parseOrThrow(businessInput, raw))
  .handler(async ({ data, context }): Promise<PhoneNumber[]> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const { rows } = await getPool().query(
      `SELECT id, phone_number, label, provider, agent_config_id, inbound_enabled, active, created_at
       FROM phone_numbers
       WHERE business_id = $1
       ORDER BY created_at ASC`,
      [data.businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
      label: row.label,
      provider: row.provider,
      agentConfigId: row.agent_config_id,
      inboundEnabled: row.inbound_enabled,
      active: row.active,
      createdAt: iso(row.created_at),
    }));
  });

const addInput = businessInput.extend({
  phoneNumber,
  label: z.string().trim().max(80).nullable().optional(),
  agentConfigId: z.string().uuid().nullable().optional(),
});

export const addPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    (raw: {
      businessId: string;
      phoneNumber: string;
      label?: string | null | undefined;
      agentConfigId?: string | null | undefined;
    }) => parseOrThrow(addInput, raw),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireBusinessMembership(context.userId, data.businessId);
    if (data.agentConfigId) await requireAgentInBusiness(context.userId, data.agentConfigId, data.businessId);
    try {
      const { rows } = await getPool().query<{ id: string }>(
        `INSERT INTO phone_numbers (business_id, phone_number, label, agent_config_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [data.businessId, data.phoneNumber, data.label || null, data.agentConfigId ?? null],
      );
      return { id: rows[0]!.id };
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error("That number is already in this workspace.");
      throw err;
    }
  });

const updateInput = z.object({
  phoneNumberId: z.string().uuid(),
  agentConfigId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

/** Reassigns the number to an agent (or none) and/or pauses it. */
export const updatePhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    (raw: { phoneNumberId: string; agentConfigId?: string | null | undefined; active?: boolean | undefined }) =>
      parseOrThrow(updateInput, raw),
  )
  .handler(async ({ data, context }): Promise<void> => {
    const businessId = await requireNumberAccess(context.userId, data.phoneNumberId);
    if (data.agentConfigId) await requireAgentInBusiness(context.userId, data.agentConfigId, businessId);

    const assignments: string[] = [];
    const params: unknown[] = [data.phoneNumberId];
    if (data.agentConfigId !== undefined) {
      params.push(data.agentConfigId);
      assignments.push(`agent_config_id = $${params.length}`);
    }
    if (data.active !== undefined) {
      params.push(data.active);
      assignments.push(`active = $${params.length}`);
    }
    if (assignments.length === 0) return;

    await getPool().query(
      `UPDATE phone_numbers SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1`,
      params,
    );
  });

export const deletePhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { phoneNumberId: string }) =>
    parseOrThrow(z.object({ phoneNumberId: z.string().uuid() }), raw),
  )
  .handler(async ({ data, context }): Promise<void> => {
    await requireNumberAccess(context.userId, data.phoneNumberId);
    await getPool().query(`DELETE FROM phone_numbers WHERE id = $1`, [data.phoneNumberId]);
  });
