> **HISTORICAL, POINT-IN-TIME AUDIT — DO NOT UPDATE IN PLACE.**
> Audit date **2026-08-02** · base commit `c05a4802` · source `audit/w11-project-operating-system` @ `b5e8247f`.
> Findings are frozen exactly as written and were **not** re-scored against later work.
> Closed since this audit: **P0-4** and **P2-4** by PR #985 (`693e8efa`); **P0-2**/**P1-2** have merged code in PR #988 (`6433b1a3`) whose migration is **NOT applied to production**.
> §7 states W13/W14 were undefined at audit time; W14 was defined afterwards, W13 still is not.
> Current state → [post-merge production readiness baseline 2026-08-03](./post-merge-production-readiness-baseline-2026-08-03.md).
> Restored to `main` on 2026-08-03 (docs-only, content unaltered).

---

# W11 — Project Operating System: read-only audit

**Worktree:** `C:\Users\Mano\Documents\labourmarketai-w11-audit`
**Branch:** `audit/w11-project-operating-system` (base `origin/main` `c05a48026b945c14a42a76a34cb1c90ce9113e87`)
**Date:** 2026-08-02
**Mode:** STRICT READ-ONLY. No file was modified. No command was run against any database,
dev server, test runner, or production surface. See §10.

---

## 0. Method, and what this audit could NOT verify

Everything below is derived from three sources only:

1. `supabase/migrations/*.sql` — the SQL that defines tables, RLS and RPCs.
2. `apps/web/**` — the reads, writes and route gates.
3. `docs/APPLIED_LEDGER.md` + `apps/web/lib/supabase/types.ts` — evidence of what is live in prod.

**Limits I am declaring up front rather than guessing around:**

- **I did not query the database.** Every "applied in prod" claim rests on (a) an
  `APPLIED_LEDGER.md` row, (b) the presence of the table in the generated
  `apps/web/lib/supabase/types.ts` (which contains `project_members`
  (`types.ts:5589`), `project_stages` (`:5628`), `project_budgets` (`:5449`),
  `defects` (`:2260`), `finance_records` (`:2716`) but contains **zero**
  occurrences of `experience_records` — i.e. it is a snapshot of the applied
  schema, not of the repo), and (c) app-code comments that assert prod state
  (`apps/web/lib/company/project-context.ts:6-9`: "The project / object / client
  / work-item data model is now live in prod (migrations 20260601090000 +
  20260601091000)"). That is strong but not conclusive.
- **`docs/APPLIED_LEDGER.md` is incomplete for this domain.**
  `20260601091000_project_object_client_context.sql` — the migration that creates
  `can_manage_project()`, `project_members`, `project_clients` and
  `project_worker_assignments`, i.e. the entire authorization spine of the project
  OS — has **no ledger row at all** (`grep -n "20260601091000" docs/APPLIED_LEDGER.md`
  returns nothing). Same for `20260705230000_project_handover_passport.sql` and
  `20260609180000_pilot_ops_v2_status_readiness.sql`. The ledger is therefore not a
  reliable inventory of this domain; the later Wagon rows (`APPLIED_LEDGER.md:373`,
  `:377`) prove `can_manage_project` exists in prod only indirectly, by citing
  post-apply verification that exercised it.
- **I could not observe row counts.** Statements like "every project is `draft`"
  are statements about the **code paths**, not about the 4 rows the W10 backfill
  touched (`20260627143433_w10_projects_org_backfill.sql:20`).
- **W13 / W14 do not exist in this repo.** `grep -rn "W13\|W14" docs/` finds only
  `APPLIED_LEDGER.md` prose. The only "W1x" roadmap
  (`docs/audits/labourmarketai-premium-rebuild-execution-plan.md:29-30`) uses a
  *different* numbering (W10 = mobile/a11y/perf, W11 = production E2E). §7 therefore
  reports W9 and W12 dependencies concretely and states honestly that W13/W14 are
  undefined.

---

## 1. Domain schema — tables, columns, FKs, RLS

### 1.1 The spine: `public.projects`

Defined in `supabase/migrations/0001_initial_schema.sql:140-152`:

| column | notes |
|---|---|
| `id` uuid pk | |
| `company_id` uuid → `companies(id)` **on delete cascade** | legacy owner pointer, still the RLS key |
| `organization_id` uuid → `organizations(id)` **on delete restrict** | added `20260530120100_projects_company_to_organization.sql:25-27`; **not referenced by any `projects` RLS policy** |
| `title`, `country`, `city` | |
| `start_date`, `end_date` date | **never written by the app** — see §5.3 |
| `housing_provided` boolean | |
| `status` text check `('draft','live','paused','closed')` | **never written after insert** — see §2 |
| `granularity`, `location_confirmed`, `visibility_level` | added `20260617120000_market_map_data_model_v1.sql:147-155`; **no app write path exists** (only `preferred_locations` is updated in `lib/market-map/capture.ts:142-167`) |

**RLS — unchanged since 0001.** `grep -rn "policy .* on public.projects" supabase/migrations/`
returns hits in `0001_initial_schema.sql` **only** (lines 501–514):

```
projects_select  using ( owns_company(company_id) or is_admin()
                         or (status = 'live' and auth.uid() is not null) )   -- :502-504
projects_insert  with check ( owns_company(company_id) or is_admin() )       -- :506-507
projects_update  using/with check ( owns_company(company_id) or is_admin() ) -- :509-511
projects_delete  using ( owns_company(company_id) or is_admin() )            -- :513-514
```

`owns_company(c)` = `companies.profile_id = auth.uid()`
(`0001_initial_schema.sql:321-326`). `companies.profile_id` is UNIQUE
(`20260604120000_company_profile_request.sql:245`), so **`owns_company` resolves to
exactly one human being per company.**

### 1.2 The authorization helper: `can_manage_project`

`supabase/migrations/20260601091000_project_object_client_context.sql:22-35`:

```sql
create or replace function public.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p
     where p.id = p_project_id
       and ( public.owns_company(p.company_id)
          or public.manages_organization(p.organization_id)
          or public.is_admin() ));
$$;
```

`manages_organization(org)` (`0013_work_journal_m1.sql:109-119`) = an **active**
`engagement_contexts` row for `auth.uid()` with
`relationship_slug in ('manager','owner','external_manager')`.

**`can_manage_project` does NOT consult `project_members`.** This is the single most
consequential fact in the domain — see §3 and §4.

### 1.3 Project-scoped tables

| table | file:line | RLS SELECT | write path |
|---|---|---|---|
| `project_clients` | `20260601091000…:40-49` | `can_manage_project(project_id)` (`:98-99`) | direct DML policy `for all` (`:100-103`) + GRANT (`:124`) |
| `project_members` | `20260601091000…:53-61` | `profile_id = auth.uid() or can_manage_project(project_id)` (`:107-108`) | direct DML `for all using can_manage_project` (`:109-112`) |
| `project_worker_assignments` | `20260601091000…:66-75` | `owns_worker(worker_id) or can_manage_project(project_id)` (`:116-117`) | tightened by `20260609120000_project_worker_assignment_gate.sql:84` — RPC `assign_worker_to_project` requires `can_manage_project(pid) AND caller_manages_worker(w_id)` |
| `project_stages` | `20260718140000_project_operations_stages.sql:22-42` | `can_manage_project(project_id)` **OR** active `project_worker_assignments` row (`:53-65`) | RPC-only: `add_/update_/delete_project_stage_v1` (`:71,:103,:154`), each re-checks `can_manage_project` |
| `project_budgets` | `20260718160000_project_budgets.sql:18-32` | `can_manage_project(project_id) or is_admin()` (`:39-41`) — **managers only, never workers** | RPC-only `set_project_budget_v1` / `_status_v1` / `delete_…` (`:48,:82,:107`) |
| `defects` | `20260718200000_delivery_quality.sql:15-31` | `can_manage_project(project_id) or reporter_id = auth.uid() or is_admin()` (`:53-55`) | RPC-only `report_defect_v1` (`:73`), `set_defect_status_v1` (`:88`), `add_defect_correction_v1` (`:102`), `delete_defect_v1` (`:121`) |
| `defect_corrections` | `20260718200000…:34-45` | `caller_manages_defect(defect_id) or is_admin()` (`:66-68`) | via `add_defect_correction_v1` |
| `work_tasks` | `20260711210000_work_tasks_v1.sql:71-107` | `created_by = uid or assignee = uid or is_admin() or can_manage_project(project_id)` (`:121-128`) | RPC-only `create_work_task_v1` (`:133`), `set_work_task_status_v1` (`:204`), `update_work_task_v1` (`:257`); direct DML revoked (`:329`) |
| `finance_records` | `20260711230000_finance_records_v1.sql:70-105` | **`created_by = uid or is_admin() or owns_company(company_id)`** (`:120-126`) — **`project_id` is NOT in the policy** | RPC-only (`:131,:229,:314`); direct DML revoked (`:366`) |
| `assets` | `20260718170000_assets_logistics.sql:16-35` | **`manages_organization(organization_id)`** (`:66-70`) — a different spine | RPC-only (`:95,:129,:169,…`) |
| `asset_assignments` | `20260718170000…:37-55` (has `project_id` FK, `:40`) | `manages_organization` of the asset's org, via `caller_manages_asset` (`:81-84`, recursion fixed in `20260718180000_assets_rls_recursion_fix.sql`) | `issue_asset_v1` (`:129`) |
| `project_handover_entries` | `20260705230000_project_handover_passport.sql`; live per `types.ts:5544` | manager-only per `lib/projects/handover-passport.ts:22-23` | `lib/projects/handover-passport-actions.ts` |
| `journal_entries.project_id` | `20260601091000…:80-83` | inherited from `journal_entries_select` (`0013:341-…`) | autolink `20260610213000_journal_entry_project_autolink.sql` |
| `journal_entry_photos` (project gallery) | `20260705250000_journal_photos_project_gallery.sql:32-42` | **`manages_organization(ec.organization_id)` of the journal entry** — a third spine | n/a (read extension only) |

### 1.4 Dead schema (exists in prod, unreachable by any code path)

| object | evidence |
|---|---|
| `project_members` (whole table, incl. its `role in ('owner','manager','member','viewer')` column, `20260601091000…:57-58`) | `grep -rn 'from("project_members")' apps/web` → **0 hits**. Only mentions are comments: `lib/company/project-context.ts:8`, `lib/guards/product-readiness.test.ts:1292`, and the generated `types.ts:5589`. **DEAD** |
| `project_clients` read path | written once at creation (`lib/company/project-context-actions.ts:78`); `grep` shows **no read** anywhere. **DEAD (write-only)** |
| `project_stages.responsible_engagement_id` (`20260718140000…:33`) | neither `add_project_stage_v1` (params at `:71-77`) nor `update_project_stage_v1` (`:103-113`) accepts it; `grep -rn "responsible_engagement" apps/web` hits only `types.ts:5641/5658/5675/5696`. **DEAD** |
| `projects.granularity` / `visibility_level` / `location_confirmed` | read by `lib/market-map/signals.ts:233`, never written. **DEAD (defaults only)** |
| `projects.status` values `live` / `paused` / `closed` | never written — §2. **DEAD** |
| `projects.start_date` / `end_date` / `country` / `housing_provided` | never written — §5.3. **DEAD** |

---

## 2. Project lifecycle as actually implemented

**Q1: how much of create → plan → execute → close exists?**

### CREATE — **FULL** (one canonical core, two entry points)

`apps/web/lib/projects/create-project-core.ts:33-67` is the single insert:

```ts
.from("projects").insert({ company_id, organization_id, title, city, status: "draft" })   // :48-55
```

Both callers route through it: `lib/projects/actions.ts:43` (`createProjectAction`,
inline form on `/dashboard/projects`) and `lib/company/project-context-actions.ts`
(`createProjectContextAction`, `/dashboard/company/projects/new`). Pinned by
`lib/company/project-context-create.test.ts:98-103`. **FULL.**

### PLAN — **PARTIAL**

`project_stages` is real (§1.3) and reachable at
`app/[locale]/dashboard/projects/[id]/operations/page.tsx:319` (`ProjectStagesPanel`)
and `:324` (`ProjectStageGantt`). Budgets are real (`:329`). But:

- **the project row itself cannot be planned.** `start_date` / `end_date` / `country`
  are never set at creation (`create-project-core.ts:49-55`) and there is **no update
  path at all** — `grep -rn '"projects"' apps/web --include=*.ts | grep -i update`
  returns nothing, and no migration defines a `projects`-updating RPC
  (`grep -rn "update public.projects" supabase/migrations/` → only the two backfills).
  **The `projects` row is INSERT-ONLY in the entire product.**
- no stage↔task link. `work_tasks` has no `stage_id`
  (`20260711210000_work_tasks_v1.sql:71-107`), despite the stage migration promising
  "a later slice links tasks to a stage" (`20260718140000…:9-10`). **MISSING.**

### EXECUTE — **PARTIAL**

Real and wired: worker assignment (`lib/projects/actions.ts:73-105` → RPC
`assign_worker_to_project`), tasks, defects, assets, journal/evidence, handover
passport entries. All reachable from
`app/[locale]/dashboard/projects/[id]/operations/page.tsx`.

### CLOSE — **MISSING**

There is no close. `projects.status` is written exactly once, to `'draft'`
(`create-project-core.ts:54`), and never again. The reports hub proves the product
does not even model `closed`:

```ts
const byStatus: Record<ReportProjectStatus, number> = { draft: 0, live: 0, paused: 0 };
```
`apps/web/lib/reports/reports-hub.ts:203-207` — `'closed'` is absent from
`REPORT_PROJECT_STATUSES`. **MISSING.**

The handover passport (`lib/projects/handover-passport.ts`) is the closest thing to a
close ritual, but it appends declarative entries and does not transition the project.

**Verdict Q1: CREATE=FULL, PLAN=PARTIAL, EXECUTE=PARTIAL, CLOSE=MISSING.**

---

## 3. Permissions matrix (actor × action × enforcement point)

**Q3.** There are **three independent authorization spines** in this domain and they
do not agree:

- **S1 — `owns_company(projects.company_id)`.** One profile per company
  (`companies.profile_id` UNIQUE). Gates the `projects` table itself.
- **S2 — `manages_organization(projects.organization_id)`.** N profiles via
  `engagement_contexts`. Gates `assets`, the project photo gallery, and *half* of
  `can_manage_project`.
- **S3 — `profiles.active_role ∈ {company, agency}`.** A UI-only gate, hand-rolled
  and duplicated verbatim in four route files
  (`dashboard/projects/page.tsx:23`, `projects/[id]/page.tsx:32`,
  `projects/[id]/operations/page.tsx:44`, `dashboard/assets/page.tsx:11`).

| Actor | Action | Allowed? | Enforcement point |
|---|---|---|---|
| Company owner (S1) | create project | ✅ | `projects_insert` `0001:506` + `create-project-core.ts:47` |
| Company owner | read own project | ✅ | `projects_select` `0001:502` |
| Company owner | update/close project | ❌ **no code path** | `projects_update` `0001:509` allows it at DB level; no app write exists |
| Company owner | manage stages/budgets/defects/tasks | ✅ | `can_manage_project` → `owns_company` |
| Company owner | read project assets | ❌ **unless also an org manager** | `assets_select` = `manages_organization` only (`20260718170000…:66-70`) |
| Company owner | read project photo gallery | ❌ **unless also an org manager** | `20260705250000…:32-42` |
| Org manager (S2, not the company owner) | read the `projects` row | ❌ | `projects_select` has **no** `manages_organization` clause (`0001:502-504`) |
| Org manager | open `/dashboard/projects` | ❌ empty list | `listManagedProjects` (`lib/projects/projects.ts:60-66`) relies on `projects_select` |
| Org manager | open `/dashboard/projects/[id]/operations` | ❌ `ops-not-authorized` | `getProjectOperations` returns null when the `projects` row is unreadable (`lib/projects/operations.ts:241`) → `operations/page.tsx:98-110` |
| Org manager | add/edit a project stage | ✅ **at the RPC** | `add_project_stage_v1` gate is `can_manage_project` (`20260718140000…:86`) |
| Org manager | set a project budget | ✅ **at the RPC** | `set_project_budget_v1` (`20260718160000…:61`) |
| Org manager | read those stages/budgets back | ✅ | `project_stages_select` / `project_budgets_select` use `can_manage_project` |
| **Anyone authenticated** | read **any** project whose `status='live'` | ✅ **(latent cross-tenant read)** | `projects_select` `0001:504` |
| `project_members.role = 'manager'` | anything | ❌ **nothing at all** | `can_manage_project` (`20260601091000…:22-32`) never reads `project_members` |
| Assigned worker | read own assignment | ✅ | `pwa_select` `20260601091000…:117` |
| Assigned worker | read the parent `projects` row | ❌ **for every draft project** | `projects_select` has no assigned-worker clause; see §6 P0-2 |
| Assigned worker | read project stages | ✅ | `project_stages_select` second branch (`20260718140000…:57-64`) |
| Assigned worker | read project budgets | ❌ (by design, correct) | `project_budgets_select` `20260718160000…:41` |
| Assigned worker | report a defect they see on site | ❌ | `report_defect_v1` requires `can_manage_project` (`20260718200000…:80`), even though `defects_select` anticipates a non-manager `reporter_id` (`:54`) |
| Dismissed manager | everything above | ✅ **forever** | no revocation path — §6 P0-1 |

**Q4: is "project manager" only a label, or an enforced right?**

**It is a label — and worse, it is a label on a table nobody reads.**
`project_members` carries `role in ('owner','manager','member','viewer')`
(`20260601091000…:57-58`), has RLS and GRANTs (`:107-112`, `:125`), is live in prod
(`types.ts:5589`) — and **no line of application code ever selects, inserts or updates
it**. The one function whose name promises to answer "can this person manage the
project", `can_manage_project`, does not join it
(`20260601091000…:24-32`). Classification: **DEAD**.

The *effective* project manager is "the single profile that owns the `companies`
row", plus "anyone with an active manager/owner engagement on the organization" —
and those two populations get **different, partially-broken** product experiences
(§6 P0-3).

**Q5: does W9 organization scope actually restrict project access, or is it profile-level?**

**Profile-level.** `projects.organization_id` exists (`20260530120100…:25`), is
backfilled (`20260627143433…:23-29`), is joined for a display chip
(`lib/projects/projects.ts:63`) — and is **used by exactly zero `projects` RLS
policies**. Every gate on the `projects` table is `owns_company(company_id)`, i.e.
`companies.profile_id = auth.uid()`. Organization scope enters the domain only
*below* the project row, through `can_manage_project`'s second branch — which, as
§6 P0-3 shows, grants write rights the table itself denies read rights for.
Compounding this, `organizations_select` is `using (true)`
(`0013_work_journal_m1.sql:327`), so the org directory is world-readable to any
authenticated user.

---

## 4. Surface map

Every route/result that touches the project domain, classified.

| # | Surface | File | Classification | Evidence |
|---|---|---|---|---|
| 1 | `/dashboard/projects` (manager map) | `app/[locale]/dashboard/projects/page.tsx` | **PARTIAL** | Real reads (`listProjectMap` :111 → `lib/projects/map.ts:24`), but the list is whatever `projects_select` returns — which includes **every `live` project on the platform** (`0001:504`). Gate is S3 `active_role` (`:23,:55`), not S1/S2. |
| 2 | `/dashboard/projects` (worker branch) | same file, `:59-108` | **PARTIAL / MISLEADING** | `listWorkerProjects` (`lib/projects/worker-project-access.ts:118-151`) returns `title:null, status:null, city:null` for every draft project, because `projects_select` denies the row (`:145-147` fall back to `?? null`). Renders assignment cards with no project identity. |
| 3 | `/dashboard/projects/[id]` (stadium) | `projects/[id]/page.tsx` | **PARTIAL** | Manager path real (`getProjectStadium` :73). Worker path (`getWorkerProjectView` :76) returns `project: null` for draft projects (`worker-project-access.ts:91-95,:104-114`). |
| 4 | `/dashboard/projects/[id]/operations` | `projects/[id]/operations/page.tsx` | **FULL for the company owner, DEAD for the org manager** | Rich and real (stages :319, Gantt :324, economics :329, defects :354, board :427, passport :441). But `getOperationsCentre` → `getProjectOperations` returns null when `projects` RLS denies the row (`lib/projects/operations.ts:241`) → `ops-not-authorized` (`page.tsx:104-108`). |
| 5 | `/dashboard/projects/[id]/operations/report` | `.../report/route.ts` | **FULL** | CSV over `getProjectOperations`; 401/403/404 gates at `:28-50`. |
| 6 | `/dashboard/company/projects/new` | `company/projects/new/page.tsx` | **FULL** | `requireRoleOrRedirect(locale,"company")` (`:21`) → `createProjectContextAction`. |
| 7 | `/dashboard/company/projects` (index) | — | **MISSING (404)** | Directory contains only `new/`. Yet `action-registry.ts:456` sets `advancedRoute: "/dashboard/company/projects"` for `company.assign-worker`. **Dead link shipped in the action registry.** |
| 8 | `/dashboard/company/planning` | `company/planning/page.tsx` | **PARTIAL** | Real workforce read (`lib/workforce/workforce.ts:184,:245` touch `projects` + assignments); the "timeline" at `:507` is an inline month-bucket list over the pure `lib/workforce/gap-timeline.ts`, not a project schedule. |
| 9 | `/dashboard/planning` (canonical calendar) | `dashboard/planning/page.tsx` | **PARTIAL** | Project bands (`lib/planning/planning.ts:194,:280`) and stages (`:376`) are real projections. **No route-level auth gate** — RLS only. Worker-side project bands are empty in practice (§6 P0-2). |
| 10 | `/dashboard/tasks` | `dashboard/tasks/page.tsx` | **PARTIAL** | Real `work_tasks` reads (`lib/tasks/tasks.ts:94,:162`). Project filter fed by `listManagedProjects` (`:147`) → inherits the `live`-leak. Board is 4 static columns (`:71-76`), no drag, **no dependencies**. |
| 11 | `/dashboard/assets` | `dashboard/assets/page.tsx` | **PARTIAL** | Real, but org-scoped (S2) while the rest of the project OS is S1 — a company owner who is not an org manager sees nothing. |
| 12 | `/dashboard/documents` | `dashboard/documents/page.tsx` | **MISSING (project axis)** | Reads only worker-owned documents (`lib/documents/document-centre.ts:101,:116,:147,:152`). The "project axis" is a bare `<Link href="/dashboard/projects">` (`:177-186`, testid `doc-centre-org-project-link`) plus an explanatory note. No project document exists. |
| 13 | `/dashboard/finance` + `/finance/export` | `dashboard/finance/page.tsx`, `.../export/route.ts` | **PARTIAL / MISLEADING** | Real `finance_records`, but the reader is `listMyFinanceRecords` (`lib/finance/finance.ts:100-124`) — **the caller's own rows only**. `project_id` is a dropdown label, not a scope. |
| 14 | `/dashboard/admin/project-truth` | `admin/project-truth/page.tsx` | **MISLEADING (naming)** | `requireSuperadmin` (`:80`); reads `profiles`/`profile_roles`/CRM head-counts. **Never touches the `projects` table.** "Project" here means the Supabase project. |
| 15 | `?result=project` Workspace Result | `lib/conversation/result-registry.ts:186-193` + `components/app/workspace/result-body.tsx` | **MISLEADING — the headline surface defect** | See §5.1 |
| 16 | `?result=invoice`, `?result=evidence` | `result-registry.ts:194-201`, `:246-255` | **MISLEADING** (same defect as #15) | No `case` in `InlineResult` (`result-body.tsx:138-190`) |
| 17 | Project chat context | `projects/[id]/page.tsx:200-213` | **MISSING** | Links to the generic `/dashboard/communication` with `notReadyNote` = *"A dedicated project thread is being prepared…"* (`messages/en.json:5344`). `conversations.source_type` is a closed set of four and **`'project'` is not one of them** (`20260706210000_conversation_source_relation.sql:89-93,:127-150`). |
| 18 | `/dashboard/reports` project counts | `lib/reports/reports-hub.ts:192-215` | **PARTIAL** | Real `owns_company`-scoped counts, but the status vocabulary omits `closed` (`:203-207`). |

**Q14: is there a second dashboard competing with chat-first?**

**No second dashboard, but a large surviving route estate.** `/dashboard/advanced`
was deleted (`app/[locale]/dashboard/layout.tsx:49`,
`components/app/account-menu.tsx:77`), and the product-gate doc records the honest
current state: *"the per-domain detail pages … `/dashboard/projects/[id]` still exist
and still navigate"* (`lib/product-gate/world-state.ts:281`). The project OS is the
single biggest remaining page-based cluster — 8 project routes vs **one** result kind
that does not render. Classification: **PARTIAL** (no forbidden second dashboard;
chat-first absorption of the project domain has not started).

**Q13: can chat create/modify project actions?**

**PARTIAL — exactly one write.** `company.assign-worker` has
`handler: { kind: "server_action", ref: "assignWorkerToProjectAction" }`
(`action-registry.ts:457`), executed at `lib/conversation/company-executors.ts:209`
→ `lib/projects/actions.ts:73` → RPC `assign_worker_to_project`. Every other project
action in the registry is `deep_link` (e.g. `company.who-waits`,
`action-registry.ts:470`). No chat path creates a project, a stage, a budget, a task
or a defect. And the one write's `advancedRoute` is a 404 (row 7 above).

---

## 5. The truth about Gantt, tasks and finance

### 5.1 The Workspace Result for `project` — **MISLEADING** (P0-4)

`result-registry.ts:186-193` declares:

```ts
{ kind: "project", titleKey: "conversation.results.project.title",
  openedBy: ["company.assign-worker", "company.who-waits"],
  advancedRoute: "/dashboard/projects",
  contexts: ["organization", "project"],
  dataReadiness: "real" }       // ← :192
```

`canRenderInline("project","organization")` therefore returns **true**
(`result-registry.ts:303-307`), so `ResultBody` takes the inline branch
(`result-body.tsx:91-95`) and **skips the honest fallback with the "open full screen"
button** (`:98-114`). `InlineResult` then falls to `default:`
(`result-body.tsx:184-189`) and renders one sentence:

> `"pendingInline": "Preparing this result."` — `messages/en.json:11018`

So the result claims real data, renders nothing, and **suppresses the very fallback
the module's own doc-comment calls "the NO REGRESSION guarantee"**
(`result-body.tsx:64-66`). Identical defect for `evidence` and `invoice`.

Worse, it is **unreachable except by hand-typing the URL**: `openResult` is called
with `"opportunities"`, `"player-card"`, `"experiences"`, `"calendar"` only
(`components/app/conversation/chat/conversation-chat.tsx:452,:506,:719,:761,:781,:925`),
and `resultForAction` (`result-registry.ts:277`) has **no caller outside its own
module and test**. This is precisely the failure the registry documents and claims to
have fixed for the old `reputation` slot: *"A result nobody can open from the
conversation is not a result"* (`result-registry.ts:206-209`).

### 5.2 Gantt — **REAL, and honestly built**

`lib/projects/stage-gantt.ts` is a pure projection over `project_stages`:
`stageSpan` prefers actual over planned dates (`:47-53`), `overdue` is computed
against a passed-in `today` (`:75-76`), and the header states *"No fabricated
completion percentage"* (`:1-7`). The DB backs this: `project_stages` stores
`planned_start/end` + `actual_start/end` and **no progress column**
(`20260718140000…:29-32`), with the migration explicitly refusing one (`:18-20`).
`ProjectStageGantt` (`components/app/project-stage-gantt.tsx:22`) takes only the
projection and shows `project-gantt-empty` when `hasTimeline` is false (`:31`).

**Verdict Q6: the Gantt is REAL (derived), not decorative.** Its limits are honest
ones: it is mounted in exactly one place
(`projects/[id]/operations/page.tsx:324`), it has no dependency arrows because there
is no dependency model, and it renders nothing until someone enters stage dates.

### 5.3 Tasks — dependency model **MISSING**

**Q7.** `work_tasks` (`20260711210000_work_tasks_v1.sql:71-107`) has
`project_id`, `source_type`/`source_id`, `assignee`, `due_at`, `priority` — and **no
predecessor/successor column, no join table, no `stage_id`**. `grep -rli
"dependency\|predecessor\|critical.path" apps/web` finds nothing in this domain.
There is no critical path, no scheduling constraint, no blocking relationship beyond
the free-text `status='blocked'` value. **MISSING.**

Related: `create_work_task_v1` accepts `p_assign_to_self boolean`
(`:139`) and can only self-assign or leave unassigned (`:190`), documented at
`:46-48`. So a manager cannot assign a task to a worker — "assignable task" is
aspirational. **PARTIAL.**

### 5.4 Budgets and actuals — budgets REAL, actuals **MISLEADING** (P1-1)

**Q8.** `project_budgets` rows are real, EUR-only, manager-gated, RPC-written
(§1.3). The **actual** is not:

```ts
const finance = await listMyFinanceRecords();
if (finance.status === "ok") {
  actualCents = finance.records
    .filter(r => r.projectId === projectId && (r.recordType === "expense" || r.recordType === "invoice_received") && r.status !== "cancelled")
    .reduce((s, r) => s + r.amountCents, 0);
}
```
`apps/web/lib/economics/economics.ts:99-108`.

`listMyFinanceRecords` is bounded by `fr_select`, i.e.
`created_by = auth.uid() OR is_admin() OR owns_company(company_id)`
(`20260711230000…:120-126`). **`project_id` is not in that policy.** Therefore
"actual cost of this project" is really "the cost rows *I personally* can see that
happen to point at this project". Two managers of the same project, or the same
manager before and after a colleague enters an invoice, see **different actuals and
different variance** — and the panel presents them as project truth. Nothing in the
UI says the figure is viewer-scoped.

**Q9: do `finance_records` have the correct scope?**
- *Can another org read your money?* **No.** `fr_select` has no org/project branch;
  an unrelated caller sees zero rows and RPC edits return `not_found`
  (`:300-302`, `:351-353`). That half is correct.
- *Can the project's own manager read the project's money?* **No** — unless they
  created the row or own the linked `companies` row. An org manager (S2) who records
  a project expense creates a row the company owner (S1) cannot see, and vice versa.
  The `project_id` column is decorative for authorization. **PARTIAL / MISLEADING.**

### 5.5 Documents — **MISSING at project scope**

**Q10.** Documents have ownership + RLS, but not project ownership:
`worker_documents_select` is worker-owner + admin only
(`20260610170000_worker_documents_readiness.sql:113-121`); employers are explicitly
excluded (`:111-112`). The only project-adjacent evidence is the journal photo
gallery, scoped by `manages_organization` of the *journal entry's* engagement
(`20260705250000…:32-42`) — a third spine again. `/dashboard/documents` offers a link
and a note, no data (`documents/page.tsx:177-186`). **MISSING.**

### 5.6 Stage → calendar projection — **PARTIAL**

**Q11.** Stages **do** project into the W12 calendar:
`lib/planning/planning.ts:376` reads `project_stages` for the already-visible project
ids and maps them through `projectStageItem`.

But **conflict detection explicitly excludes them**:

> *"managed project bands and project stages never conflict here — flagging them
> would invent a problem no real record proves."*
> `lib/planning/planning-model.ts:349-352`

`isConflictEligible` (`:344-364`) returns true only for accepted incoming bookings,
`sourceType === "project"` with `roleContext === "assigned"`, and approved absences.
`"stage"` falls through to `return false` (`:363`). The W12 DB invariant is likewise
booking-only: `booking_requests_no_overlapping_accepted`
(`20260802150000_booking_atomic_double_booking_v1.sql:161-162`) is an EXCLUDE on
`booking_requests` and never mentions projects or stages.

And the one project source that *is* conflict-eligible is empty in practice — see
P0-2. **PARTIAL: projection yes, conflict participation no.**

### 5.7 Q2 — one canonical project domain, or competing models?

**One canonical `projects` table, but three competing *access* models and two
competing *entry-point* surfaces.**

- Schema: `projects` is genuinely singular. `job_demands` still FKs to it
  (`0001:157`) and is read by `lib/market-map/market-result.ts:66` and
  `lib/market-map/project-results.ts:98,:156`, but as a demand layer, not a rival
  project entity.
- Access: S1 / S2 / S3 (§3). **This is the real fragmentation.**
- Surfaces: `/dashboard/projects` (role-agnostic, has the list) vs
  `/dashboard/company/projects/new` (company-only, has the create form, and its
  parent index 404s). The create *core* is unified
  (`create-project-core.ts`), the *navigation* is not.

Classification: **PARTIAL** — one domain model, fragmented authorization and entry.

---

## 6. Findings, most severe first

### P0-1 — A dismissed project manager keeps every project right, forever — `BLOCKED_BY_W9`

**Mechanism.** `can_manage_project`'s second branch is `manages_organization`
(`20260601091000…:29`), which is true while an `engagement_contexts` row is
`status='active'`. There is **no way to end that row**: `authenticated` holds only
`grant select on public.engagement_contexts` (`0013_work_journal_m1.sql:416`), the
write policy is self-scoped and ungranted (`0013:334-336`), and no applied RPC sets
`status` away from `'active'` — as the W9 migration's own header states
(`20260802160000_org_membership_revocation_v1.sql:20-27`). The fix,
`end_org_membership_v1`, is **committed but NOT applied to production**
(`APPLIED_LEDGER.md` Deferred: *"PRODUCTION APPLY STILL PENDING A SEPARATE OWNER
APPROVAL"*).

**Why this is a W11 finding, not just a W9 one.** The W9 audit's P0-1 write-up
enumerates the blast radius as "the organization's journal stream, the membership
list, invitation sending, journal review, and W6 replies/disputes"
(`20260802160000…:29-36`). **It does not mention the project operating system at
all.** In fact a stale manager also retains: create/edit/delete of every
`project_stage`, every `project_budget` line and its approval state, every `defect`
and correction, every project-linked `work_task`, the handover passport, and the
ability to link finance records to the org's projects. The blast radius is roughly
double what W9 recorded.

**Failure scenario.** A foreman is dismissed on Monday. On Tuesday he calls
`set_project_budget_status_v1(<line>, 'approved')` and `delete_project_stage_v1` on
the client's live project. Both succeed. The audit trail records his `auth.uid()`.
Nobody in the product can stop him.

**Classification: BLOCKED_BY_W9** (the code fix exists; production apply is
owner-gated).

---

### P0-2 — An assigned worker cannot read the project they are assigned to

**Mechanism.** `projects_select` (`0001_initial_schema.sql:502-504`) is
`owns_company OR is_admin OR (status='live' AND authed)`. There is **no
assigned-worker branch**. And `status` is `'draft'` for every project the app creates
and can never be changed (§2). Therefore, for every real project:

- `getWorkerProjectView` (`lib/projects/worker-project-access.ts:91-95`) gets
  `project = null` and returns `{ assignment, project: null }` (`:104-114`).
- `listWorkerProjects` (`:130-151`) maps missing rows to
  `title: null, status: null, city: null` (`:145-147`).
- `readAssignedProjectItems` in the calendar filters
  `.in("status", ["draft","live","paused"])` (`lib/planning/planning.ts:197`,
  constant at `:111`) over rows RLS already dropped → **zero items**.

**Consequences.**
1. `/dashboard/projects` worker branch renders assignment cards with no project name.
2. `/dashboard/projects/[id]` worker panel renders an assignment with no project.
3. The calendar's project band source is permanently empty for workers — which means
   the code comment at `lib/planning/planning.ts:161-162` ("makes the ALREADY-SHIPPED
   conflict branch in `isConflictEligible` reachable for the first time") is **false
   in production**. Worker project↔booking conflict detection can never fire.

**Second cause, independent of RLS:** even if RLS allowed the read, `start_date` and
`end_date` are never written (`create-project-core.ts:49-55`; no update path exists),
so `toIsoDay(null)` yields a dateless item that the calendar drops anyway.

**Failure scenario.** A worker is assigned to "Rotterdam warehouse, 12 Aug–30 Sep".
His calendar shows nothing for those dates. He accepts a booking from another
employer covering the same weeks. No conflict is raised — not by the calendar
(the project item does not exist) and not by the DB (the W12 EXCLUDE constraint
covers `booking_requests` only). He double-books himself and the platform reports a
clean schedule.

**Classification: MISLEADING** (surfaces exist and render, on data that structurally
cannot arrive).

---

### P0-3 — `can_manage_project` grants write rights that `projects` RLS denies read rights for

**Mechanism.** `can_manage_project` = S1 **OR** S2 (`20260601091000…:24-32`).
`projects_select` = S1 only (`0001:502-504`). Every SECURITY DEFINER write RPC in the
project OS gates on `can_manage_project`, and every one of them **bypasses RLS by
construction**.

**Result for an organization manager who is not the `companies.profile_id` owner:**

| capability | outcome |
|---|---|
| `add_project_stage_v1`, `update_…`, `delete_…` | ✅ succeeds |
| `set_project_budget_v1`, `set_project_budget_status_v1` | ✅ succeeds |
| `report_defect_v1`, `set_defect_status_v1`, `delete_defect_v1` | ✅ succeeds |
| `create_work_task_v1` with `p_project_id` | ✅ succeeds |
| `create_finance_record_v1` with `p_project_id` | ✅ succeeds (`20260711230000…:197-199`) |
| read the `projects` row | ❌ RLS denies |
| `/dashboard/projects` list | ❌ empty (`lib/projects/projects.ts:60-67`) |
| `/dashboard/projects/[id]` | ❌ `stadium-not-authorized` |
| `/dashboard/projects/[id]/operations` | ❌ `ops-not-authorized` (`operations.ts:241` → `operations/page.tsx:104-108`) |
| `/dashboard/projects/*` at all, if `active_role != company\|agency` | ❌ S3 gate (`operations/page.tsx:81`) |

So the entire operating centre — the only place stages, the Gantt, budgets and
defects are rendered — is **unreachable by the population the DB considers project
managers**, while the RPCs remain fully callable by anyone who can construct a POST.

**Failure scenario (also a security scenario).** An org manager cannot open the
project in the UI, so the operator "fixes" it by making them the company owner —
except `companies.profile_id` is UNIQUE (`20260604120000…:245`), so that transfers
ownership away from the real owner. The alternative is that the org manager drives
the project through raw RPC calls with no UI at all.

**Classification: PARTIAL** for the org-manager path (real rights, no reachable
surface); the asymmetry itself is a **P0 design defect**.

---

### P0-4 — The `project` Workspace Result lies about its readiness and suppresses its own fallback

Full mechanism in §5.1. `dataReadiness: "real"` (`result-registry.ts:192`) with no
`case "project"` in `InlineResult` (`result-body.tsx:138-190`) means
`canRenderInline` is true, the fallback branch (`:98-114`) never runs, and the user
gets `"Preparing this result."` with **no button to `/dashboard/projects`**.

**Failure scenario.** A company user deep-links `?result=project` (or a future PR
wires `resultForAction`, which already maps `company.who-waits` → `project`,
`result-registry.ts:189`). They get a one-line dead end in the context panel and no
way forward. Meanwhile the registry's guard test only pins that `openedBy` ids exist
in the action registry (`result-registry.ts:94-97`) — it does not pin that a `real`
result has a renderer.

**Classification: MISLEADING.** Same defect for `evidence` (`:195-201`) and
`invoice` (`:246-255`).

---

### P1-1 — "Budget vs actual" is viewer-scoped and presented as project truth

§5.4. `economics.ts:99-108` sums `listMyFinanceRecords()`, bounded by
`fr_select` = creator/admin/company-owner (`20260711230000…:120-126`), with **no
project branch**. Variance therefore changes per viewer.

**Failure scenario.** The site manager enters €80k of subcontractor invoices against
the project. The company owner opens the economics panel and sees `actual = €0`,
`variance = +€120k`, and reports the project as massively under budget. Both figures
are computed from real rows; neither is the project's cost.

**Classification: MISLEADING.**

---

### P1-2 — Any authenticated user can read any `live` project (latent cross-tenant read)

`projects_select` third branch: `status = 'live' and auth.uid() is not null`
(`0001:504`). `listManagedProjects` (`lib/projects/projects.ts:60-66`) applies **no
`company_id` filter** — it selects `id, title, city, country, organization_id,
organizations(display_name, legal_name)` and trusts RLS. Its name is therefore wrong.

This is **latent today** only because no code path sets `status='live'` (§2). It
becomes live the moment anyone flips a status by SQL, by admin tooling, or by the
first W11 slice that implements the lifecycle. When it does, the leaked payload is
project title + city + country + owning organization's legal name — to **every**
authenticated account on the platform, and it flows straight into the
`/dashboard/tasks` project filter (`tasks/page.tsx:147`), the `/dashboard/finance`
project dropdown (`finance/page.tsx:199-200`) and the `/dashboard/projects` map.

**Classification: MISLEADING** (a leak that reads as an ownership-scoped list).

---

### P1-3 — `project_members` is a fully-built, fully-dead permission table

§1.4, §3 Q4. Table + RLS + GRANTs live in prod (`types.ts:5589`), zero code
references, ignored by `can_manage_project`. Any future reviewer reading
`20260601091000…:52-63` will reasonably conclude the product has per-project roles.
It does not.

**Failure scenario.** A W11 slice adds a "project team" UI on top of
`project_members` and ships it. Nothing changes: adding someone as `role='manager'`
grants them nothing, because no policy or RPC consults the table. The feature looks
correct in review and is inert in production.

**Classification: DEAD.**

---

### P1-4 — The project row is insert-only; the whole lifecycle vocabulary is unreachable

§2. `status`, `start_date`, `end_date`, `country`, `housing_provided`,
`granularity`, `visibility_level`, `location_confirmed` can never change. Downstream
this breaks the calendar (P0-2), the market-map project signals
(`lib/market-map/signals.ts:233` reads three columns that are always at default), the
workspace map (`ManagedProject.country` is always null — `projects.ts:33` promises
"lets the workspace map resolve the city to real coordinates"), and the reports hub
(`reports-hub.ts:203-207`).

**Classification: MISSING.**

---

### P1-5 — Workers cannot report defects; project chat does not exist

- `report_defect_v1` requires `can_manage_project` (`20260718200000…:80`), yet
  `defects_select` grants read to `reporter_id = auth.uid()` (`:54`) — the policy
  anticipates a reporter who can never exist. The person who *sees* the defect on
  site is the one who cannot record it. **PARTIAL.**
- `conversations.source_type` is a closed CHECK set of four values and `'project'` is
  not among them (`20260706210000…:89-93`), so the stadium's chat CTA points at the
  generic inbox with an honest "being prepared" note
  (`projects/[id]/page.tsx:200-213`, `messages/en.json:5344`). **MISSING.**

---

### P2-1 — `set_defect_status_v1` assigns to an unvalidated, unauthorized profile

`20260718200000…:86-100`: `p_assignee_profile_id` is written with
`coalesce(p_assignee_profile_id, assignee_profile_id)` and **no check** that the
profile is a member of the org, assigned to the project, or exists in any relation
to it. The assignee is also **not** in `defects_select` (`:53-55`), so the person
assigned a defect cannot see it. Similar gap: `report_defect_v1` accepts
`p_stage_id` with no check that the stage belongs to `p_project_id` (`:80-86`).

### P2-2 — `issue_asset_v1` accepts any `project_id`

`20260718170000…:129-148`: the RPC checks `caller_manages_asset` (the asset's org)
but never validates `p_project_id` against `can_manage_project` or against the
asset's organization. An asset can be issued to another tenant's project id. No
cross-tenant *read* results (`asset_assignments_select` is org-scoped, `:81-84`), so
this is data integrity, not disclosure.

### P2-3 — Four hand-rolled copies of the role gate

`MANAGER_ROLES = new Set<Role>(["company","agency"])` is duplicated verbatim at
`dashboard/projects/page.tsx:23`, `projects/[id]/page.tsx:32`,
`projects/[id]/operations/page.tsx:44`, `dashboard/assets/page.tsx:11`, while
`company/projects/new/page.tsx:21` uses the canonical `requireRoleOrRedirect` and
`/dashboard/planning`, `/dashboard/tasks`, `/dashboard/finance` have **no
route-level gate at all**. Five different answers to the same question.

### P2-4 — `action-registry.ts:456` ships a 404

`company.assign-worker` → `advancedRoute: "/dashboard/company/projects"`, which has
no `page.tsx`.

### P2-5 — `/dashboard/admin/project-truth` is a naming collision

`admin/project-truth/page.tsx` is an `active_role` vs `profile_roles` RLS audit and
never reads `projects`. Any W11 search for "project truth" lands here first.

---

## 7. W9 / W12 / W13 / W14 dependency list

### Blocked by W9 (`20260802160000_org_membership_revocation_v1.sql` — merged, **not applied**)

| Item | Why |
|---|---|
| Any project-manager revocation | P0-1. Until `end_org_membership_v1` is applied, no project right can ever be withdrawn. |
| Any W11 slice that widens `projects_select` to `manages_organization` | Widening read access before revocation exists makes P0-1 strictly worse. **Do not ship the P0-3 fix before the W9 apply.** |
| Multi-org project ownership | `companies.profile_id` UNIQUE (`20260604120000…:245`) caps a profile at 1 company + N teams; `owns_company` therefore cannot express a second owner. |
| Org directory exposure | `organizations_select using (true)` (`0013:327`) is W9 slice 2 and is explicitly out of scope of the merged migration (`20260802160000…:97-98`). |

### Blocked by W12 (`20260802150000_booking_atomic_double_booking_v1.sql` — merged, **not applied**)

| Item | Why |
|---|---|
| Any claim that project assignment prevents double-booking | The EXCLUDE constraint covers `booking_requests` only (`:161-162`); projects and stages are not in it. |
| Stage-aware conflict detection | `isConflictEligible` deliberately excludes stages (`planning-model.ts:349-352`); changing that is a W12 semantic decision, not a W11 one. |
| Worker project↔booking conflicts | Dependent on P0-2 first: today the project item never reaches the detector. |

### Blocked by W6 (`20260802120000_experience_records_v1.sql` — merged, **not applied**)

Not a project dependency. Recorded only so a future reader does not assume the three
unapplied migrations are one gate: W6 touches the experience domain, not projects.

### W13 / W14

**Undefined in this repository.** `grep -rn "W13\|W14" docs/` returns only
`APPLIED_LEDGER.md` prose; the only W-numbered roadmap
(`docs/audits/labourmarketai-premium-rebuild-execution-plan.md:29-30`) uses an
unrelated scheme. I cannot state W13/W14 dependencies without inventing them. If the
caller has a W-series backlog outside the repo, this section needs that input.

---

## 8. File-conflict map

Files a W11 slice must touch that other open work also touches.

| File | W11 needs it for | Other claimant | Risk |
|---|---|---|---|
| `apps/web/lib/conversation/result-registry.ts` | fix `project` readiness / add a real renderer (P0-4) | W6 slice 3 rewrote the `experiences` entry (`:202-245`) — merged at `c05a4802`, HEAD | **Medium.** Same const array; textual conflict on any concurrent edit. |
| `apps/web/components/app/workspace/result-body.tsx` | add `case "project"` (P0-4) | W6 added `case "experiences"` (`:169-182`); the `default:` arm is shared | **Medium.** |
| `apps/web/lib/planning/planning.ts` | fix worker project bands (P0-2) | W12 owns the calendar; `readStageItems` (`:363-419`) and `readAssignedProjectItems` (`:164-…`) are both here | **High.** Coordinate with W12 or the fix will be reverted by a calendar slice. |
| `apps/web/lib/planning/planning-model.ts` | any stage-conflict change (§5.6) | W12 canonical | **High — treat as W12-owned.** |
| `supabase/migrations/` (new file) | any `projects_select` change (P0-2/P0-3), any close-lifecycle RPC | Three unapplied migrations already sit in the ratchet (`20260802120000`, `20260802150000`, `20260802160000`) | **High.** A fourth migration trips the pinned migration-safety baselines; ordering matters (W9 first — see §7). |
| `apps/web/lib/projects/projects.ts` | `listManagedProjects` filter (P1-2) | W8 slice 1 rewrote `callerCompanyId` (`:140-172`) | **Low-medium.** |
| `apps/web/lib/economics/economics.ts` | project-scoped actuals (P1-1) | `lib/finance/finance.ts` is declared the "sole reader" (`economics.ts:20-24`) — changing scope means changing the finance contract | **Medium.** Also touches `lib/guards/finance-records.test.ts`. |
| `apps/web/app/[locale]/dashboard/projects/[id]/operations/page.tsx` | any surface fix | 627 lines, mounts 6 panels; the single densest file in the domain | **High** for any concurrent slice. |
| `docs/APPLIED_LEDGER.md` | a row for any new migration | Every migration PR appends here | **High (append conflicts).** Known repo-wide hazard. |
| `apps/web/lib/supabase/types.ts` | regeneration after any migration | W6/W9/W12 all pending regeneration | **High.** Do not regenerate speculatively. |

---

## 9. Recommended W11 slice plan

Small, independently mergeable, each with its own proof. Ordered so that no slice
widens access before revocation exists.

**Slice 0 — honesty pass, no schema (smallest, ship first).**
Flip `result-registry.ts:192` `project` (and `evidence`, `invoice`) to
`dataReadiness: "unverified"`. That single change restores the honest fallback with
its "open full screen" button (`result-body.tsx:98-114`) and removes the dead end.
Add a guard test pinning *"every `real` result kind has a `case` in `InlineResult`"* —
the invariant whose absence caused P0-4. Fix `action-registry.ts:456` to
`/dashboard/projects`. **No migration, no RLS, no risk.**

**Slice 1 — project lifecycle write path (migration).**
One RPC `set_project_status_v1(project_id, status)` gated by `can_manage_project`,
plus `update_project_details_v1` for `title/city/country/start_date/end_date`. Closes
P1-4 and unblocks P0-2's second cause. Add `'closed'` to
`REPORT_PROJECT_STATUSES` (`reports-hub.ts:203`). **Do not** let this slice set
`status='live'` from the UI until Slice 2 lands, or P1-2 becomes live.

**Slice 2 — close the `live` read leak (migration, do together with or before Slice 1's `live` transition).**
Replace `projects_select`'s third branch. `(status='live' and auth.uid() is not null)`
(`0001:504`) predates the marketplace and is not how any current surface discovers
work. Replace with an explicit assigned-worker branch:
`exists (select 1 from project_worker_assignments a join workers w on w.id=a.worker_id
where a.project_id = projects.id and a.status='active' and w.profile_id = auth.uid())`.
Closes **P1-2 and P0-2's first cause in one policy.**

**Slice 3 — align read scope with `can_manage_project` (migration). REQUIRES W9 APPLIED.**
Add `manages_organization(organization_id)` to `projects_select` (and to
`projects_update`). Closes P0-3 — the operations centre becomes reachable by the
people the DB already trusts to write to it. **Hard prerequisite:**
`20260802160000_org_membership_revocation_v1.sql` applied to production, otherwise
this widens exactly the surface P0-1 cannot revoke.

**Slice 4 — project-scoped finance truth (migration).**
Add `or (project_id is not null and public.can_manage_project(project_id))` to
`fr_select`. Then `economics.ts:99-108` becomes a real project actual. Ship with a
guard test that the economics panel's `actualCents` is derived from a project-scoped
read, and a UI label change while the scope is per-viewer.

**Slice 5 — `project_members` decision (no code until decided).**
Two honest options, pick one: (a) delete the table via a down-migration and stop
implying per-project roles; or (b) add a `project_members` branch to
`can_manage_project` and make the role real. Doing neither leaves P1-3 as a trap for
the next reviewer. Recommend (a) first — (b) is a real permission model and deserves
its own audit.

**Slice 6 — worker defect reporting (migration).**
Relax `report_defect_v1` (`20260718200000…:80`) to
`can_manage_project(p_project_id) OR <active assignment on p_project_id>`, matching
the `reporter_id` branch the SELECT policy already has. Validate `p_stage_id` belongs
to `p_project_id` in the same slice (P2-1).

**Slice 7 — task↔stage link + assignment (migration).**
`work_tasks.stage_id` FK, and a `p_assignee_profile_id` on `create_work_task_v1`
validated against the project's active assignments. This is the honest first step
toward P0/§5.3's missing dependency model — **not** a dependency model itself, which
should be its own designed slice.

**Explicitly deferred / not recommended now:** stage dependencies and critical path
(needs a design, not a slice); project chat `source_type` (touches the conversation
spine — W12/W13 territory); project documents axis (needs a document-ownership model
that does not exist).

---

## 10. Confirmation that no code was modified

No `Edit`, `Write`, `git add`, `git commit`, `git checkout`, `npm`, `pnpm`, `vitest`,
`playwright`, `supabase` or MCP database call was made in this worktree. The only
file this audit creates is this document.

`git status --short` **before** writing this document (run in
`C:\Users\Mano\Documents\labourmarketai-w11-audit`):

```
$ git status --short
(no output — clean working tree)
```

`git status --short` **after** writing this document is expected to be exactly:

```
?? docs/audits/w11-project-operating-system-audit.md
```

Nothing is staged, committed, pushed, merged or deployed. No migration was applied.
No production surface was touched.
