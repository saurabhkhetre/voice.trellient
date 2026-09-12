// Creates or upgrades the database schema from db/migrations and seeds one dev
// business, owner (with a sign-in) and agent so the dashboard has something to load.
//
// Migrations run in filename order, each in its own transaction, and are
// recorded in public.schema_migrations, so running this again is safe. A
// database built from the old Supabase-era migrations is converted once with
// db/convert-from-supabase.sql.
//
// Usage: node scripts/db-init.mjs   (DATABASE_URL overrides the local default)

import { randomBytes, scrypt } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "db", "migrations");
const converterPath = path.join(root, "db", "convert-from-supabase.sql");
const BASELINE = "0001_schema.sql";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/trellient";

export const DEV_USER_ID = "11111111-1111-1111-1111-111111111111";
export const DEV_BUSINESS_ID = "22222222-2222-2222-2222-222222222222";
export const DEV_AGENT_CONFIG_ID = "33333333-3333-3333-3333-333333333333";

// Local sign-in for the seeded owner. Development databases only.
const DEV_EMAIL = process.env.DEV_EMAIL ?? "dev@trellient.local";
const DEV_PASSWORD = process.env.DEV_PASSWORD ?? "trellient-dev";

// Same format as src/lib/auth/password.server.ts: scrypt$N$r$p$<salt>$<hash>.
function hashPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(`scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`),
    );
  });
}

async function inTransaction(client, work) {
  await client.query("BEGIN");
  try {
    await work();
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`Connected to ${DATABASE_URL}`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows: appliedRows } = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(appliedRows.map((row) => row.name));

  // Tables but no recorded baseline: built by the old Supabase-era migrations.
  const { rows } = await client.query("SELECT to_regclass('public.businesses') IS NOT NULL AS exists");
  if (!applied.has(BASELINE) && rows[0].exists) {
    process.stdout.write("Converting a Supabase-era schema to the baseline ... ");
    const sql = await readFile(converterPath, "utf8");
    await inTransaction(client, async () => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [BASELINE]);
    });
    applied.add(BASELINE);
    console.log("ok");
  }

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    process.stdout.write(`Applying ${file} ... `);
    // One transaction per file, so a failing migration leaves nothing half-applied.
    await inTransaction(client, async () => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
    console.log("ok");
  }

  await client.query(
    `INSERT INTO businesses (id, name, default_language, timezone)
     VALUES ($1, 'Dev Test Business', 'en', 'Asia/Kolkata')
     ON CONFLICT (id) DO NOTHING`,
    [DEV_BUSINESS_ID],
  );

  await client.query(
    `INSERT INTO users (id, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [DEV_USER_ID, DEV_EMAIL, await hashPassword(DEV_PASSWORD)],
  );

  await client.query(
    `INSERT INTO business_users (business_id, auth_user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (business_id, auth_user_id) DO NOTHING`,
    [DEV_BUSINESS_ID, DEV_USER_ID],
  );

  await client.query(
    `INSERT INTO agent_configs (id, business_id, name, enabled, greeting)
     VALUES ($1, $2, 'Dev Test Agent', true, 'Hey, thanks for calling the dev test business. How can I help you today?')
     ON CONFLICT (id) DO NOTHING`,
    [DEV_AGENT_CONFIG_ID, DEV_BUSINESS_ID],
  );

  await client.query(
    `INSERT INTO products (business_id, name, category, price, currency, stock_status, description)
     SELECT $1, 'Sample Widget', 'widgets', 499, 'INR', 'in_stock', 'A sample product seeded for local testing.'
     WHERE NOT EXISTS (SELECT 1 FROM products WHERE business_id = $1 AND name = 'Sample Widget')`,
    [DEV_BUSINESS_ID],
  );

  console.log("Seed complete:");
  console.log(`  Dev sign-in          = ${DEV_EMAIL} / ${DEV_PASSWORD} (if this user was just created)`);
  console.log(`  DEV_USER_ID          = ${DEV_USER_ID}`);
  console.log(`  DEV_BUSINESS_ID      = ${DEV_BUSINESS_ID}`);
  console.log(`  DEV_AGENT_CONFIG_ID  = ${DEV_AGENT_CONFIG_ID}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
