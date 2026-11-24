# LabourMarket.ai — full reality audit vs Work-OS scope (2026-08-17)

Base: origin/main `9ecd063b`, audited in isolated worktree; production DB
(`gorgitwvdzxbnaxhrsrw`) read live the same day. Method: a feature is FULL
only when the end-to-end path is proven in code (UI/API → authz → DB →
logic → persistence → read-back); doc claims were not trusted, and three
stale APPLIED_LEDGER "Deferred" entries were corrected against the live
production ledger (see §Production corrections).

Statuses: FULL / PARTIAL / BROKEN / MISSING / DUPLICATE / DEAD.

## Production corrections to repo docs (verified by live DB read-back)

1. `20260808150000_caller_manages_worker_engagements_v1` (defect A1 +
   assign-bridge restore) — APPLIED in prod (ledger `20260812180224`),
   despite still sitting in the ledger's Deferred list text. Absence
   approval by booking-derived employers WORKS in prod.
2. `experience_records` / `experience_responses` — APPLIED and live
   (2 + 1 rows in prod), despite a stale Deferred citation.
3. `save_worker_availability_prefs_v2` — present in prod (RPC exists in
   live catalog), so v2 availability fields persist.
4. `20260722120000_secdef_anon_authz_bypass_fix_v1` — APPLIED: prod
   `delete_contract_v1` etc. carry the null-guard + `is distinct from`
   body and anon EXECUTE is revoked (verified from pg_proc).
5. Genuinely NOT applied: `company_locations` (`20260713120000`),
   durable workspace pointer (`20260714210000`), open-markets seed
   (`20260717130000`, owner-gated).

## WORKER

| Item | Status | Key evidence |
|---|---|---|
| identity/profile | FULL | onboarding RPC + trigger-provisioned worker row; 8 wired edit sections on `/dashboard/profile` |
| CV create/import/export | FULL | `/api/cv/extract` (auth, 5MB) → review → persist RPCs; derived verified CV + print/CSV export; no server PDF |
| skills model | PARTIAL | `worker_skills` + evidence links wired; `self_rated_level` column DEAD (no writer); real ladder = evidence-tier |
| ESCO | PARTIAL | 1.03M labels, 28 locales, live typeahead; BUT picks persist label-only (no concept_id) and `skills.esco_uri` bridge never populated |
| evidence system | FULL | `journal_entry_skills` + photos (bucket+RLS) + manager confirmations + evidence report |
| availability | PARTIAL | status/window/prefs/absences wired; no per-day calendar entity |
| worker discovery | FULL | scouting + shortlist + people search; `can_view_worker` RLS fail-closed |
| consent/visibility | FULL | append-only consent ledger + disclosure ledger; enforcement in RLS not UI |
| opportunity matching | FULL | single engine `match-v1.ts` reused worker+employer+admin side |
| external opportunities | FULL | `public_vacancies` (41,606 active) → worker board via same matcher; kill-switch gated import |
| application/action path | FULL | interest + save + contact + seen + booking respond; external ads honestly link out only |
| Work Journal | FULL | atomic `create_journal_entry_full` + hash chain + chat-first intake; `work_date` stored as metric row (untyped — debt) |
| journal→skill enrichment | FULL | `skill-pipeline.ts` on every save; always `verified:false` honest provenance |
| journal→rematch | PARTIAL | recompute-on-visit only; no rematch event, no notification type for matches |
| reputation/trust | FULL | real counts + experience records domain (applied + live rows in prod) |

DEAD found: `talent_source_records` table + provenance actions;
`adjacent-directions.ts`; `identity-resolution-service.ts`;
`candidate_skills` table; `worker_skills.self_rated_level`.

## ORGANIZATION

| Item | Status | Key evidence |
|---|---|---|
| org creation | FULL | `save_company_setup_v3` (closed company_type vocab incl. staffing_agency); org row trigger-mirrored, owner membership auto-seeded |
| membership | DUPLICATE | `company_memberships` (governance) + `engagement_contexts` (employment) both live with two member-list UIs |
| roles | FULL | owner/admin/manager/external_manager/member; last-owner protection trigger |
| permissions/RBAC | FULL | writes RPC-only, `membership_actor_role_v1` authority, anti-oracle merges, guard+e2e tests |
| teams/departments | PARTIAL | teams = org rows type 'team' (no member roster); departments MISSING entirely |
| worker invitation | DUPLICATE | THREE parallel systems: token `invitations` (canonical), legacy company/agency invites, email-keyed membership invites — all live |
| org switching | FULL | cookie + feature-detected durable pointer (durable column migration unapplied) |
| org context propagation | FULL | single resolver `employer-company-context.ts`; org keys + `has_org_demand_access` on demand tables |
| revocation | FULL | governance revoke/leave/cancel + employment end; fail-closed re-read |
| employer workspace | FULL | chat adapter + company dashboards |
| cross-tenant isolation | PARTIAL | RLS broad and real (advisors: ZERO rls-disabled tables); gaps: `productivity_units`/`profession_templates`/`skill_icons` SELECT `using(true)` cross-tenant readable; invitations/contact-disclosure authority person-bound not org-bound; creator-bound legacy authority on `finance_records` etc. |

## WORK

| Item | Status | Key evidence |
|---|---|---|
| inquiry/demand intake | FULL | `submit_demand_request_v2` + status-transition trigger + org stamp; e2e |
| job/opportunity lifecycle | PARTIAL+DUPLICATE | demand row is the posting; no publish/expiry states; `job_demands` legacy DEAD store |
| engagement | FULL | booking accept mints `company_worker_engagements` atomically; end path wired; bridge fix APPLIED in prod (correction #1) |
| project | FULL | create/status/read-back + ops CSV; `set_project_status_v1` applied |
| object/site | PARTIAL | no object entity; `company_locations` UNAPPLIED so UI shows pending; project location is free text |
| task | FULL entity | `work_tasks` end-to-end; assignment SELF-ONLY (no assign-to-other) |
| stage | FULL | `project_stages` 3 RPCs + Gantt + calendar feed |
| assignment | FULL (project) / PARTIAL (task) | `assign_worker_to_project` gate + UI + tests |
| scheduling | PARTIAL | no shift/roster entity; bands = absences/bookings/stages/due-dates |
| capacity | PARTIAL | rich deterministic model (8 gap types), rendered; ZERO persistence |
| workload | MISSING | zero matches repo-wide |
| workforce planning | PARTIAL | full compute pipeline → planning page; the "human plan" payload key has NO writer |
| calendar | PARTIAL | projection over 8 sources + real conflict detection; read-only by construction, no calendar entity |
| journal↔project/task | PARTIAL | project auto-link only (single-assignment rule), no picker; task link absent |
| work evidence | FULL | photos + confirmations + tier ladder + handover passport (experience domain live in prod — correction #2) |
| timesheet | MISSING | zero timesheet/time_entry machinery; only `journal_entry_work_items.hours_numeric`; exports carry no hours |

## EMPLOYEE LIFECYCLE

| Item | Status | Key evidence |
|---|---|---|
| recruitment | FULL (DUPLICATE substrate) | demand→shortlist→booking pipeline; stage derived at read time over 6 status stores |
| offer | FULL (+1 DEAD dup) | booking propose/respond/withdraw atomic; `agency_candidate_offers` applied but ZERO app callers |
| onboarding | PARTIAL | project readiness checklists only; no employment onboarding entity/templates |
| employment records | PARTIAL (TRIPLE DUPLICATE) | `company_worker_engagements` minted only via booking accept; no direct hire path; no position/pay/FTE; 3 parallel models incl. roster + engagement_contexts |
| probation | DEAD | only a descriptive vacancy field |
| leave/absence | FULL (no balances) | request→approve/reject→cancel + notifications; A1 predicate fix APPLIED in prod; balances/accrual ABSENT |
| employee requests | MISSING | no generic employee→employer request entity |
| changes | MISSING | no position/salary/contract change machinery |
| offboarding | MISSING | membership end/revoke exists; no checklist/asset-return linkage |
| termination | PARTIAL | engagement end status flip; no reason/type/notice/effective-date |
| approval chains | MISSING (engine) | every approval = hardcoded single-actor predicate in one RPC; NO chain/delegation/escalation anywhere |
| lifecycle notifications | FULL (3 domains) | durable `notification_events` + emitters + feed + mark-read; booking/absence/engagement types only |

## DOCUMENTS / LEGAL

| Item | Status | Key evidence |
|---|---|---|
| documents (files) | PARTIAL | metadata inventory only; `file_path` DEAD column, no storage bucket, honest UI note |
| document metadata | FULL | `upsert_worker_document` + append-only events + read-back + browser write-proof |
| versions | MISSING | in-place upsert; events capture status-only before/after |
| classification | FULL | `document_types` registry (12 slugs, 3 categories), FK-enforced |
| access control | FULL | RLS own-or-admin; writes RPC-only; org sees consent-gated aggregates only |
| acknowledgement | MISSING | zero machinery |
| retention | MISSING | AI-logs only; worker docs appear just in privacy export/deletion projections |
| document register | PARTIAL | worker register FULL; org side counts-only (by privacy design); admin queue exists |
| correspondence | MISSING | chat ≠ register |
| employment contracts | MISSING | slug on worker_documents only; `contracts` table is B2B commercial |
| amendments | MISSING | no history rows for contracts |
| termination docs | MISSING | — |
| general contracts (B2B) | FULL | `contracts` + 3 RPCs + register UI + honest no-signature disclaimer; anon-authz fix APPLIED in prod (correction #4) |
| parties model | PARTIAL/DEAD | free-text column read but never written by UI |
| contract register | FULL | owner-scoped list, honest degradation |
| approval flow (docs) | BROKEN chain | admin verify wired; worker-side `request_worker_document_verification` RPC applied in prod but ZERO callers — queue can never fill from workers |
| signature | MISSING | explicitly and honestly disclaimed in UI |
| expiry/reminders | PARTIAL | 30-day derivation wired; NO reminder/notification type exists |

## OPERATIONS

| Item | Status | Key evidence |
|---|---|---|
| tasks | FULL | `work_tasks` (see WORK) |
| approvals | PARTIAL | per-domain approvals real; no unified queue/entity |
| business trips | MISSING | zero machinery |
| expenses | FULL (manual) | `finance_records` + status + CSV; no OCR/receipts by design |
| invoices | FULL register / PARTIAL handling | invoice_received + due/overdue derived; no attachments/OCR/routing |
| procurement | MISSING | zero machinery |
| assets/inventory | FULL (durable assets) | issue→acknowledge→transfer→return, 5 RPCs, role-aware UI; no stock counts |
| training | PARTIAL | self-declared courses/certs only; repo honestly states "no training surface" |
| tests/assessments | MISSING | deliberate: skill truth = evidence + confirmation |
| certifications | PARTIAL | 2 registry slugs with expiry derivation + admin verification; no general register |
| performance | MISSING | deliberate doctrine ("record count, never a competence score") |
| management decisions | MISSING | nav guard actively excludes it |
| billing/payments | PARTIAL, gated | Stripe TEST-only end-to-end, `PAYMENTS_ENABLED=false`; portal endpoint DEAD (no UI caller); LMC ledger schema DEAD app-side (zero readers/writers, 6 false flags) |

## AI

| Item | Status | Key evidence |
|---|---|---|
| chat-first workspace | PARTIAL | real 2100-line chat UI over real data; deterministic intent router; ZERO model calls in any turn today |
| context awareness | PARTIAL | rich `loadAiWorkspaceContext`; never serialized into prompts (data-minimisation by policy) |
| document understanding | DEAD | `document_assistant` agent registered, zero callers; CV extract is deterministic |
| inquiry understanding | PARTIAL | deterministic structuring shipped; AI variant wired but disabled |
| matching explanation | PARTIAL | deterministic score/dimensions; AI prose fork FROZEN/deprecated |
| workforce calculations | FULL (deterministic) | capacity/gap engine hard-pinned to deterministic tier, cannot invoke a model |
| forecasts | DEAD | claim-type label only |
| simulation | DEAD | sandbox stub only |
| action generation | PARTIAL | 5 AI draft surfaces (journal, CV, company-need, worker intake, match preview), all human-confirm, all currently `disabled` |
| audit/budget boundaries | PARTIAL | append-only `ai_runs` + `usage_cost_events` + daily budget + cost ceiling + privacy veto; GAPS: journal/CV AI actions lack auth check + rate limit; public company-need AI call runs outside the rate limiter |
| provider chain | FULL (code), OFF (config) | local→gemini→anthropic→openai→xai, real adapters; `AI_PROVIDER_MODE=disabled` in prod (ai_runs=0 rows) |

## Cross-cutting conclusions

1. **The strongest engines already exist and must be reused**: RPC+RLS
   authority pattern, notification_events spine, `worker_documents`
   registry + append-only events, `work_tasks`, evidence tier ladder,
   `finance_records`, assets lifecycle. No new parallel domain models.
2. **The single biggest architectural gap vs Vecticum**: no generic
   Workflow & Approval engine (chains/delegation/escalation) and no
   Document file storage/acknowledgement layer.
3. **Duplication debt to consolidate, not extend**: 3 invitation systems,
   2 membership truths, 3 employment-record models, 6 candidate-stage
   stores, 2 dead stores (`job_demands`, `candidate_skills`).
4. **Dead code to remove or wire**: `request_worker_document_verification`
   (wire it — completes an existing approval chain), `agency_candidate_offers`,
   `talent_source_records`, LMC app layer, `worker_skills.self_rated_level`,
   billing portal route.
5. **Security posture is strong** (0 RLS-disabled tables, applied authz
   fixes) with named exceptions: SECURITY DEFINER view
   `worker_absence_scheduling` (the one ERROR advisor), cross-tenant
   `using(true)` reads on 3 registry tables, missing auth/rate-limit on 2
   AI server actions + 1 public AI trigger.
