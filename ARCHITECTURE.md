# Architecture

## Runtime flow

```text
Browser                    Web server                LiveKit Cloud            Agent worker
  |                            |                          |                        |
  | 1. click Start             |                          |                        |
  | 2. getUserMedia (mic)      |                          |                        |
  | 3. POST /api/token ------->|                          |                        |
  |                            | TokenManager mints a     |                        |
  |                            | short-lived join token   |                        |
  | <---- {serverUrl, token} --|                          |                        |
  | 4. WebRTC connect --------------------------------->  |                        |
  |                            |                          | 5. dispatch job -----> |
  |                            |                          |  <-- agent joins room  |
  | 6. duplex audio  <=================================>  | <====================> |
  |                            |                          |   realtime AI provider |
```

Secrets never leave the server: `LIVEKIT_API_SECRET`, `OPENAI_API_KEY` and any
future provider key are read only by the token endpoint and the Python worker.
The browser receives one room-scoped JWT with a 15-minute TTL.

## Abstractions

| Abstraction | Where | Responsibility |
| --- | --- | --- |
| `TokenManager` | `apps/web/lib/token-manager.ts`, `src/lib/voice/livekit.server.ts` | Mints room-scoped LiveKit join tokens, validates server config |
| `SessionManager` | `useVoiceSession` (both frontends) | Mic permission, token exchange, room lifecycle, reconnects |
| `AgentStateManager` | `useVoiceSession` | Maps the `lk.agent.state` participant attribute to UI states |
| `ConversationManager` | `services/agent/.../agent.py` | Starts one `AgentSession`, greets, wires events, tears down |
| `VoiceAgent` | `services/agent/.../agent.py` | The assistant persona (system prompt + behaviour) |
| `RealtimeModelProvider` | `services/agent/.../providers/` | Provider-agnostic realtime model factory |

## Provider abstraction

`RealtimeModelProvider` exposes `validate()`, `create_model()` and `describe()`.
`build_provider(config)` resolves `REALTIME_PROVIDER` through the `PROVIDERS`
registry. `openai_realtime` is implemented; `gemini_live` exists as an interface
stub, so adding it means filling in one `create_model()` — no application code
changes.

## Two frontends, one contract

`shared/voice-contract.ts` holds the connection/agent state unions, the session
credential shape, and the LiveKit attribute and topic names. Both the TanStack
Start app (`src/routes/voice.tsx`, live in this preview) and the Next.js app
(`apps/web`, for Vercel) follow it: `apps/web` imports it directly via the
`@shared/*` path alias, and the TanStack app mirrors it in
`src/lib/voice/types.ts` (same unions plus UI-only error copy), so the UI states
and the agent's published attributes can't drift apart.

## Interruption (barge-in)

Realtime models handle turn detection server-side. When the user's audio starts
mid-response, `AgentSession` cancels the in-flight generation and truncates the
already-published audio, then flips `lk.agent.state` to `listening` — which is
what drives the UI back to the Listening pill.

## Observability

The agent logs one JSON object per line (`logging_setup.py`) with redaction of
key-like fields: `agent.started`, `room.connected`, `session.started`
(with `startup_ms`), `user.turn_final`, `agent.state_changed`, `model.response`,
`session.error`, `agent.error`. The token endpoint logs
`session.token_issued` / `session.config_invalid` / `session.token_failed`.
