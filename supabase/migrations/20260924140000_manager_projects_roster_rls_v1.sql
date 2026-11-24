-- ============================================================================
-- 20260924140000 — manager_projects_roster_rls_v1
--
-- The approved manager / recruiter role actually usable: an active manager of
-- an organization can read, create and update that organization's projects and
-- read its roster (company_workers). Today the four policies admit only
-- `owns_company(...)` (creator + active owner/admin) or `is_admin()`, so the
-- role the capability matrix lets operate (lib/company/role-capabilities.ts:
-- manager, external_manager → manage-projects, manage-roster) is refused.
--
-- RED by rule (ALTER POLICY). Owner-approved 2026-09-24 to be PREPARED as a
-- draft; NOT to be applied until this concrete draft is reviewed.
--
-- @human-gate-approved
--   Acknowledged RED by route (ALTER POLICY). NOT an approval to apply.
--   Changes no data; widens four permissive policies by ONE existing helper.
--
-- ----------------------------------------------------------------------------
-- SCOPE (owner decision 2026-09-24) — exactly four policies, one helper
-- ----------------------------------------------------------------------------
--   projects_select         + OR public.manages_organization(organization_id)
--   projects_insert (CHECK) + OR public.manages_organization(organization_id)
--   projects_update (USING and CHECK)
--                           + OR public.manages_organization(organization_id)
--   company_workers_select  + OR the organization bound to company_id
--                             (organizations.legacy_company_id) is one the
--                             caller manages_organization(...)
--   NOT touched: projects_delete, every other table, every grant, every role.
--
--   `manages_organization(org)` is the EXISTING SECURITY DEFINER helper (active
--   owner/admin/manager/external_manager membership, or an active
--   owner/manager/external_manager engagement context) that
--   `can_manage_project(...)` already uses for the same question — the policies
--   now agree with it. No parallel permission model. Every helper involved is
--   SECURITY DEFINER, so no policy recursion (42P17) is introduced. The
--   restrictive hist_p9 policies on projects (organization ↔ company binding)
--   still apply on top.
--
-- ORDER OF OPERATIONS: apply FIRST (a pure widening — the deployed app keeps
--   working), THEN merge the app half, which turns off the manager-scope notice
--   (`sqlWritesGranted` now true for operating roles).
--
-- ROLLBACK: supabase/rollbacks/20260924140000_manager_projects_roster_rls_v1.down.sql
--   (restores the four policy expressions exactly as they were).
-- ============================================================================

alter policy projects_select on public.projects
  using (
    owns_company(company_id) or is_admin() or is_assigned_to_project(id)
    or public.manages_organization(organization_id)
  );

alter policy projects_insert on public.projects
  with check (
    owns_company(company_id) or is_admin()
    or public.manages_organization(organization_id)
  );

alter policy projects_update on public.projects
  using (
    owns_company(company_id) or is_admin()
    or public.manages_organization(organization_id)
  )
  with check (
    owns_company(company_id) or is_admin()
    or public.manages_organization(organization_id)
  );

alter policy company_workers_select on public.company_workers
  using (
    owns_company(company_id) or owns_worker(worker_id) or is_admin()
    or exists (
      select 1
        from public.organizations o
       where o.legacy_company_id = company_workers.company_id
         and public.manages_organization(o.id)
    )
  );

-- ROLLBACK
--   alter policy projects_select on public.projects using (owns_company(company_id) or is_admin() or is_assigned_to_project(id));
--   alter policy projects_insert on public.projects with check (owns_company(company_id) or is_admin());
--   alter policy projects_update on public.projects using (owns_company(company_id) or is_admin()) with check (owns_company(company_id) or is_admin());
--   alter policy company_workers_select on public.company_workers using (owns_company(company_id) or owns_worker(worker_id) or is_admin());
