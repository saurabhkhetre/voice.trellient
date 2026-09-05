# Agent guidelines

- This is the Trellient Voice SaaS platform (voice.trellient.com).
- The marketing website is in a separate repository â€” do not mix them.
- Supabase is the auth and database layer. All client imports go through `@/lib/supabase/client`.
- LiveKit handles real-time voice. The Python agent is under `services/agent/`.
- Keep secrets server-side only â€” no `VITE_` prefix for API keys or secrets.
