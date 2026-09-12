import { Pool } from "pg";

// The app's single Postgres connection pool. Server-only — never import from
// client code.
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
      throw new Error("Missing DATABASE_URL environment variable.");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

/** True when a query failed on a unique constraint (Postgres error 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505";
}

/** Serializes a timestamptz column (node-postgres returns a Date) as an ISO string. */
export function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}
