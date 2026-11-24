-- @human-gate-approved
-- Wagon 9 fix — break the RLS recursion between `assets` and
-- `asset_assignments`.
--
-- The two SELECT policies from 20260718170000 referenced each other: the
-- `assets` policy ran a subquery on `asset_assignments` (worker-visibility) and
-- the `asset_assignments` policy ran a subquery on `assets` (manager-visibility).
-- Under RLS that mutual reference is infinite recursion (SQLSTATE 42P17), so any
-- SELECT failed. Fix: route each cross-table check through a SECURITY DEFINER
-- helper (which bypasses the other table's RLS), breaking the cycle. Behaviour
-- is unchanged — same visibility, just non-recursive.
--
-- RED class (SECURITY DEFINER + ALTER POLICY + GRANT). Applied under owner
-- standing authorization. Rollback restores the prior (recursive) definitions.

create or replace function public.asset_open_assignment_for_caller(p_asset_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.asset_assignments aa
      join public.workers w on w.id = aa.worker_id
     where aa.asset_id = p_asset_id and aa.status in ('issued','acknowledged')
       and w.profile_id = auth.uid()
  );
$$;
grant execute on function public.asset_open_assignment_for_caller(uuid) to authenticated;

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets
  for select
  using (
    public.manages_organization(organization_id)
    or public.is_admin()
    or public.asset_open_assignment_for_caller(id)
  );

drop policy if exists asset_assignments_select on public.asset_assignments;
create policy asset_assignments_select on public.asset_assignments
  for select
  using (
    public.caller_manages_asset(asset_id)
    or public.is_admin()
    or exists (select 1 from public.workers w where w.id = asset_assignments.worker_id and w.profile_id = auth.uid())
  );

-- ROLLBACK: see supabase/rollbacks/20260718180000_assets_rls_recursion_fix.down.sql
