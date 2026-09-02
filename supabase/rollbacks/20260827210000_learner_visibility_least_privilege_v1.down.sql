-- ============================================================================
-- ROLLBACK for 20260827210000 — learner visibility, least privilege.
--
-- Restores `public.can_view_worker(uuid)` to its pre-20260827210000 body: the
-- engagement_contexts branch stops consulting the registry and treats every
-- active engagement alike again.
--
-- WHAT THIS RE-OPENS, stated plainly so nobody runs it by reflex: after this
-- rollback, an education institution's managers can again read a learner's
-- worker record — salary expectations, relocation willingness, accommodation
-- needs, availability, shift tolerance — plus that learner's skills,
-- professions and languages, purely by virtue of the enrolment. That is the
-- exact consequence the owner ruled against on 2026-08-27. Do not run this
-- without a superseding ruling.
--
-- `relationship_types.grants_worker_visibility` is deliberately LEFT IN PLACE.
-- It stops being read, and dropping it would destroy a recorded ruling for no
-- operational gain. Re-applying the forward migration is therefore idempotent.
--
-- No data row is deleted. Learner engagements created in the meantime are real
-- relationships two people agreed to and are left untouched.
-- ============================================================================

begin;

create or replace function public.can_view_worker(w uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
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
      from public.company_worker_engagements e
      where e.worker_id is not null
        and e.worker_id = w
        and e.status = 'active'
        and public.owns_company(e.company_id)
    )
    -- RESTORED: every active engagement alike, regardless of relationship.
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
$function$;

revoke all on function public.can_view_worker(uuid) from public, anon;
grant execute on function public.can_view_worker(uuid) to authenticated;

commit;
