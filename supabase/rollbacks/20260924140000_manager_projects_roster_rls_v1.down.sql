-- ============================================================================
-- ROLLBACK for 20260924140000_manager_projects_roster_rls_v1
--
-- Restores the four policy expressions exactly as production held them on
-- 2026-09-24 (read from pg_policies before the draft was written). Managers
-- are refused again; the app's manager-scope notice must be restored with it
-- (revert the app half: `sqlWritesGranted: governs`).
-- ============================================================================

alter policy projects_select on public.projects
  using (owns_company(company_id) or is_admin() or is_assigned_to_project(id));

alter policy projects_insert on public.projects
  with check (owns_company(company_id) or is_admin());

alter policy projects_update on public.projects
  using (owns_company(company_id) or is_admin())
  with check (owns_company(company_id) or is_admin());

alter policy company_workers_select on public.company_workers
  using (owns_company(company_id) or owns_worker(worker_id) or is_admin());
