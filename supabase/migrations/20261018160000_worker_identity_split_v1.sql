-- 20261018160000_worker_identity_split_v1
-- @human-gate-approved
--
-- RED (needs-human-gate): RLS policy replacement on public.workers, SECURITY DEFINER functions, GRANT.
-- Apply ONLY via Supabase MCP `apply_migration` after the owner's explicit approval, AFTER the app
-- change of the same PR is deployed (the app tolerates both states). Never `db push`.
--
-- OWNER COMMANDS 2026-10-18 ("Privatumo apsaugos prioritetas", "#2477 saugumo taisymo užbaigimas"):
-- a worker found through the employer-visibility consent is anonymous. Employers see only
-- professional data; name, contacts, photo and links reach one organization only with the worker's
-- own permission; no plan (paid or VIP) opens identity; owners and organizations with a legitimate
-- working relationship keep their access.
--
-- WHAT CHANGES
--   C1. `workers_select` no longer includes the discoverability branch of `can_view_worker`: the raw
--       row needs a working relationship (or self / admin).
--   C2. Conversation names follow the same identity rule as everything else.
--
-- THE FIX (identity never widens; legitimate organization access is kept, see 1.)
--   1. caller_has_worker_relation_v1 — every working-relationship branch of can_view_worker (NOT its
--      discoverability branch), plus three legitimate organization contexts can_view_worker missed:
--      a DELEGATED manager of the organization behind a company / agency roster, and an ACCEPTED
--      booking of the organization. Same body in 20261018150000 (pinned by a guard).
--   2. workers_select uses it.
--   3. list_discoverable_worker_profiles_v1 — the ONLY discovery read of the row: professional fields
--      only. No name, free text, profile id or exact timestamps (a week bucket instead). A synthetic-
--      fixture flag is computed in SQL from name + headline, so neither leaves the database.
--   4. list_discoverable_worker_ids_v1 — scouting's first stage, ids only.
--   5. conversation_counterpart_identities — in a CANDIDATE thread (opened by an employer from
--      scouting or a demand interest) the candidate is named to the other side only with a working
--      relationship or the candidate's live per-organization disclosure grant that includes the name;
--      otherwise the anonymous label. Starting the thread, writing a message or being shortlisted is
--      never consent (owner rule 2026-10-18). All other threads keep their names.
--   6. Context-bound doors that replace the profile id the app used to need from the row:
--      candidate_profile_for_contact_v1 (only for a worker shortlisted on, or interested in, the
--      caller's own demand), my_direct_conversations_with_workers_v1, employer_disclosure_granted_v1.
--   can_view_worker itself is UNCHANGED (skills / professions / languages and the definer doors keep
--   working exactly as today).
--
-- APPLY ORDER: this file first, then 20261018150000_employer_profile_views_v1 (it replaces the
-- projection below with its counted two-tier version and refuses to run before this file).
-- Rollback: supabase/rollbacks/20261018160000_worker_identity_split_v1.down.sql

begin;

-- 1. The working-relationship predicate (identical body in 20261018150000_employer_profile_views_v1).
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
       where cw.worker_id = p_worker_id and cw.status = 'active' and c.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.company_workers cw join public.organizations o on o.legacy_company_id = cw.company_id
       where cw.worker_id = p_worker_id and cw.status = 'active' and public.manages_organization(o.id)
    )
    or exists (
      select 1 from public.agency_workers aw join public.agencies a on a.id = aw.agency_id
       where aw.worker_id = p_worker_id and aw.status = 'active' and a.profile_id = auth.uid()
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

-- 2. The raw row only with a working relationship (or self / admin).
drop policy if exists workers_select on public.workers;
create policy workers_select on public.workers
  for select using (public.caller_has_worker_relation_v1(id));

-- 3. The discovery projection: professional fields only, for discoverable workers, to employers.
create or replace function public.list_discoverable_worker_profiles_v1(p_worker_ids uuid[])
returns table (
  id uuid,
  experience_years integer,
  current_location_country text,
  preferred_countries text[],
  availability_status text,
  available_from date,
  salary_min_eur integer,
  salary_max_eur integer,
  preferred_contract_type text,
  pay_basis_preference text,
  night_shifts_ok boolean,
  weekend_shifts_ok boolean,
  overtime_ok boolean,
  driving_licence_categories text[],
  own_vehicle boolean,
  own_tools boolean,
  last_active_week date,
  is_synthetic_fixture boolean,
  -- card tier: whether a start date is SET (the communication rule needs only that, never the date)
  has_available_from boolean,
  -- false when detail fields were withheld (20261018150000 plan limit), so null never reads as "not entered"
  detail_unlocked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_worker_ids is null or cardinality(p_worker_ids) = 0 then
    return;
  end if;
  if cardinality(p_worker_ids) > 500 then
    raise exception 'Too many workers requested' using errcode = '22023';
  end if;
  if not (public.is_employer() or public.is_admin()) then
    return;
  end if;
  return query
    select w.id, w.experience_years, w.current_location_country, w.preferred_countries,
           w.availability_status, w.available_from, w.salary_min_eur, w.salary_max_eur,
           w.preferred_contract_type, w.pay_basis_preference, w.night_shifts_ok, w.weekend_shifts_ok,
           w.overtime_ok, w.driving_licence_categories, w.own_vehicle, w.own_tools,
           -- a week bucket, never an exact timestamp
           date_trunc('week', coalesce(w.updated_at, w.created_at))::date,
           -- QA fixtures by their documented markers (lib/qa/synthetic-fixture.ts); the flag leaves
           -- the database, the name and headline never do.
           (coalesce(w.display_name, '') || ' ' || coalesce(w.headline, ''))
             ~* '(\mQA[-_ ]SYNTHETIC\M|\[E2E\]|\mE2E[-_ ]FIXTURE\M)',
           w.available_from is not null,
           true
      from public.workers w
     where w.id = any (p_worker_ids)
       and w.profile_id is not null
       and public.worker_profile_discoverable(w.profile_id);
end;
$$;
revoke all on function public.list_discoverable_worker_profiles_v1(uuid[]) from public;
revoke all on function public.list_discoverable_worker_profiles_v1(uuid[]) from anon;
grant execute on function public.list_discoverable_worker_profiles_v1(uuid[]) to authenticated;

-- 4. Discovery's first stage: WHICH discoverable workers, by country, as ids only.
create or replace function public.list_discoverable_worker_ids_v1(p_country text default null, p_limit integer default 500)
returns table (id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_cc text := nullif(btrim(coalesce(p_country, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_employer() or public.is_admin()) then
    return;
  end if;
  return query
    select w.id
      from public.workers w
     where w.profile_id is not null
       and public.worker_profile_discoverable(w.profile_id)
       and (
         v_cc is null
         or lower(coalesce(w.current_location_country, '')) = lower(v_cc)
         or w.preferred_countries && array[upper(v_cc), lower(v_cc)]
       )
     order by w.id
     limit v_limit;
end;
$$;
revoke all on function public.list_discoverable_worker_ids_v1(text, integer) from public;
revoke all on function public.list_discoverable_worker_ids_v1(text, integer) from anon;
grant execute on function public.list_discoverable_worker_ids_v1(text, integer) to authenticated;

-- 5. Conversation names: a worker is named only by their own choice or a working relationship.
create or replace function public.conversation_counterpart_identities(p_conversation_ids uuid[])
returns table (conversation_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select cp.conversation_id,
         case
           -- Only CANDIDATE threads hide a name: a thread an employer opened from discovery
           -- (scouting) or from a demand interest, seen by its creator's side. Every other thread
           -- (colleagues, own employer, buyer / provider, support, worker-initiated) is unchanged.
           when coalesce(c.source_type, '') not in ('scouting', 'demand_interest') then p.full_name
           when cp.profile_id = c.created_by then p.full_name     -- the creator side is never hidden
           when w.id is null then p.full_name
           when public.caller_has_worker_relation_v1(w.id) then p.full_name
           when exists (
             select 1
               from (select distinct on (e.recipient_organization_id, e.context_type, e.context_id)
                            e.action, e.selected_fields, e.consent_text_version, e.recipient_organization_id
                       from public.privacy_consent_events e
                      where e.user_id = cp.profile_id and e.purpose = 'employer_data_disclosure'
                      order by e.recipient_organization_id, e.context_type, e.context_id,
                               e.created_at desc, e.seq desc) l
               join public.privacy_consent_purposes pp on pp.purpose = 'employer_data_disclosure'
              where l.action = 'granted'
                and l.consent_text_version = pp.current_version
                and l.selected_fields ? 'full_name'
                and public.manages_organization(l.recipient_organization_id)
           ) then p.full_name                                     -- the worker's own disclosure grant
           else 'Candidate ' || upper(left(regexp_replace(w.id::text, '[^a-zA-Z0-9]', '', 'g'), 6))
         end
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  join public.profiles p on p.id = cp.profile_id
  left join public.workers w on w.profile_id = cp.profile_id
  where cp.conversation_id = any(p_conversation_ids)
    and c.kind = 'direct'
    and cp.profile_id <> auth.uid()
    and cp.revoked_at is null
    and public.is_conversation_participant(cp.conversation_id)
    and (
      select count(*)
      from public.conversation_participants cp2
      where cp2.conversation_id = cp.conversation_id
        and cp2.revoked_at is null
    ) = 2;
$$;
revoke all on function public.conversation_counterpart_identities(uuid[]) from public;
revoke all on function public.conversation_counterpart_identities(uuid[]) from anon;
grant execute on function public.conversation_counterpart_identities(uuid[]) to authenticated;

-- 6a. The profile id of a candidate, ONLY inside the caller's own demand context: a worker shortlisted
--     on that demand, or one who expressed interest in it. Never for "any discoverable worker".
create or replace function public.candidate_profile_for_contact_v1(p_worker_id uuid, p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select w.profile_id
    from public.workers w
    join public.customer_requests cr on cr.id = p_request_id
   where w.id = p_worker_id
     and auth.uid() is not null
     and public.can_view_worker(p_worker_id)   -- a shortlist row alone never reaches a hidden person
     and (cr.profile_id = auth.uid()
          or (cr.organization_id is not null and public.manages_organization(cr.organization_id)))
     and (
       exists (select 1 from public.demand_shortlist s
                where s.request_id = p_request_id and s.worker_id = p_worker_id
                  and s.status in ('saved', 'interested'))
       or exists (select 1 from public.demand_interest_signals i
                   where i.request_id = p_request_id and i.worker_id = p_worker_id
                     and i.status <> 'withdrawn')
     );
$$;
revoke all on function public.candidate_profile_for_contact_v1(uuid, uuid) from public;
revoke all on function public.candidate_profile_for_contact_v1(uuid, uuid) from anon;
grant execute on function public.candidate_profile_for_contact_v1(uuid, uuid) to authenticated;

-- 6b. The caller's OWN direct threads with these workers (pipeline facts), keyed by worker id.
create or replace function public.my_direct_conversations_with_workers_v1(p_worker_ids uuid[])
returns table (worker_id uuid, conversation_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if cardinality(p_worker_ids) > 500 then
    raise exception 'Too many workers requested' using errcode = '22023';   -- never a silent empty answer
  end if;
  return query
  select w.id, mine.conversation_id
    from public.workers w
    join public.conversation_participants theirs on theirs.profile_id = w.profile_id and theirs.revoked_at is null
    join public.conversation_participants mine on mine.conversation_id = theirs.conversation_id
                                              and mine.profile_id = auth.uid() and mine.revoked_at is null
    join public.conversations c on c.id = mine.conversation_id and c.kind = 'direct'
   where auth.uid() is not null
     and w.id = any (p_worker_ids);
end;
$$;
revoke all on function public.my_direct_conversations_with_workers_v1(uuid[]) from public;
revoke all on function public.my_direct_conversations_with_workers_v1(uuid[]) from anon;
grant execute on function public.my_direct_conversations_with_workers_v1(uuid[]) to authenticated;

-- 6c. Is the worker's per-organization disclosure live? Boolean only, for an organization the caller manages.
create or replace function public.employer_disclosure_granted_v1(
  p_worker_id uuid, p_organization_id uuid, p_context_type text, p_context_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.has_employer_data_disclosure(w.profile_id, p_organization_id, p_context_type, p_context_id)
      from public.workers w
     where w.id = p_worker_id
       and auth.uid() is not null
       and public.manages_organization(p_organization_id)
  ), false);
$$;
revoke all on function public.employer_disclosure_granted_v1(uuid, uuid, text, uuid) from public;
revoke all on function public.employer_disclosure_granted_v1(uuid, uuid, text, uuid) from anon;
grant execute on function public.employer_disclosure_granted_v1(uuid, uuid, text, uuid) to authenticated;

commit;
