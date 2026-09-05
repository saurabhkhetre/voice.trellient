# Trellient â€” Voice Agent SaaS Platform

The SaaS voice agent platform for [voice.trellient.com](https://voice.trellient.com).

> **Looking for the marketing website?** That lives at [trellient.com](https://trellient.com) in a separate repository.

## Stack

- **Framework:** TanStack Start (SSR via Vite + Nitro)
- **UI:** React 19, Tailwind CSS v4, Radix UI
- **Routing:** TanStack Router (file-based)
- **Auth & DB:** Supabase (Auth + Postgres)
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
pip install -r requirements.txt
python -m voice_agent.main dev
```

See [SETUP.md](./SETUP.md) for full local setup and [DEPLOYMENT.md](./DEPLOYMENT.md) for production.

## Dashboard Pages

| Route | Description |
|---|---|
| `/auth` | Sign in / sign up |
| `/dashboard/voice-agent` | Voice agent config, test calls, call history |
| `/dashboard/customers` | Customer records |
| `/dashboard/products` | Product catalog |
| `/dashboard/services` | Service catalog |
| `/dashboard/pricing` | Pricing rules |
| `/dashboard/knowledge` | Business knowledge base |
| `/dashboard/calls` | Call logs and transcripts |
| `/dashboard/appointments` | Appointment scheduling |
| `/dashboard/quotes` | Quote management |
| `/dashboard/escalations` | Escalation queue |
| `/dashboard/analytics` | Usage analytics |
| `/dashboard/settings` | Business settings |

---

This project was built with [Lovable](https://lovable.dev).
