# Security audit — multi-tenant safety after RLS removal

Scope: `services/api` (Spring Boot), plus the session layer in `src/lib/auth/`
because that is where the cookie `SessionAuthFilter` trusts is minted.
Audited 2026-09-23 against branch `supabase-removal-and-agent-fixes`.

**Report only. No code was changed.**

Context: Postgres row-level security was the previous backstop and is gone —
`0 policies`, `0 RLS-enabled tables`, no `auth` schema. Tenant isolation is now
entirely an application-layer property. Every query must carry its own scope;
nothing below the service layer will catch a mistake.

---

## Status update — 2026-09-24

**Both High findings are fixed and verified.** `AccessService` gained three
helpers (`requireManager`, `requireAgentManager`, `requireRowManager`) and every
mutating endpoint now carries a role check. 18 of 20 previously had none; all 20
are now covered (the two exceptions are `/api/business/provision` and
`/api/business/context`, which are self-scoped to the caller by design).

Verified empirically with a real `agent`-role user: 8 reads returned 200, and
10 config writes — create/edit/publish agent, tools, alerts, phone numbers,
batch campaigns, business settings, call monitoring, and policy records — all
returned 403. Owner access was re-tested for regressions and cross-tenant
isolation was re-confirmed (9 attempts, all 403).

Remaining open findings below are unchanged.

## Summary

| Severity | Count | Status |
| --- | --- | --- |
| Critical | **0** | — |
| High | 2 | **both fixed 2026-09-24** |
| Medium | 5 | open |
| Low | 7 | open |

**Headline: no unscoped tenant query was found.** All 33 endpoints reach tenant
data only after a membership or ownership check. The exposure is not *who can
see which workspace* — it is *what any member may do inside their own
workspace*, because *role* is almost never checked.

---

## 1. Tenant isolation — every query, and how it is scoped

I enumerated every SQL statement and repository call in `services/api` (49 SQL
statements, 13 repository calls) and checked each endpoint for a guard.

### Result: no unscoped reads or writes

Two access patterns are in use, both sound:

1. **Direct scope** — `WHERE business_id = ?` with a caller-supplied
   `businessId` that `requireBusinessMembership` validated first.
2. **Check-then-act** — for single-row writes keyed by `id`, an access helper
   first resolves that row's `business_id` and confirms membership
   (`requireRowAccess` / `requireAgentOwnership`), then the write runs
   `WHERE id = ?`.

Statements that run `WHERE id = ?` with no `business_id`, each verified to sit
behind a guard:

| Statement | Guard |
| --- | --- |
| `AgentToolController.java:113`, `:121` (UPDATE/DELETE `agent_tools`) | `requireRowAccess("agent_tools", …)` |
| `AlertsController.java:108`, `:115` (UPDATE/DELETE `alert_rules`) | `requireRowAccess("alert_rules", …)` |
| `PhoneNumberController.java:113`, `:121` (UPDATE/DELETE `phone_numbers`) | `requireRowAccess("phone_numbers", …)` |
| `AgentConfigController.java:106`, `:116`, `:210` (publish, snapshot, save) | `requireAgentOwnership` |
| `BatchController.java:146` (UPDATE `batch_jobs`) | explicit membership check at `:127`–`:131` |
| `CallsController.java:124`, `:141` (`call_transcripts`, `call_events` by `call_id`) | `requireRowAccess("calls", callId)` |
| `BusinessController.java:146` (UPDATE `businesses`) | `requireBusinessRole(owner, manager)` |
| `VoiceController.java:71`, `:112` (`findById`) | `.filter(business.getId().equals(...))` |

`RecordsController` is scoped twice — `WHERE id = ? AND business_id = ?`
(`:99`, `:125`) — which is the strongest pattern here and the one to copy.

Endpoints with no access guard, both **correct by design** (self-scoped, they
only ever read the caller's own `user_id`):

- `BusinessController.java:44` `POST /api/business/provision`
- `BusinessController.java:63` `GET /api/business/context`

### F-08 (Low) — check-then-act is not atomic

`file:` all "check-then-act" sites listed above.
The membership check and the write are separate statements outside one
transaction. A membership revoked between them lets the write proceed. The
window is milliseconds and the actor must already be a member, so impact is
minimal — but the `RecordsController` pattern (`AND business_id = ?` on the
write itself) removes it entirely.
**Fix:** add `AND business_id = ?` to the single-row UPDATE/DELETE statements.

### F-09 (Low) — multi-workspace users are silently pinned to one workspace

`services/BusinessService.java:33`, used by `AnalyticsController.java:53`,
`:72`, `:141`, `BusinessController.java:38`, `VoiceController.java:62`, `:103`.
`resolveBusinessForUser` returns the *oldest* membership. A user in two
workspaces can never reach the second one through these endpoints, while the
`businessId`-taking endpoints happily serve either. Not a leak — the data
belongs to the caller — but the inconsistency will produce "wrong workspace"
bugs and makes reasoning about scope harder.
**Fix:** accept an explicit `businessId` on these endpoints, validated by
`requireBusinessMembership`, as the rest of the API does.

---

## 2. Session cookie (`trellient_session`)

Minted in `src/lib/auth/session.server.ts`; validated in
`services/api/.../security/SessionAuthFilter.java`.

**Good, and worth preserving:**

- `httpOnly: true` (`session.server.ts:30`) — JS cannot read it.
- `sameSite: "lax"` (`:31`) — blocks cookies on cross-site POST, which is what
  currently compensates for CSRF being disabled in Spring.
- 32 bytes from `randomBytes` (`:23`) — not guessable.
- **Only the SHA-256 is stored** (`:27`, verified at `SessionAuthFilter.java:47`).
  A dumped `user_sessions` table cannot be replayed. This is the right design.
- Expiry enforced in SQL on every request (`expires_at > now()`), not in app code.
- Logout deletes the row (`:56`), so it is real server-side revocation, not just
  a cleared cookie.

### F-03 (Medium) — `Secure` depends on `NODE_ENV`

`src/lib/auth/session.server.ts:32` — `secure: process.env["NODE_ENV"] === "production"`.
Correct locally. But any deployment where `NODE_ENV` is unset, misspelled, or
overridden sends the session cookie over plaintext HTTP, where it can be taken
off the wire. The failure is silent.
**Fix:** default to `secure: true` and opt *out* only for an explicit local flag.

### F-05 (Medium) — no revocation beyond the current session

`session.server.ts:53`–`:58`. `endSession` deletes only the token presented.
There is no "sign out everywhere", and no endpoint that invalidates a user's
other sessions. With a 30-day lifetime (`:10`), a stolen token stays valid for
up to 30 days even after the victim signs out on their own device. No password
change endpoint exists today, but when one is added it must also revoke.
**Fix:** add `DELETE FROM user_sessions WHERE user_id = ?`, exposed as "sign out
of all devices" and called on password change.

### F-10 (Low) — sessions never rotate, expired rows never purged

`session.server.ts:10`, `:22`–`:36`. Fixed 30-day expiry, no sliding window, no
rotation on privilege change. Expired rows accumulate in `user_sessions`
forever — unbounded growth and a larger pool of historical hashes.
**Fix:** shorten the lifetime, rotate on sign-in, and schedule
`DELETE FROM user_sessions WHERE expires_at < now()`.

---

## 3. Authorization — role enforcement

`business_role` has three values: **`owner`, `manager`, `agent`**. Newly
provisioned users become `owner` (`BusinessService.java:69`).

**Role is checked in exactly two places in the entire API:**

- `AgentConfigController.java:100` — publish, `owner`/`manager`
- `BusinessController.java:118` — update business, `owner`/`manager`

### F-01 (High) — ~~every other mutating endpoint accepts any member~~ **FIXED 2026-09-24**

Membership is checked everywhere; *role* is not. An `agent`-role user — the
lowest privilege the schema defines, presumably a support operator — can do all
of the following in their workspace:

| Endpoint | file:line | What an `agent` can do |
| --- | --- | --- |
| `POST /api/batch` | `BatchController.java:66` | Launch outbound calling to up to 5,000 numbers — **real telephony spend** |
| `POST /api/batch/{jobId}/status` | `BatchController.java:119` | Start or pause any campaign |
| `DELETE /api/records/{table}/{id}` | `RecordsController.java:118` | Delete customers, policies, knowledge base entries |
| `POST /api/records/{table}` | `RecordsController.java:74` | Overwrite any of the above |
| `DELETE /api/phone-numbers/{id}` | `PhoneNumberController.java:117` | Remove a phone number — **takes inbound calling down** |
| `PATCH /api/phone-numbers/{id}` | `PhoneNumberController.java:83` | Re-route a number to a different agent, or deactivate it |
| `POST/PATCH/DELETE agent tools` | `AgentToolController.java:57`, `:84`, `:117` | Enable/disable what the voice agent may do on a call |
| `PATCH /api/agents/{id}` | `AgentConfigController.java:84` | Rewrite the agent's system instructions and greeting |
| `POST /api/agents` | `AgentConfigController.java:68` | Create agents |
| `POST/PATCH/DELETE alerts` | `AlertsController.java:59`, `:99`, `:111` | Delete alert rules — **disable the monitoring that would reveal the above** |

The agent-config gap is the sharpest: `PATCH /api/agents/{id}` can rewrite
`system_instructions` freely, and only *publishing* requires `manager`. That
distinction gives no protection, because the voice worker loads the **live**
row — `SELECT * FROM agent_configs WHERE id = $1`
(`services/agent/src/voice_agent/business.py:109`) — and never reads
`agent_config_versions` (verified: no reference anywhere in the worker). **An
unpublished draft edit by an `agent`-role user takes effect on the very next
call.** Publish-time role enforcement is therefore not an effective control
over what the agent says to customers.
**Fix:** add `requireBusinessRole(owner, manager)` to every mutating endpoint,
and treat `agent` as read-plus-call-handling only.

### F-02 (High) — ~~any member can silently listen to any live call~~ **FIXED 2026-09-24**

`VoiceController.java:62` `POST /api/voice/monitor`. Membership is checked
(`:71`–`:73`) but role is not. The minted token is deliberately
`Hidden(true)`, `CanPublish(false)` (`:87`–`:93`) — so the listener is
**invisible to both the caller and the agent**, by design, which is right for
supervisor monitoring and wrong as something every member may do unrecorded.
Combined with no audit log (F-06), covert listening to customer calls leaves no
trace.
**Fix:** restrict to `owner`/`manager` and write an audit row per monitor
session.

### F-06 (Medium) — no audit trail for privileged actions

No logging of publish, business update, call monitoring, or any delete. After
an incident there is no way to establish who did what. `agent_config_versions`
records `published_by` and is the only exception.
**Fix:** append-only audit table for privileged mutations: actor, business,
action, target, timestamp.

### Escalation approval — not implemented

There is no escalation-approval or `approvals` endpoint in Spring
(`EscalationRepository` only counts open rows). Nothing to review yet; when it
is built it must require `owner`/`manager`, since approving an escalation is
exactly the privileged action this audit finds unguarded elsewhere.

---

## 4. Input validation & injection

### No SQL injection found

Every user-supplied **value** is bound as a JDBC parameter. I found no place
where request data is concatenated into SQL.

SQL is assembled by string concatenation in five places, all for **identifiers**
(table/column names), never values:

| Location | Source of the identifier | Safe? |
| --- | --- | --- |
| `RecordsController.java:69`, `:99`, `:112`, `:125` | `RECORD_SCHEMAS` map; `schemaOf()` rejects anything else with 404 | Yes |
| `AccessService.java:106`–`:108` | `table` parameter — every call site passes a hardcoded literal (`"agent_tools"`, `"alert_rules"`, `"phone_numbers"`, `"calls"`) | Yes |
| `AgentConfigController.java:210` | `EDITABLE` allow-list | Yes |
| `AgentToolController.java:113`, `PhoneNumberController.java:113`, `BusinessController.java:146` | hardcoded column names | Yes |
| `CallsController.java:49` (`scope` filter) | fixed `SCOPE_FILTERS` map lookup | Yes |

### F-04 (Medium) — the injection safety is a convention, not a mechanism

Nothing enforces the allow-list property. `AccessService.requireRowAccess`
(`:106`) takes a `String table` and interpolates it directly; it is safe only
because all four current callers pass literals. One future caller passing a path
variable turns it into arbitrary SQL. The same holds for `RECORD_SCHEMAS` — a
contributor adding a column that is read from the request breaks it.
**Fix:** validate identifiers against a hardcoded `Set<String>` inside the
helpers themselves, and add a test that a request-supplied table name is
rejected.

### Request bodies

Bodies arrive as `Map<String, Object>` and are hand-validated by
`web/Validate.java`, which reproduces the old zod rules (lengths, enums, phone
normalisation, UUID format). Unknown keys are dropped rather than written. This
is sound, though not self-documenting.

### F-11 (Low) — no request size or collection limits

`BatchController.java:97` caps contacts at 5,000, which is the only such limit.
Free-text fields are length-checked, but there is no global request body cap.
**Fix:** set `spring.servlet.multipart.max-request-size` / a body size limit.

### F-12 (Low) — cross-tenant existence oracle

`AccessService.java:76` returns **404** "Agent not found." when a row does not
exist, but `:83` returns **403** "You do not have access to this agent." when it
exists in another workspace. Same split at `:111` vs `:52` for
`requireRowAccess`. An attacker who can guess IDs learns which exist in other
tenants. IDs are random UUIDv4, so this is near-unexploitable — listed for
completeness.
**Fix:** return 404 for both cases.

---

## 5. Secrets & CORS

### No secret is exposed to the browser

- `LIVEKIT_API_SECRET` is used only server-side to sign tokens
  (`VoiceController.java:84`, `:154`). The browser receives a scoped, expiring
  LiveKit JWT — correct.
- Model keys (`OPENAI_API_KEY`, `GOOGLE_API_KEY`) live only in
  `services/agent/.env`, read only by the Python worker. Absent from the root
  `.env` — correct, not a gap.
- `users.password_hash` is never selected by any endpoint; only `email` is
  (`BusinessController.java:80`).
- `SELECT *` on `agent_configs` (`AgentConfigController.java:63`) returns every
  column, but the table holds no credential columns (verified against
  `information_schema`). Still worth an explicit column list so a future
  credential column is not auto-exposed.
- The dead Supabase keys were removed from `.env` on 2026-09-20. The unused
  hosted project `curqreiywlyhesldgmia` should still be disabled.

### F-13 (Low) — ~~`VITE_DEV_USER_ID` is shipped to the browser~~ **FIXED 2026-10-09**

`.env`. `VITE_`-prefixed variables are inlined into the client bundle. No code
read it (verified: zero references in `src/` and `services/api`), and a user id
is not a credential — but a browser-exposed variable that names a privileged dev
account invites a future "fall back to dev user" shortcut, which would be a
complete auth bypass.

**Fixed:** deleted from `.env`, along with `DEV_USER_ID`, which nothing read
either — the seed script defines it as a constant (`scripts/db-init.mjs:22`).
Neither is in `.env.example`, so a fresh clone never gets them back.

### CORS

`SecurityConfig.java:54`–`:56`: origins come from `CORS_ALLOWED_ORIGINS`
(default `http://localhost:3000,http://localhost:5173`), methods are an explicit
list, headers are `*`. `setAllowCredentials` is **not** set, so it defaults to
false.

### F-07 (Medium) — CSRF disabled while cookie auth is accepted

`SecurityConfig.java:38` disables CSRF; `SessionAuthFilter.java:64`–`:71`
accepts the `trellient_session` **cookie** as proof of identity. Cookie auth
plus no CSRF token is the classic CSRF setup. Today the risk is contained by two
accidents rather than by design: `SameSite=Lax` blocks cross-site POST, and
`allowCredentials=false` means browsers will not attach the cookie to
cross-origin calls at all.

That second point is a live trap for Phase 5: **when the frontend is pointed at
`:8080`, cookie auth will simply not work cross-origin.** The temptation will be
to set `allowCredentials(true)` — at which point CSRF protection becomes
genuinely necessary.
**Fix:** decide now. Either same-origin behind one proxy (keep cookies, re-enable
CSRF), or `Authorization: Bearer` only for the API (then stop accepting the
cookie in `SessionAuthFilter` entirely).

### F-14 (Low) — permissive default matcher

`SecurityConfig.java:44` — `anyRequest().permitAll()`. Anything not under
`/api/**` is public. A future controller mapped at, say, `/internal/**` is
exposed with no warning.
**Fix:** `anyRequest().denyAll()` and allow-list explicitly.

### F-15 (Low) — `/api/public/**` is open and currently unused

`SecurityConfig.java:42`. No controller is mapped there yet. The Exotel webhook
(`src/routes/api/public/telephony/exotel.ts`) lands here in Phase 4 and writes
`calls`, `customers` and `phone_numbers` rows. It must verify
`TELEPHONY_WEBHOOK_TOKEN`, or it becomes an unauthenticated write endpoint into
tenant data.
**Fix:** flagged for Phase 4 — do not port the webhook without the token check.

### F-16 (Low) — no rate limiting anywhere

Neither Spring nor the Node sign-in path (`src/lib/auth/auth.functions.ts:50`)
limits attempts or locks accounts. Password hashing is scrypt (N=16384), which
slows offline cracking but does not stop online guessing.
**Fix:** rate-limit sign-in per IP and per account.

### F-17 (Low) — duplicated auth logic across two implementations

`VoiceController.java:103` and `src/lib/voice/session.functions.ts` both
implement the test call with their own ownership checks, and they already
differ: the Node version returns `{ok: false}` where Spring returns 403, and it
closes stale `ringing` calls where Spring does not. Two copies of an
authorization check drift, and drift is where holes appear.
**Fix:** delete the unused Spring copy, or switch the frontend to it — one
implementation, not two. (Phase 5.)

---

## Fix order

**No Critical findings — nothing here warrants an emergency fix.**

**High — do these first**

1. **F-01** — add `requireBusinessRole(owner, manager)` to every mutating
   endpoint. Biggest real exposure: an `agent` can spend money on outbound
   campaigns, rewrite live agent instructions, take inbound calling down, and
   delete the alert rules that would have surfaced it.
2. **F-02** — restrict `POST /api/voice/monitor` to `owner`/`manager` and audit
   it. Covert, untraceable listening to customer calls.

**Medium**

3. **F-03** — default the session cookie to `Secure`; opt out only locally.
4. **F-07** — decide the Phase 5 auth transport (same-origin + CSRF, or Bearer
   only) *before* wiring the frontend to Spring.
5. **F-05** — add bulk session revocation.
6. **F-04** — enforce the SQL identifier allow-list inside the helpers, with a test.
7. **F-06** — audit log for privileged mutations.

**Low** — F-08 (atomic scoping on single-row writes), F-09 (explicit
`businessId`), F-10 (session rotation and purge), F-11 (body size cap), F-12
(uniform 404), F-13 (drop `VITE_DEV_USER_ID`), F-14 (`denyAll` default), F-15
(webhook token — **blocking for Phase 4**), F-16 (rate limiting), F-17
(de-duplicate the test-call path — **do during Phase 5**).

---

## What was checked and found clean

Recorded so future audits need not redo it:

- All 33 endpoints reach tenant data only behind a membership/ownership check.
- No unscoped `SELECT`/`UPDATE`/`DELETE` on any tenant table.
- No SQL injection; all values are bound parameters.
- Session tokens are stored only as SHA-256; a stolen table is not replayable.
- Cookie is `HttpOnly` and `SameSite=Lax`; logout revokes server-side.
- `password_hash` is never returned by any endpoint.
- No LiveKit or model API secret reaches the browser.
- Spring Boot Actuator is **not** on the classpath — no exposed management endpoints.
- Cross-tenant access was empirically tested on 2026-09-20: 11 IDOR attempts
  across records, alerts, phone numbers, batch, calls, agents, team, publish,
  business rename, and attaching a foreign agent to an owned number — **all
  returned 403**, and the other workspace's data was verified unchanged.
