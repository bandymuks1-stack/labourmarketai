-- Rollback for 20260718180000_assets_rls_recursion_fix.sql
-- Restores the original (recursive) policy definitions and drops the helper.
-- NOTE: the restored policies are the recursive ones from 20260718170000; this
-- exists only for a clean reverse and should not be applied in normal operation.

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets
  for select
  using (
    public.manages_organization(organization_id)
    or public.is_admin()
    or exists (
      select 1 from public.asset_assignments aa
        join public.workers w on w.id = aa.worker_id
       where aa.asset_id = assets.id and aa.status in ('issued','acknowledged')
         and w.profile_id = auth.uid()
    )
  );

drop policy if exists asset_assignments_select on public.asset_assignments;
create policy asset_assignments_select on public.asset_assignments
  for select
  using (
    exists (select 1 from public.assets a where a.id = asset_assignments.asset_id and public.manages_organization(a.organization_id))
    or public.is_admin()
    or exists (select 1 from public.workers w where w.id = asset_assignments.worker_id and w.profile_id = auth.uid())
  );

drop function if exists public.asset_open_assignment_for_caller(uuid);
