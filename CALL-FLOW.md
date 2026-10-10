# CALL-FLOW — the inbound call, mapped to the code

**Report only. No code changed.** Pairs with SCHEMA-PLAN.md, which owns the
cross-channel data model; section 5 here is the call-side view of that
contract.

Stack as planned: **Plivo → LiveKit SIP → Python agent → shared Postgres**,
the same database the WhatsApp agent reads and writes.

Verified against the code on 2026-10-10. Where something is marked MISSING it
is because I looked for it and it is not there, not because I did not find it.

---

## The finding that matters most

**Almost every "guardrail" in the product is a sentence in a prompt, not a
rule in the system.**

Exactly three things are genuinely enforced, and all three are Postgres
functions the model cannot talk past:

```
pricing_lookup      price floors
discount_request    discount ceiling + owner approval
appointment_check   slot availability
```

Everything else the Agents UI presents as a control — **business hours,
allowed actions, restricted actions, approval-required actions** — exists only
as text injected into the system prompt (`prompts.py:57, 107, 110-111`).
Nothing reads the clock. Nothing checks an action against a list before
performing it. A model that mishears, is talked around, or simply ignores the
instruction will book at 3am and perform a restricted action, and no code will
stop it.

That is the spine of section 3, and it is not what the configuration screen
implies.

---

## 1. Call arrival → tenant resolution

| Step                                             | State                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Caller dials the business number                 | —                                                                   |
| Plivo receives, sends SIP INVITE to LiveKit      | **MISSING** — no Plivo account, no trunk pointed anywhere           |
| LiveKit inbound trunk accepts                    | **EXISTS** (`ST_gsjfHdp7zEoK`) but allow-list says `sip.exotel.com` |
| Dispatch rule creates the room                   | **EXISTS** (`SDR_Ji8ma7ho7rpj`), `callee` + randomize               |
| LiveKit dispatches a job to the worker           | **EXISTS** — proven on 75 browser calls                             |
| Agent reads `sip.trunkPhoneNumber`               | **EXISTS, UNVERIFIED** — `agent.py:94`                              |
| `resolve_by_dialled_number` → business + agent   | **EXISTS** — `business.py:161`                                      |
| `load_context` loads config, knowledge, policies | **EXISTS** — `business.py:204`                                      |
| Webhook records the `calls` row                  | **EXISTS** — Exotel-shaped                                          |

**Room naming is solved and needs no further work.** The dispatch rule names
the room and LiveKit hands the agent that exact room as its job, so nothing
guesses. Concurrent callers to one number land in separate rooms. The design
and its rejected alternative are recorded in `sip.ts` → `ROOM_NAMING`.

### Missing / at risk

**1.1 — The allow-list names the wrong vendor.** The live trunk carries
`allowedAddresses: ["sip.exotel.com"]`. With Plivo chosen, this is actively
misleading and will reject Plivo's INVITE. _High · S · blocked on Plivo
(need their origination hosts)._ The setup script is already de-vendored;
only the live resource is stale.

**1.2 — `sip.trunkPhoneNumber` is unverified.** The whole tenant resolution
hangs on this one attribute name. If wrong, the call connects and the agent
cannot find the business. _High · S to fix, but only observable on a live
call._ `business.resolved_from_sip` vs `business.unknown_number` in the log
distinguishes it immediately.

**1.3 — No Plivo provider adapter.** `lib/telephony/exotel.ts` implements
`TelephonyProvider` (`parseInbound`, `transfer`, `hangup`). Plivo needs a
sibling. The interface exists, so this is additive. _High · M · **buildable
now** — Plivo's webhook and API shapes are public; only testing needs the
account._

**1.4 — The inbound webhook is Exotel-shaped and Node-only.** `exotel.ts`
parses Exotel's field names and still runs in TanStack, not Spring. A Plivo
webhook is a second route. _Medium · M · buildable now._ Porting to Spring
also needs SECURITY.md **F-15** (the token check must come with it).

---

## 2. Greeting and caller identification

| Step                                        | State                                    |
| ------------------------------------------- | ---------------------------------------- |
| Greeting read from `agent_configs.greeting` | **EXISTS** — `agent.py:215`              |
| Agent instructed to say it verbatim first   | **EXISTS** — `agent.py:290`              |
| Caller looked up by number                  | **EXISTS and automatic**                 |
| `ctx.customer_id` set for the call          | **EXISTS**                               |
| Unknown caller recorded                     | **EXISTS** — webhook upserts `customers` |

Caller identification is better than the tool list suggests. `customer_lookup`
is exposed as a model tool, but `load_context` (`business.py:232-234`) **also
resolves the caller automatically** from `caller_number` before the
conversation starts, so `ctx.customer_id` is populated whether or not the
model thinks to call the tool. Downstream writes (`appointments`, `quotes`)
pick it up for free.

### Missing

**2.1 — The greeting does not use the caller's name.** The customer is
resolved before the greeting plays, but the greeting is a static string said
"word for word". Recognising a repeat caller is the cheapest warmth available
and the data is already in hand. _Low · S · buildable now._

**2.2 — No per-channel greeting.** Covered by SCHEMA-PLAN §2.3
(`channel_overrides`). _Low · S · blocked on the schema decision._

---

## 3. Conversation and business rules

### Genuinely enforced — the model cannot get past these

| Rule                        | Mechanism                                                                         |
| --------------------------- | --------------------------------------------------------------------------------- |
| Price floor                 | `pricing_lookup()` SQL function returns the minimum; prompt forbids going below   |
| Discount ceiling + approval | `discount_request()` SQL function decides and files an `approvals` row            |
| Slot availability           | `appointment_check()` SQL function                                                |
| Tool availability           | `resolve_tool_settings` — a disabled tool is **not passed to the model at all**   |
| Hangup                      | `end_call` is opt-in (`OPT_IN_TOOLS`); without it the agent has no way to hang up |

Tool gating is real enforcement and worth noting: the model cannot invoke a
tool it was never given.

### Retrieval — works, with a known ceiling

`knowledge_lookup` and `policy_lookup` run ranked full-text search with an
ILIKE fallback. Measured on the seeded corpus: knowledge **20/32 top-1, 24/32
top-3**; policies **12/16 top-1, 16/16 top-3**. Remaining misses are pure
synonym gaps. A live call confirmed correct grounded answers and a graceful
decline on an out-of-scope question.

### NOT enforced — prompt text only

**3.1 — Business hours.** `business_hours` and `after_hours_response` appear
only in `prompts.py:57,107`. **Nothing reads the clock.** The prompt is given
the current time and the opening hours and asked to behave. _High · M ·
buildable now._ The honest fix is in `appointment_create` — refuse a slot
outside hours at the tool boundary, the way `appointment_check` already
refuses an unavailable one.

**3.2 — `allowed_actions` / `restricted_actions` / `approval_required_actions`.**
`prompts.py:110-111` renders them as "You are allowed to: …" / "You must never:
…". No code checks an action against the list. _High · M · buildable now._
`approval_required_actions` is the sharpest: it implies a gate, and there is
none — only `discount_request` actually files an approval.

**3.3 — The gap is a product-truth problem, not only a technical one.** The
Agents UI presents these as switches and lists, which reads as configuration
that is applied. It is configuration that is _suggested_. This is the same
class as the Connect buttons removed in `84efabd` and the `transfer_call`
label fixed in `b84124e`. _High · S for honesty (label them "guidance to the
agent"), M for real enforcement._

---

## 4. The escalation / transfer branch

### What fires it today

Exactly one thing: **the model decides to**. `GROUND_RULES` line 47:

> _If the caller is angry, asks for a person, or the request is outside what
> you can do, call `escalate_to_human` and tell the caller a team member will
> call back._

There is **no detection** of anger, no counter of failed attempts, no
repeated-question trigger, no timeout. It is a sentence, and the model's
judgement.

### What happens when it fires

```
escalate_to_human(reason, summary)
  └─ INSERT INTO escalations (business_id, call_id, customer_id, reason, summary, 'open')
  └─ UPDATE calls SET escalation_required = true, escalation_reason = …
  └─ returns say_next: "Tell the caller a colleague will call them back shortly."
```

**The call is not transferred and nobody is notified.** A row is written to a
table, the caller is promised a callback, and the call continues or ends. The
Live Monitoring page shows the escalation count; nothing pages a human.

**`transfer_call` still only files a callback.** The UI label was corrected to
"Escalate to human (callback)" in `b84124e`, so it no longer _claims_ to
transfer — but the stored type is still `transfer_call`, and the capability
gap is unchanged.

### What should fire it — missing

| Trigger                                   | State                                                             |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Caller explicitly asks for a person       | prompt only                                                       |
| Caller is angry                           | **MISSING** — no sentiment signal                                 |
| Agent failed N times on the same question | **MISSING** — no attempt counter                                  |
| A tool returned `found: false` repeatedly | **MISSING** — the signal exists (`_dump_lookup`) and is unused    |
| Call exceeds a duration                   | **MISSING** — `max_call_seconds` ends the call, does not escalate |
| Out-of-hours                              | **MISSING** — see 3.1                                             |

_Medium · M · buildable now._ The repeated-`found: false` counter is the
cheapest and most valuable: it is the exact situation where the caller is
being failed, and the data already flows through one function.

### Live transfer — what it would take

**Nothing exists.** `provider.transfer()` is implemented in `exotel.ts` and
**called from nowhere** — `grep` finds zero callers.

Three routes, in increasing cost:

1. **Carrier-side transfer.** Plivo's transfer API moves the leg. Cheapest;
   the carrier bridges. Needs `provider.transfer()` wired into
   `escalate_to_human` when the call is a real phone call (`provider != browser`).
   _M · blocked on Plivo._
2. **SIP REFER via LiveKit.** `SipClient.transferSipParticipant` exists in the
   installed SDK. Keeps control in LiveKit; needs Plivo to honour REFER —
   unknown until tested. _M · blocked on Plivo._
3. **Warm transfer.** Dial the human into the same room as a second SIP
   participant, agent introduces and drops. Best experience, needs outbound
   working. _L · blocked on Plivo._

### Unanswered design questions — transfer-to-whom

None of these have an answer in the code or the schema:

- **Who?** There is no "on-call human" anywhere. `business_users` has roles
  but no phone number and no availability. **A `escalation_targets` table or
  a phone number on `business_users` is a prerequisite for any transfer.**
- **In hours only?** With 3.1 unfixed there is no hours check to hang this on.
- **If nobody answers?** Ring timeout → voicemail → back to the agent → give
  up? Undefined.
- **What does the caller hear?** No hold message, no "connecting you" state.
- **Does the agent stay?** If the transfer fails, can it resume, or is the
  call lost?

_These are product decisions, not engineering ones, and they block
implementation more than Plivo does._

---

## 5. The WhatsApp hand-off (flagship)

**Nothing exists.** No tool, no table, no sender. Designed here against
SCHEMA-PLAN §3.

### The mechanism

The voice agent gets one new tool. It writes an intent row and moves on; it
never learns whether WhatsApp exists or succeeded.

```python
@function_tool
async def send_on_whatsapp(what: str, note: str = "") -> str:
    """Send the caller something on WhatsApp: a quote, directions, or a receipt."""
```

→ inserts one row into `channel_deliveries` (SCHEMA-PLAN §3):

```
channel        = 'whatsapp'
recipient_ref  = ctx.caller_number
payload_kind   = 'quote' | 'location' | 'receipt' | 'text'
payload_ref    = quotes.id            -- by reference, never by value
source_conversation_id = ctx.call_id
requested_by   = 'voice_agent'
status         = 'pending'
```

The WhatsApp service claims with `FOR UPDATE SKIP LOCKED`, sends, writes back
`sent` and `delivered_conversation_id`.

### Why by reference, not by value

A quote agreed at minute two can change before the message sends at minute
four. Storing `payload_ref = quotes.id` means the WhatsApp agent renders what
the quote _is_, not a snapshot of what it _was_. This matters most for the
payload customers care about most.

### What can be sent

| Kind          | Source                   | Notes                               |
| ------------- | ------------------------ | ----------------------------------- |
| `quote`       | `quotes` + `quote_items` | Already written by `quote_create`   |
| `location`    | `businesses.address`     | Trivially available                 |
| `appointment` | `appointments`           | Confirmation with date/time         |
| `receipt`     | —                        | No payments exist yet               |
| `text`        | free text                | Needs template approval — see below |

### Consent and the number

**5.1 — The number is not necessarily the WhatsApp number.** `ctx.caller_number`
is who called. Assuming it reaches WhatsApp is usually right in India and not
guaranteed. The agent must **ask and confirm** — "shall I send that to this
number on WhatsApp?" — and the answer should be stored, not re-asked every
call. _Needs a `customers.whatsapp_opt_in` column; SCHEMA-PLAN question 1
covers the identity half._

**5.2 — Consent is a legal requirement, not a nicety.** WhatsApp Business
policy requires opt-in before business-initiated messages. The caller verbally
agreeing on a recorded call is a reasonable basis, but **the agreement must be
recorded in a column**, not merely implied by the delivery row existing.

**5.3 — The 24-hour window.** Outside 24 hours since the customer's last
message, only pre-approved templates may be sent. A quote sent minutes after a
call is inside the window **only if the customer has ever messaged the
business on WhatsApp** — for a voice-only customer, there is no window at all
and the first message **must** be a template. This is the single most likely
thing to make the flagship feature fail in practice, and it is a cofounder
question (SCHEMA-PLAN question 4).

### Missing pieces

| #   | Piece                                 | Sev    | Eff | Blocked on                   |
| --- | ------------------------------------- | ------ | --- | ---------------------------- |
| 5.4 | `channel_deliveries` table            | High   | S   | **schema decision**          |
| 5.5 | `send_on_whatsapp` tool + prompt rule | High   | S   | 5.4                          |
| 5.6 | `customers.whatsapp_opt_in`           | High   | S   | schema decision              |
| 5.7 | The sender itself                     | High   | M   | **WhatsApp API + cofounder** |
| 5.8 | Template registry / mapping           | Medium | M   | **WhatsApp API**             |
| 5.9 | Delivery status back to the dashboard | Low    | S   | 5.7                          |

**The voice side of this is small** — a table, a tool, a prompt line, an
opt-in column. The weight is on the WhatsApp side and in the template rules.

---

## 6. Call completion

### Written today

```
finish_call(duration_seconds, summary, intent)
  UPDATE calls SET ended_at, duration_seconds, status='completed',
                   summary, intent, outcome, language, tools_used
```

| Field                                    | State                                                  |
| ---------------------------------------- | ------------------------------------------------------ |
| `duration_seconds`, `ended_at`, `status` | **EXISTS**                                             |
| `summary`                                | **EXISTS**, but see 6.1                                |
| `intent`                                 | **EXISTS as of `b84124e`** — derived from `tools_used` |
| `tools_used`, `language`                 | **EXISTS**                                             |
| `outcome`                                | **MISSING** — parameter exists, never passed           |
| Transcript                               | **EXISTS** — `call_transcripts` written per turn       |
| Quotes / appointments / escalations      | **EXISTS** — written live, linked by `source_call_id`  |

**6.1 — The summary is a stub.** `_summary()` (`agent.py:415`) returns
`"Caller asked: {first 180 chars}. {n} turns exchanged."` — the first caller
utterance truncated, plus a turn count. It is not a summary; it is the opening
line. Shown in Call History as if it were one. _Medium · M · buildable now —
one model call at teardown, which is also where a real `intent` and `outcome`
would come from._

**6.2 — `outcome` is never written.** Same call site as `intent`. _Low · S._

**6.3 — Costs are never written.** `telephony_cost` and `livekit_cost` exist
and stay NULL, so `usage_records` can never be populated. _Medium · M ·
blocked on Plivo (needs their rate data)._

### What the channel-agnostic model changes

Per SCHEMA-PLAN: `finish_call` writes `conversations` instead of `calls`,
`call_transcripts` becomes `messages`, and the voice-only fields
(`duration_seconds`, `room_name`, costs) move into `channel_data`. Because the
backfill reuses `calls.id` as `conversations.id`, `quotes.source_call_id`,
`appointments.source_call_id` and `escalations.call_id` keep working untouched.

**A real summary and intent become more valuable, not less** — they are the
only fields a cross-channel view can show uniformly for a call and a WhatsApp
thread.

---

## 7. Everything missing, in one table

| #   | Missing                                       | Sev    | Eff | Blocked on            |
| --- | --------------------------------------------- | ------ | --- | --------------------- |
| 1.1 | Trunk allow-list names Exotel                 | High   | S   | **Plivo**             |
| 1.2 | `sip.trunkPhoneNumber` unverified             | High   | S   | **Plivo** (live call) |
| 1.3 | Plivo provider adapter                        | High   | M   | buildable now         |
| 1.4 | Plivo webhook route                           | Medium | M   | buildable now         |
| 2.1 | Greeting ignores known caller                 | Low    | S   | buildable now         |
| 2.2 | Per-channel greeting                          | Low    | S   | schema decision       |
| 3.1 | **Business hours not enforced**               | High   | M   | buildable now         |
| 3.2 | **Allowed/restricted actions not enforced**   | High   | M   | buildable now         |
| 3.3 | UI implies enforcement that does not exist    | High   | S   | buildable now         |
| 4.1 | No escalation triggers beyond model judgement | Medium | M   | buildable now         |
| 4.2 | No live transfer                              | High   | M   | **Plivo**             |
| 4.3 | **No "who to transfer to" anywhere**          | High   | M   | **cofounder/product** |
| 4.4 | Nobody is notified of an escalation           | High   | M   | buildable now         |
| 5.4 | `channel_deliveries`                          | High   | S   | **schema decision**   |
| 5.5 | `send_on_whatsapp` tool                       | High   | S   | 5.4                   |
| 5.6 | WhatsApp opt-in column                        | High   | S   | schema decision       |
| 5.7 | The WhatsApp sender                           | High   | M   | **WhatsApp API**      |
| 5.8 | Template registry                             | Medium | M   | **WhatsApp API**      |
| 6.1 | Summary is a stub                             | Medium | M   | buildable now         |
| 6.2 | `outcome` never written                       | Low    | S   | buildable now         |
| 6.3 | Costs never written                           | Medium | M   | **Plivo**             |

---

## Where each thing is blocked

### Buildable now — no external dependency

- **Enforce business hours** at the `appointment_create` boundary _(3.1)_
- **Enforce allowed/restricted actions**, or relabel them as guidance _(3.2, 3.3)_
- **Escalation triggers** — the repeated-`found: false` counter is the cheapest
  real signal _(4.1)_
- **Notify someone on escalation** — today a row is written and no human
  learns of it _(4.4)_
- **A real summary** at teardown, which also yields a real `intent` and
  `outcome` _(6.1, 6.2)_
- **Plivo provider adapter and webhook** — shapes are public; only testing
  needs the account _(1.3, 1.4)_
- Greet a known caller by name _(2.1)_

**The two highest-value items here are 3.1/3.2 and 4.4** — the first because
the product claims enforcement it does not have, the second because an
escalation that notifies nobody is a promise to the caller that nothing keeps.

### Blocked on Plivo

Correct allow-list _(1.1)_, verify the SIP attribute _(1.2)_, live transfer in
any form _(4.2)_, cost capture _(6.3)_. **The first real inbound call is
blocked on nothing else.**

### Blocked on the WhatsApp side

The sender _(5.7)_ and the template registry _(5.8)_. Everything on the voice
side of the hand-off — table, tool, opt-in column — is small and can land
first.

### Needs a cofounder decision

1. **SCHEMA-PLAN questions 1, 2 and 4** — identity, conversation boundaries,
   templates. These change column lists and block 5.4/5.6.
2. **Transfer-to-whom** _(4.3)_. No "on-call human" concept exists anywhere.
   Who, in hours only, what on no-answer, what the caller hears, and whether
   the agent can resume. **This blocks live transfer more than Plivo does** —
   Plivo gives a mechanism, not a policy.
3. **The 24-hour window** _(5.3)_. For a voice-only customer there is no open
   window, so the first WhatsApp message must be a template. This is the most
   likely way the flagship feature fails in practice and it is worth settling
   before building.

---

## Suggested order

1. **Decide SCHEMA-PLAN questions 1, 2, 4** — unblocks the most.
2. **Fix the enforcement gap** _(3.1, 3.2, 3.3)_ — the product currently
   claims controls it does not apply. Buildable now, no dependencies.
3. **Make escalation notify someone** _(4.4)_.
4. **Plivo adapter + webhook** _(1.3, 1.4)_ so the day credentials arrive is a
   configuration day, not a coding week.
5. **WhatsApp hand-off voice side** _(5.4, 5.5, 5.6)_ once the schema is
   agreed.
6. **Real summary/intent/outcome** _(6.1, 6.2)_.
7. Live transfer _(4.2, 4.3)_ — last, and only after the policy questions are
   answered.
