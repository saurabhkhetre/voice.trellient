# Local setup

Three things run locally: a Postgres database, a web frontend, and the Python
agent worker. Everything lives in **plain Postgres** — app data, accounts and
sign-in sessions. Every server function checks the session cookie before
touching data (see `src/lib/auth/middleware.ts`).

## 1. LiveKit Cloud

1. Create a free project at https://cloud.livekit.io.
2. Settings -> Keys -> create a key pair.
3. Copy the project URL (`wss://<name>.livekit.cloud`), the API key, and secret.

## 2. Local Postgres

```bash
docker compose up -d
node scripts/db-init.mjs
```

This applies `db/migrations/*.sql` to a local Postgres container (safe to run
again — applied files are recorded in `schema_migrations`) and seeds one dev
business, its owner with the sign-in `dev@trellient.local` / `trellient-dev`,
and one enabled agent config. A database created by the old Supabase-era
migrations is converted in place the first time it runs.

## 3. Environment

```bash
cp .env.example .env
cp services/agent/.env.example services/agent/.env
```

Fill in `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in both files,
and `OPENAI_API_KEY` (or `GOOGLE_API_KEY`) in `services/agent/.env`.
`DATABASE_URL` already points at the Docker database — no change needed.

## 4. Run the agent worker

```bash
cd services/agent
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m voice_agent.main dev
```

Startup prints `{"event":"agent.started", ...}` with secrets redacted. The
worker reads `services/agent/.env` automatically and now waits for rooms,
joining them automatically.

## 5. Run the frontend

```bash
npm install
npm run dev
```

Open the printed local URL and sign in at `/auth` with `dev@trellient.local` /
`trellient-dev` — the seeded owner, who already has an enabled **Dev Test
Agent**. Or create your own account: a new account starts with no workspace, so
click **Create my workspace** and you become its owner, with a paused starter
agent.

## 6. Try it

Pick the seeded agent, click **Start web test call**, allow the microphone.
Expect the status pill to reach **Live**, then hear the seeded greeting. Speak;
the pill moves to Thinking then Speaking. Talk over the agent — it should stop
within a few hundred ms.

## Tests

```bash
cd services/agent && python -m pytest -q   # config + provider abstraction
npx tsc --noEmit                           # frontend typecheck
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Voice runtime is not configured yet." | Web `.env` missing a `LIVEKIT_*` value |
| Status stalls on "Waiting for the agent" | Agent worker isn't running, or points at a different LiveKit project |
| `Missing configuration: OPENAI_API_KEY or GOOGLE_API_KEY` | `services/agent/.env` incomplete |
| Mic blocked | Browsers require HTTPS or `localhost` for `getUserMedia` |
| Dashboard shows "No workspace yet" | Expected for a new account — click **Create my workspace** |
| Dev sign-in says "Wrong email or password." | `node scripts/db-init.mjs` hasn't been run against this database |
| "Unauthorized: sign in to continue." | Your session is missing or expired — sign in again at `/auth` |
