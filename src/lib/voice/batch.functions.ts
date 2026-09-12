import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getPool, iso } from "@/lib/db/pg.server";
import { requireAuth } from "@/lib/auth/middleware";
import { requireAgentInBusiness, requireBusinessMembership } from "@/lib/auth/access";
import { parseOrThrow } from "@/lib/validation";

export interface BatchJob {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  completedContacts: number;
  failedContacts: number;
  agentConfigId: string;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

const MAX_CONTACTS = 5000;
const PHONE = /^\+?[0-9]{6,15}$/;

export const listBatchJobs = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string }) => parseOrThrow(z.object({ businessId: z.string().uuid() }), raw))
  .handler(async ({ data, context }): Promise<BatchJob[]> => {
    await requireBusinessMembership(context.userId, data.businessId);
    const { rows } = await getPool().query(
      `SELECT id, name, status, total_contacts, completed_contacts, failed_contacts, agent_config_id,
              created_at, started_at, completed_at
       FROM batch_jobs
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [data.businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      totalContacts: row.total_contacts,
      completedContacts: row.completed_contacts,
      failedContacts: row.failed_contacts,
      agentConfigId: row.agent_config_id,
      createdAt: iso(row.created_at),
      startedAt: iso(row.started_at),
      completedAt: iso(row.completed_at),
    }));
  });

const createInput = z.object({
  businessId: z.string().uuid(),
  agentConfigId: z.string().uuid("Choose an agent."),
  name: z.string().trim().min(1, "Give the campaign a name.").max(120),
  phoneNumbers: z.array(z.string()).max(MAX_CONTACTS, `A campaign can hold up to ${MAX_CONTACTS} numbers.`),
});

/** Creates a draft campaign and its contact list in one transaction. */
export const createBatchJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { businessId: string; agentConfigId: string; name: string; phoneNumbers: string[] }) =>
    parseOrThrow(createInput, raw),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireBusinessMembership(context.userId, data.businessId);
    await requireAgentInBusiness(context.userId, data.agentConfigId, data.businessId);

    const numbers = [...new Set(data.phoneNumbers.map((n) => n.replace(/[\s()-]/g, "")).filter(Boolean))];
    if (numbers.length === 0) throw new Error("Add at least one phone number.");
    const invalid = numbers.filter((n) => !PHONE.test(n));
    if (invalid.length > 0) {
      throw new Error(
        `These don't look like phone numbers: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`,
      );
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO batch_jobs (business_id, agent_config_id, name, total_contacts, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [data.businessId, data.agentConfigId, data.name, numbers.length, context.userId],
      );
      const jobId = rows[0]!.id;
      await client.query(
        `INSERT INTO batch_job_contacts (batch_job_id, business_id, phone_number)
         SELECT $1, $2, unnest($3::text[])`,
        [jobId, data.businessId, numbers],
      );
      await client.query("COMMIT");
      return { id: jobId };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

const statusInput = z.object({ jobId: z.string().uuid(), action: z.enum(["start", "pause"]) });

/** Starts (draft, queued or paused → running) or pauses (running → paused) a campaign. */
export const setBatchJobStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((raw: { jobId: string; action: "start" | "pause" }) => parseOrThrow(statusInput, raw))
  .handler(async ({ data, context }): Promise<void> => {
    const pool = getPool();
    const { rows } = await pool.query<{ business_id: string; status: string }>(
      `SELECT business_id, status FROM batch_jobs WHERE id = $1`,
      [data.jobId],
    );
    const job = rows[0];
    if (!job) throw new Error("That campaign no longer exists.");
    await requireBusinessMembership(context.userId, job.business_id);

    const start = data.action === "start";
    if (start && !["draft", "queued", "paused"].includes(job.status)) {
      throw new Error(`A ${job.status} campaign can't be started.`);
    }
    if (!start && job.status !== "running") {
      throw new Error("Only a running campaign can be paused.");
    }

    await pool.query(
      `UPDATE batch_jobs
       SET status = $2,
           started_at = CASE WHEN $3 THEN COALESCE(started_at, now()) ELSE started_at END,
           updated_at = now()
       WHERE id = $1`,
      [data.jobId, start ? "running" : "paused", start],
    );
  });
