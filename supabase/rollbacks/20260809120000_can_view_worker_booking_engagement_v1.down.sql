-- ============================================================================
-- ROLLBACK for 20260809120000_can_view_worker_booking_engagement_v1.
--
-- Restores `public.can_view_worker(uuid)` to the APPLIED
-- 20260711130000_privacy_consent_and_disclosure_v1 body, VERBATIM, and removes
-- the function comment that migration never carried.
--
-- WHAT RUNNING THIS RESTORES: the gap. The engaging company owner loses the
-- workers / worker_skills / worker_professions / worker_languages read, the
-- absence list goes back to rendering `absences.unknownWorker` for engaged
-- workers, and the database returns to CONTRADICTING itself — the applied
-- SECURITY DEFINER `list_booking_engagement_workers_v1` keeps handing that
-- same caller the worker's `display_name` and `profile_id` regardless.
--
-- SAFE AT ANY TIME: this rollback replaces exactly one function body and
-- clears one comment. It creates and drops nothing, touches no table, no
-- policy, no grant beyond re-stating the existing posture, and writes no rows.
-- No data can be lost by running it.
--
-- Apply via Supabase MCP only. Never `db push`.
-- ============================================================================

begin;

-- Byte-identical to the body shipped by 20260711130000 (the currently APPLIED
-- production definition), with NO company_worker_engagements branch.
create or replace function public.can_view_worker(w uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.owns_worker(w)
    or public.is_admin()
    -- Employer/agency DISCOVERY: only with a current granted
    -- profile_discoverability consent (GDPR consent basis, fail closed).
    or (
      public.is_employer()
      and exists (
        select 1 from public.workers x
        where x.id = w
          and x.profile_id is not null
          and public.worker_profile_discoverable(x.profile_id)
      )
    )
    -- Active work relationships keep visibility (contract / legitimate
    -- interest basis, NOT the discovery consent):
    or exists (
      select 1
      from public.company_workers cw
      join public.companies c on c.id = cw.company_id
      where cw.worker_id = w and cw.status = 'active' and c.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.agency_workers aw
      join public.agencies a on a.id = aw.agency_id
      where aw.worker_id = w and aw.status = 'active' and a.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.engagement_contexts ec
      join public.workers x on x.id = w and x.profile_id = ec.profile_id
      where ec.status = 'active'
        and public.manages_organization(ec.organization_id)
    )
    or exists (
      select 1
      from public.project_worker_assignments pwa
      where pwa.worker_id = w
        and pwa.status = 'active'
        and pwa.ended_at is null
        and public.can_manage_project(pwa.project_id)
    )
$$;

revoke all on function public.can_view_worker(uuid) from public;
revoke all on function public.can_view_worker(uuid) from anon;
grant execute on function public.can_view_worker(uuid) to authenticated;

-- 20260711130000 shipped no comment on this function; restore that state.
comment on function public.can_view_worker(uuid) is null;

commit;
