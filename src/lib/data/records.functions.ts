import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool, isUniqueViolation } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { requireBusinessMembership } from "@/lib/auth/access";
import { parseOrThrow } from "@/lib/validation";

const optionalText = (max: number) => z.string().trim().max(max).nullable();

/**
 * Business-scoped tables the generic record editor (CrudSection) may touch,
 * and the columns it may write. Table and column names in the SQL below only
 * ever come from this map, never from the request.
 */
const RECORD_SCHEMAS = {
  customers: z.object({
    name: optionalText(200),
    phone: z
      .string({ invalid_type_error: "Phone is required." })
      .transform((value) => value.replace(/[\s()-]/g, ""))
      .pipe(z.string().regex(/^\+?[0-9]{6,15}$/, "Enter the phone in international format, e.g. +919876543210.")),
    email: optionalText(200),
    preferred_language: z
      .string()
      .max(10)
      .nullable()
      .transform((value) => value ?? "en"),
    notes: optionalText(4000),
  }),
  business_policies: z.object({
    policy_type: z.string({ invalid_type_error: "Type is required." }).trim().min(1, "Type is required.").max(40),
    title: z.string({ invalid_type_error: "Title is required." }).trim().min(1, "Title is required.").max(200),
    content: z
      .string({ invalid_type_error: "Policy text is required." })
      .trim()
      .min(1, "Policy text is required.")
      .max(8000),
    active: z.boolean(),
  }),
  agent_knowledge: z.object({
    title: z.string({ invalid_type_error: "Title is required." }).trim().min(1, "Title is required.").max(200),
    content: z.string({ invalid_type_error: "Content is required." }).trim().min(1, "Content is required.").max(20000),
    source_reference: optionalText(500),
    active: z.boolean(),
  }),
};

export type RecordTable = keyof typeof RECORD_SCHEMAS;
/** Every column in RECORD_SCHEMAS is text, a number or a boolean. */
export type RecordValue = string | number | boolean | null;
export type RecordRow = { id: string } & Record<string, RecordValue>;

const TABLE_NAMES = Object.keys(RECORD_SCHEMAS) as [RecordTable, ...RecordTable[]];
const tableInput = z.object({ table: z.enum(TABLE_NAMES), businessId: z.string().uuid() });

function columnsOf(table: RecordTable): string[] {
  return Object.keys(RECORD_SCHEMAS[table].shape);
}

/** Every row of one record table in the workspace, newest first. */
export const listRecords = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { table: RecordTable; businessId: string }) => parseOrThrow(tableInput, raw))
  .handler(async ({ data, context }): Promise<RecordRow[]> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const { rows } = await getPool().query<RecordRow>(
      `SELECT id, ${columnsOf(data.table).join(", ")}
       FROM ${data.table}
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [data.businessId],
    );
    return rows;
  });

const saveInput = tableInput.extend({
  id: z.string().uuid().optional(),
  values: z.record(z.unknown()),
});

/** Creates a record, or updates it when `id` is given. */
export const saveRecord = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator(
    (raw: { table: RecordTable; businessId: string; id?: string | undefined; values: Record<string, unknown> }) =>
      parseOrThrow(saveInput, raw),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const values = parseOrThrow(RECORD_SCHEMAS[data.table], data.values) as Record<string, unknown>;
    const columns = Object.keys(values);
    const params = columns.map((column) => values[column]);

    try {
      if (data.id) {
        const { rows } = await getPool().query<{ id: string }>(
          `UPDATE ${data.table}
           SET ${columns.map((column, i) => `${column} = $${i + 3}`).join(", ")}, updated_at = now()
           WHERE id = $1 AND business_id = $2
           RETURNING id`,
          [data.id, data.businessId, ...params],
        );
        if (!rows[0]) throw new Error("That record no longer exists.");
        return { id: rows[0].id };
      }

      const { rows } = await getPool().query<{ id: string }>(
        `INSERT INTO ${data.table} (business_id, ${columns.join(", ")})
         VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(", ")})
         RETURNING id`,
        [data.businessId, ...params],
      );
      return { id: rows[0]!.id };
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error("A record with those details already exists.");
      throw err;
    }
  });

const deleteInput = tableInput.extend({ id: z.string().uuid() });

export const deleteRecord = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { table: RecordTable; businessId: string; id: string }) => parseOrThrow(deleteInput, raw))
  .handler(async ({ data, context }): Promise<void> => {
    await requireBusinessMembership(context.userId, data.businessId);
    await getPool().query(`DELETE FROM ${data.table} WHERE id = $1 AND business_id = $2`, [
      data.id,
      data.businessId,
    ]);
  });
