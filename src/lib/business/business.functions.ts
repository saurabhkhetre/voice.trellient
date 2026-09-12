import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool, iso } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { requireBusinessMembership, requireBusinessRole } from "@/lib/auth/access";
import type { Database } from "@/lib/db/types";
import { parseOrThrow } from "@/lib/validation";

export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type BusinessRole = Database["public"]["Enums"]["business_role"];

export interface BusinessContextPayload {
  business: Business;
  role: BusinessRole;
  userId: string;
  email: string | null;
}

/** Resolves the signed-in user's workspace (their oldest membership) and role. */
export const getBusinessContext = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<BusinessContextPayload | null> => {
    const { rows } = await getPool().query(
      `SELECT bu.role, b.*
       FROM business_users bu
       JOIN businesses b ON b.id = bu.business_id
       WHERE bu.auth_user_id = $1
       ORDER BY bu.created_at ASC
       LIMIT 1`,
      [context.userId],
    );
    const row = rows[0];
    if (!row) return null;

    const { role, ...business } = row;
    return {
      business: business as Business,
      role,
      userId: context.userId,
      email: context.email,
    };
  });

export interface TeamMember {
  id: string;
  role: BusinessRole;
  authUserId: string;
  createdAt: string | null;
}

/** Everyone with access to the workspace, oldest member first. */
export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string }) => parseOrThrow(z.object({ businessId: z.string().uuid() }), raw))
  .handler(async ({ data, context }): Promise<TeamMember[]> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const { rows } = await getPool().query(
      `SELECT id, role, auth_user_id, created_at
       FROM business_users
       WHERE business_id = $1
       ORDER BY created_at ASC`,
      [data.businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      authUserId: row.auth_user_id,
      createdAt: iso(row.created_at),
    }));
  });

const blankToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The business columns the Settings page may change. */
const businessFields = z.object({
  name: z.string({ invalid_type_error: "Business name is required." }).trim().min(1, "Business name is required.").max(200),
  legal_name: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
  // Stored without spaces so the inbound webhook can match it to the dialled number.
  phone: z.preprocess(
    blankToNull,
    z
      .string()
      .transform((value) => value.replace(/[\s()-]/g, ""))
      .pipe(z.string().regex(/^\+?[0-9]{6,15}$/, "Enter the main phone in international format, e.g. +918047180000."))
      .nullable(),
  ),
  email: z.preprocess(blankToNull, z.string().trim().email("Enter a valid contact email.").max(200).nullable()),
  timezone: z.preprocess(
    blankToNull,
    z.string().trim().refine(isTimeZone, "Use an IANA timezone such as Asia/Kolkata.").nullable(),
  ),
  default_language: z.preprocess(blankToNull, z.enum(["en", "hi", "mr"]).nullable()),
  address: z.preprocess(blankToNull, z.string().trim().max(1000).nullable()),
});

// NOT NULL columns keep their current value when the form leaves them blank.
const REQUIRED_COLUMNS = new Set(["timezone", "default_language"]);

/** Updates the business's identity. Owners and managers only. */
export const updateBusiness = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string; values: Record<string, unknown> }) =>
    parseOrThrow(z.object({ businessId: z.string().uuid(), values: z.record(z.unknown()) }), raw),
  )
  .handler(async ({ data, context }): Promise<void> => {
    await requireBusinessRole(context.userId, data.businessId, ["owner", "manager"]);
    const values = parseOrThrow(businessFields, data.values);
    // Keys come from the zod schema above, so they are always real column names.
    const entries = Object.entries(values).filter(
      ([column, value]) => !(value === null && REQUIRED_COLUMNS.has(column)),
    );
    await getPool().query(
      `UPDATE businesses
       SET ${entries.map(([column], i) => `${column} = $${i + 2}`).join(", ")}, updated_at = now()
       WHERE id = $1`,
      [data.businessId, ...entries.map(([, value]) => value)],
    );
  });
