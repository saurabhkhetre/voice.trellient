# Local setup

Two processes: a web frontend and the Python agent worker. Both talk to the same
LiveKit Cloud project.

## 1. LiveKit Cloud

1. Create a free project at https://cloud.livekit.io.
2. Settings -> Keys -> create a key pair.
3. Copy the project URL (`wss://<name>.livekit.cloud`), the API key, and secret.

## 2. Environment

```bash
cp .env.example .env.local                 # web (this repo's TanStack app)
cp apps/web/.env.example apps/web/.env.local   # web (Next.js app)
cp services/agent/.env.example services/agent/.env
```

Fill in `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` everywhere, and
`OPENAI_API_KEY` in the agent env only. Nothing here uses a `VITE_`/
`NEXT_PUBLIC_` prefix — none of these values may reach the browser.

## 3. Run the agent worker

```bash
cd services/agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m voice_agent.main dev
```

Startup prints `{"event":"agent.started", ...}` with secrets redacted. The
worker now waits for rooms and joins them automatically.

## 4. Run a frontend

TanStack app (this repo, route `/voice`):

```bash
bun install && bun run dev     # http://localhost:8080/voice
```

Next.js app (Vercel target):

```bash
cd apps/web && npm install && npm run dev   # http://localhost:3000
```

## 5. Try it

Open the page, click **Start conversation**, allow the microphone. Expect
`Session: Connected`, then `Agent: Listening`. Speak; the pill moves to Thinking
then Speaking. Talk over the agent — it should stop within a few hundred ms.

## Tests

```bash
cd services/agent && python -m pytest -q   # config + provider abstraction
bunx tsgo --noEmit                         # frontend typecheck
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Voice service is not configured yet." (503) | Web env missing a `LIVEKIT_*` value |
| Status stalls on "Waiting for agent" | Agent worker isn't running, or points at a different LiveKit project |
| `Missing configuration: OPENAI_API_KEY` | Agent `.env` incomplete |
| Mic blocked | Browsers require HTTPS or `localhost` for `getUserMedia` |
