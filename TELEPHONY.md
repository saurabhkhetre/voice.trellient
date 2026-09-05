# Telephony (Exotel) — configuration runbook

Status: **designed and coded, not yet verified on a live phone call.** No Exotel
account is connected, so nothing here has been proven end to end. Do not claim
working phone calls until step 6 passes.

## What is already in the codebase

| Piece | Location |
| --- | --- |
| Provider interface (`receiveCall`, `startCall`, `endCall`, `transferCall`, `getCallStatus`, `getRecording`) | `src/lib/telephony/provider.ts` |
| Exotel adapter | `src/lib/telephony/exotel.ts` |
| Inbound webhook | `src/routes/api/public/telephony/exotel.ts` |
| Agent runtime that joins the room and uses business data | `services/agent/` |

The webhook resolves the business by matching the dialled number against
`businesses.phone`, refuses the call when the business's agent config is
disabled, upserts the caller as a customer, opens a `calls` row, and returns the
room the agent worker should join.

## Environment variables

Set on the web app (server side only):

```
TELEPHONY_WEBHOOK_TOKEN=   # shared secret; the webhook rejects requests without it
EXOTEL_SID=
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
EXOTEL_CALLER_ID=          # the Exophone / virtual number in E.164
```

Set on the agent worker (`services/agent/.env`): `LIVEKIT_*`,
`OPENAI_API_KEY` (or `GOOGLE_API_KEY`), `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `DEFAULT_BUSINESS_ID` for browser test calls.

## Steps to go live

1. **Buy an Exophone** in the Exotel dashboard and note the number in E.164
   form (`+9180xxxxxxx`).
2. **Store that number** on the business record — Dashboard → Settings → Phone.
   The webhook uses it to identify the tenant, so it must match exactly.
3. **Create a SIP trunk** between Exotel and LiveKit SIP, then register the
   trunk in LiveKit and create a dispatch rule that routes inbound SIP calls to
   an individual room per call.
4. **Point the Exophone's flow** at the webhook:
   `POST https://project--<project-id>.lovable.app/api/public/telephony/exotel`
   with the header `x-webhook-token: <TELEPHONY_WEBHOOK_TOKEN>` and the standard
   passthru fields (`CallSid`, `From`, `To`, `Direction`).
5. **Run the agent worker** (`python -m voice_agent.main start`) against the
   same LiveKit project, so a worker is waiting when a SIP participant joins.
6. **Place a real call** to the Exophone. It counts as working only when all of
   these are true: the agent answers, quotes a real price from `products`, and a
   `calls` row appears in Dashboard → Calls with a transcript and summary.

## Escalation and transfer

The browser console and the agent both request a handoff by filing an
`escalations` row (`reason = caller_requested_human`), which surfaces in
Dashboard → Escalations. Warm transfer to a human phone line is **not**
implemented: `transferCall` in the Exotel adapter is the intended hook and needs
an Exotel connect-flow target before it can move live audio.

## Troubleshooting

- `401` from the webhook → `x-webhook-token` missing or mismatched.
- `404 Unknown destination number` → `businesses.phone` does not match `To`.
- `{"action":"reject","reason":"agent_disabled"}` → enable the agent in
  Dashboard → Voice Agent.
- Call connects but nobody speaks → no agent worker is running, or the LiveKit
  dispatch rule sends the call to a room the worker is not subscribed to.
