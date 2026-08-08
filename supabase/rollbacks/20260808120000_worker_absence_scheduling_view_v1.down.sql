-- ============================================================================
-- ROLLBACK for 20260808120000_worker_absence_scheduling_view_v1.sql
--
-- Restores the original `worker_absences_select` policy (manager reaches every
-- row regardless of status) and drops the scheduling view.
--
-- SAFE: no data is touched. The view holds no state, and the policy swap is a
-- pure authorization change. Run this BEFORE reverting the application read in
-- lib/planning/employer-availability.ts, or run both together — the app's read
-- falls back honestly when the view is absent, so either order degrades rather
-- than breaks.
-- ============================================================================

begin;

drop view if exists public.worker_absence_scheduling;

drop policy if exists worker_absences_select on public.worker_absences;
create policy worker_absences_select on public.worker_absences
  for select
  using (
    exists (
      select 1 from public.workers w
       where w.id = worker_absences.worker_id
         and w.profile_id = auth.uid()
    )
    or public.caller_manages_worker(worker_id)
    or public.is_admin()
  );

commit;
