# Trellient â€” Voice Agent SaaS Platform

The SaaS voice agent platform for [voice.trellient.com](https://voice.trellient.com).

> **Looking for the marketing website?** That lives at [trellient.com](https://trellient.com) in a separate repository.

## Stack

- **Framework:** TanStack Start (SSR via Vite + Nitro)
- **UI:** React 19, Tailwind CSS v4, Radix UI
- **Routing:** TanStack Router (file-based)
- **Auth & DB:** Postgres 16 — accounts, sessions and all app data (self-hosted sign-in)
- **Voice:** LiveKit WebRTC + Python agent worker
- **Telephony:** Exotel SIP (designed, not yet verified live)

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the runtime flow, provider abstraction, and frontend contract.

## Development

```sh
npm install
npm run dev
```

For the Python voice agent:

```sh
cd services/agent
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
python -m voice_agent.main dev
```

See [SETUP.md](./SETUP.md) for full local setup and [DEPLOYMENT.md](./DEPLOYMENT.md) for production.

## Dashboard Pages

| Route | Description |
|---|---|
| `/auth` | Sign in / sign up |
| `/dashboard` | Home: today's calls, active calls, agents, open escalations |
| `/dashboard/agents` | Agent studio: prompt, model and voice, test calls, call history |
| `/dashboard/knowledge` | Business knowledge base |
| `/dashboard/phone-numbers` | Phone numbers and agent assignment |
| `/dashboard/batch-call` | Outbound call campaigns |
| `/dashboard/call-history` | Call logs and transcripts |
| `/dashboard/contacts` | Customer records |
| `/dashboard/analytics` | Call volume, containment, intents |
| `/dashboard/live-monitoring` | Listen in on active calls |
| `/dashboard/ai-quality` | Call quality review |
| `/dashboard/alerting` | Alert rules |
| `/dashboard/integrations` | Integrations |
| `/dashboard/settings` | Business settings |

---

This project was built with [Lovable](https://lovable.dev).
