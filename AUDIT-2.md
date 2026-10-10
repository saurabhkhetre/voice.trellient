# AUDIT-2 — repository health, 2026-10-09

Read against MIGRATION.md, ROADMAP.md and SECURITY.md, so this records what
changed since those were written rather than restating them.

**Report only. Nothing in this audit was fixed.**

Severity is impact if left alone. Effort is S (under an hour), M (half a day to
a day), L (multi-day).

---

## 0. One correction to the brief

The brief lists four bodies of uncommitted work. Three of them are **already
committed**:

| Work                                           | Commit    |
| ---------------------------------------------- | --------- |
| Voice-path hardening (catalog + LiveKit error) | `dde7105` |
| P1.5 stop-the-lying UI                         | `84efabd` |
| Inbound telephony Option A                     | `121975a` |

Only **Precision Dark** and an unrelated **Supabase cleanup** are uncommitted.
The exposure is smaller than feared, but three commits are unpushed, which is
its own risk.

---

## 1. UNCOMMITTED / GIT STATE

Branch `supabase-removal-and-agent-fixes`, **3 ahead of origin, 0 behind**.

### Staged

| File                           | State                 |
| ------------------------------ | --------------------- |
| `db/convert-from-supabase.sql` | `D` — deleted, staged |

### Unstaged

| File                                            | Belongs to                   |
| ----------------------------------------------- | ---------------------------- |
| `src/styles.css`                                | Precision Dark tokens        |
| `src/components/dashboard/Shell.tsx`            | Precision Dark chrome        |
| `src/routes/_authenticated/dashboard.index.tsx` | Precision Dark hero page     |
| `scripts/db-init.mjs`                           | Supabase cleanup             |
| `SETUP.md`                                      | Supabase cleanup             |
| `MIGRATION.md`                                  | Supabase cleanup (checklist) |

Untracked: none.

### Findings

**1.1 — Three commits exist only on this machine.** `git log origin/..HEAD`
→ `121975a` (telephony groundwork), `ea5e2d7` (landing redesign),
`d741ad7` (merge). Disk failure loses all three.
**Critical · S · `git push`.**

**1.2 — Two unrelated changes are interleaved in the working tree.** Precision
Dark (3 files) and the Supabase cleanup (3 files + 1 staged delete) are
independent. One careless `git add -A` fuses a design-system change with a
migration-tooling change in one commit.
**High · S — commit as two, cleanup first (it is finished and verified).**

**1.3 — The Supabase cleanup is complete; Precision Dark is not.** The cleanup
was verified by running `node scripts/db-init.mjs` end to end. Precision Dark
has one page redesigned of thirteen and is explicitly awaiting review, so it
is mid-flight by design — but it is the larger diff and the one at risk.
**High · S — commit it behind the cleanup even if review is pending; an
uncommitted design system is worse than an unreviewed one.**

**1.4 — `main` is 2 behind and nothing has merged into it.** All work since
`8ffd547` lives on a feature branch with no PR.
**Medium · S — open a PR, or decide this branch is the trunk and say so.**

**1.5 — No stash, no WIP commits, no detached HEAD.** Nothing hidden.
**Clean.**

---

## 2. BUGS & BREAKAGE

**2.1 — Hydration error still fires. CORRECTED 2026-10-09 — the cause below is
not what this audit first claimed.**

This originally blamed `useBusiness.ts:43`
(`new Date(value).toLocaleString("en-IN", …)` in the render path), reasoning
from "most common cause" rather than from evidence. That is **wrong**, and two
facts rule it out:

- `/auth`, where the error fires, uses `formatDateTime` / `toLocaleString`
  **zero times**.
- Every file that does use them (`dashboard.index`, `call-history`,
  `ai-quality`, `batch-call`) is under `_authenticated`, which is
  **`ssr: false`** — never server-rendered, so it cannot produce a hydration
  mismatch at all.

The actual mismatch is structural. React's trace shows, inside `<AuthPage>`
under a `<Lazy>` boundary, the server rendering `<Suspense>` where the client
renders `<div className="container-x …">`. That is the router's code-splitting
and SSR interaction, not application code — nothing in `auth.tsx` differs
between server and client.

**Medium · M** (not S). Fixing it means understanding how TanStack Start
streams a lazy route boundary; a guessed fix here changes behaviour without
touching the cause. Pinning a timezone, the obvious "fix" for the original
misdiagnosis, would have altered every timestamp in the product and fixed
nothing.

Still louder than it looks: React discards the server tree and re-renders the
subtree client-side on every affected page.

**2.2 — `calls.intent` is never written, so Analytics "Top Intents" is
permanently empty.** More precise than the ROADMAP's note: the plumbing
exists. `business.py:594` `finish_call(..., intent: str | None = None)` writes
the column, and `AnalyticsController:94` aggregates it. But the only caller,
`agent.py:434`, passes `duration_seconds` and `summary` **and omits `intent`**,
so it is always `None`.
Confirmed: `0 of 75 calls have intent`.
**Medium · M — have the agent derive an intent at call end and pass it; the
write path is already there.**

**2.3 — No TODO/FIXME/HACK markers anywhere in source.** Clean.

**2.4 — Broad exception suppression in the agent's teardown.**
`agent.py:432-440` wraps `finish_call`, `aclose` and `session.aclose` in
`contextlib.suppress(Exception)`. Correct intent (teardown must not throw) but
a failed `finish_call` silently loses duration, summary and `tools_used` for
that call, with no log line.
**Low · S — log inside the suppressed blocks.**

**2.5 — `tsc --noEmit` is clean.** No type errors across the merged tree.

---

## 3. SECURITY

### Previously fixed — all still fixed

| Finding                                    | Status    | Evidence                                                                  |
| ------------------------------------------ | --------- | ------------------------------------------------------------------------- |
| **F-01** role checks on mutating endpoints | **Holds** | All 9 business controllers call `access.require*` (counts 1–6 each)       |
| **F-02** monitoring is owner/manager only  | **Holds** | `VoiceController.java:93` `access.requireManager`                         |
| **F-07** CSRF                              | **Holds** | `SecurityConfig:39-50`, cookie-to-header, exempt only on `/api/public/**` |
| **F-17** duplicate test-call               | **Holds** | Node implementation deleted; frontend uses Spring only                    |

`AuthController` has zero access checks — **correct, not a regression**: it is
the pre-auth surface (`/api/auth/**` is `permitAll`), and CSRF still applies to
it.

`VoiceController` shows only one `require*` call, which looked thin. It is not:
`/test-call` scopes through `resolveBusinessForUser` plus a
`business.getId().equals(agent.getBusinessId())` filter (lines 134-138), so a
foreign agent id 404s rather than running.

### Open

**3.1 — F-03, secure-cookie defaults to `false`.** `application.yml:34` and
`SessionService.java:45` both default `APP_SESSION_SECURE_COOKIE` to false. A
production deploy that forgets the variable ships session cookies over
plaintext, silently.
**High · S — default `true` and opt _out_ for local http.** The current
default is backwards: the safe value should be the one you get by forgetting.

**3.2 — F-15 is satisfied in Node and still pending for Spring.** The live
webhook (`exotel.ts:15-19`) verifies `x-webhook-token` and 401s. The finding
is a _warning about the future port_ — `/api/public/**` is `permitAll` **and**
CSRF-exempt in Spring, so porting without the check creates an unauthenticated
write into tenant data.
**Medium (High if the port happens) · S — port the token check with the route.**

**3.3 — F-05 bulk session revocation: still absent.** No "sign out everywhere";
`signOut` deletes one row.
**Medium · M.**

**3.4 — F-13 fixed 2026-10-09.** `VITE_DEV_USER_ID` and `DEV_USER_ID` deleted
from `.env`; neither was read by any code and neither is in `.env.example`,
so a fresh clone never reintroduces them.

**3.5 — F-04, F-06, F-08 to F-12, F-14, F-16: unchanged.** Nothing in the telephony
or UI work touched them.

### Tenant isolation

**Holds.** Every controller query filters on `business_id` or resolves it from
the session. The two new code paths were checked specifically:

- `resolve_by_dialled_number` (`business.py:161`) queries `phone_numbers` by
  number — **not** business-scoped, correctly: it is _establishing_ which
  tenant owns an inbound call, so it cannot scope by one. It mirrors the
  webhook's resolution exactly, so the two cannot disagree about ownership.
- `VoiceCatalog` serves a static capability list behind
  `requireBusinessMembership` — no tenant data.

**3.6 — One thing to watch, not yet a bug.** `resolve_by_dialled_number` falls
back to `businesses.phone` when no `phone_numbers` row matches. If two
businesses ever share a phone string, `LIMIT 1` silently routes the call to
whichever row sorts first. No unique constraint enforces this.
**Low · S — unique index on `businesses.phone`, or drop the legacy fallback.**

### Secrets to the browser

**Clean.** The only `VITE_`-prefixed values are `VITE_ANALYTICS_ID`
(commented out in `.env.example`). `VITE_DEV_USER_ID` was the other one and
has since been deleted (F-13, see 3.4). No API key, LiveKit secret or DB
credential is reachable from client code.

---

## 4. TELEPHONY READINESS

### Live resources — still present, still inert

```
trunk  ST_gsjfHdp7zEoK   numbers: ["+917507041938"]   allowed: ["sip.exotel.com"]
rule   SDR_Ji8ma7ho7rpj  trunks:  ["ST_gsjfHdp7zEoK"]
```

Both still exist on the LiveKit project. Inert: no carrier points at the SIP
URI, so nothing can arrive.

**4.1 — The allow-list names the wrong provider.** `sip.exotel.com` was my
placeholder. **If you are moving to Plivo, this is now actively misleading** —
it names a vendor you are not using, and a reader could take it for
configuration rather than a guess.
**High · S — update the trunk's `allowedAddresses` to Plivo's real origination
hosts, or delete both resources until the provider is settled.**
An empty allow-list is _not_ an option: `createInboundTrunk` throws on it by
design, because a trunk with no allow-list answers SIP from anywhere.

**4.2 — `sip.trunkPhoneNumber` is still unverified.** `agent.py:94` reads it to
resolve the workspace. It is the documented attribute, but the installed
protocol typings expose no runtime attribute names and no SIP leg has ever
existed, so the key is unconfirmed. If a call connects and the agent cannot
find the business, this is the cause; `business.resolved_from_sip` and
`business.unknown_number` distinguish the two paths.
**High · S to fix once observed — one string; the cost is that it can only be
observed on a live call.**

**4.3 — The code is provider-agnostic; only data names a provider.** The SIP
path (trunk → dispatch rule → room → agent resolves by dialled number) makes
no Exotel assumption. What is Exotel-specific:

| Thing                                                            | Provider-specific? |
| ---------------------------------------------------------------- | ------------------ |
| `sip.ts`, dispatch rule, room naming                             | No                 |
| `resolve_by_dialled_number`, `read_sip_attributes`               | No                 |
| `lib/telephony/exotel.ts` (`parseInbound`, `transfer`, `hangup`) | **Yes**            |
| `routes/api/public/telephony/exotel.ts` (webhook shape)          | **Yes**            |
| `phone_numbers.provider` default `'exotel'`                      | **Yes**            |

A Plivo move needs a sibling `plivo.ts` implementing the same
`TelephonyProvider` interface plus a webhook route. The interface already
exists, so this is additive.
**Medium · M.**

### Remaining code work for a first inbound call, provider-agnostic

1. Provider adapter for whichever carrier you pick — `parseInbound` at minimum
   (**M**).
2. Correct `allowedAddresses` on the trunk (**S**).
3. A publicly reachable webhook URL — ngrok or deployed (**S**, not code).
4. Set `phone_numbers.inbound_trunk_id` and `agent_config_id` for the number
   (**S**, data).

Everything else is built. The blocker remains the carrier account, not code.

---

## 5. INCOMPLETE / MOCK / STUBBED

| #   | Thing                                           | Evidence                                                                                                          | Sev      | Eff |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- | --- |
| 5.1 | **Batch dialer never dials**                    | zero `@Scheduled`/`EnableScheduling` in the API; nothing reads `batch_job_contacts`                               | High     | L   |
| 5.2 | **`/api/batch` not proxied**                    | absent from `vite.config.ts`                                                                                      | Medium   | S   |
| 5.3 | **Outbound has no Spring endpoint**             | no `voice/outbound` in `services/api`                                                                             | High     | M   |
| 5.4 | **Alert rules never fire**                      | one file touches `alert_rules`, and it is CRUD                                                                    | High     | L   |
| 5.5 | **`transfer_call` files a callback**            | `tools.py:28` maps the preset to `escalate_to_human`, which inserts an `escalations` row and promises a call back | **High** | M   |
| 5.6 | **Exotel webhook is Node-only**                 | `src/routes/api/public/telephony/exotel.ts`; blocks Phase 5 Tier 2                                                | Medium   | M   |
| 5.7 | **Top Intents always empty**                    | see 2.2                                                                                                           | Medium   | M   |
| 5.8 | **`provider.transfer()` / `hangup()` orphaned** | implemented in `exotel.ts`, zero callers anywhere                                                                 | Medium   | S   |

**5.5 is the one I would raise with a customer present.** The others are
absent features; this one is a **label that misdescribes behaviour**. A user
enabling "transfer_call" reasonably expects the call to transfer. It does not —
it files a callback request. Either rename the preset or wire it to
`provider.transfer()`, which already exists (5.8).

---

## 6. UI STATE

**6.1 — Exactly two files use the new tokens**: `dashboard.index.tsx` and
`Shell.tsx`. The other twelve pages are untouched in code.

**6.2 — All thirteen pages are dark anyway, by design.** The five legacy
aliases (`--ink`, `--paper`, `--navy`, `--brass`, `--onnavy`) are still defined
in `styles.css` and remapped onto the new scale, so the fourteen files still
using `text-ink` / `bg-card` / `border-line` inherit the dark surfaces without
code changes. They are readable but not _composed_ — old spacing, old type
scale, old flat hierarchy on a dark ground.
**Not a bug. Low · L to finish the rollout.**

**6.3 — Shell is shared, so chrome changed everywhere.** The redesigned
sidebar, `PageHeader`, `Panel`, `StatCard`, `Pill` and `EmptyState` apply to
all thirteen pages. This is unavoidable and mostly desirable, but it means
"only the home page changed" is not true of what a user sees.
**Informational.**

**6.4 — `StatCard` gained a `tone` prop with a default.** Existing callers
pass no `tone` and get `"neutral"`, so no page broke. Verified by `tsc`.

**6.5 — The landing page is a second, unrelated design language.** The merged
`feat/landing-redesign` ships its own `landing.css` with 28 custom properties
and three fonts (IBM Plex Mono, Instrument Sans, Schibsted Grotesk) against the
dashboard's Inter-on-Precision-Dark. They do not collide technically — the
landing CSS references none of the global tokens — but the public site and the
product now look like different companies.
**Medium · M — decide which system wins before more pages are built on either.**

---

## 7. CONFIG & DEV-EXPERIENCE

**7.1 — The stack is not running.** Postgres is up (2 hours); **Spring, Vite
and the agent worker are all down**. Spring and the worker died with exit 4
shortly after starting earlier. No crash in their logs — consistent with
external termination, not a code fault, but it has now happened several times
across sessions.
**Medium · S to restart; M to find out why they keep dying.**

**7.2 — `.env.example` has drifted from `.env`.**

Documented but missing locally: `GOOGLE_API_KEY`, `OPENAI_API_KEY` (both live
in `services/agent/.env` instead), `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`.

Used but **undocumented**: `DATABASE_USERNAME`, `DATABASE_PASSWORD`,
`JDBC_DATABASE_URL`, `DEV_USER_ID`, `VITE_DEV_USER_ID`.

A fresh developer copying `.env.example` gets a `.env` that **cannot start the
Spring API** — it needs `JDBC_DATABASE_URL`, `DATABASE_USERNAME` and
`DATABASE_PASSWORD`, none of which are mentioned.
**High · S — add the five missing keys.** This is the single cheapest fix in
this audit and it breaks onboarding today.

**7.3 — Two split `.env` files with no signpost.** Root `.env` holds LiveKit and
DB; `services/agent/.env` holds `GOOGLE_API_KEY` and `OPENAI_API_KEY`. Nothing
tells you the second exists.
**Medium · S — note it in SETUP.md.**

**7.4 — LiveKit defaults are dangerously quiet.** `application.yml` defaults to
`ws://localhost:7880` / `devkey` / `secret`. A deploy with those unset does not
fail — it mints tokens for a LiveKit that is not there. This already cost a
debugging session.
**High · S — fail fast on startup when the URL is localhost and the profile is
not dev.**

**7.5 — Secure-cookie default.** Same class as 7.4; see 3.1.

**7.6 — Fresh-dev path otherwise works.** `docker compose up -d db` →
`node scripts/db-init.mjs` applies migrations and seeds 45 notes + 15 policies.
Verified today: re-running was idempotent and left all data intact.

---

## 8. ARCHITECTURE / FORWARD-LOOKING

The schema is **voice-specific, not channel-agnostic.** For a WhatsApp agent
sharing one database and knowledge base, this is the gap.

### Already channel-agnostic — reusable as-is

`businesses`, `business_users`, `users`, `customers`, `agent_knowledge`,
`business_policies`, `products`, `services`, `pricing_rules`, `quotes`,
`quote_items`, `appointments`, `approvals`, `escalations`, `usage_records`.

The knowledge base in particular needs **no change** — `agent_knowledge` has no
voice concepts, and the ranked full-text retrieval in
`BusinessClient.knowledge_lookup` is channel-neutral. A WhatsApp agent can call
it unchanged. That is the most valuable part of the system and it is already
portable.

### Voice-specific — needs evolving

| Table              | Problem for WhatsApp                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calls`            | The conversation root, but named and shaped for telephony: `caller_number`, `destination_number`, `duration_seconds`, `room_name`, `provider_call_id`, `direction` (inbound/outbound), `status` (ringing/in_progress) |
| `call_transcripts` | `speaker`/`text`/`timestamp` is the right shape for messages, wrong name; no delivery/read state, no attachments                                                                                                      |
| `call_events`      | Same                                                                                                                                                                                                                  |
| `agent_configs`    | Mixes channel-neutral (prompt, knowledge, tools, languages) with voice-only (`voice_name`, `model_provider`, `max_call_seconds`, `recording_enabled`)                                                                 |
| `phone_numbers`    | Telephony-only; WhatsApp needs its own identity table                                                                                                                                                                 |
| `batch_jobs`       | Assumes dialling                                                                                                                                                                                                      |

### The shape of the gap

A conversation is a conversation. The honest model is a `conversations` table
with a `channel` discriminator (`voice` | `whatsapp`), channel-specific detail
in a side table or JSONB, and `messages` replacing `call_transcripts`. `calls`
becomes a voice-flavoured view over `conversations`.

**Do not do this now.** Flagging only, as asked. But two things are worth
knowing while making near-term decisions:

- Every new voice feature written against `calls` increases the eventual
  migration cost. The batch dialer (5.1) and alert evaluator (5.4) are both
  large and both would be written against `calls` today.
- `agent_configs` is where the split bites soonest — a shared agent identity
  with per-channel delivery settings is a different shape from what exists.

**Large · L. Decide before P2.2, not after.**

---

## RECOMMENDED ORDER

### First — stop losing work (today, under an hour)

1. **`git push`** — three commits exist on one machine. _(1.1, Critical, S)_
2. **Commit the Supabase cleanup** — finished and verified. _(1.2, High, S)_
3. **Commit Precision Dark separately** — unreviewed beats uncommitted.
   _(1.3, High, S)_

### Then — High, cheap, breaks things today

4. **Add the 5 missing keys to `.env.example`** — onboarding is broken without
   them. _(7.2, High, S)_
5. **Flip secure-cookie to default `true`** — the safe value should be the
   default. _(3.1, High, S)_
6. **Fail fast on LiveKit devkey defaults outside dev.** _(7.4, High, S)_
7. **Fix or rename `transfer_call`** — the only finding that actively
   misdescribes behaviour to a user. _(5.5, High, M)_
8. **Resolve the SIP allow-list** — correct it for the real provider or delete
   the two resources. _(4.1, High, S)_

### Then — Medium

9. Hydration error — a lazy-route SSR mismatch on `/auth`, not the date
   helper this audit first blamed _(2.1, M)_
10. Decide the design-language question: dashboard vs landing _(6.5, M)_
11. `.env` split signposted in SETUP.md _(7.3, S)_
12. Proxy `/api/batch` _(5.2, S)_
13. Wire `provider.transfer()` / `hangup()` or delete them _(5.8, S)_
14. `calls.intent` — pass it from the agent _(2.2, M)_
15. F-05 bulk session revocation _(3.3, M)_
16. Open a PR, or declare this branch the trunk _(1.4, S)_

### Decide before building more

17. **Channel-agnostic schema** — decide _before_ P2.2, because the batch
    dialer and alert evaluator would both be built against `calls`. _(8, L)_

### Last — cosmetic / large

18. Roll Precision Dark across the remaining twelve pages _(6.2, L)_
19. Batch dialer runner _(5.1, L)_ and alert evaluator _(5.4, L)_ — both gated
    on 17
20. Log inside the agent's suppressed teardown _(2.4, S)_
21. Unique index on `businesses.phone` _(3.6, S)_

**The first three items take under an hour and remove the only risk in this
audit that cannot be undone.**
