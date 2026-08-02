-- Rollback for 20260803090000_project_assigned_worker_read_v1.sql
--
-- Restores `projects_select` exactly as 0001_initial_schema.sql:502-504 defines
-- it and drops the helper. Note what rolling back RE-OPENS: the tenant-blind
-- `status = 'live' AND auth.uid() IS NOT NULL` branch (W11 P1-2), and it
-- re-closes the assigned worker out of their own project (W11 P0-2).
--
-- Only run this if the forward migration caused a concrete problem — the
-- pre-migration state is not a safe resting place, it is the audited one.

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (public.owns_company(company_id) or public.is_admin()
         or (status = 'live' and auth.uid() is not null));

-- Dropped last: the policy above must no longer reference it.
drop function if exists public.is_assigned_to_project(uuid);
