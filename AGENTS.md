# Agent guidelines

- This is the Trellient Voice SaaS platform (voice.trellient.com).
- The marketing website is in a separate repository â€” do not mix them.
- Postgres is the only data store; there is no Supabase. Server functions query it through `@/lib/db/pg.server` and authorize with `@/lib/auth/middleware` + `@/lib/auth/access`. Schema changes go in `db/migrations/`.
- LiveKit handles real-time voice. The Python agent is under `services/agent/`.
- Keep secrets server-side only â€” no `VITE_` prefix for API keys or secrets.
