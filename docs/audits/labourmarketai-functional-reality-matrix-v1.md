# Labourmarket.ai — Functional Reality Matrix v1

**Date:** 2026-07-22
**Repo:** `C:\Users\Mano\Documents\labourmarketai`, branch `main`, HEAD `664b9ab9fe75887cee8bcfd5917d671239df11f5` (clean tree)
**Production:** https://labourmarket.ai (live; `/` → 307 → `/lt` 200, `/lt/dashboard` → 307 auth redirect, `/questions-sitemap.xml` 200 — probed 2026-07-22)
**Supabase prod:** project ref `gorgitwvdzxbnaxhrsrw` ("labourmarket.ai", ACTIVE_HEALTHY, eu-west-1)
**Audit loop:** 3 of a full product audit — Functional Reality Matrix
**Mode:** READ-ONLY. No source file modified, no migration applied, no production data mutated. All SQL was `SELECT`-only via Supabase MCP `execute_sql`.

---

## 1. Method and what "evidence" means here

Five independent evidence axes were collected for every feature. A feature is only called VERIFIED when **all five** line up.

| Axis | How it was established | What it does *not* prove |
|---|---|---|
| **Visible in UI** | The `page.tsx` exists AND something links to it: `apps/web/lib/config/navigation.ts` (primary tabs), `apps/web/lib/dashboard/dashboard-module-registry.ts` (control-room grid), `apps/web/lib/navigation/command-registry.ts` (command finder), or an in-page `Link href`. Reachability cross-checked against `apps/web/lib/guards/route-truth-map.test.ts:23-175`. | That the page does anything |
| **Exists in code** | The concrete server action / lib module that performs the **write**, named with `file:line`. | That the write can succeed |
| **E2E path** | The write path names a concrete table or RPC, and that object is present in prod. | That anyone ever used it |
| **Prod-backed** | Direct `information_schema.tables` / `information_schema.columns` / `pg_proc` reads on `gorgitwvdzxbnaxhrsrw`, **plus real row counts** (prod is pilot-scale). | Nothing — this is the hardest evidence available |
| **Tests** | Named test file(s). Treated as *documentation of intent*, never as proof of function. | That the feature works in prod |

**Row counts are the decisive signal.** This platform ships an unusually disciplined "honest degradation" layer (every read/write classifies `42P01`/`PGRST205`/`42883`/`PGRST202`/`42703` into a `needs-migration` / `{applied:false}` state instead of crashing). That means *a feature can be fully coded, fully tested, prod-backed, linked in nav — and still have produced exactly zero rows in production*. Those cases are marked **PARTIAL (never exercised)**, not VERIFIED.

### Status vocabulary

| Status | Meaning |
|---|---|
| `VERIFIED` | UI reachable + write path exists + DB object applied in prod + **real prod rows created by the product path** |
| `PARTIAL` | End-to-end path is complete and prod-backed, but the feature is unexercised (0 rows), or a named sub-part is blocked |
| `UI_ONLY` | Page renders, but the data is fixture/sample or there is no write path |
| `CODE_ONLY` | Module + DB objects exist; no reachable UI consumes them |
| `BROKEN` | A user-reachable path that cannot succeed in production |
| `FLAGGED_OFF` | Deliberately disabled by env, literal flag, or an unapplied owner-gated migration |
| `UNKNOWN` | Not verifiable from repo + read-only prod access |

### Production scale baseline (SQL, 2026-07-22)

```
profiles 27 (20 onboarded, 9 created in last 30d)   profile_roles: worker 25, company 7, agency 4, customer 2, admin 1
workers 27        organizations 9 (company 6, agency 3, team 0)      companies 6      agencies 3
journal_entries 32 (5 distinct authors, 15 in last 30d)   journal_entry_metrics 82   journal_entry_skills 26
journal_entry_confirmations 12   journal_entry_photos 8   worker_skills 33 (2 verified)   profile_skill_claims 27
customer_requests 17 (submitted 11, draft 4, closed 2)    demand_interest_signals 4   demand_shortlist 1
conversations 2   conversation_messages 16 (12 in last 30d)   conversation_participants 3
engagement_contexts 39   company_workers 3   company_worker_invitations 4   projects 5
project_worker_assignments 1   project_handover_entries 1   service_offerings 2   service_offering_requests 1
worker_languages 5   worker_education 2   worker_achievements 1   pilot_events 224
market_intelligence_observations 76 (all source_key='eurostat')   market_intelligence_sources 7
audit_logs 31   countries 10   professions 49   skills 153   esco_labels 1,045,186
```

**Zero-row tables that are fully applied and fully coded** (the honesty gap in numeric form):
`booking_requests`, `booking_request_events`, `booking_requests_seen`, `work_tasks`, `finance_records`, `assets`, `asset_assignments`, `proposals`, `contracts`, `defects`, `defect_corrections`, `project_stages`, `project_budgets`, `marketplace_listings`, `worker_absences`, `worker_documents`, `worker_saved_opportunities`, `contact_disclosure_requests`, `team_details`, `team_enquiries`, `pilots`, `pilot_participants`, `pilot_outcomes`, `invitations`, `matches`, `match_actions`, `job_demands`, `billing_customers`, `billing_subscriptions`, `payment_webhook_events`, `subscriptions`, `customers`, `leads`, `learning_review_queue`, `learning_signals`, `lmc_accounts`/`lmc_lots`/`lmc_transactions`, `personal_data_disclosures`, `market_rate_averages`, `platform_skill_aggregates`.

---

## 2. The matrix

Legend for **Prod-backed**: `applied+rows N` = DB object present and N real rows; `applied+0` = object present, never used; `ABSENT` = object confirmed missing from prod.

### 2.1 Worker side

| Feature | Route(s) | Code module (write path) | E2E path | Prod-backed | Tests | Status | Evidence |
|---|---|---|---|---|---|---|---|
| Work journal — create / edit / supersede / soft-delete / restore | `/dashboard/journal` (primary nav tab) | `apps/web/lib/journal/actions.ts:414` `create_journal_entry_full`; `:700` `journal_entry_supersede_v2`; `:909` `journal_entry_soft_delete`; `:961` `journal_entry_restore` | RPC → `journal_entries` + `journal_entry_metrics` atomically | applied + **32 entries / 82 metrics / 5 authors / 15 in last 30d** | `journal-atomic-supersede.test.ts`, `journal-delete-honesty.test.ts`, `journal-compact-edit.test.ts`, e2e `journal.spec.ts` | **VERIFIED** — the single most-exercised feature on the platform. Primary nav tab (`lib/config/navigation.ts:66`, `feature-availability.ts:128-134`) |
| Journal photos | `/dashboard/journal` | `apps/web/lib/journal/photo-upload.ts:60` bucket `journal-entry-photos` → `:71` RPC `register_journal_entry_photo` | storage + `journal_entry_photos` | applied + **8 photos** | `journal-photo-continuity.test.ts` | **VERIFIED** |
| Journal → skill recognition | `/dashboard/journal` (pipeline runs on save) | `apps/web/lib/journal/skill-pipeline.ts:500` upsert `worker_skills`; `:521` `journal_entry_skills`; `:595` `profile_skill_claims` | direct DML (RLS-scoped) | applied + **26 entry-skill links / 33 worker_skills / 27 claims** | `journal-pipeline-canonical.test.ts`, `skill-pipeline.test.ts`, `journal-entry-skill-links.test.ts` | **VERIFIED** |
| Manager confirmation → **verified** skill | `/dashboard/inbox`, `/dashboard/inbox/quick` | `apps/web/lib/journal/review-actions.ts:78` RPC `review_journal_entry`; `apps/web/lib/operations/org-membership.ts:115` RPC `confirm_entry_and_verify_skills` | `journal_entry_confirmations` + `worker_skills.verified` | applied + **12 confirmations, `audit_logs` shows `review_journal_entry:10` + `confirm_entry_and_verify_skills:2`, but only 2 verified skills** | `manager-review-rpc.test.ts`, `journal-review-enable-rpc.test.ts`, e2e `journal-confirm-loop.spec.ts` | **VERIFIED (thin)** — the core trust loop works but has fired twice in production |
| Batch journal review | `/dashboard/inbox` | RPC `review_journal_entries_batch` + `batch_review_exceptions` (both in `pg_proc`) | `journal_entry_confirmations` | applied + 0 batch rows (no batch audit row in `audit_logs`) | — | **PARTIAL (never exercised)** |
| Voice journal | `/dashboard/journal/voice` (one inbound link: `journal/page.tsx:709`) | `apps/web/lib/voice/transcribe-action.ts:115` → self-hosted `services/transcribe` whisper.cpp; transcript handed to composer via sessionStorage, **no DB write of its own** | `VOICE_TRANSCRIBE_URL` + `VOICE_TRANSCRIBE_TOKEN`, both optional (`apps/web/lib/env.ts:107,151`) | service URL not set in checked-in env → `{status:"unavailable"}` (`transcribe-action.ts:96`) | `voice-work-journal.test.ts` | **FLAGGED_OFF** — real code, real service in-repo, unconfigured. Honest `unavailable` state |
| Worker profile — professions / curated skills | `/dashboard/profile` | `apps/web/lib/worker/actions.ts:14,78,97` direct DML on `worker_professions`; `apps/web/app/api/workers/[workerId]/skills/route.ts:61,135,147` on `worker_skills` | direct DML | applied + **14 worker_professions / 33 worker_skills** | `profile-loop-audit.test.ts`, e2e `profile-text-skills-smoke.spec.ts` | **VERIFIED** |
| Worker languages | `/dashboard/profile` (`page.tsx:815`) | `apps/web/lib/worker/worker-languages-actions.ts:76` RPC `save_worker_language_v1` | `worker_languages` | applied + **5 rows** | `worker-languages-migration.test.ts` | **VERIFIED** |
| Worker preferences v2 (pay basis, shifts, licences, vehicle, tools) | `/dashboard/profile` (`page.tsx:742`) | `apps/web/lib/worker/availability-prefs-actions.ts:122` RPC `save_worker_availability_prefs_v2`, v1 fallback `:145` | 7 nullable columns on `workers` | applied + not separately countable | `worker-availability-prefs.test.ts` | **PARTIAL** — applied and reachable; usage not distinguishable from NULL defaults |
| Worker education / achievements | `/dashboard/profile` (`page.tsx:844,850`) | `apps/web/lib/worker/worker-education-actions.ts:80`; `worker-achievements-actions.ts:68` direct DML | `worker_education`, `worker_achievements` | applied + **2 / 1 rows** | `worker-education-model.test.ts` | **VERIFIED (thin)** |
| Self-declared work history | reachable **only** via CV-import review panel | `apps/web/lib/profile/cv-section-import-actions.ts:107` RPC `save_self_declared_work_history_v1` | `engagement_contexts` (org_id always NULL) | applied + `engagement_contexts` 39 rows (mix of real + self-declared, not separable read-only) | `cv-sections.test.ts` | **PARTIAL** — no standalone editor; only lights up if the user uploads a CV |
| Worker external profiles (LinkedIn/GitHub/portfolio) | `/dashboard/profile` (`page.tsx:864`) | `apps/web/lib/worker/external-profiles-actions.ts:87` RPC `save_worker_external_profile_v1` | `worker_external_profiles` | **ABSENT from prod** (`20260713210000_multi_source_talent_v1` unapplied) | `external-profiles-consent.test.ts` | **FLAGGED_OFF** — section permanently renders `needs_migration` (`external-profiles-section.tsx:217`) |
| CV upload / text extraction | `/dashboard/profile` → `/api/cv/extract` | `apps/web/app/api/cv/extract/route.ts:21` → `apps/web/lib/cv/extract.ts:93` (unpdf / mammoth) | **stores nothing** by design (`route.ts:13`) | n/a (stateless) | `extract.test.ts`, `structured-parse.test.ts`, e2e `cv-upload-authenticated.spec.ts` | **VERIFIED** |
| CV structured import → profile writes | `/dashboard/profile` | `apps/web/lib/profile/cv-section-import-actions.ts` (work history / education / languages / achievements / work card / prefs) | 6 different RPCs + tables | all applied | `structuring/cv-upload-truth.test.ts` | **PARTIAL** — deterministic parser only; **AI structuring is off** (`cv-ai-structuring-actions.ts:23,30` require `AI_PROVIDER_MODE=live`) |
| Verified CV export | `/cv` | `apps/web/lib/cv-export/verified-cv.ts:152-420` (read-only composition over 14 tables) | read-only | applied | `verified-cv-honesty.test.ts`, `cv-sections.test.ts`, e2e `quick-confirm-cv-export.spec.ts` | **VERIFIED** |
| Personal gallery | `/dashboard/gallery` (**one** inbound link: `profile/page.tsx:474`) | none — read-only projection of `journal_entry_photos` (`apps/web/lib/journal/personal-gallery.ts:82`) | read-only | applied + 8 photos | `journal-modes-gallery.test.ts` | **VERIFIED (near-orphan)** |
| Worker documents centre | `/dashboard/documents` | **CORRECTED 2026-08-21 — a write path exists.** `WorkerDocumentForm` (rendered at `documents/page.tsx:615`) posts to `lib/documents/document-actions.ts:40` → RPC `upsert_worker_document`, with `request_worker_document_verification` beside it. Both are SECURITY DEFINER in production, EXECUTE granted to `authenticated`, denied to `anon` (verified 2026-08-21). The old "every reference is a `select`" reading came from `document-centre.ts:46`, which is accurate about THAT module — the writes live in `document-actions.ts`, which the audit did not read. | `worker_documents` | applied + **0 rows — unused, NOT unreachable** | `documents-readiness.test.ts`, `document-centre.test.ts` | **IMPLEMENTED_NOT_YET_USED** — the facts-about-a-document half is reachable; FILE upload (bucket + object) is still absent and the page stays honest about that (`uploadNote`) |
| Absences / leave | `/dashboard/absences` (module registry `:378`) | `apps/web/lib/leave/absences-actions.ts:75,101,120` RPCs request/review/cancel | `worker_absences` | applied (2026-07-18) + **0 rows** | `leave-absence.test.ts` | **PARTIAL (never exercised)** |
| Privacy self-service (consent, export, deletion request) | `/dashboard/privacy` + `/dashboard/privacy/export` | `apps/web/lib/privacy/discoverability-actions.ts:103,131`; `actions.ts:53` `submit_privacy_request_v1`; export `lib/privacy/export-data.ts:49` | `privacy_consent_events`, `personal_data_disclosures`, `customer_requests` | applied + **1 consent event, 0 disclosures, 2 consent purposes (v2)** | `privacy-self-service.test.ts`, `consent-fail-closed.test.ts` | **VERIFIED (thin)** — one real consent grant exists |
| Contact disclosure requests (employer asks worker for details) | ask on `/dashboard/company/scouting:718`; respond on `/dashboard/privacy` | `apps/web/lib/privacy/contact-disclosure-actions.ts:175,270,321,375` | `contact_disclosure_requests` + events | applied + **0 rows** | `contact-disclosure-requests-migration.test.ts` | **PARTIAL (never exercised)** |
| Worker opportunity board | `/dashboard/opportunities` (module registry `:168`) | read-only via RPC `list_open_demand_for_workers` (`lib/opportunities/load-worker-opportunities.ts:149`) | `customer_requests` projection | applied + **11 submitted demands to project** | `worker-opportunities.test.ts`, `worker-opportunity-board.test.ts` | **VERIFIED** |
| Save an opportunity (bookmark) — internal demand | `/dashboard/opportunities` | `apps/web/lib/opportunities/saved-opportunities.ts` RPC `save_worker_opportunity_v1` | `worker_saved_opportunities` | applied + **0 rows** | `saved-compare-recent.test.ts` | **PARTIAL (never exercised)** |
| Save a PUBLIC VACANCY (bookmark) — **ADDED 2026-08-19** | `/jobs/[id]` (save) · `/jobs?saved=1` (retrieve) | `apps/web/lib/opportunities/saved-opportunities.ts` RPCs `save_worker_public_vacancy_v1` / `unsave_worker_public_vacancy_v1` | `worker_saved_opportunities.public_vacancy_id` (same table — one concept, two sources) | applied to prod 2026-08-19 (ledger `20260819100000`, owner-approved RED) + **0 real rows** (probe rows removed) | `private-bookmark-boundary.test.ts` | **IMPLEMENTED_NOT_PROVEN** — DB_PROVEN by production read-back (save / duplicate / expired-refused / anon-refused / unsave; worker A sees 1, worker B sees 0); no real user has saved yet |
| "New job matches" badge / seen markers | `/dashboard` card + spine signal | `apps/web/lib/opportunities/seen.ts:113` RPC `mark_worker_opportunities_seen_v1` | `worker_opportunity_seen` | **ABSENT from prod** (`20260714170000` unapplied) | `job-recommendations.test.ts` | **FLAGGED_OFF** — write silently no-ops; the badge on `dashboard-module-registry.ts:181` can never light up |
| Express interest in a demand | `/dashboard/opportunities` | `apps/web/lib/opportunities/interest.ts:116,149,190` direct DML | `demand_interest_signals` | applied + **4 rows** | `worker-interest-signal.test.ts` | **VERIFIED (thin)** |
| Interest-response notification | (deferred by design) | `lib/notifications/spine-signals.ts` explicitly defers the signal | `demand_interest_seen` | **ABSENT from prod** (`20260717150000` unapplied) | `canonical-ideas-integration.test.ts` | **FLAGGED_OFF** |
| Journal profession templates (composer scaffolds) | `/dashboard/journal` composer | `apps/web/lib/journal/journal-templates.ts` | `journal_profession_templates` | **ABSENT from prod** (`20260714180000` unapplied) | `journal-proof-engine.test.ts` | **FLAGGED_OFF** — composer offers no picker (honest absence) |
| Learning / auto-confirmation policy | `/dashboard/learning` | `apps/web/lib/learning/learning.ts:178,262,308` RPCs | `learning_review_queue`, `learning_policy_settings` | applied (2026-07-21) + **0 / 0 rows** | 8 `learning-*.test.ts` guards | **PARTIAL + orphaned** — zero inbound links, guard-enforced (`preview-surfaces-unlinked.test.ts:36-47`) |
| Player card | `/dashboard/player-card` | pure redirect → `/dashboard/journal` (`player-card/page.tsx:16`) | — | n/a | `player-card-honesty.test.ts` | **REDIRECT_STUB** — the real card renders inside `/dashboard/journal` |
| Onboarding | `/onboarding` | `apps/web/lib/auth/actions.ts:74` RPC `complete_onboarding`, `:96` `add_role` | `profiles`, `profile_roles` | applied + **20/27 profiles onboarded, 39 role rows** | `first-use-ux.test.ts`, e2e `auth.spec.ts` | **VERIFIED** |

### 2.2 Employer / company / agency side

| Feature | Route(s) | Code module (write path) | E2E path | Prod-backed | Tests | Status | Evidence |
|---|---|---|---|---|---|---|---|
| Company setup | `/dashboard/start/company` | `apps/web/lib/company/company-setup.ts:250` RPC `save_company_setup_v2` (v1 fallback `:261`) | `companies` → mirror trigger → `organizations` | applied + **6 companies / 9 orgs** | `wagon4-setup-journey.test.ts`, `company-role-simplicity.test.ts` | **VERIFIED** |
| Company workspace | `/dashboard/company` (module registry `:391`) | composition + sub-sections below | multiple | applied | `company-architecture-v1.test.ts` | **VERIFIED** |
| Company operating locations | `/dashboard/company` (`page.tsx:1041`) | `apps/web/lib/company/company-locations-actions.ts:40,67` | `company_locations` | **ABSENT from prod** (`20260713120000` unapplied) | `production-ux-repair-v2.test.ts:184` | **FLAGGED_OFF** — panel renders "prepared, activation pending" (`company-locations-section.tsx:74`) |
| Agency client CRM + demand→client link | `/dashboard/company` (`page.tsx:784`, staffing agencies only) | `apps/web/lib/agency/clients-actions.ts:48,73,98` | `agency_clients` + `customer_requests.agency_client_id` | **ABSENT from prod** — table missing AND column count = 0 (verified by `information_schema.columns`) | `agency-client-management.test.ts` | **FLAGGED_OFF** |
| Multi-company switching | header switcher | `apps/web/lib/company/active-organization.ts` | `profiles.active_organization_id` + `relationship_types.viewer` | **ABSENT** — `profiles` has 15 columns, none named `active_organization_id`; `relationship_types` slugs are `owner,employee,manager,consultant,collaborator,freelancer,unemployed,student,volunteer` (no `viewer`) | `company-architecture-v1.test.ts` | **FLAGGED_OFF** — falls back to single-company behaviour |
| Dashboard card preferences (server-side) | `/dashboard` grid | server action → `dashboard_preferences` | `dashboard_preferences` | **ABSENT from prod** (`20260714211000` unapplied) | `company-architecture-v1.test.ts` | **FLAGGED_OFF** — silently falls back to device-local `localStorage` |
| Company workers / roles / journal-review grant | `/dashboard/company` | `apps/web/lib/company/company-workers.ts:224` `invite_company_worker`, `:281` `assign_company_worker_role` | `company_workers`, `company_worker_invitations`, `engagement_contexts` | applied + **3 workers / 4 invitations / 39 engagements**; `audit_logs`: `assign_company_worker_role:5`, `accept_company_worker_invitation:3`, `add_org_member:4`, `set_engagement_journal_review:4` | `company-worker-management-clarity.test.ts` | **VERIFIED** — this is the *legacy* invite path and it is the one actually in use |
| Canonical invitations (7 types, token-hash, single-use) | `/dashboard/network`, `/invite/[token]` | `apps/web/lib/invitations/actions.ts:121,286,345,389` | `invitations` | applied 2026-07-12 + **0 rows** | `invitations-network.test.ts` | **PARTIAL (never exercised)** — the canonical model has never been used; the legacy `company_worker_invitations` path carries all 4 real invitations |
| Invitation **email delivery** | same | `apps/web/lib/email/transactional.ts:38-56,64,78` (Resend / Postmark) | requires `INVITE_EMAIL_PROVIDER` + `INVITE_EMAIL_API_KEY` + `INVITE_EMAIL_FROM` | unset (`.env.example:95-97` ships empty) → `{status:"not_configured"}` | — | **FLAGGED_OFF** — invitations are a **manual link-share** feature; `delivery_status` is permanently `not_sent` (honestly rendered, `invitation-list.tsx:129`) |
| Demand posting (draft + submit) | `/dashboard/company`, `/dashboard/buyer` | `apps/web/lib/demand/demand-drafts.ts:209` `save_demand_draft`; `demand-request.ts:287` `submit_demand_request` | `customer_requests` | applied + **17 rows (11 submitted / 4 draft / 2 closed)** | `demand-intake-migration.test.ts`, e2e `demand-flow.spec.ts` | **VERIFIED** |
| Public anonymous company-need intake | `/[locale]/company-need` | `apps/web/lib/staffing/company-need-public-intake.ts:72` RPC `submit_company_need_public_v1` (anon client) | `company_need_public_intakes` | applied + **1 real intake** | `company-need-public-intake.test.ts` | **VERIFIED (thin)** |
| Scouting / shortlist | `/dashboard/company/scouting` | `apps/web/lib/scouting/scouting.ts:232,335,365` direct DML | `demand_shortlist`, `demand_interest_signals` | applied + **1 shortlist row / 4 interest signals** | `company-scouting-visibility.test.ts` | **VERIFIED (thin)** |
| Projects — create, assign workers | `/dashboard/projects`, `/dashboard/projects/[id]` | `apps/web/lib/projects/actions.ts:65,99,124` (+ RPCs `assign_worker_to_project`, `end_worker_project_assignment`) | `projects`, `project_worker_assignments` | applied + **5 projects / 1 assignment** | `f4-assignment-migration.test.ts`, `f4-assignment-ui.test.ts` | **VERIFIED (thin)** |
| Project stages (Gantt sub-phases) | `/dashboard/projects/[id]/operations:319` | `apps/web/lib/projects/stages-actions.ts:74,107,129` | `project_stages` | applied 2026-07-18 + **0 rows** | `project-stages.test.ts`, `project-stage-gantt.test.ts` | **PARTIAL (never exercised)** |
| Project budgets | `/dashboard/projects/[id]/operations:329` | `apps/web/lib/economics/economics-actions.ts:18-20` | `project_budgets` | applied + **0 rows** | `project-economics.test.ts` (migration + read model only — never touches the panel) | **PARTIAL (never exercised)** |
| Defects / corrections (quality) | **no dedicated route**; panel only at `/dashboard/projects/[id]/operations:354` | `apps/web/lib/quality/quality-actions.ts:73,96,115,130` | `defects`, `defect_corrections` | applied + **0 / 0 rows** | `delivery-quality.test.ts` | **PARTIAL (never exercised) + no index route** — there is no cross-project defect list anywhere in `apps/web` |
| Project handover passport | `/dashboard/projects/[id]/operations:441` | `apps/web/lib/projects/handover-passport-actions.ts` | `project_handover_entries` | applied + **1 row** | `handover-passport-shell.test.ts` | **VERIFIED (thin)** |
| Project operations CSV report | `/dashboard/projects/[id]/operations/report` | route handler over `getProjectOperations` | read-only | applied | `lib/projects/operations-report.test.ts` | **VERIFIED** (no `needs-migration` branch, unlike its finance sibling) |
| Work tasks | `/dashboard/tasks` (module registry `:185`) | `apps/web/lib/tasks/task-actions.ts:147,176,211` | `work_tasks` | applied 2026-07-11 + **0 rows** | `work-tasks.test.ts` | **PARTIAL (never exercised)** |
| Finance records + CSV export | `/dashboard/finance` (+ `/export`) | `apps/web/lib/finance/finance-actions.ts` → `create/update/set_finance_record_status_v1` | `finance_records` | applied 2026-07-11 + **0 rows** | `finance-records.test.ts` | **PARTIAL (never exercised)** — export route returns honest 503 `needs_migration` (`finance/export/route.ts:26`) |
| Assets & logistics | `/dashboard/assets` (module registry `:363`) | `apps/web/lib/assets/assets-actions.ts:75,101,117,136,157` | `assets`, `asset_assignments` | applied 2026-07-18 + **0 / 0 rows** | `assets-logistics.test.ts` only — **no page-level or e2e test** | **PARTIAL (never exercised)** |
| Commercial CRM (proposals / contracts) | `/dashboard/commercial` (module registry `:348`) | `apps/web/lib/commercial/commercial-actions.ts:60,81,95,113,135,148` | `proposals`, `contracts` | applied 2026-07-18 + **0 / 0 rows** | `commercial-crm.test.ts` only — **no page-level or e2e test** | **PARTIAL (never exercised)** |
| Bookings (propose / respond / reschedule / deadline) | `/dashboard/bookings` (module registry `:200`) | `apps/web/lib/booking/booking-actions.ts:149` v3 → v1 fallback; `:189,239,289,320` | `booking_requests`, `booking_request_events`, `booking_requests_seen` | applied + **0 / 0 / 0 rows** | `booking-lifecycle.test.ts`, `booking-honesty.test.ts`, `booking-visibility-honest.test.ts` | **PARTIAL (never exercised)** — the richest degradation code in the repo, guarding a feature nobody has used |
| Service offerings | `/dashboard/services` (module registry `:273`) | `apps/web/lib/services/service-offerings.ts:143,170,197,220` direct DML | `service_offerings` | applied + **2 rows** | `service-offerings-publish-funnel.test.ts` | **VERIFIED (thin)** |
| Service requests | `/dashboard/service-requests` (module registry `:282`) | `apps/web/lib/marketplace/service-requests.ts:196,224,243` RPCs | `service_offering_requests` | applied + **1 row** | `marketplace-honest-degradation.test.ts` | **VERIFIED (thin)** |
| Marketplace listings (accommodation / tools / vehicles) | `/dashboard/listings` (module registry `:296`) | `apps/web/lib/marketplace/listings.ts:172,204,233,254` | `marketplace_listings` | applied 2026-07-19 + **0 rows** | `marketplace-listings.test.ts` | **PARTIAL (never exercised)** |
| Teams / brigades | `/dashboard/company:1006` (create + details + enquiry inbox); requester side on `/dashboard/network:238` | `apps/web/lib/company/team-brigade-actions.ts:40,141,196`; `team-enquiry-actions.ts:57,114` | `create_team_v1`, `team_details`, `team_enquiries` | all applied + **`organizations` has 0 rows with `organization_type='team'`; `team_details` 0; `team_enquiries` 0** | `team-brigades-layer.test.ts`, `trust-connect-minimum.test.ts` | **PARTIAL (never exercised)** |
| Candidate drafts (agency) | `/dashboard/candidates` | `apps/web/lib/candidates/actions.ts:71,126,147` direct DML | `candidate_drafts` | applied + **2 rows** | `candidate-provider-draft.test.ts` | **VERIFIED (thin)** |
| Person detail | `/dashboard/people/[workerId]` (only linked from `company-workers-section.tsx:220,234`) | read-only, fail-closed via `can_view_worker` | `workers`, `worker_skills` | applied | `production-ux-repair-v2.test.ts` | **VERIFIED (orphaned from nav)** |
| Agency workspace | `/dashboard/agency`, `/dashboard/agency/pool` | redirect stubs (`agency/page.tsx:28`, `agency/pool/page.tsx:19`) | — | n/a | `agency-direction-a.test.ts` | **REDIRECT_STUB** — agency = `company_type='staffing_agency'` inside `/dashboard/company` |
| Talent pool preview | `/dashboard/talent` | none — hard-coded `SAMPLE_WORKERS` (`talent/page.tsx:32`) | — | n/a | `preview-surfaces-unlinked.test.ts:44` | **UI_ONLY** — superadmin-only fixture surface, zero inbound links (guard-enforced) |
| Visual OS preview | `/dashboard/visual-os`, `/dashboard/visual-os/agency` | none — `SAMPLE_WORKERS`/`SAMPLE_JOBS` all prefixed `"Sample · "`, counts render `"0 · Preview"` (`visual-os/page.tsx:23-90`) | — | n/a | `preview-surfaces-unlinked.test.ts` | **UI_ONLY** — labelled preview, superadmin-gated |

### 2.3 Cross-cutting

| Feature | Route(s) | Code module | E2E path | Prod-backed | Tests | Status | Evidence |
|---|---|---|---|---|---|---|---|
| Messaging (conversations) | `/dashboard/communication` (primary nav tab), `/[conversationId]` | `apps/web/lib/communication/actions.ts:100,259,448,496` | `conversations`, `conversation_messages`, `conversation_participants` | applied + **2 conversations / 16 messages (12 in last 30d) / 3 participants** | `communication-migration-0021.test.ts`, e2e `chat-visibility-rls.spec.ts` | **VERIFIED (thin)** |
| Message attachments | same | `actions.ts:411` RPC `register_conversation_message_attachment` | `conversation_message_attachments` + private bucket | applied + **0 rows** | `conversation-attachments.test.ts` | **PARTIAL (never exercised)** |
| **Out-of-app notification of any kind** | — | none. `sendMessage` (`actions.ts:259-442`) has no mail/push/webhook call; repo-wide grep for `web-push`/`nodemailer`/`sendgrid`/`firebase` returns only i18n strings and guards that *forbid* those imports | — | — | `notification-spine.test.ts` | **DOES NOT EXIST** — recipients learn of messages only by opening the app. The single outbound channel in the whole product is `lib/notifications/telegram-owner-alerts.ts` (owner alert on `/company-need` intake only) |
| Network / relationships | `/dashboard/network` (primary nav tab) | `apps/web/lib/invitations/network.ts` + invitation actions | `organizations`, `engagement_contexts`, `invitations` | applied + 9 orgs / 39 engagements / **0 invitations** | `invitations-network.test.ts` | **PARTIAL** — the read half is real, the invitation half has never fired |
| Deterministic fit engine (matching) | `/dashboard/opportunities`, `/dashboard/company/scouting`, `/dashboard/admin/matching` | `apps/web/lib/market/match-v1.ts` (pure, read-time, never persisted) | computed over `customer_requests` × `workers` | n/a (nothing stored by design) | 14 `matching-*` / `fit-*` guards | **VERIFIED** — real and deliberately score-free |
| Automatic two-sided matching marketplace | — | **no app code touches `matches` / `match_actions`** — grep finds them only in `0001_initial_schema.sql`, generated types, and guards | — | applied + **0 / 0 rows** | `matching-ui-neutralized.test.ts` | **FLAGGED_OFF** by design — `feature-availability.ts:262-275` marks `matching` and `marketplace` `hidden` |
| Market intelligence workspace | `/dashboard/intelligence` (module registry) | read-only `apps/web/lib/intelligence/intelligence-read.ts:126` | `market_intelligence_observations/sources/insight_queries` | applied + **76 observations, all `source_key='eurostat'`; sources: internal_platform_aggregates=on, admin_market_rate_averages=on, eurostat=on, stat_gov_lt/eures/uzt_lt/cvbankas_salary=off** | 26 `lib/intelligence/*.test.ts` | **VERIFIED** — Eurostat is a genuinely live external source with real rows |
| Eurostat import | manual script | `scripts/eurostat-import.ts` — emits JSON, **does not write to the DB**; dual kill switch `lib/eurostat-import/eurostat-kill-switch.ts:18-23` | manual owner service-role insert | 76 rows landed | `lib/eurostat-import/*.test.ts` | **PARTIAL** — real data, manual pipeline, no scheduler. `EUROSTAT_SOURCE_ENABLED`/`EUROSTAT_KILL_SWITCH` are **absent from `.env.example`** |
| Admin market rate averages | `/dashboard/admin/league`, `/dashboard/admin/market` | RPC `admin_set_market_rate_average` | `market_rate_averages` | applied + **0 rows** | `league.ts` guards | **PARTIAL (never exercised)** — the league thermometer needs n≥2 and has n=0 |
| Billing / Stripe | `/dashboard/admin/billing`, `/api/billing/test-checkout`, `/api/billing/webhook` | `apps/web/lib/billing/config-core.ts:88-98` requires `PAYMENTS_ENABLED=true` + `BILLING_PROVIDER=stripe` + `STRIPE_MODE=test` + `sk_test_…` + `whsec_…` | `billing_customers`, `billing_subscriptions`, `payment_webhook_events` | applied + **0 / 0 / 0 rows**; no `STRIPE_*` in any checked-in env; `PAYMENTS_ENABLED = false as const` (`lib/billing/plans.ts:18`) | `no-live-payments.test.ts`, `webhook-core.test.ts` | **FLAGGED_OFF** — provider resolves to `noop`, Stripe SDK never imported, live mode structurally blocked (`config-core.ts:75-84`) |
| LMC credit ledger | **no route at all** | one file: `apps/web/lib/billing/lmc-flags.ts` (67 lines). Repo-wide grep for `lmc_` in `app/`/`components/`/`lib/` hits only that file | 8 RPCs + 5 tables in prod | applied 2026-07-21 + **`lmc_settings` 6 rows, ALL `false`; every other `lmc_*` table 0 rows** | `lmc-ledger-foundation.test.ts` | **CODE_ONLY** — a fully built, fully inert DB foundation with no UI and six `false as const` kill switches |
| Public business profiles | `/[locale]/business/[slug]` | `apps/web/lib/company/public-profile.ts:54,64,65` (3 RPCs) | `organizations` + `service_offerings` + `marketplace_listings` | applied 2026-07-18 + **0 opted-in profiles** (prod probe `/lt/business/test` → 404) | `public-business-profile.test.ts` | **PARTIAL (never exercised)** — default private, 404 until a company opts in |
| Answer engine (SEO questions) | `/questions`, `/questions/[slug]`, `/questions/category/[category]`, `/questions-sitemap.xml` | static registry `content/answer-engine/question-registry.json` + `lib/answer-engine/publishing.ts` — **no Supabase client** | static | n/a; sitemap returns 200 in prod | `answer-engine-registry.test.ts`, `answer-engine-publishing.test.ts` | **VERIFIED (static)** — **550 registered questions, only ~45 have written localized answers**; unwritten ones are correctly not published |
| Labour-market country pages | `/labour-market`, `/labour-market/[country]` | `lib/labour-market/country-evidence.ts:25` — 6 countries with evidence pages, others render "coming soon" | static, source-cited | prod 200 | `country-evidence.test.ts` | **VERIFIED (static)** |
| Marketing pages (`/professions`, `/skills`, `/work-abroad`, `/work-opportunities`, `/match-preview`, `/calculators/project-cost`, `/worker-intake`, `/pricing`, `/vision`, `/about`, `/for-*`, 7 × `/legal/*`) | `/[locale]/(marketing)/*` | static registries + i18n; none opens a Supabase client | static | prod 200 | `public-seo-indexing.test.ts` | **VERIFIED (static)** |
| Reports hub | `/dashboard/reports`, `/dashboard/reports/evidence` | `apps/web/lib/reports/reports-hub.ts` — composition over caller's own RLS reads, every figure basis-labelled | read-only | applied | `universal-search-reports.test.ts` | **VERIFIED** |
| Activity centre | `/dashboard/activity` | `lib/notifications/spine.ts:35` — derived counts only, no "mark read" control by design | read-only | applied | `notification-spine.test.ts` | **VERIFIED** |
| Assist centre | `/dashboard/assist` | `apps/web/lib/assist/assist.ts` — deterministic, **no text produced by a language model** (`assist/page.tsx:10-25`) | read-only | applied | `assist-centre.test.ts` (forbids importing any AI/send SDK, `:134`) | **VERIFIED (non-generative)** |
| Work instructions | `/dashboard/instructions` | reuses conversation tables (`instructions/page.tsx:31`) + RPCs `send_work_instruction`, `send_work_instruction_to_project` | `conversations`/`conversation_messages` | applied | `work-instructions-project-scope-design-v1.md` | **PARTIAL** — cannot be separated from the 16 total messages |
| Dashboard search | `/api/dashboard-search` | `lib/search/dashboard-search.ts`, caller RLS only, no people search by design | read-only | applied | — | **VERIFIED** |
| Telemetry | `/dashboard/admin/telemetry` | append-only `pilot_events` | `pilot_events` | applied + **224 events** (`journal_edit_clicked:21`, `login_succeeded:15`, `dashboard_viewed:15`, `journal_new_skill_added:13`, …) | `activation-funnel-telemetry.test.ts` | **VERIFIED** — real behavioural data; charts deliberately excluded |
| Admin surfaces (23 pages under `/dashboard/admin/*`) | see §5 | all fail-closed behind `admin/layout.tsx:22-36` + per-page `requireSuperadmin` | real reads | applied | `route-truth-map.test.ts:114-152` | **VERIFIED** with one exception: `/dashboard/admin/agent-os` renders a **static list of 10 agent docs** (`agent-os/page.tsx:24-35`, "no live agent runtime in v1") alongside real counts |
| `/api/leads` | `/api/leads` | `app/api/leads/route.ts:44` service-role insert | `leads` | applied + **0 rows** | — | **CODE_ONLY (dormant)** — the route's own comment (`:5-12`) says the CTA was repointed to `customer_requests` |
| `/api/waitlist` | `/api/waitlist` | anon insert via RLS policy | `waitlist` | applied + **3 rows** | — | **VERIFIED (thin)** |
| `/api/auth/google` | login | Google `tokeninfo` → Supabase `signInWithIdToken` | Supabase auth | live | `google-route.test.ts` | **VERIFIED** |
| `/design`, `/design/text-first` | dev only | `notFound()` in production via `lib/env.ts:186-188` | — | n/a | — | **FLAGGED_OFF in prod** |

---

## 3. The honesty gap — UI_ONLY, CODE_ONLY, and "coded but never used"

### 3.1 UI_ONLY (a page exists; the data behind it is fixture or unwritable)

| Surface | Specific evidence |
|---|---|
| ~~`/dashboard/documents` — worker document centre~~ **REMOVED FROM UI_ONLY, 2026-08-21.** | The claim "0 is unreachable — nothing in the product can create one" is **false as of the W4 Slice 2 change**: `WorkerDocumentForm` calls `upsert_worker_document` (SECURITY DEFINER, `authenticated` EXECUTE, `anon` denied — checked against production 2026-08-21). Prod is still **0 rows**, but that is *unused*, not *unwritable*, and the distinction is the whole point of this section. The evidence that misled the original entry was `document-centre.ts:46` ("Read-only: no insert/update/delete/upsert"), which is a true statement about the READ module only. Downstream readiness therefore computes over an empty table, not a permanently empty one. |
| `/dashboard/talent` | `talent/page.tsx:32` hard-codes `SAMPLE_WORKERS`. Superadmin-only, zero inbound links (enforced by `preview-surfaces-unlinked.test.ts:44`). |
| `/dashboard/visual-os`, `/dashboard/visual-os/agency` | `visual-os/page.tsx:23-90` — every entity prefixed `"Sample · "`, all `hasPhoto:false`, all `ownerApprovedBy:null`, status counts literally `"0 · Preview"`. |
| `/dashboard/admin/agent-os` (partial) | Agent cards are a static array of 10 doc references (`agent-os/page.tsx:24-35`); the header states "no live agent runtime in v1" (`:8-13`). The counts on the same page are real. |

### 3.2 CODE_ONLY (module + DB objects exist; no reachable UI)

| Module | Evidence |
|---|---|
| **LMC credit ledger** | `supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql` (~1550 lines, 5 tables + 8 RPCs) is **applied to prod** (`schema_migrations` version `20260721133338`). The entire TypeScript surface is one 67-line flag file, `apps/web/lib/billing/lmc-flags.ts`. Repo-wide grep for `lmc_` across `app/`, `components/`, `lib/` returns hits only inside that file. Prod: `lmc_settings` = 6 rows, all `false`; `lmc_accounts`/`lmc_lots`/`lmc_transactions`/`lmc_lot_consumptions` = 0. |
| `apps/web/lib/agency/pool.ts` | ~376 lines reading `workers`, `worker_professions`, `journal_entries`, `journal_entry_confirmations` and calling RPC `mark_agency_can_offer:343`. **No importer in `app/` or `components/`.** Its only route, `/dashboard/agency/pool`, became a redirect stub (`agency/pool/page.tsx:19`). |
| `apps/web/lib/talent/provenance.ts` + `provenance-actions.ts` | Read/write layer over `talent_source_records` and RPC `record_talent_source_v1`. No consumer anywhere in `app/` or `components/`, and the backing table is **absent from prod**. |
| `/api/leads` | Real service-role insert path into `leads`; the route's own header (`:5-12`) declares it dormant. `leads` = 0 rows in prod. |
| `matches` / `match_actions` | Present in prod (0 rows) since `0001_initial_schema.sql`. No app code reads or writes them — grep finds them only in the initial migration, generated types, placeholder copy, and guards. Deliberate: `feature-availability.ts:262-268` marks `matching` hidden and `matching-ui-neutralized.test.ts` forbids resurrecting the old UI. |

### 3.3 The largest gap: fully built, prod-backed, linked in nav — and never used once

These are **not** broken and **not** dishonest. Every one has a reachable page in the control-room grid, a real RPC write path, an applied migration, and passing guards. In production they have produced **zero rows**:

`booking_requests` · `work_tasks` · `finance_records` · `assets` + `asset_assignments` · `proposals` + `contracts` · `defects` + `defect_corrections` · `project_stages` · `project_budgets` · `marketplace_listings` · `worker_absences` · `worker_saved_opportunities` · `contact_disclosure_requests` · `team_details` + `team_enquiries` (and **0 organizations of type `team`**) · `invitations` (canonical) · `pilots` + `pilot_participants` + `pilot_outcomes` · `learning_review_queue` · `market_rate_averages` · `conversation_message_attachments` · `personal_data_disclosures` · public business profiles.

That is **22 shipped modules with zero production usage**, versus 5 features carrying essentially all real activity (journal, profile/skills, demand intake, company/worker membership, messaging).

---

## 4. Features blocked purely by an unapplied migration (owner gate list)

Verified against prod by direct catalog reads — not by trusting the ledger.

| # | Migration file (exact) | Prod check performed | Result | Blocked feature |
|---|---|---|---|---|
| 1 | `supabase/migrations/20260713120000_company_locations_v1.sql` | `information_schema.tables` — no `company_locations` | **NOT APPLIED** | Company operating-geography panel (`/dashboard/company:1041`), market-map company layer |
| 2 | `supabase/migrations/20260713160000_agency_clients_v1.sql` | no `agency_clients` table; `information_schema.columns` count for `customer_requests.agency_client_id` = **0** | **NOT APPLIED** | Staffing-agency client CRM + demand→client linking (`/dashboard/company:784`) |
| 3 | `supabase/migrations/20260713210000_multi_source_talent_v1.sql` | no `worker_external_profiles`, `talent_source_records`, `identity_resolution_events` | **NOT APPLIED** | Worker external profiles section (`/dashboard/profile:864`); makes `lib/talent/provenance*.ts` dead code |
| 4 | `supabase/migrations/20260714150000_ai_runs_audit_v1.sql` | `ai_runs` present, 27 columns | **APPLIED — CORRECTED 2026-08-19** | Applied to production 2026-08-03 (prod ledger `20260803061937`) under explicit owner approval; re-verified against production 2026-08-19. This row read **NOT APPLIED** until now — the audit was accurate when written and went stale on apply. The other rows in this table were re-checked against production on 2026-08-19 and remain correct. |
| 5 | `supabase/migrations/20260714170000_worker_opportunity_seen_v1.sql` | no `worker_opportunity_seen` | **NOT APPLIED** | "New job matches" badge + `new-job-matches` spine signal (`dashboard-module-registry.ts:181`) — can never light up |
| 6 | `supabase/migrations/20260714180000_journal_profession_templates_v1.sql` | no `journal_profession_templates` | **NOT APPLIED** | Journal composer profession scaffolds — picker never renders |
| 7 | `supabase/migrations/20260714210000_company_memberships_v1.sql` | `profiles` has 15 columns, **no `active_organization_id`**; `relationship_types` slugs = `owner,employee,manager,consultant,collaborator,freelancer,unemployed,student,volunteer` — **no `viewer`** | **NOT APPLIED** | Multi-company switching (header switcher falls back to single-company) |
| 8 | `supabase/migrations/20260714211000_dashboard_preferences_v1.sql` | no `dashboard_preferences` | **NOT APPLIED** | Server-side dashboard card layout — silently falls back to device-local `localStorage` |
| 9 | `supabase/migrations/20260717150000_demand_interest_seen_v1.sql` | no `demand_interest_seen` | **NOT APPLIED** | Interest-response notification signal (deliberately unwired pending apply) |
| 10 | `supabase/migrations/20260717130000_open_markets_countries_draft_v1.sql` | `public.countries` codes = `DE,DK,EE,FI,LT,LV,NL,NO,PL,SE` — GE/BE/FR/ES/AT/CH absent | **NOT APPLIED — and NOT listed in the ledger's Deferred section either** | Company registration in the 6 markets the platform announces (see finding F2) |

**The ledger's Deferred section (`docs/APPLIED_LEDGER.md:98-110`) is accurate for items 1–9.** Item 10 is missing from it entirely.

### 4.1 Ledger drift in the OTHER direction — 26 migrations applied to prod but absent from `docs/APPLIED_LEDGER.md`

`docs/APPLIED_LEDGER.md:3-9` declares itself the human-readable source of truth for "is it live". Diffing the 55 filenames it names against `supabase_migrations.schema_migrations` (156 rows, latest `20260721133338`):

```
20260702130000_admin_grant_guard              20260705150000_customer_requests_status_transition_guard
20260702140000_worker_personal_engagement     20260705170000_conversation_counterpart_identity
20260702150000_pilot_events_anon_insert_grant 20260705200000_worker_demand_transport
20260702170000_worker_demand_approved_route_model_a
20260702200000_pilot_events_service_role_report_read
20260704120000_universal_profession_skill_catalogue
20260704130000_seed_missing_legacy_professions
20260704150000_universal_catalogue_expansion_wave2
20260704230000_demand_interest_signals        20260705210000_worker_demand_required_tools
20260705120000_demand_interest_company_ack    20260705230000_project_handover_passport
20260705130000_worker_demand_location_label   20260705235000_follow_up_tasks
20260706150000_privacy_request_intake         20260706210000_conversation_source_relation
20260707120000_company_need_public_intake     20260719120000_business_public_profile
20260719150000_vehicle_cleaning_skill         20260720100000_journal_atomic_supersede_v1
20260720150000_journal_photo_continuity_v1    20260720170000_learning_stale_lifecycle_v1
20260720190000_lmc_ledger_foundation_v1
```

All 26 are present in prod `schema_migrations`. Six of them landed in the last four days (2026-07-18 → 2026-07-21), including the ~1550-line LMC ledger foundation. The ledger's last recorded row is `20260718210000_marketplace_listings`. This is the exact "ledger drift" class of bug the ledger itself documents at `docs/APPLIED_LEDGER.md:73`.

---

## 5. Orphaned routes and dead code

The repo maintains a deliberate classification at `apps/web/lib/guards/route-truth-map.test.ts:23-175`, and a ratchet forbidding inbound links to parked surfaces at `apps/web/lib/guards/preview-surfaces-unlinked.test.ts:36-47`. Findings below are consistent with it, plus what it does *not* cover.

**Primary navigation is only 6 tabs** (`lib/config/navigation.ts:51-88` × `feature-availability.ts` `safeToShowInPrimaryNav:true`): `/dashboard`, `/dashboard/market-map`, `/dashboard/journal`, `/dashboard/communication`, `/dashboard/planning`, `/dashboard/network`, plus `/dashboard/admin` for admins. **No employer/company/agency operations route is a primary tab.** Everything else is reached through the control-room grid (`dashboard-module-registry.ts`, 18 modules), the command finder, or an in-page link.

### Deliberately orphaned (zero inbound links, guard-enforced)
`/dashboard/talent` · `/dashboard/visual-os` · `/dashboard/visual-os/agency` · `/dashboard/learning`

### Redirect stubs (bookmark preservation only)
`/dashboard/marketplace` → `/dashboard/market-map` · `/dashboard/player-card` → `/dashboard/journal` · `/dashboard/agency` → `/dashboard/company` · `/dashboard/agency/pool` → `/dashboard/company#company-team` · `/dashboard/start/agency` → `/dashboard/start/company`

### Near-orphans — a real feature hanging off exactly one link
| Route | Only inbound link |
|---|---|
| `/dashboard/gallery` | `app/[locale]/dashboard/profile/page.tsx:474` |
| `/dashboard/journal/voice` | `app/[locale]/dashboard/journal/page.tsx:709` |
| `/dashboard/market/recognize` | `app/[locale]/dashboard/market-map/page.tsx:179` (classified `DUPLICATE_DRIFT`) |
| `/dashboard/people/[workerId]` | `components/app/company-workers-section.tsx:220,234` |
| `/dashboard/journal/export` | `documents/page.tsx:612`, `reports/page.tsx:257` — **not from the journal page itself** |

### Deep-only surfaces (no nav, no command entry)
`/dashboard/projects/[id]` and `/dashboard/projects/[id]/operations` — and this operations page is the **only** way to reach project stages, budgets, defects, the handover passport and the ops CSV. There is no cross-project defect list anywhere in `apps/web` (grep for `defect` finds only `lib/quality/*` and the one panel at `operations/page.tsx:354`).

### Known duplicate drift (kept temporarily, must not grow)
`/dashboard/buyer` and `/dashboard/start/buyer` overlap the canonical company workspace; `/dashboard/market/recognize` overlaps journal recognition (`route-truth-map.test.ts:167-169`).

### Dead code
| File | Evidence |
|---|---|
| `apps/web/lib/agency/pool.ts` | ~376 lines, no importer in `app/` or `components/`; its route is a redirect stub |
| `apps/web/lib/talent/provenance.ts`, `provenance-actions.ts` | no consumer; backing table absent from prod |
| `matches` / `match_actions` schema | in prod since `0001`, 0 rows, no app code path |
| `pilot_drafts` | folded into `customer_requests` by `20260530150000` (ledger line 21); table retained, 0 rows |
| `/api/leads` | self-declared dormant (`route.ts:5-12`), 0 rows |

### Naming trap
`/dashboard/inbox` is the **journal review queue**, not the message inbox (`inbox/page.tsx:19-24`). Messaging lives entirely under `/dashboard/communication`. Any audit or user searching for "inbox" lands on the wrong surface.

---

## 6. Top 10 findings

### F1 — 22 shipped, prod-backed, nav-linked modules have zero production usage

- **Problem.** Bookings, tasks, finance, assets, commercial CRM, defects, stages, budgets, marketplace listings, absences, teams, canonical invitations, pilots, saved opportunities, contact-disclosure requests, message attachments, public business profiles, learning queue, market rate averages, personal data disclosures, `matches`, `leads` — all complete, all applied, all reachable, **all 0 rows**. Meanwhile five features carry all activity: journal (32), profile/skills (33), demand (17), membership (39 engagements), messaging (16).
- **Evidence.** Full-schema row-count SQL, §1 baseline; module registry `apps/web/lib/dashboard/dashboard-module-registry.ts:145-498`; APPLIED_LEDGER rows for each migration.
- **Affected user.** Employers and agencies — every operations module they are offered is untested by any real user.
- **Affected paths.** `apps/web/lib/{booking,tasks,finance,assets,commercial,quality,economics,marketplace,leave,invitations}/*`.
- **Business impact.** Build effort is concentrated where usage is not. Zero rows means zero evidence any of these survive contact with a real user; every one is an untested liability at first customer contact.
- **Risk.** HIGH (product-strategy), LOW (technical).
- **Recommended fix.** Stop building breadth. Pick the 3 modules the next paying pilot actually needs, drive one real row through each with a real user, and mark the rest `preparing` in `feature-availability.ts` so the grid stops advertising them.
- **Acceptance.** Each chosen module has ≥1 production row created by a non-employee user; every unchosen module either has a row or is demoted out of the control-room grid.
- **Dependencies.** Owner decision on pilot scope.
- **Effort.** 1 day for the demotion pass; the pilot itself is a business activity.
- **Loop.** Product/CEO review, not an engineering loop.

### F2 — Six announced markets cannot register a company (marketing vs FK mismatch)

- **Problem.** `MARKET_COUNTRIES` was extended on 2026-07-17 with GE/BE/FR/ES/AT/CH, and demand intake accepts them (`customer_requests.country` is free text). But `organizations.country` has `FOREIGN KEY (country) REFERENCES countries(code)` and prod `countries` holds only `DE,DK,EE,FI,LT,LV,NL,NO,PL,SE`. `save_company_setup_v2` raises `invalid_country` (errcode 22023) for anything else.
- **Evidence.** `apps/web/lib/taxonomy/work-categories.ts:224-227`; prod `pg_constraint`: `organizations_country_fkey FOREIGN KEY (country) REFERENCES countries(code)`; prod `select string_agg(code) from countries` → 10 codes; `pg_get_functiondef('save_company_setup_v2')` → `raise exception 'invalid_country'`; `supabase/migrations/20260717130000_open_markets_countries_draft_v1.sql:1-10` is a DRAFT that was never applied and is **not** in the ledger's Deferred list.
- **Affected user.** Any Belgian/French/Spanish/Austrian/Swiss/Georgian company that responds to the marketing.
- **Affected paths.** `apps/web/lib/company/company-setup.ts:226,270-277`; `apps/web/lib/labour-market/country-evidence.ts:36-45`.
- **Business impact.** The company setup form only offers seeded countries, so the user is not shown a broken control — but the funnel silently has no destination for six advertised markets. `engagement_contexts.country_code` carries the same FK, so self-declared work history in those countries is also impossible.
- **Risk.** MEDIUM.
- **Recommended fix.** Owner decision: either apply `20260717130000` (6 additive `insert … on conflict do nothing` rows, no DDL) or remove the 6 codes from `MARKET_COUNTRIES` and the marketing index. Do not leave them half-open.
- **Acceptance.** For every code in `MARKET_COUNTRIES`: a row exists in `countries` AND `save_company_setup_v2` accepts it; or the code is absent from every public surface.
- **Dependencies.** Owner apply gate (§4 rules).
- **Effort.** 30 min either way.
- **Loop.** Owner-gated migration apply loop.

### F3 — 26 migrations are live in production but missing from `docs/APPLIED_LEDGER.md`

- **Problem.** The ledger declares itself the source of truth for "is it live" (`docs/APPLIED_LEDGER.md:3-9`). 26 applied migrations are absent from it, six of them from the last four days, including the ~1550-line LMC ledger foundation applied 2026-07-21.
- **Evidence.** §4.1 list; prod `select name from supabase_migrations.schema_migrations where version >= '20260702'` (61 names) diffed against the 55 filenames the ledger cites. Latest ledger row = `20260718210000_marketplace_listings`; latest prod apply = `20260721133338 / 20260720190000_lmc_ledger_foundation_v1`.
- **Affected user.** Every future auditor, and every agent session that trusts the ledger before acting.
- **Affected paths.** `docs/APPLIED_LEDGER.md`.
- **Business impact.** This is a repeat of the documented `team_spine` drift (ledger line 73). An agent reading the ledger today would conclude LMC and public business profiles are unapplied and could attempt a duplicate apply.
- **Risk.** HIGH (operational).
- **Recommended fix.** Backfill the 26 rows from `schema_migrations` (version + name + date), and add a CI check that fails when a name in prod `schema_migrations` has no matching ledger entry.
- **Acceptance.** `set(prod schema_migrations names) − set(ledger names)` is empty; a guard test enforces it.
- **Dependencies.** Read-only prod access in CI (or a checked-in snapshot).
- **Effort.** 2–3 h.
- **Loop.** Documentation + guard loop.

### F4 — ~~The document centre is an inventory over a table nothing can write~~ — **RESOLVED 2026-08-21**

> **This finding is closed. Its own recommended fix was shipped and the entry was never updated.**
> F4 proposed: *"Either ship the upload slice (bucket + `upsert_worker_document` is already in `pg_proc`) or demote the module."* The first half was taken — W4 Slice 2 gave that RPC a caller (`WorkerDocumentForm` → `document-actions.ts:40`), so a worker can record the FACTS about a document they hold. Verified against production 2026-08-21: `upsert_worker_document` and `request_worker_document_verification` are both SECURITY DEFINER with EXECUTE granted to `authenticated` and denied to `anon`.
>
> **What remains, stated narrowly:** file/bucket upload is still absent — the page says so rather than implying otherwise (`uploadNote`), and `country_document_requirements` is still 0 rows. Neither makes the module UI_ONLY. The correct class is now IMPLEMENTED_NOT_YET_USED, matching the closing-state block in the truth report.
>
> The original text is kept below unedited, because it is the record of what a session believed and of the evidence that misled it: `document-centre.ts:46` is a true statement about the READ module, and was read as a statement about the whole app.

- **Problem.** `/dashboard/documents` is in the control-room grid and is linked from the profile, reports and CV pages. It computes "document readiness" per country and feeds `agency_pool_docs_readiness()` and the Verified CV. There is **no upload path and no insert anywhere in `apps/web`** — every `worker_documents` reference is a `select`.
- **Evidence.** `apps/web/lib/documents/document-centre.ts:46` ("Read-only: no insert/update/delete/upsert, no storage access"), `:116`; `lib/documents/readiness.ts:175`; `lib/cv-export/verified-cv.ts:227`; `lib/privacy/export-data.ts:76`; `lib/admin/readiness-overview.ts:65,85`. Prod `worker_documents` = **0 rows**. The page discloses it at `documents/page.tsx:42-45` and `:446`.
- **Affected user.** Workers (readiness always 0%), agencies (docs-readiness aggregate always empty), the owner (admin readiness always shows nothing).
- **Affected paths.** as above, plus `RPC set_docs_aggregate_consent` — a consent toggle governing data that cannot exist.
- **Business impact.** A visible module whose only honest output is "nothing". Country document requirements (`country_document_requirements`, also 0 rows) compound it.
- **Risk.** MEDIUM.
- **Recommended fix.** Either ship the upload slice (bucket + `upsert_worker_document` is already in `pg_proc`) or demote the module to `preparing` and hide the readiness percentages until it exists.
- **Acceptance.** Either a real `worker_documents` row created through the UI, or `/dashboard/documents` no longer appears in the module grid and no surface renders a document-readiness figure.
- **Dependencies.** Owner decision on storage/PII scope.
- **Effort.** 2–3 days for the upload slice; 2 h for the demotion.
- **Loop.** Product slice loop (`labma-safe-slice`).

### F5 — There is no out-of-app notification of any kind

- **Problem.** A user learns about a new message, booking, invitation, interest signal or journal-review request **only by opening the app**. No email, no push, no SMS anywhere in the product.
- **Evidence.** `apps/web/lib/communication/actions.ts:259-442` — `sendMessage` has no mail/push/webhook call, only DB insert + `revalidatePath`. Repo-wide grep for `web-push|serviceWorker|firebase|PushSubscription|nodemailer|sendgrid|@react-email` finds no implementation, only i18n strings and guards that *forbid* those imports (`assist-centre.test.ts:134`). The notification spine is explicitly read-on-visit (`lib/notifications/spine.ts:35-65`). The only outbound channel in the product is the owner Telegram alert on `/company-need` intake (`lib/notifications/telegram-owner-alerts.ts:1-29`).
- **Affected user.** Every user on both sides.
- **Affected paths.** `apps/web/lib/notifications/*`, `apps/web/lib/communication/actions.ts`.
- **Business impact.** This is the single most likely cause of the 0-row pattern in F1: employer↔worker interactions require both parties to be in the app simultaneously. `conversations` = 2 with `conversation_messages` = 16 across 27 profiles is the observable symptom.
- **Risk.** HIGH.
- **Recommended fix.** Ship one channel — transactional email for the three highest-value events (new message, booking proposed, invitation received) — reusing the already-built `lib/email/transactional.ts` adapter.
- **Acceptance.** A real user receives an email for a new message in production and the send is recorded with an honest `sent`/`failed` state; no fake "delivered" is ever written.
- **Dependencies.** Owner gate — new secret (`INVITE_EMAIL_API_KEY`) and live outbound sending are both owner-only per §3/§4.
- **Effort.** 2–3 days (adapter exists; the work is event wiring, templates, and per-user preference/opt-out).
- **Loop.** Owner-gated feature loop.

### F6 — Invitation email is code-complete but unconfigured; the canonical invitation model has never been used

- **Problem.** Two compounding facts. (a) `lib/email/transactional.ts` requires `INVITE_EMAIL_PROVIDER` + `INVITE_EMAIL_API_KEY` + `INVITE_EMAIL_FROM`; none is set, so `sendTransactionalEmail` short-circuits to `not_configured` and every invitation is permanently `not_sent` — the product is manual link-sharing. (b) The canonical `invitations` table (applied 2026-07-12, 20/20 production test battery per ledger line 61) has **0 rows**, while the legacy `company_worker_invitations` has 4 — all real invitations still flow through the old path.
- **Evidence.** `apps/web/lib/email/transactional.ts:38-56`; `.env.example:88-97`; `apps/web/lib/invitations/actions.ts:116,158-161,303-325`; `components/app/invitation-list.tsx:129-137`; prod row counts `invitations` 0 / `company_worker_invitations` 4; `audit_logs` shows `accept_company_worker_invitation:3`.
- **Affected user.** Anyone invited to a company or team.
- **Affected paths.** `apps/web/lib/invitations/*`, `apps/web/lib/company/company-workers.ts:224`, `apps/web/app/[locale]/invite/[token]/page.tsx`.
- **Business impact.** A migration battery-tested against production has never carried a single real invitation. The consolidation the canonical model was built for did not happen; both models are live simultaneously.
- **Risk.** MEDIUM.
- **Recommended fix.** Decide the single invitation path, migrate `/dashboard/company`'s invite button onto `create_invitation_v1`, and either configure the email provider or rename the UI to "copy invite link" so the mechanism matches the label.
- **Acceptance.** One production invitation created through `create_invitation_v1` and accepted; `invite_company_worker` no longer called from any UI, or is explicitly documented as the legacy path with a removal date.
- **Dependencies.** F5 (email) for the delivery half; owner gate for the secret.
- **Effort.** 1–2 days for the path consolidation.
- **Loop.** Safe-slice loop.

### F7 — Project operations (stages, budgets, defects, handover, CSV) is reachable only by a two-hop deep link

- **Problem.** `/dashboard/projects/[id]/operations` is in neither the module registry nor the command registry. It is the sole surface for project stages, budgets, defects, corrections, the handover passport, the operations board and the CSV export. Defects have no index route at all — there is no way to see quality issues across projects.
- **Evidence.** `apps/web/lib/guards/route-truth-map.test.ts:93-95` classifies it `REAL_LAUNCH_SURFACE` but the module registry route list (18 entries) does not contain it; inbound links only from `projects/page.tsx:76`, `[id]/page.tsx:372`, `components/app/arena/project-map.tsx:38,66`, `premium-hub-project-card.tsx:46,110`, `project-assignment-manager.tsx:232`. Panels: `operations/page.tsx:319` (stages), `:329` (economics), `:354` (defects), `:441` (handover), `:432` (CSV).
- **Affected user.** Project managers / foremen.
- **Affected paths.** `apps/web/app/[locale]/dashboard/projects/[id]/operations/page.tsx`, `apps/web/lib/quality/*`, `apps/web/lib/economics/*`, `apps/web/lib/projects/stages*.ts`.
- **Business impact.** Four applied migrations (`project_operations_stages`, `project_budgets`, `delivery_quality`, and the handover passport) have 0/0/0/1 rows. Discoverability is a plausible cause: with 5 projects in prod, a manager must know to click through to a project and then to an unlabelled operations tab.
- **Risk.** MEDIUM.
- **Recommended fix.** Add a project-operations entry to the command registry and a defects surface at the company level (cross-project list). Do not add a new nav tab.
- **Acceptance.** Operations is reachable from the command finder; a cross-project defect list exists; `route-truth-map.test.ts` updated.
- **Dependencies.** None.
- **Effort.** 1 day.
- **Loop.** Safe-slice loop.

### F8 — Answer engine ships 45 of 550 registered questions

- **Problem.** `content/answer-engine/question-registry.json` holds 550 canonical questions; only ~45 have written, HUMAN_APPROVED localized answers (`pilot-answers.ts` 6 + wave2b 12 + wave2c 12 + wave2d 15). Publishing correctly refuses to publish the rest (no EN fallback, no machine drafts indexed).
- **Evidence.** `apps/web/lib/answer-engine/publishing.ts:1-12,31-45`; `apps/web/app/questions-sitemap.xml/route.ts:19-20`; prod `/questions-sitemap.xml` returns 200. Memory record: owner said STOP at 45.
- **Affected user.** Organic search visitors.
- **Affected paths.** `content/answer-engine/*`, `apps/web/lib/answer-engine/*`.
- **Business impact.** The 550-question registry represents a planned SEO surface of ~2,750 pages across 5 active locales; 8% is live. Not a defect — a strategic gap the registry makes look larger than it is.
- **Risk.** LOW (technical), MEDIUM (growth).
- **Recommended fix.** Either continue waves or trim the registry so its size stops implying delivered coverage.
- **Acceptance.** Registry size and published count are reported together on any readiness surface.
- **Dependencies.** Owner decision (already STOP at 45).
- **Effort.** n/a.
- **Loop.** Marketing/content loop.

### F9 — Degradation gaps: several write paths throw instead of degrading honestly

- **Problem.** The repo's honest-degradation discipline is near-universal but has named holes. These paths throw an opaque error where their siblings return a `needs-migration` state.
- **Evidence.** `apps/web/lib/worker/actions.ts:46,51,88,113` (professions — `throw new Error(error.message)`); `apps/web/app/api/workers/[workerId]/skills/route.ts:150` (500); `apps/web/lib/auth/actions.ts:90` (`completeOnboarding` throws); `apps/web/lib/demand/demand-drafts.ts:218-222` (logs and throws — the only demand write path with no `42883/PGRST202` branch); `apps/web/lib/journal/skill-pipeline-actions.ts:327,341` and `apps/web/lib/operations/org-membership.ts:128` return opaque `write_failed` / `{ok:false,code:"error"}`; `projects/[id]/operations/report/route.ts` has no `needs-migration` branch unlike `finance/export/route.ts:26-28`.
- **Affected user.** Any user hitting one of these during a schema transition — they see a crash, not an explanation.
- **Business impact.** Low today (all backing objects are applied) but these are exactly the paths that will crash on the next migration change, and one of them (`completeOnboarding`) is on the first-run path.
- **Risk.** LOW–MEDIUM.
- **Recommended fix.** Extend the existing `ABSENT` code-set idiom to these six modules.
- **Acceptance.** A guard test asserts every `"use server"` module that calls `.rpc(` or `.from(` classifies `42P01/42883/PGRST202/PGRST205/42703`.
- **Dependencies.** None.
- **Effort.** 1 day including the guard.
- **Loop.** Safe-slice loop.

### F10 — LMC credit ledger: 1550 lines applied to production with no UI and six false flags

- **Problem.** A complete credit/ledger system (5 tables, 8 SECURITY DEFINER RPCs, append-only guards, lot expiry, reversal) was applied to production on 2026-07-21. Its entire application surface is a 67-line flag file. All six flags are `false` in code *and* in the DB, and two are `owner_only` with a setter that refuses every caller including `service_role`.
- **Evidence.** `supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql`; prod `schema_migrations` version `20260721133338`; `apps/web/lib/billing/lmc-flags.ts:21-27,34-38,59-67`; prod `select * from lmc_settings` → 6 rows all `false`; all other `lmc_*` tables 0 rows; grep for `lmc_` across `app/`/`components/`/`lib/` hits only that one file.
- **Affected user.** None today (that is the point).
- **Affected paths.** as above.
- **Business impact.** Correctly and safely built — but it is production schema surface, RLS surface and maintenance burden for a monetisation model that has no UI, no pricing decision, and no Stripe configuration behind it (`PAYMENTS_ENABLED = false as const`, `lib/billing/plans.ts:18`). It is also one of the 26 undocumented applies (F3).
- **Risk.** LOW (safety), MEDIUM (focus).
- **Recommended fix.** Record it in the ledger (F3), then park it explicitly: an ADR stating LMC is dormant until a named owner decision, so no future session mistakes it for in-progress work.
- **Acceptance.** Ledger row exists; an ADR or `TASKS.md` entry names the gate.
- **Dependencies.** Owner decision on monetisation.
- **Effort.** 1 h.
- **Loop.** Documentation loop.

---

## 7. What I could NOT verify, and why

| Claim | Why not verifiable | What would be needed |
|---|---|---|
| **Production environment variables** | `.env.local` in this checkout holds only Supabase URL/anon/service keys + `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS`. Vercel's runtime env is not in the repo. Every statement about `STRIPE_*`, `INVITE_EMAIL_*`, `AI_PROVIDER_MODE`, `VOICE_TRANSCRIBE_URL`, `EUROSTAT_SOURCE_ENABLED`, `INTELLIGENCE_INSPECTOR_ENABLED` being unset describes the **repo/local** state only. | `vercel env ls` for the production environment (names only) |
| Whether authenticated pages actually render without error in prod | `/lt/dashboard` returns 307 to auth for an anonymous probe; I have no test credentials and creating one would be a write. | A disposable prod account, or an owner-run authenticated smoke |
| Whether the 712 unit tests / 514 guards / 24 e2e specs currently pass | Not run — running the suite is safe but out of scope for a read-only inventory loop, and CI state at HEAD was not inspected. | `pnpm -C apps/web test` + `pnpm e2e`, or the CI run for `664b9ab9` |
| Which of the 39 `engagement_contexts` rows are self-declared work history vs real memberships | `organization_id IS NULL` distinguishes them, but reading per-row would be personal data beyond the audit's need. | An aggregate `count(*) where organization_id is null` if the owner wants it |
| Whether worker preferences v2 columns are actually populated by users | The 7 columns are nullable with NULL = "not stated"; distinguishing "never saved" from "saved as unset" needs per-column counts against 27 workers. | A targeted aggregate query |
| Whether `/dashboard/instructions` messages are separable from ordinary chat | Both write to `conversations`/`conversation_messages`; only 16 messages exist total. | `conversations.kind` breakdown |
| Whether the 6 announced markets appear as selectable options anywhere user-facing | `company-setup-form.tsx:44,201` confirms the country select only offers seeded codes; the marketing index comment (`country-evidence.ts:36-45`) says the 6 render as "coming soon" — I did not visually confirm the rendered marketing page. | Browser check of `/lt/labour-market` |
| Whether Vercel serves the same commit as local HEAD | Production responds 200 but exposes no build SHA I read. | Vercel deployment inspection |
| Real user identity behind the 27 profiles (real users vs internal test accounts) | Would require reading PII. Memory notes 12 historical test accounts exist on this project. | Owner statement |

---

*Read-only audit. No file other than this one was created or modified; no migration was applied; no production row was written.*
