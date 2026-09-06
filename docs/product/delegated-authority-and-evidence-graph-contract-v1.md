# Delegated authority · bulk import · contribution/evidence graph · AI-agent Living CV — contract v1

**Status:** canonical direction + inventory (2026-09-06, window 6, lane I+J+K). READ-ONLY inventory of code at `main ca96605b` and the PRODUCTION catalog (Supabase `gorgitwvdzxbnaxhrsrw`, `execute_sql` read-only). Nothing here was built; the staged roadmap is in `docs/ARCHITECTURE.md` §5.6, which is the entry point. This file holds the detail §5.6 cannot.

**Authority:** extends `docs/ARCHITECTURE.md` §5.1–5.5 and the owner contract §1c. `PLATFORM_DOCTRINE` stays supreme (§7 no fake AI, §16 migrations, §18 honesty). Existing docs this composes with, not duplicates: `docs/audits/external-assistant-gateway-gap-audit-2026-09-02.md` (gateway status), `docs/product/confirmed-suggestions-foundation.md` (suggestion ≠ fact), `docs/product/ai-data-minimization-contract-v1.md`, `docs/architecture/CAPABILITY_PLATFORM_v1.md` (parked), `docs/product/ENTITY_BEHAVIOR_MODEL_V1.md` (actor_type verdict), memory `ai-actor-already-declared`.

---

## A. Delegated AI today — the actual scope matrix

**How delegation works now.** ONE identity resolver (`apps/web/lib/api/api-identity.ts:205–241` bearer, `:270–303` cookie) turns an OAuth-issued Supabase JWT into the USER's own RLS-scoped client. The MCP door (`apps/web/app/api/mcp/route.ts:99–205`) lists the 12 registered capabilities (`apps/web/lib/capabilities/registry.ts`, all `exposed: true`, 0 unexposed) and runs them AS THE USER. OAuth 2.1 server = Supabase Auth (`app/.well-known/oauth-protected-resource/route.ts`); production: `auth.oauth_clients` 2 (ChatGPT/public + one proof client), `auth.oauth_consents` 5, `auth.oauth_authorizations` 9. Consent scopes granted in production are **identity scopes only**: `openid email offline_access [profile phone]` — there is no capability scope; a connected client receives every exposed capability of that user. Revocation: `lib/auth/connected-apps-actions.ts:28–57` (`auth.oauth.revokeGrant`, own grants only; global logout kills grants — #1412 keeps logout `scope=local`).

**Impersonation finding (the one structural gap).** Every delegated write records the USER as the actor: `journal_entries.worker_id`, `work_hour_allocations.entered_by = auth.uid()` (RLS `work_hour_allocations_insert`), `journal_entry_confirmations.confirmer_id = auth.uid()`. The OAuth `client_id` is never read (no `client_id`/`azp` in `api-identity.ts` or `external-client-auth.ts`); `caller.transport` (`route.ts:135–144`) reaches only a stdout JSON line (`route.ts:164–177`), never a row. So **actor ≠ recorder is not representable for delegated writes today** — a journal entry written through ChatGPT is indistinguishable in the database from one typed by the person. Precedents that DO separate the two: `work_hour_allocations.entered_by` vs `worker_id` (`supabase/migrations/20260829140000_work_hour_allocations_v1.sql:114`), `journal_entry_metrics.source ∈ {worker_input, ai_extracted, manager_corrected}` (`0013_work_journal_m1.sql:151`) with the document-import slugs `source_document_file` / `extractor_version` (`lib/journal/document-journal-draft-model.ts:31–32,41–56`).

| Candidate scope | Exists as | Where (file:line) | Enforcement point | Recorder column today |
|---|---|---|---|---|
| READ_PROFILE | MCP tool | `profile.get` registry.ts:68 · `living_cv.skills.get` :126 · `journal.list` :187 | RLS as caller | n/a (read) |
| UPDATE_PROFILE | MCP (work card only) / server action (full) | `work_card.save_draft/confirm` :1027/:1119 · `worker.complete-profile` action-registry.ts:163 | draft→confirm token (`confirmable.ts`) + RLS | none — row = user |
| ADD_HISTORICAL_WORK | MCP (one entry) / server action | `journal.create_draft/confirm` :483/:569 (any `work_date`) · `worker.add-work-history` action-registry.ts:176 | one-time token bound to input hash + chain fingerprint; `journal_entries_insert` RLS (owns_worker, visibility `closed`) | `journal_entry_metrics.source='worker_input'` only; transport NOT recorded |
| IMPORT_WORK_HISTORY (bulk) | server action only (company side) | `confirmTimesheetImportAction` lib/timesheet-import/import-confirm-actions.ts:146–292 · CV: `extractCvFile` lib/cv/cv-import-client.ts:23 → suggestions, confirmed one by one | employer context + RLS insert | `work_hour_allocations.source='import'`, `entered_by`; no batch id |
| ATTACH_EVIDENCE | server action only | `uploadWorkerDocumentFileAction` / `…ForChatAction` lib/documents/document-file-actions.ts:213/223 (sha256 → `register_document_file_v1`) · journal `source_document_file_id` journal-write-core.ts:301–388,514–518 · task link lib/journal/task-evidence-actions.ts | RPC re-checks authority; storage delete policy admits only unregistered objects | `document_files.uploaded_by`, `content_sha256`; `journal_entry_tasks.linked_by` |
| PROPOSE_CAPABILITY | deterministic pipeline inside journal writes; Gemini proposes INTENTS only | `lib/structuring/recognition-tiers.ts:30–33` (`auto_signal` / `candidate_suggestion` / `manual_only`) · `lib/conversation/llm-proposal.ts` (intent ids only) | never auto-links: a candidate becomes a claim only through the manual path | `journal_entry_skills.provenance ∈ {recognized, confirmed, manual}` (20260727180000:47); `ai_runs` row for the LLM (profile_id null by design) |
| CONFIRM_DERIVED_CAPABILITY | server action only | `company.confirm-work` action-registry.ts:818 · lib/journal/quick-confirm-actions.ts · `lib/conversation/confirm-work.ts` (reads) | RLS `journal_entry_confirmations_insert`: `confirmer_id = auth.uid()` AND `manages_organization(...)` | `confirmer_id`, `confirmer_role`, `confirmation_scope` (jsonb: decision, skills_confirmed) — a delegated token would confirm AS the manager |
| CREATE_PROJECT | server action only | `company.create-project` action-registry.ts:656 | conversation dispatcher (held roles, zod, token) → executor → RPC | `projects.responsible_profile_id`; no created_by |
| ASSIGN_WORKER | server action only | `company.assign-worker` :555 · `company.move-worker` :581 | same | `project_worker_assignments` (no recorder column listed) |
| IMPORT_TIMESHEET | server action only | import-confirm-actions.ts:244–267 (ONE atomic insert) | RLS `work_hour_allocations_insert` | `entered_by`, `source='import'` |
| UPDATE_DOCUMENT_STATUS | server action only | `acknowledgeDocumentAction` document-file-actions.ts:297 · org approval `submit_org_document_for_approval_v1` · `worker_documents.verification/verified_by/verified_at` | RPC + RLS | `worker_documents.updated_by`, `org_document_events.actor_id` |
| RECONCILE_DATA | partial (preview-time) | `resolveEntityLabel` lib/timesheet-import/resolve-entities.ts:60–107 (exact / unambiguous / ambiguous → human picks) · `correction_of` / `superseded_by` on `journal_entries` and `work_hour_allocations` (:141–142) | human choice at preview; corrections non-destructive | prod: 0 corrections written; MERGE of duplicate objects/sites: MISSING |
| MANAGE_ALLOWED_COMPANY_OPERATIONAL_DATA | MCP (demand, context) / server actions (rest) | `demand.create_draft/confirm` :1256/:1315 · `context.switch` :883 · tasks/stages/readiness action-registry.ts:697–798 | draft→confirm + `requireEmployerCompanyForCaller` | `work_tasks.created_by`, `work_task_events.actor_profile_id` |
| SEND_EXTERNAL_MESSAGE | **DENY — holds today** | no capability has `openWorldHint: true` (contract.ts:52–54); the only outward paths are `company.invite-worker` :634, `company.invite-learner` :895, `agency.invite-client` :931 → `lib/invitations/actions.ts` / `lib/email/transactional.ts`, all server-action-only | registry exposure is a code-review decision (`exposed`) | must stay non-delegable until scopes exist |

**Verdict A:** delegation is vendor-neutral and RLS-true (ChatGPT, Claude, any MCP host are equal adapters), but it is **all-or-nothing** (no capability scopes) and **recorder-blind** (no column says an assistant wrote it). Both are Stage 1–2 items; neither is a launch blocker because delegated writes are draft→confirm and append-only.

---

## B. Bulk / historical import — pipeline stage table

Source families in code: **XLSX** (`lib/timesheet-import/xlsx-read.ts`, `xlsx-grid-parse.ts`); **PDF/DOCX CV** (`lib/cv/extract.ts`, unpdf + mammoth → profile/journal SUGGESTIONS, never facts — `cv-upload-truth.test.ts`); **document files** pdf/jpeg/png/webp/docx (`document_files`, prod 0 rows); **external market data** (Eurostat, vacancies: `public_vacancies.import_session_id`, `content_hash` — 20260809160000:190). **CSV, HR/ERP exports, e-mail: none.**

| Stage | Exists? | Evidence | Gap |
|---|---|---|---|
| SOURCE preserved (immutable original) | NO for timesheets; YES pattern for documents | preview reads the upload buffer only (import-confirm-actions.ts:96–103); `register_document_file_v1` + `content_sha256` exists but the importer never calls it; `document_files` = 0 in prod | register the workbook as a `document_files` row BEFORE preview |
| DRAFT | YES (in memory) | `persisted: false` literal (import-preview.ts:73–74); `rollbackRef: preview-not-persisted:<file>` (:271) | drafts do not survive a page reload |
| NORMALIZE | YES | `xlsx-grid-parse.ts`; `normalizeLabel` NFD-fold used for MATCHING only (resolve-entities.ts:35–45) | source cell text for hours/dates is not kept past commit (only `hours_numeric`, `work_date`, `note`) |
| RECONCILE (people, objects/sites) | YES, human-decided | exact / single-partial → resolved; several → `ambiguous` with ≤5 candidates (:60–107); "Jonas vs two Jonases" is the designed case | spelling variants (e.g. a site written three ways) resolve per file by human pick; the alias is NOT learned — no site/person alias table; no MERGE of two `work_objects` |
| PREVIEW | YES | `buildTimesheetImportPreview` + `buildImportSession` exact-sum accounting (import-preview.ts:17–19, 249–277) | — |
| COMMIT | YES, atomic | ONE insert into `work_hour_allocations` (:244–267); every row re-validated (:155–206); membership re-checked; duplicate key worker|date|object|hours is a WARNING with explicit override (:137–144, 208–239); cap 2,000 rows | — |
| PROVENANCE columns | PARTIAL | `entered_by` (who), `source='import'` (how), `created_at` (when) | no `import_batch_id`, no source-file reference, no file hash on the rows |
| REVERSIBLE BATCH / ROLLBACK | NO | rows carry nothing that identifies the batch after commit; `correction_of`/`superseded_by` exist (non-destructive) but no batch-level supersede | `import_batches` + `import_batch_id` (Stage 3) |
| CORRECTIONS / MERGE | columns only | `work_hour_allocations_update` RLS exists; prod corrections = 0 | no correction UI/action for allocations; no merge |
| NO-SIDE-EFFECT guarantee | **PASS (proven by reading the whole action)** | `import-confirm-actions.ts` imports (lines 3–21) contain no notification, invitation, e-mail, pilot-event or workflow module; the only post-commit call is `revalidatePath` (:290). The timesheet domain's single emitter is `emitWorkflowStepPendingNotifications` in `lib/timesheets/timesheets-actions.ts:256`, fired on SUBMIT-for-approval, in-app only ("nothing here sends anything to anyone" :45–47), and the importer never calls it | guard test to pin this invariant (Stage 3) |

Production: `work_hour_allocations` = 5 rows, all `source='import'` (E3 proof), 0 journal-linked, 0 corrections. The owner's split case (8 h object A + 2 h object B) is satisfiable at the canonical layer (G-01, G-04 proofs).

---

## C. Contribution / evidence graph — reuse table

**Tier mapping (owner vocabulary → what exists).** Code ladders: `lib/evidence/evidence-tier.ts:19` (`self_declared` < `work_journal` < `manager_confirmed`, from `worker_skills.source`), `lib/evidence/provenance.ts:40–44` (SELF_DECLARED / EVIDENCE_SUPPORTED / EMPLOYER_CONFIRMED / SYSTEM_DERIVED; THIRD_PARTY_CONFIRMED deliberately absent — no canonical third-party source), `lib/structuring/recognition-tiers.ts:30–33` (recognition, not evidence). Production `worker_skills.source`: work_journal 26 / self_declared 22 / manager_confirmed 2; `journal_entries` 40, all `visibility_scope='closed'` (RLS insert forces `closed`, 20260530130000:48); confirmations 13 (owner role; 11 approved, 2 changes_requested).

| Owner tier | Exists as | Missing |
|---|---|---|
| SELF_DECLARED | `worker_skills.source='self_declared'`; `profile_skill_claims` (visibility CHECK `('closed')` only) | — |
| COMPANY_RECORDED | data only: `work_hour_allocations.entered_by ≠ worker_id`; `journal_entry_metrics.source='manager_corrected'` | not a named tier in either ladder |
| ACTIVITY_EVIDENCED | `work_journal` tier; provenance EVIDENCE_SUPPORTED (hash-chained entries `hash_prev/hash_self`) | — |
| COUNTERPARTY_CONFIRMED | `manager_confirmed`; EMPLOYER_CONFIRMED from `journal_entry_confirmations` (latest-wins `review-status.ts`) or `worker_skills.verified` | third party (client, institution, peer) — no source |
| DOCUMENT_BACKED | folded into EVIDENCE_SUPPORTED (`worker_documents.valid_until`, `document_files.content_sha256`) | its own class |
| FORMALLY_QUALIFIED | `training_skill_links` (20260817230000) — explicitly NOT admitted to the ladder (:265, owner decision pending) | tier |
| SYSTEM_DERIVED | provenance SYSTEM_DERIVED (`derivedFrom`); `worker_skills.confidence_score/bin/last_recompute_at`; `learning_signals.proposed_outcome` | — |

**Work Unit mapping (GOAL → CONTRIBUTION → DELIVERABLE → OUTCOME → EVIDENCE → BENEFICIARIES).**

| Element | Reuse | Missing |
|---|---|---|
| GOAL | `work_tasks` (title, description, status, priority, `source_type ∈ project|booking|demand|company`, `assignee_profile_id`, `object_id`) — prod 2 rows; `work_task_events` before/after state | — |
| CONTRIBUTION | `journal_entries.original_text` (the person's words, kept verbatim) + `journal_entry_work_items` (hours, certainty clear/partial/unclear) + `work_hour_allocations` | — |
| DELIVERABLE | `work_tasks.resolved_at` only | a nullable `deliverable_text` / `deliverable_ref` on `work_tasks` |
| OUTCOME | `performance_reviews` + `review_evidence_links` (kind, ref_id; prod 0); `pilot_outcomes` is pilot-level | `work_tasks.outcome_text` (nullable) — outcomes are stated by a human, never derived |
| EVIDENCE | `journal_entry_tasks` (entry ↔ task link, withdraw kept as a record, task-evidence-model.ts) — prod 0; photo bucket; `document_files` | — (adoption, not schema) |
| BENEFICIARIES | `project_clients` (project → client org) | per-unit beneficiary (see contributors table) |
| ATTRIBUTION: PRIMARY / CONTRIBUTORS / SUPERVISOR / APPROVER / BENEFICIARY | PRIMARY = `journal_entries.worker_id`; SUPERVISOR = `projects.responsible_profile_id` / `work_objects.responsible_profile_id` / engagement context; APPROVER = `journal_entry_confirmations.confirmer_id` + `confirmer_role` | CONTRIBUTORS and BENEFICIARY per entry — one worker per entry today |
| SIGNIFICANCE filter | none | nullable `significance` on `work_tasks` (human-set: `routine|notable|milestone`), never AI-set |
| ROLL-UP | skills: `worker_skills` recompute (`last_recompute_at`, confidence); hours: `timesheet_compute_lines_v1`; evidence text: `provenance.ts` | outcome roll-up = a READ (view/RPC over tasks × links), not a stored score |

**Minimum missing capability — migration-shaped proposal (NOT code; classes per the merge envelope; every migration trips the count ratchet by design):**

```sql
-- Stage 4a  GREEN (nullable columns, no RLS change)
alter table public.work_tasks
  add column if not exists deliverable_text text check (char_length(deliverable_text) <= 2000),
  add column if not exists outcome_text     text check (char_length(outcome_text) <= 2000),
  add column if not exists significance     text check (significance in ('routine','notable','milestone'));
-- rollback: alter table public.work_tasks drop column deliverable_text, drop column outcome_text, drop column significance;  (assert zero non-null first)

-- Stage 4b  RED (new table + RLS policies → owner apply via apply_migration)
create table public.journal_entry_contributors (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.journal_entries(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete restrict,
  role        text not null check (role in ('contributor','supervisor','approver','beneficiary')),
  added_by    uuid not null references public.profiles(id) on delete restrict,
  added_at    timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (entry_id, profile_id, role)
);
-- RLS mirrors journal_entry_tasks: select using can_read_journal_entry_v1(entry_id);
-- insert with check (added_by = auth.uid() and (owns_worker(<entry worker>) or manages_organization(<entry org>)));
-- no update/delete policy (withdrawal is a record, never a deletion).

-- Stage 3  RED (new table + RLS) — reversible import batches
create table public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  imported_by     uuid not null references public.profiles(id) on delete restrict,
  source_file_id  uuid references public.document_files(id) on delete set null,   -- the immutable original (sha256 lives there)
  source_kind     text not null check (source_kind in ('xlsx','csv','pdf','hr_export','manual_paste')),
  row_count       int  not null check (row_count >= 0),
  status          text not null default 'committed' check (status in ('committed','superseded')),
  superseded_at   timestamptz, superseded_by_profile uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
alter table public.work_hour_allocations add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;  -- GREEN part
create index if not exists work_hour_allocations_import_batch_idx on public.work_hour_allocations (import_batch_id) where import_batch_id is not null;
-- rollback of a batch = set superseded_by on every row of the batch + status='superseded' on the batch; never DELETE.
```

---

## D. AI / agent Living CV — contract summary

Existing: `ENTITY_TYPES` declares `ai_agent` (`lib/product-gate/entity-model.ts:43–62`, open union); `ai_runs` (`20260714150000_ai_runs_audit_v1.sql:46–84`: `provider`, `model_alias`, `model_id`, `prompt_version`, `output_excerpt`, `schema_validation`, `human_review_state`, `fallback_applied`, `blocked_reason`, tokens, cost, `profile_id` nullable) — prod 30 rows (`propose_conversation_intent` 23, `explain_market_demand` 6, `explain_match` 1), `profile_id` null in all 30 (attributed to the surface by design, `llm-proposal.ts` header); grants `authenticated:SELECT`, `service_role:INSERT`; `usage_cost_events` 30 rows (`payer`, `plan_key`, `provider`); `work_tasks.assignee_profile_id`; `company_memberships.source`. Missing: `profiles.actor_type` (production `profiles` columns verified: none), an agent's `workers` row (journal entries key on `worker_id`).

| Contract line | Rule |
|---|---|
| Identity | an agent is a `profiles` row with `actor_type = 'ai_agent'` (column to add, `organizations.organization_type` precedent) owned by ONE organization through `company_memberships` (`source='agent_registration'`); never a legal human identity (§5.1); never a `Role` value (guard `lib/guards/actor-role-plan-boundary.test.ts`) |
| Permissions / boundaries | the same RLS as any member; capability scopes (Stage 2) bound what it may write; `openWorldHint` stays false — an agent never messages outside the platform from LabourMarket.ai (Agentai OS boundary) |
| CAPABILITY ≠ IDENTITY | provider / model / version live on the RUN (`ai_runs.model_id`, `prompt_version`), never on the profile; a model swap changes provenance, not who the agent is |
| Evidence chain | REAL TASK (`work_tasks`, assignee = agent) → EXECUTION (`ai_runs` row linked by `request_context` → task id) → ARTIFACT (journal entry by the agent's worker row, `journal_entry_metrics.source='ai_extracted'`, `recorded_via='agent:<profile>'`) → REVIEW / ACCEPTANCE (human `journal_entry_confirmations`; `ai_runs.human_review_state`) → CAPABILITY (`worker_skills` for the agent, same ladder) — an agent's claim is never evidence |
| Failures / intervention | `ai_runs.fallback_applied`, `blocked_reason`, `human_review_state='rejected'`, `work_task_events` before/after by the intervening human — regressions are rows, not deletions |
| Cost | `usage_cost_events` per run (`payer` = owning org), never a second ledger |
| Last validation | `worker_skills.verified_at` / newest approving confirmation — the Living CV shows "last validated <date>" and degrades to SELF_DECLARED when stale |
| Not a marketplace | no agent listing, ranking or hiring surface in this contract |

---

## E. Personal / company assistant control — least privilege

READ / WRITE / COMMUNICATE must be separable. Today: READ = 3 tools; WRITE = journal, work card, interest, demand, context (all draft→confirm, append-only); COMMUNICATE = none exposed (correct). Files cannot travel over MCP — the assistant reads what the person uploaded in the app.

| Assistant | Action | Today | Minimum missing |
|---|---|---|---|
| Personal | import CV | web upload → `extractCvFile` → suggestions → confirm | `documents.list` (read) so the assistant can name what is missing; no MCP upload |
| Personal | maintain history | `journal.create_draft/confirm` per entry; `worker.add-work-history` server-action-only | `work_history.add_draft/confirm` capability (bridge of the existing action; `conversationActionId`) |
| Personal | certificates | `worker.add-document` server-action-only | read tool `documents.list` (have / valid / expires / missing) |
| Personal | journal / skills / evidence | live | `recorded_via` provenance (Stage 1) |
| Personal | projects, missing evidence | `worker.what-next` (server action) | `next_steps.get` read capability |
| Company | workers, teams, availability, history | reads via pages only | `company.workers.list` read capability (bounded, paginated) |
| Company | projects, sites, assignments | server actions `company.create-project/assign-worker/move-worker` | capability bridges with `manages_organization` — only after scopes (Stage 2) |
| Company | timesheets / import | web only | never over MCP without the batch model (Stage 3) |
| Company | document status, reports | server actions | read-first (`documents.status.get`), writes stay human |
| Both | SEND_EXTERNAL_MESSAGE | none | stays DENY; invitations remain human-initiated in the app |

---

## F. Research direction — what temporal / provenance semantics already exist

Keep PRODUCT / LONGITUDINAL DATA / RESEARCH / FORECAST / COUNTERFACTUAL as separate artefacts; only the first two exist and nothing forecasts or counterfactuals today (do not build).

| Question later | Exists now |
|---|---|
| what was true at time T | `journal_entries.hash_prev/hash_self` (order), `correction_of/superseded_by` (journal, allocations), `created_at` everywhere, `work_task_events.before_state/after_state` |
| what was shown / seen | `demand_interest_seen` (20260717150000), `pilot_events` (87 event names, 2,732 rows: route, task_step, result, error_code, metadata) |
| what was chosen / rejected | `demand_interest_signals`, `match_actions.action`, `journal_entry_confirmations.confirmation_scope.decision`, `booking_request_events` |
| what the AI proposed | `ai_runs.output_excerpt` (bounded, schema-validated), `learning_signals.proposed_outcome`, `journal_entry_skills.provenance='recognized'` |
| what it cost | `usage_cost_events`, `ai_runs.actual_cost_usd` |
| consent | `privacy_consent_purposes`, `privacy_consent_events` (text hash + version), `consents.consent_type`, `profiles.consent_data_processing`; `docs/CONSENT_LOG.md` (empty by design); `ai-data-minimization-contract-v1.md` |
| missing | a research-purpose consent row; `ai_runs` de-linking retention is a schedule (`20260808140000`) — research export must read redacted rows only |

---

## G. RED items (owner channel; nothing here is auto-mergeable)

1. Capability scopes on OAuth consent (auth-core) — Stage 2.
2. `profiles.actor_type` + agent `workers` row policy (RLS on a new actor class) — Stage 5.
3. `import_batches`, `journal_entry_contributors` (new tables + policies) — Stages 3/4b.
4. Admitting `training_skill_links` (FORMALLY_QUALIFIED) into the evidence ladder — owner decision recorded pending since 20260817230000.
5. Exposing CONFIRM_DERIVED_CAPABILITY or any invitation to a delegated token — DENY until 1 and the recorder exist.
