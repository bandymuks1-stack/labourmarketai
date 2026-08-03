-- 20260803090000 — assigned-worker project read + close the `live` read leak
--
-- SAFETY CLASS: RED. This migration creates a SECURITY DEFINER function,
-- changes GRANTs/REVOKEs on it, and REPLACES an existing RLS policy.
--
-- @human-gate-approved
--
-- OWNER APPROVAL — SCOPE, from the decision on PR #988 (2026-08-03). The
-- marker above was NOT self-added by an agent; it records an explicit owner
-- decision made after reviewing the human-gate package
-- (docs/human-gates/project-assigned-worker-read-gate.md). What it covers, and
-- nothing else:
--
--   APPROVED — the three migration-safety findings, and only these three:
--     1. `security-definer-function`  (is_assigned_to_project)
--     2. `grant-or-revoke`            (revoke all from public / from anon;
--                                      grant execute to authenticated)
--     3. `alter-drop-policy`          (projects_select replaced)
--
--   APPROVED — the read direction: company owner sees their own project;
--   platform admin per the existing contract; a worker with an ACTIVE
--   assignment sees only that project; an ENDED assignment grants nothing;
--   an unrelated worker sees nothing; anon sees nothing; the global
--   `status = 'live' and authenticated` branch is removed. The assigned worker
--   receives the `projects` row and nothing more.
--
--   NOT APPROVED by this decision — each of these needs its own owner gate:
--     * applying this migration to PRODUCTION. Status stays
--       PENDING_SEPARATE_OWNER_APPROVAL. Merging this PR does NOT apply it.
--     * any PRODUCTION DATA MUTATION. This migration contains no DML, no
--       backfill and no data migration, and none is authorised.
--     * PRODUCTION ROLLBACK. The paired .down.sql exists for completeness; it
--       is not authorised to run against production.
--
--   Still explicitly OUT of scope (unchanged by this approval): project manage,
--   update/delete, budget, the full member list, finance, organization write,
--   company ownership, and any other project. W11 P0-3 (active organization
--   manager project read) is NOT solved by this PR.
--
-- W11 audit P0-2 and P1-2, closed by ONE policy replacement (audit slice 2).
--
-- TODAY, `projects_select` (0001_initial_schema.sql:502-504) is:
--
--     owns_company(company_id) OR is_admin() OR (status = 'live' AND auth.uid() IS NOT NULL)
--
-- Two separate defects live in that one line.
--
-- P0-2 — THE ASSIGNED WORKER CANNOT READ THEIR OWN PROJECT. There is no
-- assigned-worker branch, and every project the app creates is `draft` with no
-- write path to change it. So for every real project the worker's row is
-- filtered out before the app ever sees it:
--   * /dashboard/projects renders assignment cards with no project name;
--   * /dashboard/projects/[id] renders an assignment with no project;
--   * the calendar's project band is permanently empty for workers, so
--     project↔booking conflict detection can never fire. A worker assigned to
--     "Rotterdam, 12 Aug–30 Sep" sees nothing on those dates, accepts an
--     overlapping booking, and the platform reports a clean schedule.
--
-- P1-2 — ANY AUTHENTICATED USER CAN READ ANY `live` PROJECT. The third branch
-- is not scoped to a company, an organization or an assignment: it is "any
-- signed-in person, any tenant". It is latent only because nothing can set
-- `status = 'live'` yet — which makes it a trap armed for the first PR that
-- adds a lifecycle write path (W11 slice 1).
--
-- THE FIX: replace the tenant-blind `live` branch with an explicit
-- assigned-worker branch. Strictly narrower for everyone except the assigned
-- worker, who gains exactly the project they are actively assigned to.
--
-- WHY A SECURITY DEFINER HELPER RATHER THAN AN INLINE SUBQUERY: a subquery on
-- `project_worker_assignments` inside a `projects` policy would evaluate that
-- table's own RLS, whose `pwa_select` calls `can_manage_project` — workable,
-- but it makes the two policies mutually load-bearing. The helper mirrors the
-- existing `can_manage_project` / `owns_worker` pattern exactly, so the policy
-- stays a flat OR of three independent predicates.
--
-- NOT IN THIS MIGRATION (deliberately):
--   * `manages_organization` on `projects_select` — that is audit slice 3
--     (P0-3), a wider change with its own reasoning;
--   * any project lifecycle write path — audit slice 1;
--   * anything touching `projects_insert/update/delete`, which are unchanged.
--
-- ROLLBACK: supabase/rollbacks/20260803090000_project_assigned_worker_read_v1.down.sql

-- ── 1. Is the caller an ACTIVELY assigned worker on this project? ───────────
--
-- `status = 'active'` is load-bearing: an assignment that ended must not keep
-- the project readable. `owns_worker` is not reused here because it takes a
-- worker id and the caller only has a project id.
create or replace function public.is_assigned_to_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.project_worker_assignments a
      join public.workers w on w.id = a.worker_id
     where a.project_id = p_project_id
       and a.status = 'active'
       and w.profile_id = auth.uid()
  )
$$;

-- Default-closed: authenticated only.
--
-- `revoke ... from public` is NOT sufficient on its own. This function is
-- created AFTER the 20260722160000 anon-reach closure, so that closure cannot
-- reach it, and the environment's default privileges leave it anon-reachable
-- unless anon is revoked BY NAME. That is the exact shape of the 2026-07-22 P0
-- — a leftover default EXECUTE grant that no migration diff revealed, visible
-- only in the catalog. Revoking anon explicitly is what makes it default-closed
-- rather than default-closed-looking.
revoke all on function public.is_assigned_to_project(uuid) from public;
revoke all on function public.is_assigned_to_project(uuid) from anon;
grant execute on function public.is_assigned_to_project(uuid) to authenticated;

-- ── 2. Replace projects_select ─────────────────────────────────────────────
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (
    public.owns_company(company_id)
    or public.is_admin()
    -- Replaces `status = 'live' and auth.uid() is not null`. Read is now tied
    -- to a real, active relationship with THIS project instead of to a status
    -- value any tenant's signed-in user could satisfy.
    or public.is_assigned_to_project(id)
  );
