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
| F | CRM/demand pipeline | IN_PROGRESS | this PR | `/dashboard/admin/pipeline` (stage summary, filters, search, dedup chips); links from admin hub, sales panel, intake queue | leads + waitlist + operator-state customer_requests (sales seed) + company_need_public_intakes (admin seed) — composition only, no new call sites | superadmin gating unchanged; read-only, no mutation, no outbound (guard-pinned) | none (contacts/stage-ledger/dedup-index stay migration-gated) | CI + guard suite | contacts/ledger apply (optional) | merge, start PR G |
| G | Project ops + resources | NOT_STARTED | — | `/dashboard/projects/[id]/operations` | getProjectOperations + journal + gallery | RLS as today | issues/milestones gated | — | drafts apply | compose surface |
| H | Document centre | NOT_STARTED | — | `/dashboard/documents` | worker_documents + photos + CV/evidence + handover | RLS + consent aggregates | bucket gated | — | worker-docs bucket | consolidation hub |
| I | Finance foundation | NOT_STARTED | — | `/dashboard/finance` (planned) | new invoice/expense tables (gated) | owner-scoped RLS, RPC writes | RED, human-gated | — | owner apply | shell + migration PR |
| J | AI assistance centre | NOT_STARTED | — | `/dashboard/assist` (planned) | lib/ai runtime + learning_review_queue | server-only provider boundary | ai_runs gated | — | provider key + apply | honest-disabled surface |
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
| F (CRM pipeline) | same suite — vitest 534 files / 8485 tests | ALL PASS locally; CI on PR |

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
