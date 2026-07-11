# Control Room Capability Execution Report — v1

Living handoff document for the control-room capability expansion programme.
Companion: `docs/launch/control-room-capability-gap-map-v1.md` (audit truth @ `7f863f9`).
Updated per merged slice. Statuses are honest: a plan, shell, disabled provider path, or
unapplied migration is never reported as complete.

Status legend: `DONE` (merged + validated) · `IN_PROGRESS` · `GATED` (prepared, waiting on
owner/provider action named in the gate register) · `NOT_STARTED`.

| # | Capability | Status | PR / commit | Routes | Data sources | Security model | Migration | Deploy/smoke | Remaining gate | Next non-blocked action |
|---|---|---|---|---|---|---|---|---|---|---|
| A | Gap map + architecture | DONE | #704 / `36a18ff` | — (docs) | source audit | — | none | n/a | none | — |
| B | Control room foundation | DONE | #705 / `3e568d2` | `/dashboard` (module registry + status strip + role grid; nav/command wired) | feature-availability registry, spine counts (request-cached single read), roles | RLS as today; badges spine-only | none | CI green; deployed via Vercel on merge | none | — |
| C | Unified activity centre | DONE | #706 / `2b0742a` | `/dashboard/activity` + status-strip/bell "view all" links | notification spine (6 signals, one request-cached read) | RLS + existing seen RPCs; links-only, no fake mark-read | none (persistent feed + demand signals stay migration-gated) | CI green; deployed on merge | events-table apply (optional, for feed/demand events) | — |
| D | Work/task management | GATED (UI merged; table unapplied) | D1 #707 / `832680e`; D2 draft #708 (needs-human-gate) | `/dashboard/tasks` (my-tasks, board, create/edit/status); ops-page bridge | `work_tasks` via 3 SECURITY DEFINER RPCs (unapplied); honest "preparing" state; spine signal `open-task-attention` (0 pre-apply) | RLS SELECT creator/assignee/admin/`can_manage_project`; writes RPC-only (guard-pinned) | D2 RED, human-gated, rollback sibling, classifier green (4 patterns acknowledged) | D1 CI green, merged | owner applies #708 via MCP + ledger entry | — (gate visible on #708) |
| E | Planning/calendar | DONE | #709 / `71cf03a6` | `/dashboard/planning` (agenda + 7-day strip, filters, conflicts) | bookings (both directions), company project bands, due-dated tasks (degrading); worker-side assigned-project read skipped honestly (no RLS-scoped helper exists) | caller-scoped reads only; read-only; no admin client (guard-pinned) | none | CI green; deployed on merge | none | — |
| F | CRM/demand pipeline | DONE | #710 / `020ebd96` | `/dashboard/admin/pipeline` (stage summary, filters, search, dedup chips); links from admin hub, sales panel, intake queue | leads + waitlist + operator-state customer_requests (sales seed) + company_need_public_intakes (admin seed) — composition only, no new call sites | superadmin gating unchanged; read-only, no mutation, no outbound (guard-pinned) | none (contacts/stage-ledger/dedup-index stay migration-gated) | CI green; deployed on merge | contacts/ledger apply (optional) | — |
| G | Project ops + resources | DONE | #711 / `18006128` | `/dashboard/projects/[id]/operations` upgraded (header strip, attention, resources, tasks, evidence, handover); `projects` module added for org roles | getOperationsCentre composing getProjectOperations + handover + project tasks (degrading) + gallery counts + housing_provided + availability basics + accepted booking ranges | RLS as today; composition-only, `.from` set guard-pinned; unapplied draft columns never read | none (milestones/issues/resource tables stay gated) | CI green; deployed on merge | drafts apply (handover, availability prefs, team spine) | — |
| H | Document centre | DONE | #712 / `88ce0ee7` | `/dashboard/documents` consolidated (attention strip, filtered inventory, work-proof exports, org aggregate view) | worker_documents readiness (applied; verification axis read degradably), journal HEAD counts, CV/evidence/journal exports, `agency_pool_docs_readiness` RPC for orgs | RLS + consent-gated aggregate RPC only; read-only, no storage, no upload UI (guard-pinned) | none (worker-docs bucket stays gated) | CI green; deployed on merge | worker-docs bucket apply for real file upload | — |
| I | Finance foundation | GATED (UI merged; table unapplied) | I1 #713 / `6a50b729`; I2 draft #714 (needs-human-gate) | `/dashboard/finance` (records list, filters, forms, summary strip, CSV export route); honest "preparing" pre-apply | `finance_records` via 3 SECURITY DEFINER RPCs (unapplied); overdue DERIVED app-side; cents-only math | RLS SELECT creator/admin/`owns_company`; writes RPC-only; no payment-provider code (guard-pinned) | I2 RED, human-gated, rollback sibling, classifier green | I1 CI green, merged | owner applies #714 via MCP + ledger | — (gate visible on #714) |
| J | AI assistance centre | IN_PROGRESS | this PR | `/dashboard/assist` (attention, deterministic summaries, honest provider-state card) | spine counts, document/finance attention derivations, evidence report, project reads — deterministic only; provider state via existing config resolver (never the key) | read-only, RLS client only; no runAiAgent call, no prompt UI (guard-pinned) | none (ai_runs store stays gated) | CI + guard suite | provider key (EXTERNAL_PROVIDER_GATED) + ai_runs migration for live generation | merge, start PR K |
| K | Search + reports | NOT_STARTED | — | search API + reports hub | RLS-scoped server queries | permission-scoped, no leakage | none | — | none | server search |

## Gate register (owner/provider actions)

See gap map §"Gate register". None triggered yet by merged work.

## Validation log

Per runtime PR: typecheck, lint, vitest, build, placeholders:check, check:i18n-debt,
check:public-seo-indexing, check:primary-route-smoke, landing-freeze (via vitest),
migration-safety self-test, 390px mobile smoke (LT + DE), desktop smoke, keyboard/focus,
no `[EN]` markers, no external reference names, no duplicate canonical routes.
Results recorded here per PR as they run.

| PR | Commands run | Result |
|---|---|---|
| A (docs-only) | migration-safety + quality (CI) | PASS — merged #704 |
| B (control room) | typecheck, lint, vitest (530 files / 8353 tests), placeholders:check, check:i18n-debt, check:primary-route-smoke, check:public-seo-indexing, build | ALL PASS locally; CI green; merged #705 |
| C (activity centre) | same suite — vitest 531 files / 8379 tests, primary-route-smoke 37 routes | ALL PASS; CI green; merged #706 |
| D1 (tasks repo-safe layer) | same suite — vitest 532 files / 8412 tests, primary-route-smoke 38 routes | ALL PASS; CI green; merged #707 |
| D2 (work_tasks migration) | migration-safety self-test 26/26; classifier on diff GREEN (4 RED patterns human-gate-acknowledged); work-tasks guard 30/30 | draft #708, needs-human-gate — awaiting owner apply |
| E (planning) | same suite — vitest 533 files / 8451 tests, primary-route-smoke 39 routes | ALL PASS; CI green; merged #709 |
| F (CRM pipeline) | same suite — vitest 534 files / 8485 tests | ALL PASS; CI green; merged #710 |
| G (project ops centre) | same suite — vitest 535 files / 8523 tests, primary-route-smoke 40 routes | ALL PASS; CI green; merged #711 |
| H (document centre) | same suite — vitest 536 files / 8562 tests | ALL PASS; CI green; merged #712 |
| I1 (finance repo-safe layer) | same suite — vitest 537 files / 8597 tests, primary-route-smoke 41 routes | ALL PASS; CI green; merged #713 |
| I2 (finance_records migration) | migration-safety classifier GREEN (RED patterns human-gate-acknowledged); finance guard 33/33 | draft #714, needs-human-gate — awaiting owner apply |
| J (AI assistance centre) | same suite — vitest 538 files / 8633 tests, primary-route-smoke 42 routes | ALL PASS locally; CI on PR |

PR J notes: deterministic-only slice — attention composed from the spine + document/finance
derivations, summaries from the evidence report and the caller company's project reads,
every row/summary shows its sources; the AI provider card reads only state+reason from the
existing config resolver (disabled in production — stated honestly with both gates named:
provider key EXTERNAL_PROVIDER_GATED and the ai_runs/ai_suggestions audit-store migration).
runAiAgent is never called; no prompt UI; guard-pinned. AI_* env docs deferred to the
live-enable slice.

PR I decisions: statuses stored are draft|issued|partially_paid|paid|cancelled — overdue is
DERIVED app-side from due_date + unpaid (no cron, no stale stored state). Module for
company/agency/worker (customers excluded). finance-overdue-attention spine signal is a
recorded follow-up after I2 applies. CSV export via route handler over the caller's own
RLS rows (503 pre-migration, never a fabricated file). EUR-only, integer-cents math.

PR H notes: DOCUMENTS_READINESS_ENABLED left true (apply evidenced via the flag-flip MCP
record + the s6 ledger row building agency_pool_docs_readiness on worker_documents);
verification axis (20260613100200) has no ledger row → read degradably (absent column →
no claim rendered). LEDGER GAP recorded: no explicit APPLIED_LEDGER rows for
20260610170000_worker_documents_readiness / 20260613100200 — owner may want to backfill.
Org view calls the applied consent-gated RPC directly (counts only); file upload stays
gated on the worker-documents bucket.

PR G notes: demand references skipped honestly (no repo lib reads job_demands);
project→conversation linkage limited to the instruction counts the board already carries;
attention rows trace only to real data (documents_needed workers, needed checklist items,
overdue/blocked tasks) each with a resolve link; booking-overlap chips reuse the planning
model's inclusive daterange semantics on accepted rows the caller can already read.

PR F stage mapping (presentation-only; stored statuses always shown verbatim):
customer_requests draft→excluded, submitted→new, in_review→qualifying,
needs_followup→follow_up, approved→active, closed→closed · public intakes new→new,
contacted→contacted, qualified→qualifying, rejected→closed · leads new→new,
contacted→contacted, qualified→qualifying, won→active, lost→closed · waitlist→new
(storedStatus null rendered as "—"). Dedup: display-only chips on normalized
company-name/email key collisions; no merge action. conversation_source_context
read-only history noted as a possible follow-up.

PR E notes: pure agenda model + conflict detection mirroring the booking accept guard's
inclusive daterange && semantics (accepted incoming bookings + own assignments only —
overlaps that prove nothing are excluded); per-source honest degradation notes; planning
module added to registry (bookings module re-pointed to its own label keys); no calendar
dependency; worker-side assigned-project bands deferred until an RLS-scoped read exists.

PR D contract (the D2 migration must match exactly): table `public.work_tasks`
(id, project_id→projects, source_type/source_id pair check 'project|booking|demand|company',
title 3..160, description ≤2000, status todo|in_progress|blocked|done|cancelled,
priority low|normal|high, assignee_profile_id→profiles, created_by→profiles, due_at,
created_at/updated_at, resolved_at). RLS SELECT creator/assignee/is_admin()/
can_manage_project(project_id); INSERT/UPDATE/DELETE revoked. RPCs (SECURITY DEFINER,
set search_path=public, revoke-then-grant-execute, outcome strings):
`create_work_task_v1(p_title,p_description,p_priority,p_due_date,p_project_id,p_assign_to_self)`,
`set_work_task_status_v1(p_task_id,p_status)` (resolved_at on done/cancelled),
`update_work_task_v1(p_task_id,p_title,p_description,p_priority,p_due_date)`.
v1 UI decisions: self-assign or unassigned only (no people-picker); comments → conversation
spine and attachments → document axes in later slices; overdue = UTC calendar-day.

PR C notes: `lib/dashboard/activity-centre.ts` pure view model inverts the registry's
`attentionSignalIds` linkage (no duplicated labels/routes); `/dashboard/activity` renders one
row per spine signal with real count, clearing-surface link and honest per-signal read
semantics; searchParams-driven filters (attention state + source module); no buttons — links
only, no fake mark-read; demand/verification events intentionally absent (no seen-model —
migration-gated). Guard `activity-centre.test.ts` pins spine-only sourcing and 1:1 catalogue
coverage. New namespace `activityCentre.*` in lt/en/ru/nl/de.

PR B notes: registry `lib/dashboard/dashboard-module-registry.ts` (11 modules) + pure view
model + grid/status-strip components; removed hard-coded `marketplaceAccess` block and
MyZone action list (readiness chip kept); command registry resolves module routes through
`getModuleRoute`; spine signals gained optional `featureKey` (overview tab now badges
pending invitations); `/dashboard/service-requests` added to the primary-route smoke
inventory; `getSpineCounts` request-cached (no second query set). New i18n keys
(`auth.dashboard.statusStrip.title/allClear`, `commandFinder.shortcutHint`) in lt/en/ru/nl/de —
non-active locale files follow the repo's frozen-subset convention (verified against recent
PRs). `DashboardChainActions` intentionally untouched (task deep-links, not module doors).
