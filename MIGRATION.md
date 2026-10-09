# Backend migration — TanStack server functions → Spring Boot (`services/api`)

**Status as of 2026-09-25.** Written so a fresh session can pick this up cold.

Goal: `services/api` (Spring Boot) becomes the only backend. The React app in
`src/` talks to it over HTTP and stops querying Postgres directly.

---

## TL;DR for a fresh session

- **12 of 13 dashboard pages are migrated**, plus auth, the route guard, the
  workspace context and the browser test call. All verified against Spring.
- The old TanStack server functions are **all still in place**. Nothing has been
  deleted. Every migration is revertible with one `git checkout` plus (where it
  added one) one line in `vite.config.ts`.
- **The only remaining `useServerFn` consumer is `dashboard.batch-call.tsx`**,
  deferred to P2: it needs outbound calling built and `/api/batch` proxied
  first. Exotel webhook is the other open port.
- **Migration complete.** Stage 4 regression passed and Phase 5 Tier 1 is done:
  11 server-function modules deleted, their response types now in
  `src/lib/api/contracts.ts`. Tier 2 is deferred to post-P2 — see Phase 5 below.
- Security P1 is done (both High findings fixed and verified). **F-17 (duplicate
  test-call implementation) is resolved** — the frontend now uses only the
  Spring one.
- The app must stay runnable after every step. It is runnable now.

### Running the API — read this first

Start `services/api` with the **same `LIVEKIT_*` values the web app uses**
(they are in `.env`). `application.yml` defaults to `ws://localhost:7880` with
`devkey`/`secret`, which silently mints tokens for a LiveKit that isn't there.
It does not matter for `/api/voice/monitor`, which only signs a token, but
`/api/voice/test-call` calls LiveKit to create the room and will fail without
them.

```bash
set -a && . ./.env && set +a
cd services/api && JDBC_DATABASE_URL="jdbc:postgresql://localhost:5432/trellient"   DATABASE_USERNAME=postgres DATABASE_PASSWORD=postgres   java -jar target/api-0.0.1-SNAPSHOT.jar
```

### Start the stack

```bash
docker compose up -d db                       # Postgres 16 :5432
cd services/api && ./mvnw -B -q package -DskipTests
JDBC_DATABASE_URL="jdbc:postgresql://localhost:5432/trellient" \
DATABASE_USERNAME=postgres DATABASE_PASSWORD=postgres \
java -jar target/api-0.0.1-SNAPSHOT.jar       # Spring :8080
npm run dev                                   # Vite :5173
```

Dev sign-in: `dev@trellient.local` / `trellient-dev`
(seeded by `scripts/db-init.mjs`; dev business `22222222-…`, agent `33333333-…`).

**Use one hostname consistently in the browser.** The session cookie is bound to
whichever of `localhost:5173` / `127.0.0.1:5173` you signed in on; switching
hosts mid-session logs you out.

---

## Decisions locked in

| Decision | Choice | Why |
| --- | --- | --- |
| Backend | **Spring only.** Delete the TypeScript server functions once every page is proven. | Two parallel backends make future integrations hard, and the two copies had already drifted once (the test-call path). |
| Auth transport | **Same-origin proxy + CSRF.** Not bearer-only. | Keeps the session cookie `HttpOnly`. Bearer would require a JS-readable token, trading CSRF risk for XSS token theft. |
| CSRF | Cookie-to-header double submit: Spring sets a readable `XSRF-TOKEN`, the client echoes `X-XSRF-TOKEN`. | An attacker's origin cannot read our cookie, so it cannot forge the header. |
| CSRF handler | Plain, **not** XOR, with `setCsrfRequestAttributeName(null)` for eager loading. | XOR blunts BREACH, which attacks a secret in a compressed *response body*. This API only moves the token via cookie and header, so masking buys nothing and would change the value every request. |
| Customer `DELETE` | **owner + manager only.** Agents may still create/edit. | Deletion is destructive and irreversible. Mirrors `phone_numbers` and the policy tables. |
| Role model | `agent` = read everything + edit operational data (`customers`). `owner`/`manager` = all configuration. | See `AccessService.MANAGER_ROLES`. |

---

## How a page gets migrated (the recipe)

1. Replace `useServerFn(x)` calls with `apiGet` / `apiPost` / `apiPatch` /
   `apiDelete` from **`src/lib/api/client.ts`**.
2. Keep the old module imported **for its types only**, so TypeScript checks the
   Spring response against the original contract. Do not delete the server function.
3. Add the endpoint prefix to `vite.config.ts` → `server.proxy`.
4. Verify: agent-role blocked on mutations (403), owner allowed, data matches
   direct SQL, and the browser network log shows `/api/...` not `_serverFn`.

### Error contract: HTTP status, not a result union

Some server functions returned a union like `{ ok: false, error }` on HTTP 200.
Spring reports failure with a status code and `{"error": "..."}`, which
`apiPost` throws as an `ApiError` carrying that text. When migrating such a
call, delete the `if (!result.ok)` branch and let the existing `catch` render
`err.message` — otherwise the failure path silently stops working.
`createCallMonitorSession` was the first of these. `listTeam`, `updateBusiness`
and `provisionWorkspace` all throw rather than return a union, so Settings
needed no such change.

### Check the Spring endpoint's contract, not just its existence

An endpoint existing is not the same as it matching. `POST /api/business/provision`
existed and was listed as ready, but diverged from `provisionWorkspace()` in
three ways that would each have broken the dashboard's empty state:

| | Server function | Spring, before | Fixed to |
| --- | --- | --- | --- |
| `companyName` | optional, defaults to `"<local-part>'s workspace"` | **required → 400** on the empty body the page posts | optional, same default |
| Existing member | idempotent, `created: false` | **409 Conflict** | idempotent, `created: false` |
| New workspace | seeds a disabled `Front desk agent` | no agent, no `email` | seeds both |

The second implementation in `BusinessService.provisionWorkspace` was deleted so
only one provision path remains. **Diff the ported handler against the server
function before migrating a page onto it.**

### Two traps already hit — don't repeat them

- **Proxy keys must be plain prefixes, not regexes.** Vite matches a regex key
  against the path *and query string*, so `^/api/calls(/|$)` misses
  `/api/calls?businessId=…` and it 404s through to the app. Plain prefixes use
  `startsWith`.
- **CORS must list both `localhost` and `127.0.0.1`.** Browsers send `Origin` on
  POST even same-origin, but not on same-origin GET. Listing one spelling makes
  every read pass and every write fail with `"Invalid CORS request"` — which
  looks exactly like a CSRF bug and is not one.

---

## Migrated — 11 pages ✅

All verified: role checks, CSRF on mutations, data matched against direct SQL,
and confirmed in the browser network log.

| Page | File(s) | Spring endpoints |
| --- | --- | --- |
| Analytics | `dashboard.analytics.tsx` | `GET /api/stats/analytics` |
| Home | `dashboard.index.tsx` | `GET /api/stats/dashboard`, `/recent-calls` |
| Call History | `dashboard.call-history.tsx` | `GET /api/calls`, `/api/calls/{callId}` |
| Contacts | `components/dashboard/CrudSection.tsx` | `/api/records/customers` |
| Knowledge Base | *(same `CrudSection`)* | `/api/records/business_policies`, `/agent_knowledge` |
| Alerting | `dashboard.alerting.tsx` | `GET/POST /api/alerts`, `PATCH/DELETE /api/alerts/{id}` |
| Phone Numbers | `dashboard.phone-numbers.tsx` | `/api/phone-numbers/**` + `GET /api/agents` |
| **Agents** | `dashboard.agents.tsx`, `voice/FunctionsSection.tsx`, `voice/CallHistorySection.tsx`, `voice/PhoneNumbersSection.tsx` | `/api/agents/**`, `/api/agents/{id}/tools`, `/api/agents/tools/{toolId}`, `/api/calls/by-agent/{id}` |
| **Live Monitoring** | `dashboard.live-monitoring.tsx` | `GET /api/calls?scope=active`, `POST /api/voice/monitor` |
| **AI Quality** | `dashboard.ai-quality.tsx` | `GET /api/calls?scope=finished` |
| **Settings** | `dashboard.settings.tsx` | `GET /api/business/team`, `PATCH /api/business/{id}` |
| *(workspace layout)* | `_authenticated/dashboard.tsx` | `POST /api/business/provision` |
| **Auth** | `routes/auth.tsx` | `POST /api/auth/signin`, `/signup`, `GET /api/auth/me` |
| **Route guard** | `_authenticated/route.tsx` | `GET /api/auth/me` — runs on every protected navigation |
| **Workspace context** | `lib/business/useBusiness.ts` | `GET /api/business/context` — read by every page |
| **Sign out** | `components/dashboard/Shell.tsx` | `POST /api/auth/signout` |
| **Browser test call** | `lib/voice/useVoiceSession.ts` | `POST /api/voice/test-call` |

**Note:** Contacts and Knowledge Base share `CrudSection`, so migrating one
moved both. `Settings` only imports the presentational `RecordForm` from that
file and is unaffected.

Proxy prefixes currently routed to `:8080`:
`/api/stats`, `/api/business`, `/api/voice`, `/api/calls`, `/api/records`,
`/api/alerts`, `/api/phone-numbers`, `/api/agents`, `/api/auth`

---

## Remaining work

### Pages still on server functions

| Page / file | Server functions still used | Spring endpoint | Notes |
| --- | --- | --- | --- |
| Batch Call — `dashboard.batch-call.tsx` | `listAgentConfigs`, `listBatchJobs`, `createBatchJob`, `setBatchJobStatus` | `/api/batch/**` | **Deferred to P2, not part of this migration.** The controller exists, but `/api/batch` is unproxied and the page's whole point — dialling — has no backend (gap 2 below). Migrating it would move a feature that has never worked. |

### Auth — built and proven (Stages 1-3)

`AuthController` + `PasswordHasher` + `SessionService` issue sessions the same
way `session.server.ts` did: scrypt `$N$r$p$salt$hash` (N=16384, r=8, p=1,
16-byte salt, 64-byte key) via Bouncy Castle, a base64url token whose SHA-256
alone is stored, and a `trellient_session` cookie that is HttpOnly, SameSite=Lax,
Path=/, 30 days.

- Hashes verify **both directions**: the Node-written dev-owner hash verifies in
  Java, and a Java-written hash verifies under Node's `verifyPassword`. Both
  login paths can coexist.
- `/api/auth/**` is `permitAll` but **CSRF still applies** — the token comes from
  a cookie, not the session, so a pre-auth caller can read it and login CSRF
  stays closed.
- `GET /api/auth/me` answers **204** for "nobody", matching `getCurrentUser`'s
  `null`. The shared client turns 204 into `undefined`, so every caller
  normalises with `?? null`.
- Sign-out deletes only the current session's row. Ending *all* of a user's
  sessions still needs F-05.
- `app.session.secure-cookie` replaced the old `NODE_ENV` check and **must be
  true in production** (F-03).

### Gaps where Spring has no endpoint yet
   (`src/lib/auth/password.server.ts`, mirrored in `scripts/db-init.mjs`) and
   the cookie attributes matched.
1. **Outbound calling** — `createOutboundCall` has no Spring equivalent.
   `/api/voice` has only `/monitor` and `/test-call`. This is what defers Batch
   to P2: the batch dialer depends on it, and nothing consumes
   `batch_job_contacts` either, so the feature has never dialled.
2. **Exotel webhook** — `src/routes/api/public/telephony/exotel.ts`.
   **Blocking:** `/api/public/**` is `permitAll` **and** CSRF-exempt in Spring,
   so porting it without verifying `TELEPHONY_WEBHOOK_TOKEN` creates an
   unauthenticated write into tenant data (SECURITY.md F-15).

### Pages with no backend to migrate

**Integrations** and **Conductor** are entirely mock (hardcoded array;
`setTimeout` canned replies). Nothing to move — see ROADMAP.md P2.1.

---

## Security status

**P1 complete.** Both High findings from SECURITY.md are fixed and verified.

- **F-01** — role checks on mutating endpoints. Was 18 of 20 unguarded; now all
  20 covered. `AccessService` gained `requireManager`, `requireAgentManager`,
  `requireRowManager`. The two exceptions (`/api/business/provision`,
  `/api/business/context`) are self-scoped to the caller by design.
- **F-02** — call monitoring restricted to owner/manager. Re-verified after the
  Live Monitoring migration: agent 403, manager 200, owner 200.
- **F-07** — CSRF, closed by this migration's auth-transport decision.

Verified empirically with a real `agent`-role user: reads 200, all config writes
403, owner unaffected, cross-tenant attempts 403.

**Still open: 5 Medium, 7 Low.** Highest value next:
- **F-03** (Medium) — session cookie `Secure` flag depends on `NODE_ENV`; a
  deployment without it silently ships cookies over plaintext.
- **F-05** (Medium) — no bulk session revocation ("sign out everywhere").
- **F-04** (Medium) — SQL identifier allow-list is a convention, not enforced.
- **F-06** (Medium) — no audit log for privileged actions.
- **F-15** (Low, but **blocking for the Exotel port**) — webhook token check.

---

## Known open issues (not migration regressions)

- **React hydration error**, console, every page. Pre-existing — it fires on
  untouched pages too. P3 (ROADMAP.md).
- **Model dropdown does not validate against provider.**
  `dashboard.agents.tsx` renders one flat `MODELS` list (2 OpenAI + 2 Gemini)
  regardless of `model_provider`, and `VOICES` contains only OpenAI voices — a
  Gemini agent cannot pick a valid voice. This exact mismatch broke the dev
  agent on 2026-09-20. Spring doesn't cross-check `model_name` against
  `model_provider` either. **Fix deferred pending a product decision.**
- **Batch campaigns never dial.** Nothing consumes `batch_job_contacts`.
- **Alert rules never fire.** Nothing evaluates `alert_rules`.
- **Analytics "Top Intents" is always empty.** The agent never writes
  `calls.intent`.

---

## Phase 5 cleanup

**Stage 4 regression passed, and Tier 1 is done.** Eleven server-function
modules were deleted after their response types moved to
**`src/lib/api/contracts.ts`**, which is now the single place the frontend's
view of the API is written down. Each type there names the Java controller that
produces it.

Deleted:

```
auth.functions.ts            business.functions.ts      provision.functions.ts
stats.functions.ts           calls.functions.ts         records.functions.ts
alerts.functions.ts          phone-numbers.functions.ts agent-tools.functions.ts
monitor.functions.ts         session.functions.ts
```

`session.functions.ts` going closes **F-17** on disk — there is no longer a
second test-call implementation to drift.

### Still on disk, and why

| File | Why it stays |
| --- | --- |
| `voice/batch.functions.ts` | Batch Call still calls it (P2). |
| `voice/agent-configs.functions.ts` | **Batch imports `listAgentConfigs` as a value**, not a type — it was on the Tier 1 list but is not deletable. Its `AgentConfigRow` type is also still imported by Phone Numbers. |
| `voice/outbound.functions.ts` | `createOutboundCall` has no Spring equivalent; deleting it removes outbound calling. |
| `routes/api/public/telephony/exotel.ts` | The webhook is still Node-only. Porting it needs F-15 first. |

### Tier 2 — deferred to post-P2

`session.server.ts`, `password.server.ts`, `middleware.ts`, `access.ts`,
`pg.server.ts` and the `pg` dependency **cannot go yet**: the three surviving
server functions import `requireAuth`, the access helpers and the pool. They
become deletable only once Batch is migrated and outbound calling exists in
Spring — that is, after P2, not as a follow-up to this cleanup.

- [ ] *(post-P2)* Delete the last three `*.functions.ts` and `src/lib/db/pg.server.ts`
- [ ] *(post-P2)* Delete `src/lib/auth/session.server.ts`, `password.server.ts`, `middleware.ts`, `access.ts`
- [ ] *(post-P2)* Drop `pg` and `@types/pg` from `package.json`
- [x] Delete `db/convert-from-supabase.sql` and its branch in `scripts/db-init.mjs`.
      Dead since the baseline was recorded in `schema_migrations` — the branch
      only fires on a database built by the pre-migration Supabase schema, and
      no such database is left. `SETUP.md` updated to match.
- [x] Scrub remaining Supabase mentions. The ones still in the tree are kept on
      purpose: `AGENTS.md` states there is no Supabase, `0001_schema.sql`
      explains why the schema has no auth schema or roles, and MIGRATION /
      ROADMAP / SECURITY record the migration itself. Deleting those would
      remove the explanation, not a dependency.
- [ ] Disable the unused hosted Supabase project `curqreiywlyhesldgmia`
      (account action — nothing in the repo references it)
- [ ] Decide where `db/migrations/` lives (repo root vs Flyway/Liquibase in `services/api`)

---

## Schema reference

26 tables in `db/migrations/0001_schema.sql`. SQL functions: `appointment_check`,
`pricing_lookup`, `discount_request`, `touch_updated_at`. Enums include
`business_role` (`owner`, `manager`, `agent`).

Supabase was already fully removed in commit `8ffd547` — no
`@supabase/supabase-js` imports, no `.from()`/`.rpc()` calls, no
`supabase/migrations/`. Migrations live in `db/migrations/`.
