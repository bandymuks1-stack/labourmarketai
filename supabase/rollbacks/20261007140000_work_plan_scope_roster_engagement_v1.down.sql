-- ROLLBACK for 20261007140000_work_plan_scope_roster_engagement_v1
-- Restores the previous body verbatim (from 20261003150200_work_plan_entries_v2).
-- Already-planned windows are untouched; they simply fall outside re-checked scope.
create or replace function public.work_plan_worker_in_scope_v1(
  p_organization_id uuid,
  p_worker_id uuid
) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.company_worker_engagements e
      join public.organizations o on o.legacy_company_id = e.company_id
     where e.worker_id = p_worker_id
       and e.status = 'active'
       and o.id = p_organization_id
  )
  or exists (
    select 1
      from public.company_memberships m
      join public.workers w on w.profile_id = m.profile_id
     where w.id = p_worker_id
       and m.organization_id = p_organization_id
       and m.status = 'active'
  )
  or exists (
    select 1
      from public.agency_workers aw
      join public.organizations o on o.legacy_agency_id = aw.agency_id
     where aw.worker_id = p_worker_id
       and aw.status = 'active'
       and o.id = p_organization_id
  );
$$;

revoke all on function public.work_plan_worker_in_scope_v1(uuid, uuid) from public;
revoke all on function public.work_plan_worker_in_scope_v1(uuid, uuid) from anon;
grant execute on function public.work_plan_worker_in_scope_v1(uuid, uuid) to authenticated;
