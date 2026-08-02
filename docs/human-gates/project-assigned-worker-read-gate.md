# Human gate — let the assigned worker read their own project, and close the `live` read leak

**Status:** OPEN — awaiting owner decision. Nothing in this repo applies it.
**Migration:** `supabase/migrations/20260803090000_project_assigned_worker_read_v1.sql`
**Rollback:** `supabase/rollbacks/20260803090000_project_assigned_worker_read_v1.down.sql`
**Closes:** W11 audit **P0-2** and **P1-2**, in one policy replacement (audit slice 2).

---

## The one line at fault

`projects_select`, unchanged since `0001_initial_schema.sql:502-504`:

```sql
using (public.owns_company(company_id) or public.is_admin()
       or (status = 'live' and auth.uid() is not null));
```

Re-verified against the tree after the W9 production apply: **W9 did not touch this policy.** Both defects are still live.

### P0-2 — the assigned worker cannot read their own project

There is no assigned-worker branch, and every project the app creates is `draft` with no write path to change it. So for every real project the row is filtered out before the app ever sees it:

- `/dashboard/projects` renders assignment cards with **no project name**;
- `/dashboard/projects/[id]` renders an assignment with **no project**;
- the calendar's project band is permanently empty for workers, so **project↔booking conflict detection can never fire**.

> A worker is assigned to "Rotterdam warehouse, 12 Aug – 30 Sep". His calendar shows nothing for those dates. He accepts a booking from another employer covering the same weeks. No conflict is raised — not by the calendar (the project item does not exist) and not by the DB (the W12 EXCLUDE constraint covers `booking_requests` only). He double-books himself and **the platform reports a clean schedule.**

### P1-2 — any authenticated user can read any `live` project

The third branch is scoped to no company, no organization and no assignment. It is "any signed-in person, any tenant". It is latent **only** because nothing can currently set `status = 'live'` — which makes it a trap armed for the first PR that adds a lifecycle write path (W11 slice 1).

## The change

Replace the tenant-blind `live` branch with an explicit active-assignment branch:

```sql
using (public.owns_company(company_id)
       or public.is_admin()
       or public.is_assigned_to_project(id));
```

`is_assigned_to_project` is a SECURITY DEFINER helper mirroring the existing `can_manage_project` pattern: it joins `project_worker_assignments → workers → auth.uid()` and requires `status = 'active'`, so an **ended** assignment stops granting read.

## Risk assessment

**Low, and strictly narrowing for everyone except the assigned worker.**

| | |
|---|---|
| Access removed | The `live`-status branch — every authenticated user of every tenant loses a read they should never have had. |
| Access added | Exactly one: an **actively assigned** worker can read **the project they are assigned to**. Nothing else. |
| Write policies | **Untouched.** `projects_insert` / `update` / `delete` are not mentioned by the migration. A worker gains no manage, budget, member or finance rights. |
| Other objects | None. One policy replaced, one function created. No `alter table`, no DML, no data migration, no backfill. |
| Recursion risk | None. The helper is SECURITY DEFINER, so the `projects` policy never re-enters `project_worker_assignments` RLS. |
| Function grant | Default-closed: `revoke all … from public`, `grant execute … to authenticated`. |

**Practical blast radius today:** near zero. No project has `status = 'live'`, so the removed branch currently grants nobody anything, and the added branch turns a set of blank cards into populated ones.

**What could break:** any surface that relied on reading *other companies'* live projects. Checked — none exists; `PLANNED_PROJECT_STATUSES` in `lib/planning/planning.ts` filters the worker's own assigned projects, which is exactly what this migration enables.

## What the owner is being asked to decide

Apply `20260803090000_project_assigned_worker_read_v1.sql` to production — yes or no.

If **yes**, in the same session:

1. apply the migration;
2. record it in `docs/APPLIED_LEDGER.md`;
3. post-apply verification (the live-catalog half this static guard cannot do):
   - `projects_select` shows three branches and **no** `status = 'live'`;
   - `is_assigned_to_project` exists, is `security definer`, `search_path = public`;
   - `has_function_privilege('public', 'public.is_assigned_to_project(uuid)', 'execute')` is **false**; the same for `anon`; **true** for `authenticated`;
   - as an assigned worker: their project row returns; a project they are not assigned to does not;
   - as a signed-in user of another tenant: zero rows.

If **no**, both defects stay open. P0-2 keeps workers' calendars structurally empty, and P1-2 stays armed for whoever ships the lifecycle write path.

## Explicitly NOT in this migration

- **P0-3** (`can_manage_project` grants write rights that `projects` RLS denies read rights for) — audit slice 3, needs `manages_organization` on `projects_select`. Wider change, own reasoning, own PR. Mixing it in would make this migration's blast radius impossible to state plainly.
- **Any project lifecycle write path** — audit slice 1.
- **P1-1** project-scoped finance truth — audit slice 4.
