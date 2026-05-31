# Slice 5 — project / work-context foundation — RED / needs-human-gate

**Status:** RED. No product UI shipped. The operational project/task layer needs
new tables + RLS + grants → owner must apply. The company workspace already
shows the honest "Projektai ir užduotys ruošiami" card (PR #176), so there is no
dead button today. Slice 6 (task assignment MVP) depends on this and is blocked
until applied.

## Preflight — what exists vs missing

| Concern | State |
|---|---|
| `public.projects` | **exists** (0001) + `organization_id` (convergence `20260530120100`) + `grant select,insert,update` to authenticated (0023) + `projects_select` RLS |
| Project app surface (list/create) | **none** — no `/dashboard/projects`, no `from("projects")` in app code |
| `tasks` | **missing** |
| `task_assignments` | **missing** |
| Project ↔ worker membership | **missing** (could reuse `engagement_contexts`, owner decision) |
| Journal ↔ project/task link | **missing** (`journal_entries` has no `task_id`/`project_id`) |
| Tasks/assignments RLS | **missing** |

Because tasks / assignments / membership / journal-link are entirely absent,
this slice cannot ship real (non-fake) project/task functionality without a
migration → RED.

## Owner decisions required

1. **Project membership model:** reuse `engagement_contexts` (worker is an org
   member, can be assigned any project) **vs** a dedicated `project_workers`
   table (per-project membership). Recommended: reuse `engagement_contexts` for
   v1 (no new membership table); a worker is assignable if they are an active
   `employee` engagement of the task's organization.
2. **Assignment identity:** assign by `workers.id` (consistent with
   `company_workers`/journal) — recommended — vs `profiles.id`.
3. **Journal link:** add nullable `journal_entries.task_id` (additive column,
   recommended) vs a `task_journal_entries` join table.
4. **Status vocab:** `open / in_progress / done / cancelled` (matches Slice 6).

## Prepared migration (additive, reversible — owner applies via Supabase MCP)

File: `supabase/migrations/20260531132710_tasks_and_assignments.sql` (in this
PR, **not applied**). Creates `tasks` + `task_assignments`, an additive nullable
`journal_entries.task_id`, RLS (org owner/manager full; assigned worker reads
own + the task), and grants. No destructive change; no RLS loosening (access is
scoped to `manages_organization()` and the assigned worker).

After it is applied, **Slice 6** (task assignment MVP) becomes a GREEN UI slice:
owner creates a task on the company workspace, assigns an org worker, the worker
sees the assigned task, status can move open → in_progress → done, optionally
linked to a journal entry — all read/write through the applied tables/RLS.

## Safety

No migration applied. No production change. No app code that calls the new
tables (so nothing breaks pre-apply). Draft PR + `needs-human-gate` only. Stop
this slice; Slice 6 stays blocked until apply.
