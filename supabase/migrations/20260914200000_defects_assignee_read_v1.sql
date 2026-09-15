-- ============================================================================
-- @human-gate-approved — TIER: owner-gated (ALTER/DROP POLICY on a live table).
-- Approved by the owner in the decision round of 2026-09-14, item 2a:
--   "APPROVED. Apply the minimum one-disjunct RLS widening so an assigned
--    worker can read a defect where assignee_profile_id = auth.uid().
--    Do not widen any related table/policy."
-- The annotation states the ROUTE, not the decision. Apply ONLY via Supabase
-- MCP apply_migration — never `db push`.
-- Rollback: supabase/rollbacks/20260914200000_defects_assignee_read_v1.down.sql
-- ============================================================================
--
-- WRK-8 — the assigned worker can read the defect that names them.
--
-- THE DEFECT. `public.defects.assignee_profile_id` records who must fix a
-- defect. `set_defect_status_v1` writes it. No policy has ever read it back:
--
--     defects_select USING (can_manage_project(project_id)
--                           OR reporter_id = auth.uid()
--                           OR is_admin())
--
-- `can_manage_project` requires owns_company or manages_organization, which an
-- assigned worker is not, by definition. `reporter_id` is the MANAGER who
-- raised it, never the assignee. So the one person the row exists to instruct
-- is the one person who cannot read it. That is SEP-8 (data exists != visible)
-- and the level-playing-field clause in one column.
--
-- WHY A POLICY AND NOT AN RPC. A SECURITY DEFINER reader would work without
-- touching RLS, and would be the wrong fix: it creates a SECOND read path to
-- the same table beside the surface's existing PostgREST read, and leaves the
-- policy still wrong for every future reader. One disjunct on the canonical
-- policy is the smaller and more honest change.
--
-- WHY THE COMPARISON IS DIRECT. `profiles.id REFERENCES auth.users(id)`, so
-- `profiles.id` IS `auth.uid()`. `assignee_profile_id = auth.uid()` is exactly
-- the shape `reporter_id = auth.uid()` already uses — no join, no function,
-- no new grant, nothing to go stale.
--
-- SCOPE — deliberately one line.
--   * `defect_corrections` is NOT touched. Owner decision 2b is DEFER: the
--     correction carries `reviewer_id` and an `outcome` of passed/failed,
--     which is a named person's judgement of this worker's remediation — a
--     different disclosure class, and there is no worker correction workflow
--     that needs it yet.
--   * No table grant changes. `authenticated` already holds SELECT and holds
--     no INSERT/UPDATE/DELETE on `defects`; writes stay RPC-only.
--   * No other policy, function, column or index is touched.
--
-- BLAST RADIUS, measured read-only on production gorgitwvdzxbnaxhrsrw
-- immediately before writing this file: `defects` 0 rows, `defect_corrections`
-- 0 rows, against 9 projects. No existing row's visibility changes. This is the
-- cheapest possible moment to correct it.
--
-- DIRECTION OF THE WIDENING. Strictly additive: every caller who could read a
-- row before can still read it, and exactly one new class is admitted — the
-- person named in `assignee_profile_id`, for that row only. It is a per-ROW
-- predicate, not per-project: an assignee gains their own assigned defects and
-- learns nothing about any other defect on the same project. Fails closed — a
-- worker with no assignment matches no disjunct and reads 0 rows, no error.

drop policy if exists defects_select on public.defects;

create policy defects_select on public.defects for select
  using (
    public.can_manage_project(project_id)
    or reporter_id = auth.uid()
    -- WRK-8 (2026-09-14): the person the defect is assigned to. profiles.id IS
    -- auth.users(id), so this is a direct comparison, same as reporter_id above.
    or assignee_profile_id = auth.uid()
    or public.is_admin()
  );

comment on policy defects_select on public.defects is
  'Project managers, the reporter, the ASSIGNED worker (WRK-8, 2026-09-14), and admins. The assignee disjunct is per-row: it never exposes other defects on the same project.';
