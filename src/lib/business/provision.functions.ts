import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";

const input = z.object({
  companyName: z.string().trim().min(1).max(120).optional(),
});

/**
 * Creates a workspace for the signed-in user when they are not a member of one
 * yet, and makes them its owner. Idempotent: returns the existing membership.
 */
export const provisionWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { companyName?: string }) => input.parse(raw))
  .handler(async ({ data, context }): Promise<{ businessId: string; created: boolean }> => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query<{ business_id: string }>(
        `SELECT business_id FROM business_users
         WHERE auth_user_id = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [context.userId],
      );
      const membership = existing.rows[0];
      if (membership) {
        await client.query("COMMIT");
        return { businessId: membership.business_id, created: false };
      }

      const email = context.email;
      const name = data.companyName ?? (email ? `${email.split("@")[0]}'s workspace` : "My workspace");
      const business = await client.query<{ id: string }>(
        `INSERT INTO businesses (name, email, default_language, timezone)
         VALUES ($1, $2, 'en', 'Asia/Kolkata')
         RETURNING id`,
        [name, email],
      );
      const businessId = business.rows[0]!.id;

      await client.query(
        `INSERT INTO business_users (business_id, auth_user_id, role) VALUES ($1, $2, 'owner')`,
        [businessId, context.userId],
      );
      await client.query(
        `INSERT INTO agent_configs (business_id, name, greeting, primary_language, enabled)
         VALUES ($1, 'Front desk agent', 'Hi, thanks for calling. How can I help you today?', 'en', false)`,
        [businessId],
      );

      await client.query("COMMIT");
      return { businessId, created: true };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });
