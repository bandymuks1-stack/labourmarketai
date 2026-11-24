-- @human-gate-approved
-- 20261121100200_former_member_access_arms_v1 — access arms follow ended governance membership.
-- RED: SECURITY DEFINER function bodies and RLS policy replacements.
--
-- A. The company / agency creator arms of five predicates use the canonical
--    helpers public.owns_company(...) / public.owns_agency(...) (as fixed in
--    20261021093000) instead of the raw creator column. Every other arm is
--    unchanged: caller_has_worker_relation_v1, can_view_worker,
--    worker_avatar_path_v1, worker_recognitions_for_viewer_v1,
--    read_companies_private_v1.
-- B. The creator/owner arm of customer_requests_select, customer_requests_update,
--    demand_shortlist_select and booking_requests_select holds for a personal
--    row (organization_id is null) or while the caller has demand access to
--    the row's organization (public.has_org_demand_access). Other arms unchanged.
-- C. demand_shortlist_write: the caller's own shortlist rows of an
--    organization's need are read and changed only while the caller has demand
--    access to that organization (USING); a new row needs a request that is
--    the caller's own personal one or one of an organization they have demand
--    access to (WITH CHECK).
--
-- Signatures, language, volatility, security, search_path and grants are as in
-- each object's previous definition. No rows are changed.
-- Rollback: supabase/rollbacks/20261121100200_former_member_access_arms_v1.down.sql

begin;

-- ── A1. caller_has_worker_relation_v1 (previous: 20261018160000_worker_identity_split_v1) ──
create or replace function public.caller_has_worker_relation_v1(p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.owns_worker(p_worker_id)
    or public.is_admin()
    or exists (
      select 1 from public.company_workers cw join public.companies c on c.id = cw.company_id
       where cw.worker_id = p_worker_id and cw.status = 'active' and public.owns_company(cw.company_id)
    )
    or exists (
      select 1 from public.company_workers cw join public.organizations o on o.legacy_company_id = cw.company_id
       where cw.worker_id = p_worker_id and cw.status = 'active' and public.manages_organization(o.id)
    )
    or exists (
      select 1 from public.agency_workers aw join public.agencies a on a.id = aw.agency_id
       where aw.worker_id = p_worker_id and aw.status = 'active' and public.owns_agency(aw.agency_id)
    )
    or exists (
      select 1 from public.agency_workers aw join public.organizations o on o.legacy_agency_id = aw.agency_id
       where aw.worker_id = p_worker_id and aw.status = 'active' and public.manages_organization(o.id)
    )
    or exists (
      select 1 from public.company_worker_engagements e
       where e.worker_id is not null and e.worker_id = p_worker_id and e.status = 'active'
         and public.owns_company(e.company_id)
    )
    or exists (
      select 1 from public.engagement_contexts ec
        join public.relationship_types rt on rt.slug = ec.relationship_slug and rt.grants_worker_visibility
        join public.workers x on x.id = p_worker_id and x.profile_id = ec.profile_id
       where ec.status = 'active' and public.manages_organization(ec.organization_id)
    )
    or exists (
      select 1 from public.project_worker_assignments pwa
       where pwa.worker_id = p_worker_id and pwa.status = 'active' and pwa.ended_at is null
         and public.can_manage_project(pwa.project_id)
    )
    or exists (
      select 1 from public.booking_requests b
       where b.worker_id = p_worker_id and b.status = 'accepted'
         and (b.owner_id = auth.uid()
              or (b.organization_id is not null and public.manages_organization(b.organization_id)))
    );
$$;
revoke all on function public.caller_has_worker_relation_v1(uuid) from public;
revoke all on function public.caller_has_worker_relation_v1(uuid) from anon;
grant execute on function public.caller_has_worker_relation_v1(uuid) to authenticated;

-- ── A2. can_view_worker (previous: 20260827210000_learner_visibility_least_privilege_v1) ──
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
      where cw.worker_id = w and cw.status = 'active' and public.owns_company(cw.company_id)
    )
    or exists (
      select 1
      from public.agency_workers aw
      join public.agencies a on a.id = aw.agency_id
      where aw.worker_id = w and aw.status = 'active' and public.owns_agency(aw.agency_id)
    )
    -- An ACTIVE accepted-booking engagement held by a company the caller owns.
    -- Same legal basis as the two roster branches above: an ACTIVE,
    -- worker-ACCEPTED relationship (legal-basis-matrix-v1 row 4).
    or exists (
      select 1
      from public.company_worker_engagements e
      where e.worker_id is not null            -- a GDPR-detached row grants nothing (#856 model A)
        and e.worker_id = w
        and e.status = 'active'                -- an ended engagement grants nothing
        and public.owns_company(e.company_id)  -- caller-bound, same authority as the roster branch
    )
    -- ▼▼ CHANGED 20260827210000 — owner ruling, least privilege ▼▼
    -- An active organization engagement, AND that relationship must be one
    -- the registry says carries worker visibility. Every work relationship is
    -- seeded true, so employer/company behaviour is unchanged; `student` is
    -- false, so enrolling a learner discloses nothing on its own. The join is
    -- total: relationship_slug is NOT NULL with an FK to this registry.
    or exists (
      select 1
      from public.engagement_contexts ec
      join public.relationship_types rt
        on rt.slug = ec.relationship_slug
       and rt.grants_worker_visibility
      join public.workers x on x.id = w and x.profile_id = ec.profile_id
      where ec.status = 'active'
        and public.manages_organization(ec.organization_id)
    )
    -- ▲▲ END OF THE CHANGE ▲▲
    -- The PURPOSE-BOUND path an institution uses for a learner: a real
    -- practice assignment on a real project. Untouched.
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

-- ── A3. worker_avatar_path_v1 (previous: 20260930133500_worker_avatar_path_for_relations_v1) ──
create or replace function public.worker_avatar_path_v1(p_worker_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.avatar_url
  from public.workers w
  join public.profiles p on p.id = w.profile_id
  where w.id = p_worker_id
    and p.avatar_url is not null
    and p.avatar_url like p.id::text || '/%'
    and (
      -- the worker themselves
      w.profile_id = auth.uid()
      -- a REAL, ACTIVE work relationship (the relationship branches of
      -- can_view_worker(); its discovery-consent branch is intentionally
      -- absent)
      or exists (
        select 1
        from public.company_workers cw
        join public.companies c on c.id = cw.company_id
        where cw.worker_id = w.id and cw.status = 'active' and public.owns_company(cw.company_id)
      )
      or exists (
        select 1
        from public.agency_workers aw
        join public.agencies a on a.id = aw.agency_id
        where aw.worker_id = w.id and aw.status = 'active' and public.owns_agency(aw.agency_id)
      )
      or exists (
        select 1
        from public.engagement_contexts ec
        where ec.profile_id = w.profile_id
          and ec.status = 'active'
          and public.manages_organization(ec.organization_id)
      )
      or exists (
        select 1
        from public.project_worker_assignments pwa
        where pwa.worker_id = w.id
          and pwa.status = 'active'
          and pwa.ended_at is null
          and public.can_manage_project(pwa.project_id)
      )
    )
$$;

revoke all on function public.worker_avatar_path_v1(uuid) from public;
revoke all on function public.worker_avatar_path_v1(uuid) from anon;
grant execute on function public.worker_avatar_path_v1(uuid) to authenticated;

-- ── A4. worker_recognitions_for_viewer_v1 (previous: 20261007210000_worker_recognitions_for_viewer_v1) ──
create or replace function public.worker_recognitions_for_viewer_v1(p_worker_id uuid)
returns table (
  id                       uuid,
  requirement_kind         text,
  requirement_key          text,
  requirement_country      text,
  assessor_organization_id uuid,
  assessor_name            text,
  valid_until              date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_worker_id is null then return; end if;
  -- Audience (owner decision 2026-10-08): the subject, an admin, or a viewer
  -- with a CURRENT engagement / authorized organizational relationship with the
  -- Person. NOT can_view_worker alone: its discoverability branch is excluded.
  if not (
    public.owns_worker(p_worker_id)
    or public.is_admin()
    or exists (
      select 1 from public.company_workers cw
        join public.companies c on c.id = cw.company_id
       where cw.worker_id = p_worker_id and cw.status = 'active' and public.owns_company(cw.company_id)
    )
    or exists (
      select 1 from public.agency_workers aw
        join public.agencies a on a.id = aw.agency_id
       where aw.worker_id = p_worker_id and aw.status = 'active' and public.owns_agency(aw.agency_id)
    )
    or exists (
      select 1 from public.company_worker_engagements e
       where e.worker_id = p_worker_id and e.status = 'active' and public.owns_company(e.company_id)
    )
    or exists (
      select 1 from public.engagement_contexts ec
        join public.relationship_types rt on rt.slug = ec.relationship_slug and rt.grants_worker_visibility
        join public.workers x on x.id = p_worker_id and x.profile_id = ec.profile_id
       where ec.status = 'active' and public.manages_organization(ec.organization_id)
    )
    or exists (
      select 1 from public.project_worker_assignments pwa
       where pwa.worker_id = p_worker_id and pwa.status = 'active' and pwa.ended_at is null
         and public.can_manage_project(pwa.project_id)
    )
  ) then
    return;
  end if;
  return query
    select r.id, r.requirement_kind, r.requirement_key, r.requirement_country,
           r.assessor_organization_id,
           coalesce(o.display_name, o.legal_name),
           r.valid_until
      from public.competency_recognitions r
      join public.workers w on w.profile_id = r.subject_profile_id and w.id = p_worker_id
      left join public.organizations o on o.id = r.assessor_organization_id
     where r.decision = 'recognised'
       and r.revoked_at is null
       and r.requirement_kind in ('skill', 'profession')
       and (r.valid_from is null or r.valid_from <= current_date)
       and (r.valid_until is null or r.valid_until >= current_date)
     order by r.requirement_kind, r.requirement_key
     limit 100;
end $$;

revoke all on function public.worker_recognitions_for_viewer_v1(uuid) from public, anon;
grant execute on function public.worker_recognitions_for_viewer_v1(uuid) to authenticated;

-- ── A5. read_companies_private_v1 (previous: 20260924120000_companies_contact_minimization_v2) ──
create or replace function public.read_companies_private_v1()
returns setof public.companies
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.*
    from public.companies c
   where public.owns_company(c.id)
      or public.is_admin()
      or exists (
           select 1
             from public.organizations o
             join public.company_memberships m on m.organization_id = o.id
            where o.legacy_company_id = c.id
              and m.profile_id = auth.uid()
              and m.status = 'active'
              and m.role in ('owner', 'admin', 'manager', 'external_manager', 'member')
         );
$$;
revoke all on function public.read_companies_private_v1() from public;
revoke all on function public.read_companies_private_v1() from anon;
grant execute on function public.read_companies_private_v1() to authenticated;

-- ── B1. customer_requests_select (previous: 20260806200000_org_demand_spine_v2) ──
drop policy if exists customer_requests_select on public.customer_requests;
create policy customer_requests_select on public.customer_requests
  for select to authenticated
  using (
    (profile_id = auth.uid() and (organization_id is null or public.has_org_demand_access(organization_id)))
    or public.is_admin()
    or public.has_org_demand_access(organization_id)
  );

-- ── B2. customer_requests_update (previous: 0028_customer_requests) ──
drop policy if exists customer_requests_update on public.customer_requests;
create policy customer_requests_update on public.customer_requests for update
  using ((profile_id = auth.uid() and (organization_id is null or public.has_org_demand_access(organization_id))) or public.is_admin())
  with check ((profile_id = auth.uid() and (organization_id is null or public.has_org_demand_access(organization_id))) or public.is_admin());

-- ── B3. demand_shortlist_select (previous: 20260806200000_org_demand_spine_v2) ──
drop policy if exists demand_shortlist_select on public.demand_shortlist;
create policy demand_shortlist_select on public.demand_shortlist
  for select to authenticated
  using (
    (owner_id = auth.uid() and (organization_id is null or public.has_org_demand_access(organization_id)))
    or public.is_admin()
    or public.has_org_demand_access(organization_id)
  );

-- ── B4. booking_requests_select (previous: 20260806200000_org_demand_spine_v2) ──
drop policy if exists booking_requests_select on public.booking_requests;
create policy booking_requests_select on public.booking_requests
  for select to authenticated
  using (
    (owner_id = auth.uid() and (organization_id is null or public.has_org_demand_access(organization_id)))
    or exists (
      select 1 from public.workers w
       where w.id = booking_requests.worker_id and w.profile_id = auth.uid()
    )
    or public.is_admin()
    or public.has_org_demand_access(organization_id)
  );

-- ── C. demand_shortlist_write (previous: 20260612220000_demand_shortlist) ──
drop policy if exists demand_shortlist_write on public.demand_shortlist;
create policy demand_shortlist_write on public.demand_shortlist for all
  using (owner_id = auth.uid()
         and (organization_id is null or public.has_org_demand_access(organization_id)))
  with check (owner_id = auth.uid()
    and exists (select 1 from public.customer_requests r
                 where r.id = demand_shortlist.request_id
                   and ((r.organization_id is null and r.profile_id = auth.uid())
                        or (r.organization_id is not null and public.has_org_demand_access(r.organization_id)))));

commit;
