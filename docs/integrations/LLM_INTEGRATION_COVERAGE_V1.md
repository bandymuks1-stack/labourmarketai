# Universal LLM integration — coverage map V1 (2026-10-13)

> Status: **BUILT, TEST_PROVEN, NOT YET OWNER-ACCEPTED.** The bearer-caller-scope
> RED PR (#2336) is on `main` (`d37e956a5`, 2026-10-13); the integration now
> waits for a reachable production origin and the owner's real-client walk
> (ChatGPT refresh to the current toolset; the first Claude connection) — see
> `EXTERNAL_LLM_CLIENTS_PROGRAMME_2026-10-17.md` §H. Nothing in this document
> claims a human-proven or production-proven result for the new tools. Proof
> levels follow the §20 vocabulary of `CHATGPT_MCP_CLIENT_V1.md`.

## 1. One architecture — nothing new beside it

```
ChatGPT / Claude / Agentai OS / any MCP client
   │  OAuth 2.1 (Supabase Auth OAuth server, DCR) — the user's own JWT
   ▼
POST /api/mcp ── resolveApiIdentity (the ONE identity boundary)
   │
   ├─ runAsBearerCaller(identity)        ← NEW: lib/api/bearer-caller-scope.ts
   │      inside it, createClient() IS the verified caller's RLS client
   ▼
lib/capabilities/registry.ts  (the ONE execution path; zod input, kind, annotations)
   ├─ existing capabilities (81)                                   unchanged
   ├─ conversation-action-bridge.ts  (56)  → lib/conversation/dispatch.ts
   │      the SAME dispatcher the web chat uses: role gate, schema,
   │      confirmation tier, state-fingerprinted one-time token, executor
   ├─ workspace-read-capabilities.ts (22)  → the web chat's own read loaders
   └─ domain-action-capabilities.ts  (69)  → the web pages' own typed actions
   ▼
Supabase (RLS as the caller) → result + external receipt (audit)
```

No second MCP server, no second auth system, no service-role path, no new
table, no migration, no duplicated business logic. Every new tool is ONE call
into a function the web already runs.

## 2. Operation classes (the brief's A / B / C)

| Class | Tool shape | Rule | Examples |
|---|---|---|---|
| **A — read** | `kind: read`, `readOnlyHint` | runs at once if RLS allows | `calendar_conflicts_get`, `projects_list`, `reports_get` |
| **B — reversible own write** | one tool, `kind: execute` | runs at once; reversible; may notify the person it concerns, exactly as the web does; pinned by name in `lib/guards/mcp-execute-allowlist.test.ts` (or, for the bridge, by the web chat's own `reversible_write` tier) | `company_create-task`, `service_offering_create` (draft), `notification_mark_read`, `booking_deadline_set` |
| **C — sensitive / external / irreversible** | `_prepare`/`_draft` (writes nothing, returns a one-time token) + `_confirm` | token bound to caller + exact input + workspace (+ CURRENT state for domain actions and the fingerprinted web actions, so a spent token is stale); tamper / other-user / other-input refused; a mint is refused when the state cannot be read | publish a service, legal data, invitations (e-mail), accept a booking, end an engagement, approve leave or hours, deletes |

For bridged web-chat actions the class is READ FROM the conversation registry
(`reversible_write` → B; `important_write` / `strong_irreversible` → C), so an
external client can never get a lighter confirmation than the web chat.

## 3. Counts

| | tools |
|---|---|
| Existing before this slice | **81** (`0.1.0+t81.1f8f7db4`) |
| + web-chat action bridge | 56 (34 actions: 12 one-step, 22 prepare/confirm pairs) |
| + workspace reads | 22 |
| + domain actions | 70 (19 reads, 11 one-step, 20 draft/confirm pairs) |
| **Now** | **229** (`0.1.0+t229.d05cd4a7`) |

10 executable web-chat actions were NOT bridged because a capability already
performs them (no duplicate tools): log work, express interest, work card,
create/close/reopen demand, create project, assign worker, keep assignment,
shortlist. Guard: `conversation-action-bridge.test.ts`.

## 4. Coverage by area

Legend: ✅ covered by real tools · 🟡 partly covered · ⛔ not exposed (reason given)

| # | Area | State | Tools (MCP names) | Not covered / why |
|---|---|---|---|---|
| 1 | Registration, profiles, settings, authorization | 🟡 | OAuth 2.1 connect; `profile_get`, `context_list`, `context_switch`, `notification_preference_set`, `worker_save-preferences`, `cv_state_get` | ⛔ Account creation and sign-in stay in the product's own sign-up/consent pages (an agent never creates accounts or handles passwords). ⛔ Name/country edit after onboarding has no web action either. ⛔ Profile-discoverability consent (`grant/withdrawProfileDiscoverability`) deliberately left a first-person act in the UI — owner decision needed to expose consent to an assistant. |
| 2 | Personal and company workspaces | ✅ | `context_list`, `context_switch`, `organization_companies_list`, `organization_today_get` | — |
| 3 | Company legal data, activities, documents | 🟡 | `organization_setup_draft/_confirm` (legal name, type, country, registration code, address, website, contacts), `organization_capabilities_get` / `_declare_draft/_confirm`, `organization_description_set`, `organization_public_profile_get` / `_set_draft/_confirm`, `company_rename-organization_prepare/_confirm`, `company_ingest_*` | ⛔ Organization DOCUMENT register (create/approve/archive/ack) — its actions take FormData and end in `redirect()`; needs its core extracted first. ⛔ VAT number has no write path on the web either. ⛔ No NACE/industry code field exists — the classifiers are `company_type` and capability categories (both covered). |
| 4 | Worker profiles, CV, skills, availability | ✅ | `profile_get`, `living_cv_skills_get`, `cv_state_get`, `cv_verified_get`, `work_card_save_*`, `worker_add-work-history`, `worker_add-language`, `worker_add-document`, `worker_add-education`, `worker_add-achievement`, `worker_save-preferences`, `worker_documents_gap`, `workforce_availability` | 🟡 skill selection runs through `POST /api/workers/:id/skills` (shared bearer route), not an MCP tool yet. |
| 5 | Work Journal and evidence | ✅ | `journal_list`, `journal_work_intelligence_get`, `journal_create_draft`, `journal_confirm`, `evidence_*` | — |
| 6 | Historical import, confirmation, review | ✅ | `evidence_import_*` (15), `people_ingest_*`, `evidence_record_attest_*`, `_correct_*` | — |
| 7 | Projects, objects, stages, tasks | ✅ | `projects_list`, `project_create_*`, `project_status_set_*`, `project_stages_list`, `project_risk_get`, `project_readiness_get`, `tasks_open_list`, `company_create-task`, `company_update-stage-status`, `company_update-task-status`, `company_set-readiness-item`, `company_seed-readiness-checklist`, `company_request-readiness_prepare/_confirm` | 🟡 work objects (sites) are read through projects; no separate object tool. |
| 8 | Assignments, brigades, capacity | ✅ | `assignment_*`, `team_assignment_*`, `capacity_available_get`, `project_move_options`, `project_move_what_if`, `company_move-worker_prepare/_confirm`, `roster_list` | — |
| 9 | Calendar, schedules, conflicts | 🟡 | `calendar_agenda_get`, `calendar_conflicts_get`, `organization_today_get` | ⛔ Creating a work-plan entry (`createWorkPlanEntryAction`) is FormData + `redirect()`; needs core extraction. |
| 10 | Working time, hours, approvals | 🟡 | `journal_review_queue_get`, `journal_review_draft/_confirm`, `company_confirm-work_prepare/_confirm`, `company_enable-journal-review`, `counterparty_review_*`, `timesheets_overview_get`, `absence_*`, `leave_balances_get` | ⛔ Timesheet create/submit/reopen, work-hour allocations and generic approval workflows are FormData + `redirect()` actions; need core extraction. |
| 11 | Search for workers and employers | ✅ | `candidate_search`, `shortlist_*`, `work_find`, `jobs_new_list`, `opportunities_saved_list`, `service_offering_discover`, `marketplace_listing_discover` | — |
| 12 | Job offers and applications | ✅ | `demand_*`, `interest_express_*`, `company_propose-booking_*`, `worker_respond-booking_*`, `booking_list`, `booking_withdraw_*`, `booking_reschedule_*`, `booking_deadline_set`, `company_contact-worker_*` | — |
| 13 | Universal marketplace: services, goods, orders | 🟡 | services: `service_offering_*` (create draft, edit, publish/pause, delete); goods/rentals/wanted: `marketplace_listing_*`; enquiry→answer: `service_request_*` | ⛔ There is no ORDER module on the web (the closest are service requests, covered, and procurement inquiries — FormData + redirect, not yet). ⛔ Listing enquiry (`enquireAboutListingAction`) is FormData + redirect. |
| 14 | Requests, proposals, collaboration | ✅ | `agency_propose-candidate_*`, `company_share-request_*`, `company_respond-offer_*`, `company_respond-team-offer_*`, `client_agency_offers_get`, `proposal_*`, `contract_*`, `commercial_get`, `service_request_*` | Note: `proposal_status_set` records "sent"; it does not e-mail the client (the web does not either). |
| 15 | Notifications, chats, communication | ✅ | `notification_list`, `notification_mark_read`, `notification_mark_all_read`, `notification_preference_set`, `conversation_list`, `conversation_get`, `message_send_*`, `company_contact-worker_*` | — |
| 16 | Organization relationships, invitations, access | 🟡 | `invitations_list`, `worker_respond-invitation_*`, `company_invite-worker_*`, `agency_invite-client_*`, `company_invite-learner_*`, `company_accept-connection_*`, `company_decline-connection_*`, `agency_clients_get`, `client_agency_connections_get`, `engagement_end_*` | ⛔ Changing a member's governance ROLE is not exposed (open owner decision ORG-2 on the role model). |
| 17 | Reports, analytics, export | ✅ | `reports_get`, `finance_records_list`, `timesheets_overview_get`, `cv_verified_get`, `marketplace_funnel_get` | The CSV/print downloads stay browser routes; the same data is returned as JSON. |
| 18 | Administration and platform management | 🟡 | per the caller's real rights: `marketplace_funnel_get`, `worker_activation_queue_get`; education: `education_workspace_get`, `company_create-programme_*`, `company_create-cohort_*`, `company_assign-learner_*` | ⛔ The founder/admin console actions are not exposed — platform-admin power through an assistant needs its own owner decision. |

## 5. Security properties and where they are enforced

| Property | Enforcement |
|---|---|
| A bearer caller can never do more than the same person's web session | the scope holds only the `ApiIdentity` the ONE resolver verified; anon key + the user's JWT; RLS decides (`bearer-caller-scope.ts`, `mcp-door-bearer-scope.test.ts`) |
| No cross-user leakage between concurrent requests | `AsyncLocalStorage` per request (`bearer-caller-scope.test.ts` — two concurrent callers) |
| No tool runs as "nobody" | every new tool refuses `not_supported` when a bearer caller is not inside the scope, or the scope is another user's |
| No privilege escalation by argument | organization ids are selectors re-checked by RLS/RPCs; the bridge re-checks HELD roles in the active workspace; the workspace comes from the durable pointer only |
| No lighter confirmation than the web | bridge tiers come from the conversation registry; guard `mcp-execute-allowlist.test.ts` |
| Tamper / other-user / other-workspace / stale confirmations refused (replay: see §2) | dispatcher tokens (workspace-bound state fingerprints) and capability tokens (hash of the canonical read the write changes) — `conversation-action-bridge.test.ts`, `domain-action-capabilities.test.ts` |
| Audit | every `confirm`/`execute` through `/api/mcp` writes the external receipt (`recordExternalReceipt`; hyphenated bridge ids folded to the RPC's id format, guard-tested) and a privacy-safe log line; `actorKind: "agent"` |
| Revoking agent access | the person revokes the connector in ChatGPT, or the OAuth grant in Supabase Auth; the next call is 401 |
| Honest failure states | `unavailable` ≠ empty, `needs_migration`, `no_organization_context` (with what to do), `confirmation_rejected` |
| No production data touched by this slice | no migration, no seed, no prod write; all tests use synthetic in-memory data |

## 6. How the owner verifies it in ChatGPT

1. After deploy, open `https://labourmarket.ai/api/mcp` in a browser: the JSON
   must show `"toolsetVersion": "0.1.0+t229.d05cd4a7"` and `"toolCount": 229`.
2. ChatGPT → Settings → Connectors (Apps) → LabourMarket.ai → **Refresh**
   (the server is stateless and cannot push `tools/list_changed`).
3. Start a NEW conversation and attach the LabourMarket.ai connector in the
   composer ("+" → LabourMarket.ai) — tools are per-conversation.
4. Run the prompts below. Each maps to real tools; a write always shows a
   prepare/draft preview first and needs your explicit "yes".

| Prompt (LT) | Tools ChatGPT should call |
|---|---|
| „Parodyk mano įmonės projektus." | `context_list` → (`context_switch`) → `projects_list` |
| „Įkelk oficialius įmonės registracijos duomenis." | `organization_companies_list` → `organization_setup_draft` → (your yes) → `organization_setup_confirm` |
| „Pakeisk organizacijos veiklos kategoriją." | `organization_capabilities_get` → `organization_capabilities_declare_draft/_confirm` (additive) |
| „Sukurk projektą ir priskirk darbuotojus." | `project_create_draft/_confirm` → `roster_list` → `assignment_create_draft/_confirm` or `team_assignment_create_*` |
| „Parodyk laisvas brigadas." | `capacity_available_get` (+ `workforce_availability`) |
| „Patikrink kalendoriaus konfliktus." | `calendar_conflicts_get`, `calendar_agenda_get` |
| „Įkelk 200 darbuotojų sąrašą." | `people_ingest_preview` → `people_ingest_commit` (≤64 KB per request; larger files via the web import panel — the refusal says so) |
| „Paskelbk mūsų paslaugą prekyvietėje." | `service_offering_create` (draft) → `service_offering_status_set_draft/_confirm` (status `active`) |
| „Paruošk ir išsiųsk pasiūlymą klientui." | agency → `agency_propose-candidate_prepare/_confirm`; commercial record → `proposal_create` → `proposal_status_set_draft/_confirm` (`sent`) |

5. Cross-check every write in the web UI (same account): it must appear on the
   matching page — one domain state, two clients.

## 7. Proof levels for this slice

- UNIT/GUARD PROVEN: bearer scope (isolation, concurrency, no leak), the real
  `/api/mcp` POST handler entering the scope, bearer `getUser()` parity, the
  bridge (coverage, tier→shape, token flow, refusals, schema conversion of all
  tools), workspace reads (state mapping, SEP-7), domain actions (normalizer,
  draft/confirm, stale and input-mismatch refusal), the updated transport
  guards, the fingerprint register.
- NOT YET PROVEN: a live database run of the new tools (the local Supabase
  stack needs Docker, which agents do not start), real ChatGPT discovery of
  the 229 tools, and every owner acceptance prompt above. Those are the
  owner's acceptance steps; this slice does not mark them done.

### 7.1 Real CLIENT proof vs MCP SERVER proof (2026-10-14, owner §5)

These are two different claims and are never merged.
- A **server** test calls `/api/mcp` directly with a bearer token that the test itself minted. It proves the server.
- A **client** test is ChatGPT or Claude doing its own discovery, OAuth, tool choice and rendering. Only that proves the integration a person will use.

| What | Server proof (agent, today) | Real client proof | Status |
|---|---|---|---|
| Discovery (PRM → authorization server metadata) | Read live 2026-10-14: PRM → `…supabase.co/auth/v1`; AS metadata lists DCR, PKCE S256, `none` auth, refresh | **ChatGPT 2026-08-30**: DCR 201, consent 200, token 200 (`CHATGPT_MCP_CLIENT_V1.md`) | ChatGPT ✓ · **Claude NOT VERIFIED** |
| Tool list | Public `GET /api/mcp` → `toolCount 229` (`0.1.0+t229.105ffae5`) | ChatGPT last saw **81** (a stored snapshot). The owner must press **Refresh** in the connector. | Server ✓ · ChatGPT 229 **NOT VERIFIED** · Claude **NOT VERIFIED** |
| Read | `mcp-chain` + `mcp-agents` prod walks green (synthetic cast, minted bearer) | ChatGPT `profile.get` 2026-08-30 | ChatGPT ✓ (81-tool era) |
| Draft → confirm write | `mcp-chain` walk; replay refused (single-use) | ChatGPT journal draft→confirm 2026-08-30, plus a DB row | ChatGPT ✓ (81-tool era) |
| Refusals: invalid token, rate limit | `mcp-door-refusals.test.ts` (incl. the 600 / 5 min per-person brake, #2373) | — | Server ✓ |
| Revocation | Connected Apps → revoke grant → next call 401 (`connected-apps-surface.test.ts`) | not re-run with a live client | Server ✓ · client NOT VERIFIED |
| Domain verification (OpenAI) | `/.well-known/openai-apps-challenge` (#2374) answers 404 until the token is set | portal verification | Owner step |

**The client test protocol** (owner, about 20 minutes per client; use the synthetic review account, never a personal one):
1. **ChatGPT:**
   - Settings → Connectors → LabourMarket.ai → **Refresh**.
   - Confirm the tool list is larger than 81 and that `serverInfo.version` matches the top row of `MCP_TOOLSET_FINGERPRINTS.md`.
2. **Claude:**
   - Settings → Connectors → *Add custom connector* → `https://labourmarket.ai/api/mcp`.
   - Complete the consent screen.
3. In each client, run the **5 positive + 3 negative** cases from `docs/launch/RELEASE_SUBMISSION_PACK_2026-10-14.md` §4.
4. Record per case: the tool the client called, whether a draft was confirmed before any write, and the reply.
5. Server-side evidence for the same minutes: `vercel logs … -q external_client` shows `external_client.auth` / `external_client.tool` lines (class-only, no data).
6. Settings → Account → Connected apps → **revoke**. The next client call must ask to reconnect.

## 8. Next: AI agents as labour-market participants (owner direction 2026-10-13)

This integration makes every agent a **DELEGATE**: it acts for the signed-in
person, with that person's authority, into that person's history. The owner
direction of 2026-10-13 adds the **PROVIDER** mode — an AI agent as its own,
clearly identified work subject with a responsible operator, its own AI Living
Profile and Work Journal, competing for digital work on the SAME market. It is
recorded in the canonical architecture (§1.13) and planned in
[`AI_AGENT_PARTICIPANTS_V1.md`](AI_AGENT_PARTICIPANTS_V1.md), deliberately
OUTSIDE this PR: it needs owner decisions AGENT-1..3 and schema gates, and it
reuses this door, this capability layer and this audit trail rather than
adding any of its own.
