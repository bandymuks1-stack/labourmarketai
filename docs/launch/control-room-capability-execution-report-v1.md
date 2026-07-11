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
| B | Control room foundation | IN_PROGRESS | this PR | `/dashboard` (module registry + status strip + role grid; nav/command wired) | feature-availability registry, spine counts (request-cached single read), roles | RLS as today; badges spine-only | none | CI + guard suite; visual smoke recorded below | none | merge, start PR C |
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
| A (docs-only) | migration-safety + quality (CI) | PASS — merged #704 |
| B (control room) | typecheck, lint, vitest (530 files / 8353 tests), placeholders:check, check:i18n-debt, check:primary-route-smoke, check:public-seo-indexing, build | ALL PASS locally; CI on PR |

PR B notes: registry `lib/dashboard/dashboard-module-registry.ts` (11 modules) + pure view
model + grid/status-strip components; removed hard-coded `marketplaceAccess` block and
MyZone action list (readiness chip kept); command registry resolves module routes through
`getModuleRoute`; spine signals gained optional `featureKey` (overview tab now badges
pending invitations); `/dashboard/service-requests` added to the primary-route smoke
inventory; `getSpineCounts` request-cached (no second query set). New i18n keys
(`auth.dashboard.statusStrip.title/allClear`, `commandFinder.shortcutHint`) in lt/en/ru/nl/de —
non-active locale files follow the repo's frozen-subset convention (verified against recent
PRs). `DashboardChainActions` intentionally untouched (task deep-links, not module doors).
