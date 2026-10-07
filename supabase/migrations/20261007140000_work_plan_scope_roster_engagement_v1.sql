-- ============================================================================
-- work_plan_worker_in_scope_v1 — add the roster + v2 engagement truths.
--
-- PROVEN FAILURE (rolled-back prod proof 2026-10-07): create_work_plan_entry_v1
-- returned 'worker_not_in_scope' for (a) a worker linked through
-- invite_company_worker + accept_company_worker_invitation (company_workers
-- row, zero company_worker_engagements) and (b) an employee who accepted a v2
-- join_as_employee invite (engagement_contexts row only). The previous body
-- counted only booking engagements, company memberships and agency_workers,
-- so planning was unreachable for the normal roster/employee population.
--
-- Additive: signature, SECURITY DEFINER, search_path and grants are identical.
-- Two branches added to the existing three; nothing removed or loosened.
-- Caller authority is NOT in this function: create_work_plan_entry_v1 still
-- gates on manages_organization() before it ever asks about scope.
-- Rollback: supabase/rollbacks/20261007140000_work_plan_scope_roster_engagement_v1.down.sql
-- ============================================================================

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
  )
  -- NEW: the company roster (invite_company_worker / accept_company_worker_invitation)
  or exists (
    select 1
      from public.company_workers cw
      join public.organizations o on o.legacy_company_id = cw.company_id
     where cw.worker_id = p_worker_id
       and cw.status = 'active'
       and o.id = p_organization_id
  )
  -- NEW: an active v2 engagement of the worker's profile in this organization
  -- (join_as_employee / collaborator / freelancer). Manager/owner relationships
  -- are deliberately NOT worker scope.
  or exists (
    select 1
      from public.engagement_contexts ec
      join public.workers w on w.profile_id = ec.profile_id
     where w.id = p_worker_id
       and ec.organization_id = p_organization_id
       and ec.status = 'active'
       and ec.relationship_slug in ('employee', 'collaborator', 'freelancer')
  );
$$;

revoke all on function public.work_plan_worker_in_scope_v1(uuid, uuid) from public;
revoke all on function public.work_plan_worker_in_scope_v1(uuid, uuid) from anon;
grant execute on function public.work_plan_worker_in_scope_v1(uuid, uuid) to authenticated;
