# Control Room Capability Execution Report — v1

Living handoff document for the control-room capability expansion programme.
Companion: `docs/launch/control-room-capability-gap-map-v1.md` (audit truth @ `7f863f9`).
Updated per merged slice. Statuses are honest: a plan, shell, disabled provider path, or
unapplied migration is never reported as complete.

Status legend: `DONE` (merged + validated) · `IN_PROGRESS` · `GATED` (prepared, waiting on
owner/provider action named in the gate register) · `NOT_STARTED`.

| # | Capability | Status | PR / commit | Routes | Data sources | Security model | Migration | Deploy/smoke | Remaining gate | Next non-blocked action |
|---|---|---|---|---|---|---|---|---|---|---|
| A | Gap map + architecture | IN_PROGRESS | this PR | — (docs) | source audit | — | none | n/a | none | merge, start PR B |
| B | Control room foundation | NOT_STARTED | — | `/dashboard` | feature-availability registry, spine, roles | RLS as today | none | — | none | module descriptor layer |
| C | Unified activity centre | NOT_STARTED | — | `/dashboard/activity` (planned) | notification spine (6 signals) | RLS + seen RPCs | none (feed table gated) | — | events-table apply (optional) | spine-based surface |
| D | Work/task management | NOT_STARTED | — | `/dashboard/tasks` (planned) | new `tasks` table (gated) | `can_manage_project()` + assignee RLS | RED, human-gated | — | owner apply | degrading UI + migration PR |
| E | Planning/calendar | NOT_STARTED | — | `/dashboard/planning` (planned) | bookings, projects, assignments | caller-scoped reads | none | — | none | agenda aggregation |
| F | CRM/demand pipeline | NOT_STARTED | — | admin pipeline queue | lead-intake-model + public intakes | service-role + superadmin (unchanged) | none (contacts/ledger gated) | — | contacts/ledger apply (optional) | extend lead-intake-model |
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
| A (docs-only) | migration-safety self-test (CI) | pending CI |
