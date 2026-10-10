# Trellient product roadmap — feature audit & build order

Audit date: 2026-09-24. Branch `supabase-removal-and-agent-fixes`.
**Report only — no code was changed.**

## Legend

| Mark        | Meaning                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| **WORKING** | Real data, real backend write, does what the label says                    |
| **MOCK**    | Renders hardcoded data; controls change local state only. Nothing persists |
| **BROKEN**  | Wired to a backend, but the end-to-end outcome never happens               |
| **STUBBED** | Real data in, placeholder logic — honest but not the real feature          |
| **MISSING** | Does not exist                                                             |

---

## The single most important finding

**No dashboard page talks to the Spring Boot API.** Every page calls TanStack
server functions in `src/lib/**/*.functions.ts`, which query Postgres directly
through `pg.server.ts`. Zero references to `:8080` or any `/api/*` Spring route
exist anywhere in `src/`.

`services/api` is a complete, tested, parallel implementation (Phase 3 of
[MIGRATION.md](MIGRATION.md)) that **nothing calls**. So for the question "does
this page load from the Spring Boot API?", the answer is **no, on every single
page** — they load real data, just not through Spring.

That is not a bug, it is the planned state. But it means every feature below is
effectively implemented twice, and the two copies have already drifted once
(the test-call path, finding F-17 in [SECURITY.md](SECURITY.md)).

---

## Page-by-page

### Home — `/dashboard`

Data: **real** (`getDashboardStats`, `getRecentCalls`).

| Feature                                                 | Status  | Notes                                         |
| ------------------------------------------------------- | ------- | --------------------------------------------- |
| 4 stat cards (Calls Today, Active, Agents, Escalations) | WORKING | Verified against direct SQL                   |
| Recent calls list                                       | WORKING | Joins `customers` for names                   |
| 6 Quick Action tiles                                    | WORKING | Real router `Link`s                           |
| Loading state                                           | MISSING | Shows `"—"` while fetching                    |
| Error state                                             | MISSING | Query failure renders as empty/dash, silently |

---

### Agents — `/dashboard/agents`

Data: **real** (`listAgentConfigs`, `getAgentRuntime`, + `listCalls`, `listAgentTools`).
The most complete page in the product.

| Feature                                                                   | Status     | Notes                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent list + runtime state pills                                          | WORKING    | Derived from last 24h of calls                                                                                                                                                                                          |
| Create agent                                                              | WORKING    | `createAgentConfig`                                                                                                                                                                                                     |
| Save draft                                                                | WORKING    | `saveAgentConfig`, allow-listed columns                                                                                                                                                                                 |
| Publish (version bump + snapshot)                                         | WORKING    | Owner/manager only — the one place role is enforced                                                                                                                                                                     |
| Tab: Prompt                                                               | WORKING    |                                                                                                                                                                                                                         |
| Tab: Model & voice                                                        | WORKING    | Provider/model/voice/speed                                                                                                                                                                                              |
| Tab: Functions                                                            | WORKING    | Real `agent_tools` CRUD                                                                                                                                                                                                 |
| Tab: Phone numbers                                                        | WORKING    |                                                                                                                                                                                                                         |
| Tab: Call history                                                         | WORKING    |                                                                                                                                                                                                                         |
| Tab: Call settings                                                        | WORKING    |                                                                                                                                                                                                                         |
| Tab: Escalation                                                           | WORKING    |                                                                                                                                                                                                                         |
| Web test call                                                             | WORKING    | Voice path — parked, works                                                                                                                                                                                              |
| Model dropdown lists `gpt-realtime-mini`, `gemini-3.1-flash-live-preview` | **BROKEN** | Selectable, never validated. Picking a model the provider rejects kills the call at connect time (exactly how `model_provider`/`model_name` got mismatched on 2026-09-20)                                               |
| Draft vs published semantics                                              | **BROKEN** | The worker reads the **live** row (`business.py:109`), never `agent_config_versions`. An unpublished draft edit reaches the next call. "Publish" is therefore cosmetic — and the role check on it is not a real control |

---

### Knowledge Base — `/dashboard/knowledge`

Data: **real** via `CrudSection` → `records.functions.ts`.

| Feature                                       | Status      | Notes                                                                                                                                    |
| --------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Policies tab — list/create/edit/delete        | WORKING     | `business_policies`                                                                                                                      |
| Knowledge notes tab — list/create/edit/delete | WORKING     | `agent_knowledge`                                                                                                                        |
| Active/inactive toggle                        | WORKING     | Agent respects `active`                                                                                                                  |
| Search                                        | WORKING     | Client-side                                                                                                                              |
| **File/document upload**                      | **MISSING** | Home's "Upload Knowledge" tile leads here, but the page is manual text entry only. No PDF/DOCX/URL ingestion, no chunking, no embeddings |
| `agent_knowledge.embedding` (jsonb)           | **MISSING** | Column exists, never populated. Retrieval is `ILIKE` substring matching, not semantic                                                    |

---

### Phone Numbers — `/dashboard/phone-numbers`

Data: **real** (`listPhoneNumbers`, `listAgentConfigs`).

| Feature                   | Status      | Notes                                                                                                                                                                                 |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List numbers              | WORKING     |                                                                                                                                                                                       |
| Add number                | WORKING     | Validates + normalises E.164                                                                                                                                                          |
| Assign/reassign to agent  | WORKING     | Cross-tenant guarded                                                                                                                                                                  |
| Activate/pause            | WORKING     |                                                                                                                                                                                       |
| Delete (with confirm)     | WORKING     |                                                                                                                                                                                       |
| **Number provisioning**   | **MISSING** | You can only record a number you already own elsewhere. No purchase/porting flow. The success toast admits it: "Configure your telephony provider to point at your Trellient webhook" |
| Webhook URL shown to user | MISSING     | User must know the URL out-of-band                                                                                                                                                    |

---

### Batch Call — `/dashboard/batch-call`

Data: **real** (`listBatchJobs`, `listAgentConfigs`).

| Feature                              | Status                        | Notes                                                                                                                                                                                                                                         |
| ------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List campaigns                       | WORKING                       |                                                                                                                                                                                                                                               |
| Create campaign + contact list       | WORKING                       | Dedupes, validates, one transaction, caps at 5,000                                                                                                                                                                                            |
| Start / pause                        | WORKING                       | Writes `status`, enforces the state machine                                                                                                                                                                                                   |
| **Actually placing the calls**       | **BROKEN — the headline gap** | **Nothing consumes `batch_job_contacts`.** I grepped every source tree: the only code touching those tables is the create/status writes above. There is no dialer, no scheduler, no worker. A campaign set to `running` dials nobody, forever |
| Progress (completed/failed counts)   | **BROKEN**                    | Columns exist and are displayed; nothing ever increments them. Permanently 0                                                                                                                                                                  |
| `createOutboundCall` server function | **MISSING (orphaned)**        | Fully implemented in `src/lib/voice/outbound.functions.ts`, referenced by **zero** UI code. The capability exists and is unreachable                                                                                                          |

---

### Call History — `/dashboard/call-history`

Data: **real** (`listCalls`, `getCallDetail`).

| Feature                                | Status  | Notes                                                                                                                                           |
| -------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Call list                              | WORKING | 50 most recent                                                                                                                                  |
| Select call → transcript + events      | WORKING | Verified live: 12 lines on a real call                                                                                                          |
| Scope filters (recent/active/finished) | WORKING |                                                                                                                                                 |
| Export / download                      | MISSING |                                                                                                                                                 |
| Search / date range / pagination       | MISSING | Hard `LIMIT 50`, no way to reach older calls                                                                                                    |
| Recording playback                     | MISSING | Audio recording is deliberately **off** (`record={"audio": False}`) to dodge the `livekit_ffi` crash. Re-enabling is blocked on the rtc upgrade |

---

### Chat History — **MISSING ENTIRELY**

No route, no nav entry, no table, no code. There is no chat/messaging channel in
the product at all — voice only. This is a net-new feature, not a repair.

---

### Contacts — `/dashboard/contacts`

Data: **real** via `CrudSection`.

| Feature                                 | Status  | Notes                                                |
| --------------------------------------- | ------- | ---------------------------------------------------- |
| List / create / edit / delete customers | WORKING |                                                      |
| Search (name/phone/email)               | WORKING | Client-side                                          |
| Auto-creation from inbound calls        | WORKING | Exotel webhook upserts by phone                      |
| Import / export CSV                     | MISSING | Blocks getting a contact list in for batch campaigns |
| Call history per contact                | MISSING |                                                      |

---

### Analytics — `/dashboard/analytics`

Data: **real** (`getAnalyticsStats`). Read-only page, no actions.

| Feature                                               | Status     | Notes                                                                                                                                                                                                     |
| ----------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Totals, answered/missed/failed, minutes, avg duration | WORKING    | Cross-checked against SQL                                                                                                                                                                                 |
| Escalation + containment rate                         | WORKING    |                                                                                                                                                                                                           |
| Calls by direction / status                           | WORKING    |                                                                                                                                                                                                           |
| Range selector (today/7d/30d/90d/all)                 | WORKING    |                                                                                                                                                                                                           |
| **Top Intents**                                       | **BROKEN** | Always `[]`. `calls.intent` is a real column and `business.py` accepts an `intent` parameter — but `agent.py` never passes one, so it is `NULL` on every row ever written. The panel is permanently empty |
| Charts / visualisation                                | MISSING    | Numeric tiles only                                                                                                                                                                                        |
| Cost / spend tracking                                 | MISSING    | No provider cost data captured anywhere                                                                                                                                                                   |

---

### Live Monitoring — `/dashboard/live-monitoring`

Data: **real** (`listCalls` scope=active, `createCallMonitorSession`).

| Feature                              | Status              | Notes                                                               |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------- |
| Active call list                     | WORKING             |                                                                     |
| Listen in (LiveKit, hidden listener) | WORKING             | Token is correctly `Hidden(true)`, `CanPublish(false)`              |
| Stop listening                       | WORKING             |                                                                     |
| **Any member can eavesdrop**         | **SECURITY — High** | SECURITY.md F-02. Membership checked, role not. Covert and unlogged |
| Live transcript during call          | MISSING             | Audio only                                                          |
| Barge-in / take over call            | MISSING             |                                                                     |

---

### AI Quality Assurance — `/dashboard/ai-quality`

Data: **real** (`listCalls` scope=finished).

| Feature                                               | Status  | Notes                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Call list with QA scores                              | STUBBED | Real calls, but `computeScore()` is a hand-written heuristic (`base 70`, ±points for status/latency/duration). The code says so plainly: _"Real scoring would come from an LLM evaluation pipeline; this is a transparent heuristic until that exists"_ |
| Issue detection                                       | STUBBED | Same — rule-based `detectIssues()`, not analysis                                                                                                                                                                                                        |
| Min-5-calls gate before showing QA                    | WORKING |                                                                                                                                                                                                                                                         |
| **Actual LLM evaluation**                             | MISSING | The real feature                                                                                                                                                                                                                                        |
| Transcript-based scoring, rubrics, human review queue | MISSING |                                                                                                                                                                                                                                                         |

---

### Alerting — `/dashboard/alerting`

Data: **real** (`listAlertRules` + create/toggle/delete).

| Feature                                   | Status     | Notes                                                                                                                                                                  |
| ----------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List rules                                | WORKING    |                                                                                                                                                                        |
| Create rule (type, threshold, channel)    | WORKING    | Threshold JSON serialisation verified                                                                                                                                  |
| Enable/disable toggle                     | WORKING    |                                                                                                                                                                        |
| Delete rule                               | WORKING    |                                                                                                                                                                        |
| **Rules ever firing**                     | **BROKEN** | Like batch: nothing evaluates `alert_rules`. No scheduler, no evaluator. `last_triggered_at` is never written. You can build any rule you like; none will ever trigger |
| Notification delivery (email/SMS/webhook) | MISSING    | Channels are stored, never used. No sender exists                                                                                                                      |

---

### Integrations — `/dashboard/integrations`

Data: **hardcoded array of 12 entries.**

| Feature                                                                                                                    | Status                         | Notes                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration catalogue (Salesforce, HubSpot, Zoho, Twilio, Exotel, WhatsApp, Calendly, Cal.com, Zapier, Make, Webhook, GA4) | **MOCK**                       | `const INTEGRATIONS: Integration[] = [...]` in the component file                                                                                                                                                             |
| Category filter                                                                                                            | WORKING                        | Filters the hardcoded array                                                                                                                                                                                                   |
| **Connect / Disconnect buttons**                                                                                           | **MOCK — actively misleading** | `toggleConnect()` flips `useState` and fires `toast.success("Connected Salesforce.")`. No OAuth, no credentials, no persistence. Refresh the page and it resets. **The toast tells the user something happened that did not** |
| Twilio + Exotel shown as "Connected"                                                                                       | **MOCK**                       | Hardcoded `connected: true`. Exotel is _partly_ real (inbound webhook works); Twilio has no implementation at all                                                                                                             |
| Custom Webhook                                                                                                             | MISSING                        | Listed, not implemented                                                                                                                                                                                                       |

This page is the highest-risk item in the product: it is the one place the UI
states a falsehood rather than merely lacking a feature.

---

### Billing — **MISSING ENTIRELY**

No route, no nav entry, no tables, no provider. The schema has `usage_records`
(never written to) and nothing else. No plans, no metering, no invoices, no
payment integration. For a SaaS, this is the largest single gap.

---

### Settings — `/dashboard/settings`

Data: **real** (`getBusinessContext`, `listTeam`, `updateBusiness`).

| Feature                                                                             | Status  | Notes                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| Business details form (name, legal name, phone, email, timezone, language, address) | WORKING | Validated, owner/manager only                                                                                            |
| Team member list                                                                    | WORKING | Read-only                                                                                                                |
| **Invite member**                                                                   | MISSING | No invite flow, no email, no pending state                                                                               |
| **Change member role / remove member**                                              | MISSING | Roles exist in schema and are unmanageable from the UI. The only way to get a second user into a workspace is direct SQL |
| API keys / developer settings                                                       | MISSING |                                                                                                                          |
| Danger zone (delete workspace)                                                      | MISSING |                                                                                                                          |

---

### Conductor (auto-config panel) — sidebar, all pages

| Feature                                  | Status                                           | Notes                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel open/close, message list, input    | WORKING                                          | UI shell only                                                                                                                                                                                             |
| **Assistant responses**                  | **MOCK — the most deceptive surface in the app** | `setTimeout(..., 800)` returning one of two hardcoded strings. No LLM, no network call whatsoever                                                                                                         |
| "Paste a URL" → site analysis            | **MOCK**                                         | On a URL it replies _"I'll analyze {url} to understand your business. Give me a moment to read the site and suggest an agent configuration…"_ — then does nothing, ever. No fetch, no parse, no follow-up |
| Generating agent config from description | MISSING                                          | The actual product promise                                                                                                                                                                                |
| Applying generated config to an agent    | MISSING                                          |                                                                                                                                                                                                           |

---

### Exotel telephony

| Feature                                        | Status                    | Notes                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbound webhook `/api/public/telephony/exotel` | WORKING                   | Verifies `TELEPHONY_WEBHOOK_TOKEN`, upserts customer, inserts `calls` row, routes to agent by dialled number                                                                           |
| Provider client (`exotel.ts`)                  | STUBBED                   | `createExotelProvider()` + auth + `call()` helper exist; no UI path reaches it                                                                                                         |
| Outbound dialling                              | **MISSING (unreachable)** | Provider supports it, `createOutboundCall` implements it, nothing calls either                                                                                                         |
| Exotel credentials configured                  | **MISSING**               | `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_CALLER_ID` are all **empty** in `.env`. Inbound is untested against a real Exotel account                                  |
| Spring port of the webhook                     | MISSING                   | Phase 4 of MIGRATION.md. **Blocking note:** when ported it must verify the token, or `/api/public/**` (permitAll) becomes an unauthenticated write into tenant data — SECURITY.md F-15 |

---

## Cross-cutting

| Concern               | Status                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Frontend → Spring API | Not connected on any page (by design, Phase 5 pending)                                   |
| Duplicate backends    | Every feature implemented twice; already drifted once                                    |
| Loading states        | Mostly missing — pages render `—` or empty while fetching                                |
| Error states          | Largely missing — failed queries look like empty data                                    |
| Empty states          | Good — `EmptyState` component used consistently                                          |
| Toasts                | Good coverage via `sonner` — except where they lie (Integrations, Conductor)             |
| Responsive            | Partial — sidebar collapses, mobile nav exists; tables not adapted                       |
| Accessibility         | Partial — some `aria-label`s; no focus management, no keyboard traps handled in modals   |
| Design system         | Tokens exist (`--ink`, `--line`, `--brass`, `card`, `measure`) and are used consistently |
| Animations            | Essentially none beyond CSS `transition-colors`                                          |
| Tests                 | **Zero frontend tests.** 10 Python agent tests. No Spring tests                          |

---

# Build order

## P1 — Security (do first, small, unblocks nothing but protects everything)

From [SECURITY.md](SECURITY.md). Both are High. Neither is large.

1. **F-01 — role checks on mutating endpoints.** Only 2 of ~20 mutating
   endpoints check role. An `agent`-role member can launch outbound campaigns,
   delete phone numbers (killing inbound), rewrite agent instructions, and
   delete the alert rules that would have surfaced it.
   _Note:_ this must be fixed in **both** backends, or fixing one is theatre.
2. **F-02 — restrict call monitoring to owner/manager** and write an audit row.
   Currently any member can silently listen to any live customer call, invisibly
   and without trace.

Also worth folding in here, cheap and related: 3. F-04 — enforce the SQL identifier allow-list inside the helpers, with a test. 4. F-06 — audit log for privileged actions.

**Why first:** it is the only category where _doing nothing_ actively increases
risk, and it is a day or two of work, not a sprint.

---

## P2 — Make the core actually work

Ordered by "how badly does the current state mislead the user".

**P2.1 — Stop lying.** Cheapest possible fix, highest trust return.

- Integrations: replace fake Connect buttons with honest "Coming soon" state, or
  remove the page from nav until real.
- Conductor: same — it currently claims to be reading websites.
- Agents model dropdown: remove unvalidated model options, or validate
  provider/model compatibility on save.

**P2.2 — The batch dialer.** The single biggest functional hole. Requires a job
runner that reads `batch_job_contacts`, respects campaign status, places calls
via the (already written) `createOutboundCall`, and increments
`completed_contacts`/`failed_contacts`. This also makes the orphaned outbound
capability reachable and gives Exotel outbound its first real use.

**P2.3 — The alert evaluator.** Same shape of problem: a scheduler that
evaluates `alert_rules`, writes `last_triggered_at`, and delivers to
email/SMS/webhook. Needs a notification sender, which does not exist yet.

**P2.4 — Team management.** Roles are the foundation P1 just hardened, and they
are currently unmanageable outside SQL. Invite, change role, remove.

**P2.5 — Billing.** Net-new and large: plans, metering into `usage_records`
(exists, unused), invoices, a payment provider. Required before anyone pays you.

**P2.6 — Knowledge ingestion.** File/URL upload, chunking, and embeddings into
the unused `agent_knowledge.embedding` column — replacing `ILIKE` with real
retrieval. This is also the fix that would have prevented the empty-tool-result
dead end we hit in voice testing.

**P2.7 — Fill the permanently-empty features.** Populate `calls.intent` from the
agent so Analytics "Top Intents" works. Real LLM evaluation for AI Quality.

**P2.8 — Call history depth.** Pagination, search, date filtering, export.
Recording playback stays blocked until the `livekit` rtc upgrade.

**P2.9 — Chat History.** Net-new channel. Only worth starting once voice is
genuinely stable.

---

## P3 — UI/UX overhaul

Deliberately last: polishing a page whose buttons do not work is wasted effort,
and several of these pages will be rebuilt in P2 anyway.

1. Loading states — skeletons everywhere currently showing `—`
2. Error states — every `useQuery` needs a visible failure path with retry
3. Empty states — already good, extend to new pages
4. Responsive — tables need a card layout at mobile width
5. Accessibility — focus management, modal keyboard traps, contrast audit, labels
6. Animation — transitions, optimistic UI on mutations
7. Design system — formalise the existing tokens into documented components
8. Charts — Analytics is numeric tiles; it needs real visualisation

---

## Recommended execution sequence

1. **P1 security** (~1–2 days). Small, self-contained, protects everything else.
2. **P2.1 stop lying** (~half a day). Trivial, and removes the product's worst
   credibility risk immediately.
3. **Decide the backend question — before building anything new.** Right now
   every feature is written twice. P2.2 onward will double in cost until this is
   settled. Either finish MIGRATION.md Phase 5 (point the frontend at Spring,
   delete the TypeScript) or formally abandon the Spring port. **Do not build the
   batch dialer twice.** This is the highest-leverage decision on the list.
4. **P2.2 batch dialer** — the biggest functional hole, and it makes an already
   written, currently unreachable capability real.
5. **P2.4 team management** — completes the P1 role work.
6. **P2.3 alerting evaluator + notification sender** — the sender unlocks
   invites, billing receipts and alerts all at once.
7. **P2.5 billing** — the gate on revenue.
8. **P2.6 knowledge ingestion** — the biggest agent-quality win.
9. **P2.7 / P2.8** — fill empty features, deepen call history.
10. **P3 UI/UX** — once the surfaces are stable.
11. **P2.9 Chat History** — new channel, last.

**One caveat on step 3:** I would not start P2.2 before that decision is made.
Everything in P2 is backend work, and the duplicate-backend question determines
where it gets written. The test-call path has already drifted between the two
implementations once — building nine more features across both is how that
becomes nine more inconsistencies.
