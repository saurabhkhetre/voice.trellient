# Deployment

Frontend on Vercel, agent on LiveKit Cloud. No self-hosted LiveKit in V1.

## 1. Agent -> LiveKit Cloud

```bash
brew install livekit-cli          # or: curl -sSL https://get.livekit.io/cli | bash
lk cloud auth                      # links your LiveKit project
cd services/agent
lk agent create                    # first deploy; writes agent id into livekit.toml
```

Set the agent's secrets in the LiveKit Cloud dashboard (Agents -> your agent ->
Secrets), or on the command line:

```bash
lk agent update-secrets \
  OPENAI_API_KEY=sk-... \
  REALTIME_PROVIDER=openai_realtime \
  REALTIME_MODEL=gpt-4o-realtime-preview
```

`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are injected by the
platform for deployed agents — don't set them as agent secrets.

Subsequent releases:

```bash
lk agent deploy      # builds services/agent/Dockerfile and rolls it out
lk agent logs        # streams the structured JSON logs
lk agent status
```

Commit the `livekit.toml` that `lk agent create` updates, so later deploys
target the same agent.

## 2. Frontend -> Vercel

```bash
cd apps/web
vercel link
vercel env add LIVEKIT_URL production
vercel env add LIVEKIT_API_KEY production
vercel env add LIVEKIT_API_SECRET production
vercel --prod
```

If the repo root is the Vercel project root, set **Root Directory** to
`apps/web` in Project Settings.

The `/api/token` route runs on the Node.js runtime (`runtime = "nodejs"`) because
`livekit-server-sdk` is Node-only; keep that export.

## 3. Verify production

1. Open the deployed URL over HTTPS (required for microphone access).
2. Click Start conversation, allow the mic.
3. `lk agent logs` should show `room.connected` then `session.started`.
4. Speak, then interrupt mid-answer — the agent must cut off promptly.

## Rollback and scaling

- `lk agent rollback` returns to the previous agent build.
- LiveKit Cloud scales agent replicas with concurrent sessions; one job serves
  one room.
- Vercel rollback: promote a previous deployment from the dashboard.

## Security checklist

- [ ] No `NEXT_PUBLIC_` / `VITE_` variable holds a key or secret.
- [ ] `/api/token` validates its body and returns room-scoped tokens only.
- [ ] Token TTL stays short (15 minutes) and responses are `no-store`.
- [ ] Provider keys exist only as agent secrets on LiveKit Cloud.
- [ ] `.env*` files are gitignored; only `.env.example` is committed.
