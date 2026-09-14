-- Rollback for 20260914200000_defects_assignee_read_v1.
--
-- A faithful inverse: restores `defects_select` to the exact predicate read
-- from production on 2026-09-14 before the apply —
--
--     (can_manage_project(project_id) OR (reporter_id = auth.uid()) OR is_admin())
--
-- This is a pure NARROWING back to the prior state. It re-creates the defect it
-- reverses: the assigned worker again cannot read the row that names them.
-- Prefer fixing forward.
--
-- Nothing else is touched — no grants, no other policy, no data. `defects` held
-- 0 rows at apply time, so there is no row whose visibility this can strand.

drop policy if exists defects_select on public.defects;

create policy defects_select on public.defects for select
  using (
    public.can_manage_project(project_id)
    or reporter_id = auth.uid()
    or public.is_admin()
  );

comment on policy defects_select on public.defects is null;
