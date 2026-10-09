# SCHEMA-PLAN — a channel-agnostic core for voice + WhatsApp

**Status: proposal. No schema change has been made.** This is the contract two
agents will depend on, so it is written to be argued with before anything is
built.

Grounded in the live schema as of 2026-10-09: 27 tables, 9 enums, 75 calls.

---

## The one-paragraph version

About two thirds of the schema is already channel-neutral and needs **no
change** — including the knowledge base, which is the most valuable part. The
voice-specific part is three tables (`calls`, `call_transcripts`,
`call_events`) plus a split inside `agent_configs`. The proposal is to add
`conversations` and `messages` alongside the existing tables, make `calls` a
view over `conversations`, and leave every current query working untouched.
The WhatsApp agent writes `conversations`/`messages` from day one and never
sees `calls`.

---

## 1. Current state

### Already channel-neutral — reuse unchanged

| Table | Note |
|---|---|
| `agent_knowledge` | **No voice concepts at all.** The ranked full-text retrieval in `BusinessClient.knowledge_lookup` is channel-neutral; a WhatsApp agent can call it as-is. This is the single biggest asset already portable. |
| `business_policies` | Same. `policy_lookup` likewise. |
| `products`, `services`, `pricing_rules` | Catalogue and price floors. No channel. |
| `quotes`, `quote_items` | **One voice coupling**: `quotes.source_call_id` → `calls(id)`. |
| `appointments` | Same coupling: `appointments.source_call_id`. |
| `escalations` | Same: `escalations.call_id`. |
| `customers` | Neutral, but **`phone` is the only identity column** — see 1.3. |
| `businesses`, `business_users`, `users`, `user_sessions` | Tenancy and auth. Untouched. |
| `approvals` | Neutral. |

### Voice-specific — the actual work

**1.1 `calls` — the conversation root, telephony-shaped.** 28 columns. Sorting
them by whether a WhatsApp conversation would have them:

*Would have (channel-neutral):* `id`, `business_id`, `customer_id`,
`agent_config_id`, `started_at`, `ended_at`, `language`, `intent`, `outcome`,
`summary`, `tools_used`, `escalation_required`, `escalation_reason`,
`created_at`.

*Would not (voice-only):* `caller_number`, `destination_number`,
`answered_at`, `duration_seconds`, `room_name`, `provider_call_id`,
`recording_url`, `latency_ms`, `telephony_cost`, `livekit_cost`,
`phone_number_id`.

*Wrong shape rather than absent:* `direction` (`inbound|outbound` — a WhatsApp
thread is bidirectional, not one or the other), `status`
(`ringing|in_progress|completed|missed|failed` — "ringing" and "missed" are
meaningless for messaging), `provider` (defaults `'browser'`).

Roughly **half the columns survive**, which is why a view works.

**1.2 `call_transcripts` — right shape, wrong name, missing fields.**
`speaker` / `text` / `timestamp` / `metadata jsonb` is almost exactly a
messages table. Missing for WhatsApp: delivery and read state, a
provider message id for idempotency and webhook correlation, attachments, and
a reply-to for threading.

`call_events` is a generic `event_type` + `event_data jsonb` log. It needs
only its FK re-pointed.

**1.3 `customers` identity is phone-only.** `phone` plus a
`(business_id, phone)` unique constraint. WhatsApp identities are usually the
same E.164 number, which is convenient — but not guaranteed, and the WhatsApp
Business API returns an opaque `wa_id`. Treating "the phone number" as the
join key across channels is the cheapest correct thing **today** and a known
ceiling.

**1.4 `agent_configs` mixes three kinds of setting.** See section 2.3.

**1.5 `usage_records` is call-shaped.** `total_calls`, `total_minutes`,
`inbound_calls`, `outbound_calls`, `escalated_calls`. Billing for messaging
counts conversations and messages, not minutes. Not urgent (the table is
unused), but it will need the same treatment.

### What actually constrains the migration

Six tables carry an FK to `calls(id)`:

```
call_transcripts.call_id      call_events.call_id
appointments.source_call_id   quotes.source_call_id
escalations.call_id           batch_job_contacts.call_id
```

And eight files read or write `calls`:

```
agent-configs.functions.ts   outbound.functions.ts   exotel.ts
AgentConfigController  AnalyticsController  CallsController  VoiceController
business.py
```

Any plan that renames or drops `calls` touches all fourteen at once. The plan
below does not.

---

## 2. Proposed model

### 2.1 `conversations` — the new root

```sql
CREATE TYPE conversation_channel AS ENUM ('voice', 'whatsapp');
CREATE TYPE conversation_status  AS ENUM
  ('active', 'completed', 'abandoned', 'failed');

CREATE TABLE conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel          conversation_channel NOT NULL,
  customer_id      uuid REFERENCES customers(id),
  agent_config_id  uuid REFERENCES agent_configs(id),

  -- The participant identity, in whatever form the channel uses: E.164 for
  -- both today, but a wa_id or a browser session id tomorrow.
  participant_ref  text,
  -- The provider's own id, for idempotency and webhook correlation.
  provider         text NOT NULL,
  provider_ref     text,

  status           conversation_status NOT NULL DEFAULT 'active',
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,

  language         text,
  intent           text,
  outcome          text,
  summary          text,
  tools_used       text[] NOT NULL DEFAULT '{}',
  escalation_required boolean NOT NULL DEFAULT false,
  escalation_reason   text,

  -- Everything channel-specific. Voice puts room_name, duration_seconds,
  -- caller/destination numbers, recording_url, latency and cost here;
  -- WhatsApp puts its own. Promote a key to a column when a query needs to
  -- filter or aggregate on it across many rows, not before.
  channel_data     jsonb NOT NULL DEFAULT '{}',

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversations_business_started_idx
  ON conversations (business_id, started_at DESC);
CREATE INDEX conversations_channel_idx
  ON conversations (business_id, channel, started_at DESC);
CREATE UNIQUE INDEX conversations_provider_ref_idx
  ON conversations (provider, provider_ref) WHERE provider_ref IS NOT NULL;
```

**Why `channel_data jsonb` and not per-channel side tables.** A side table is
the textbook answer and it is the wrong trade here: every read of a voice
conversation would become a join, all eight existing call-reading files would
change, and the `calls` compatibility view would get more complex. JSONB keeps
the view a straight projection. The cost is no type checking on channel fields
and no cheap aggregate over them — which is why the rule above exists: promote
to a real column the moment something aggregates on it. `duration_seconds` is
the likeliest first promotion.

**On the unique index**: `(provider, provider_ref)` is what makes webhook
retries safe. The Exotel webhook already hand-rolls this with a `SELECT … WHERE
provider = $1 AND provider_call_id = $2` lookup; WhatsApp webhooks retry far
more aggressively, so it should be a constraint rather than a convention.

### 2.2 `messages` — generalises `call_transcripts`

```sql
CREATE TYPE message_role AS ENUM ('customer', 'agent', 'system', 'human');

CREATE TABLE messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  role             message_role NOT NULL,
  body             text NOT NULL,
  sent_at          timestamptz NOT NULL DEFAULT now(),

  -- WhatsApp needs these; voice leaves them null.
  provider_ref     text,
  delivery_status  text,        -- queued|sent|delivered|read|failed
  reply_to_id      uuid REFERENCES messages(id),
  attachments      jsonb NOT NULL DEFAULT '[]',

  metadata         jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX messages_conversation_idx ON messages (conversation_id, sent_at);
CREATE UNIQUE INDEX messages_provider_ref_idx
  ON messages (business_id, provider_ref) WHERE provider_ref IS NOT NULL;
```

`role` is an enum rather than `call_transcripts.speaker text` because
`'human'` matters: after an escalation, a teammate's WhatsApp replies are
neither the customer nor the agent, and the distinction has to survive into
the transcript the agent later reads back.

`delivery_status` is left `text`, not an enum — providers disagree on the set
and adding an enum value needs a migration.

### 2.3 `agent_configs` — three kinds of setting, one table

The 28 columns split cleanly:

| Kind | Columns | Treatment |
|---|---|---|
| **Shared identity & behaviour** | `name`, `enabled`, `personality`, `business_description`, `system_instructions`, `primary_language`, `supported_languages`, `allowed_actions`, `restricted_actions`, `approval_required_actions`, `escalation_enabled`, `escalation_rules`, `business_hours`, versioning | Stay. Both channels read them. |
| **Voice-only** | `voice_name`, `voice_speed`, `max_call_seconds`, `recording_enabled`, `model_provider`, `model_name` | Stay where they are. Meaningless to WhatsApp, harmless. |
| **Differs per channel** | `greeting`, `after_hours_response` | **The real problem.** A spoken greeting and a WhatsApp opener are not the same text. |

Proposal — one additive column, no new table:

```sql
ALTER TABLE agent_configs
  ADD COLUMN channel_overrides jsonb NOT NULL DEFAULT '{}';
-- {"whatsapp": {"greeting": "Hi! …", "after_hours_response": "…"}}
```

Resolution is `channel_overrides -> channel ->> key`, falling back to the
column. Voice reads the columns exactly as today and never consults the
override.

**Rejected: a `channel` column on `agent_configs`,** i.e. one config row per
channel. It looks cleaner and it duplicates the prompt, the knowledge wiring,
the guardrails and the versioning across rows — so the two channels drift, and
the thing customers actually want ("one agent, two channels, same answers")
becomes impossible to guarantee. The override map keeps a single agent
identity with per-channel surface text, which is the product requirement.

### 2.4 `calls` becomes a view — this is what keeps voice working

```sql
ALTER TABLE calls RENAME TO conversations_voice_legacy;   -- step 3 only

CREATE VIEW calls AS
SELECT
  c.id, c.business_id, c.customer_id, c.agent_config_id,
  c.provider,
  c.provider_ref                               AS provider_call_id,
  (c.channel_data->>'direction')::call_direction AS direction,
  c.channel_data->>'caller_number'             AS caller_number,
  c.channel_data->>'destination_number'        AS destination_number,
  c.started_at,
  (c.channel_data->>'answered_at')::timestamptz AS answered_at,
  c.ended_at,
  (c.channel_data->>'duration_seconds')::int   AS duration_seconds,
  …
FROM conversations c
WHERE c.channel = 'voice';
```

A view is readable immediately. Writes need `INSTEAD OF` triggers, or the
writers move to `conversations` directly — see step 4. There are only three
writers (`exotel.ts`, `VoiceController`, `business.py`), so moving them is
likely cheaper than maintaining triggers.

**Keep `status` and `direction` as the existing voice enums inside the view.**
Do not widen `call_status` to cover messaging: `conversation_status` is a new,
smaller enum, and the view casts. Widening the old enum would leak messaging
states into every voice query.

---

## 3. Cross-channel hand-off

The requirement: a voice call ends with "I will WhatsApp you the quote", and
the WhatsApp agent sends it — **without either agent importing the other's
code or writing to the other's tables.**

### The mechanism: an outbound intent table

```sql
CREATE TYPE delivery_status AS ENUM
  ('pending', 'claimed', 'sent', 'failed', 'cancelled');

CREATE TABLE channel_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  channel          conversation_channel NOT NULL,   -- where to deliver
  recipient_ref    text NOT NULL,                   -- E.164 / wa_id

  -- What to send, by reference rather than by value, so the sender renders
  -- it with current data rather than a snapshot taken mid-call.
  payload_kind     text NOT NULL,       -- 'quote' | 'appointment' | 'text' | …
  payload_ref      uuid,                -- quotes.id, appointments.id, …
  payload          jsonb NOT NULL DEFAULT '{}',

  -- Provenance: which conversation asked for this.
  source_conversation_id uuid REFERENCES conversations(id),
  requested_by     text NOT NULL,       -- 'voice_agent' | 'whatsapp_agent' | 'dashboard'

  status           delivery_status NOT NULL DEFAULT 'pending',
  claimed_at       timestamptz,
  sent_at          timestamptz,
  attempts         int NOT NULL DEFAULT 0,
  last_error       text,

  -- Result, once sent.
  delivered_conversation_id uuid REFERENCES conversations(id),

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX channel_deliveries_pending_idx
  ON channel_deliveries (channel, status, created_at) WHERE status = 'pending';
```

### How it works

1. Mid-call the voice agent calls a tool — `send_on_whatsapp(kind, ref)` —
   which inserts one `pending` row. That is its entire involvement. It does
   not know whether WhatsApp exists, is configured, or succeeded.
2. The WhatsApp service claims work with
   `SELECT … WHERE channel='whatsapp' AND status='pending' FOR UPDATE SKIP LOCKED`,
   marks it `claimed`, sends, then writes `sent` plus the resulting
   `delivered_conversation_id`.
3. Failures set `failed` with `last_error` and increment `attempts`. A row
   that stays `claimed` past a timeout is reclaimable.

### Why this shape

- **Neither agent reaches into the other.** The contract is one table.
- **By reference, not by value.** Storing `payload_ref = quotes.id` means the
  WhatsApp agent renders the quote as it stands when it sends. A snapshot
  taken mid-call would ship a stale total if the quote changed in the seconds
  after.
- **The voice agent must not block on delivery.** It promises a message and
  moves on; the caller should not wait on WhatsApp's API inside the call.
- **`SKIP LOCKED` rather than a queue.** Postgres is already there. Add a real
  broker when throughput demands it, not before.
- **It is bidirectional by construction.** `channel='voice'` rows let the
  WhatsApp agent request a callback through the same table.

### What this deliberately does not do

No retry/backoff policy, no scheduling (`send_after`), no templating. Add
`send_after timestamptz` when the first "message them tomorrow" requirement
appears — it is one nullable column.

---

## 4. Migration path

Five steps. **Steps 1–2 ship before the WhatsApp agent needs anything, and
neither touches a line of voice code.**

### Step 1 — additive only *(no code changes, no risk)*

Create `conversations`, `messages`, `channel_deliveries`, the new enums, and
`agent_configs.channel_overrides`. Nothing reads them. `calls` is untouched
and the voice agent cannot tell anything happened.

**The WhatsApp agent can start here.** It writes `conversations` with
`channel='whatsapp'` and never touches `calls`. The two channels coexist in
separate rows of the same table before any voice code moves.

### Step 2 — backfill and dual-write *(small, reversible)*

Backfill the 75 existing calls into `conversations`:

```sql
INSERT INTO conversations (id, business_id, channel, customer_id, agent_config_id,
                           provider, provider_ref, status, started_at, ended_at,
                           language, intent, outcome, summary, tools_used,
                           escalation_required, escalation_reason, channel_data, created_at)
SELECT id, business_id, 'voice', customer_id, agent_config_id,
       provider, provider_call_id,
       CASE status WHEN 'completed' THEN 'completed'
                   WHEN 'failed'    THEN 'failed'
                   WHEN 'missed'    THEN 'abandoned'
                   ELSE 'active' END::conversation_status,
       started_at, ended_at, language, intent, outcome, summary, tools_used,
       escalation_required, escalation_reason,
       jsonb_strip_nulls(jsonb_build_object(
         'direction', direction, 'caller_number', caller_number,
         'destination_number', destination_number, 'answered_at', answered_at,
         'duration_seconds', duration_seconds, 'room_name', room_name,
         'recording_url', recording_url, 'latency_ms', latency_ms,
         'telephony_cost', telephony_cost, 'livekit_cost', livekit_cost,
         'phone_number_id', phone_number_id)),
       created_at
FROM calls;
```

**`conversations.id` is deliberately `calls.id`.** Keeping the same primary key
means the six FK dependents do not have to be rewritten or re-pointed — they
already hold valid `conversations` ids. This is the single decision that makes
the rest cheap.

Then dual-write: the three voice writers write both tables in one transaction.
Verify counts match over a few days. **Rollback at this point is dropping the
new tables.**

### Step 3 — cut over reads

Rename `calls` → `conversations_voice_legacy`, create the `calls` view, drop
the dual-write. Readers (`CallsController`, `AnalyticsController`,
`business.py`) keep working through the view with **no query changes**.

Re-point the six FKs to `conversations(id)`. Because the ids are identical,
this is a constraint swap, not a data migration.

### Step 4 — move the writers

Three writers move from `calls` to `conversations`: `exotel.ts`,
`VoiceController`, `business.py`. Done individually, each independently
revertible. After this, `INSTEAD OF` triggers are unnecessary.

### Step 5 — retire

Drop `conversations_voice_legacy` once a release has passed with no reads.
Migrate `call_transcripts` → `messages` on the same pattern. Keep the `calls`
view as long as anything external depends on it.

### What is explicitly not done

No big-bang rename. No downtime. No step where the voice agent and the schema
disagree — each step leaves a consistent state, and steps 1–2 are pure
additions.

---

## 5. For the cofounder — the WhatsApp agent's contract

**Everything below is what the WhatsApp agent can rely on. Please challenge
anything that does not fit how the WhatsApp side actually works.**

### What you get, unchanged, today

- **`agent_knowledge`** and **`business_policies`** with ranked full-text
  retrieval — already channel-neutral. Same answers as voice, no work needed.
- **`products`, `services`, `pricing_rules`** — catalogue and price floors,
  including the SQL functions `pricing_lookup` and `discount_request` that
  enforce the floor so a prompt cannot talk past it.
- **`customers`** — keyed `(business_id, phone)`.
- **`businesses`, `business_users`** — tenancy. **Every query must be scoped by
  `business_id`.** This is the invariant the whole product rests on.
- **`agent_configs`** — one agent identity shared across channels.

### What you write

- One row in **`conversations`** per thread, `channel='whatsapp'`,
  `provider_ref` = the provider's conversation id.
- One row in **`messages`** per message, with `provider_ref` for idempotency
  and `delivery_status` as it changes.
- Channel-specific fields go in `conversations.channel_data` jsonb. Tell us
  what you need promoted to real columns.

### What you consume

- **`channel_deliveries`** where `channel='whatsapp' AND status='pending'`.
  Claim with `FOR UPDATE SKIP LOCKED`, send, mark `sent` and set
  `delivered_conversation_id`.

### What you never touch

- `calls`, `call_transcripts`, `call_events`, `phone_numbers`, `agent_tools`
  — voice internals.
- Another business's rows. There is no row-level security; scoping is the
  application's job.

### Six questions we need answered before building this

1. **Identity.** Is the WhatsApp sender always the same E.164 as the phone
   number, or do you get an opaque `wa_id`? If it can differ, `customers`
   needs a second identity column and the "same person across channels" join
   stops being free.
2. **Conversation boundaries.** What ends a WhatsApp conversation — a 24-hour
   window, inactivity, explicit close? Voice has a clear hangup; messaging
   does not, and `ended_at` has to mean something.
3. **Do you need `messages` before `conversations`?** Some providers deliver a
   message webhook before any thread concept exists. If so, the insert order
   inverts and `conversations` needs creating lazily.
4. **Template messages.** WhatsApp requires pre-approved templates outside the
   24-hour window. Does `channel_deliveries.payload_kind` map to a template
   name, or do you need a `template_id` column?
5. **Who owns sending?** Does the WhatsApp agent poll `channel_deliveries`, or
   would you rather the Spring API expose `POST /api/deliveries` and you call
   it? Polling is less coupling; an endpoint is lower latency.
6. **Read receipts.** Do you need them stored per message, or is the latest
   status on the conversation enough? It changes whether `delivery_status`
   belongs on `messages` or a side table.

### What we need from you to proceed

Agreement on `conversations` + `messages` + `channel_deliveries` as the three
shared tables, and answers to 1, 2 and 4 — those three change the column list.
3, 5 and 6 can be decided later without reshaping anything.

---

## 6. P2.2 impact

**Yes — the batch dialer and alert evaluator should target the new model, and
this is the reason to decide now rather than after.**

**Batch dialer.** `batch_job_contacts.call_id` already points at `calls(id)`.
Because step 2 preserves ids, a dialer written against `calls` today keeps
working — but every new query it adds is a query to migrate later, and it is a
large feature. More importantly, "batch" is not voice-specific: the same
campaign shape is a WhatsApp broadcast. Building it against `conversations`
with a `channel` on the job makes the WhatsApp broadcast nearly free; building
it against `calls` guarantees a second implementation.
**Recommend: wait for step 1, then build against `conversations`.** Step 1 is
additive and can land in a day.

**Alert evaluator.** `alert_rules` evaluates call conditions. The same rules
("escalation rate above X", "failures in the last hour") are channel-neutral,
and an evaluator reading `conversations` covers both channels at once. Written
against `calls`, it silently ignores every WhatsApp conversation.
**Recommend: same — build against `conversations`.**

**What can proceed now, before any schema change:** porting
`createOutboundCall` to Spring, proxying `/api/batch`, and the Plivo provider
adapter. None of them touch the conversation root.

### Suggested order

1. **Agree this contract** with the cofounder — questions 1, 2, 4 above.
2. **Step 1** (additive tables). One day, zero risk, unblocks the WhatsApp
   agent immediately.
3. WhatsApp agent starts; **step 2** backfill and dual-write in parallel.
4. Batch dialer and alert evaluator against `conversations`.
5. **Steps 3–5** when convenient — no deadline, nothing blocks on them.

---

## Known ceilings in this proposal

Stated plainly so they are chosen, not discovered.

- **`channel_data jsonb` has no type checking** and no cheap cross-row
  aggregate. Mitigation: promote to a column when something aggregates on it.
  `duration_seconds` will likely go first.
- **Phone number as the cross-channel identity** breaks if WhatsApp hands back
  an opaque id. Question 1 settles it.
- **`channel_deliveries` is a polled table, not a queue.** Fine at this
  volume; revisit if delivery latency matters more than simplicity.
- **`usage_records` is still call-shaped** and not addressed here. It is
  unused, so it can be reshaped when billing is built.
- **No row-level security.** Tenant isolation stays an application invariant
  across two codebases now instead of one — which is a meaningfully larger
  surface to get wrong, and worth revisiting as a Postgres RLS policy.
