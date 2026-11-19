-- Rollback for 20261118100000_agency_partnerships_commissions_v1.
--
-- One transaction. It REFUSES while any partnership, any need passed to a partner, or any offer
-- made through a partner exists: dropping them would erase which agency placed a candidate and on
-- which agreed share. Otherwise it restores the two objects this migration replaced to their
-- 20261114235900 definitions (copied verbatim below), then drops what this migration added.
-- 20261114235900 itself is left in place; its own rollback undoes it.
begin;

do $$
declare
  n_part   bigint;
  n_pass   bigint;
  n_offers bigint;
begin
  select count(*) into n_part from public.agency_partnerships;
  select count(*) into n_pass from public.agency_partner_request_shares;
  select count(*) into n_offers from public.agency_candidate_offers where partner_share_id is not null;
  if n_part > 0 or n_pass > 0 or n_offers > 0 then
    raise exception
      'ROLLBACK REFUSED: % partnership(s), % passed need(s), % partner offer(s) exist.',
      n_part, n_pass, n_offers;
  end if;
end $$;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where table_name in ('agency_partnerships', 'agency_partner_request_shares');
  end if;
  if to_regclass('public.privacy_erasure_value_rules_v3') is not null then
    delete from public.privacy_erasure_value_rules_v3 where table_name = 'agency_partnerships';
  end if;
end $$;

-- Restore 20261114235900's respond_agency_candidate_offer_v2 (verbatim).
create or replace function public.respond_agency_candidate_offer_v2(
  p_offer_id         uuid,
  p_decision         text,
  p_note             text default null,
  p_accepted_term_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_offer  public.agency_candidate_offers%rowtype;
  v_term   uuid;
  v_result uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select * into v_offer from public.agency_candidate_offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found' using errcode = '42501'; end if;
  if not public.owns_company(v_offer.client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if p_decision = 'accepted' then
    select t.id into v_term
      from public.agency_placement_terms t
     where t.company_id = v_offer.agency_company_id and t.retired_at is null;
    -- The employer must accept the term they were shown, and only that one:
    -- a term changed since the page was read is refused, never assumed.
    if v_term is not null and p_accepted_term_id is distinct from v_term then
      raise exception 'placement_term_not_accepted' using errcode = 'P0004';
    end if;
  end if;

  -- The decision and the booking are v1's, unchanged.
  v_result := public.respond_agency_candidate_offer_v1(p_offer_id, p_decision, p_note);

  if p_decision = 'accepted' and v_term is not null then
    update public.agency_candidate_offers
       set accepted_placement_term_id = v_term,
           placement_term_accepted_at = now()
     where id = p_offer_id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (v_uid, 'agency_placement_term_accepted', 'agency_candidate_offers', p_offer_id,
      jsonb_build_object('term_id', v_term,
                         'agency_company_id', v_offer.agency_company_id,
                         'client_company_id', v_offer.client_company_id));
  end if;

  return v_result;
end;
$$;

-- Restore 20261114235900's agency_placement_terms_select (verbatim).
drop policy if exists agency_placement_terms_select on public.agency_placement_terms;
create policy agency_placement_terms_select on public.agency_placement_terms
  for select to authenticated
  using (
    retired_at is null
    or public.owns_company(company_id)
    or exists (
      select 1 from public.agency_candidate_offers o
       where o.accepted_placement_term_id = agency_placement_terms.id
         and public.owns_company(o.client_company_id)
    )
    or public.is_admin()
  );

drop function if exists public.placement_term_accepted_for_caller_v1(uuid);
drop function if exists public.list_agency_commissions_v1();
drop function if exists public.list_partner_offers_for_lead_v1();
drop function if exists public.list_partner_shared_requests_v1();
drop function if exists public.list_agency_partnerships_v1();
drop function if exists public.submit_partner_candidate_offer_v1(uuid, uuid, text);
drop function if exists public.unshare_request_with_partner_v1(uuid);
drop function if exists public.share_request_with_partner_v1(uuid, uuid);
drop function if exists public.end_agency_partnership_v1(uuid);
drop function if exists public.decline_agency_partnership_v1(uuid);
drop function if exists public.accept_agency_partnership_v1(uuid, uuid);
drop function if exists public.invite_agency_partner_v1(uuid, text, numeric);

-- Owner principle 2026-11-19 (§3b): main's four function bodies verbatim, the full read grant, and
-- the internal owner helper dropped. (The rollback refuses above while any partner offer exists.)
create or replace function public.list_agency_offer_progress_v1()
returns table (
  offer_id     uuid,
  request_id   uuid,
  worker_id    uuid,
  offer_status text,
  review_stage text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.request_id, o.worker_id, o.status,
    case
      when exists (select 1 from public.booking_requests b
                    where b.request_id = o.request_id and b.worker_id = o.worker_id
                      and b.status = 'accepted') then 'accepted'
      when exists (select 1 from public.booking_requests b
                    where b.request_id = o.request_id and b.worker_id = o.worker_id
                      and b.status = 'proposed') then 'booking_started'
      when exists (select 1 from public.demand_shortlist d
                    where d.request_id = o.request_id and d.worker_id = o.worker_id
                      and d.owner_id = (select r.profile_id from public.customer_requests r where r.id = o.request_id)
                      and d.status = 'not_fit') then 'rejected'
      when exists (select 1 from public.conversations cv
                    join public.workers w on w.id = o.worker_id
                    join public.conversation_participants cp
                      on cp.conversation_id = cv.id and cp.profile_id = w.profile_id
                    where cv.source_type = 'scouting' and cv.source_id = o.request_id) then 'contacted'
      when exists (select 1 from public.demand_shortlist d
                    where d.request_id = o.request_id and d.worker_id = o.worker_id
                      and d.owner_id = (select r.profile_id from public.customer_requests r where r.id = o.request_id)) then 'reviewed'
      else 'offered'
    end as review_stage,
    o.created_at
    from public.agency_candidate_offers o
    join public.agency_client_request_shares s on s.id = o.request_share_id
    join public.agency_client_connections c on c.id = o.connection_id
   where public.owns_company(o.agency_company_id)  -- caller = agency owner
     and c.status = 'active'
     and s.status = 'active'
   order by o.created_at desc
   limit 200;
$$;

create or replace function public.list_agency_placements_v1()
returns table(
  offer_id uuid,
  request_id uuid,
  worker_id uuid,
  offered_at timestamptz,
  client_decided_at timestamptz,
  booking_status text,
  start_date date,
  expected_end_date date,
  worker_decided_at timestamptz,
  engagement_status text,
  engagement_started_at timestamptz,
  engagement_ended_at timestamptz,
  assignment_status text,
  assigned_at timestamptz,
  assignment_ended_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select o.id, o.request_id, o.worker_id, o.created_at, o.decided_at,
         b.status, b.start_date, b.expected_end_date,
         (select max(e.created_at) from public.booking_request_events e
           where e.booking_request_id = b.id and e.event_type in ('accepted', 'declined')),
         g.status, g.started_at, g.ended_at,
         a.status, a.assigned_at, a.ended_at
    from public.agency_candidate_offers o
    left join public.booking_requests b on b.id = o.booking_id
    left join lateral (
      select ce.status, ce.started_at, ce.ended_at
        from public.company_worker_engagements ce
       where ce.source_booking_id = b.id
       order by ce.created_at desc limit 1) g on true
    left join lateral (
      select pa.status, pa.assigned_at, pa.ended_at
        from public.project_worker_assignments pa
        join public.projects p on p.id = pa.project_id
        left join public.organizations org on org.id = p.organization_id
       where pa.worker_id = o.worker_id
         and (org.legacy_company_id = o.client_company_id
              or (p.organization_id is null and p.company_id = o.client_company_id))
         and pa.assigned_at >= coalesce(o.decided_at, o.created_at)
       order by pa.assigned_at desc limit 1) a on true
   where public.owns_company(o.agency_company_id)
     and o.status = 'accepted'
   order by o.decided_at desc nulls last
   limit 100;
$function$;

create or replace function public.withdraw_agency_candidate_offer_v1(p_offer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_upd int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Only the offering agency owner may withdraw. The client never withdraws an
  -- agency offer (it rejects via its own demand_shortlist not_fit instead).
  update public.agency_candidate_offers o
     set status = 'withdrawn', withdrawn_by = v_uid, withdrawn_at = now(), updated_at = now()
   where o.id = p_offer_id
     and o.status = 'offered'
     and public.owns_company(o.agency_company_id);
  get diagnostics v_upd = row_count;
  return v_upd > 0;
end;
$$;

create or replace function public.submit_agency_candidate_offer_v1(p_request_share_id uuid, p_worker_id uuid, p_note text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid       uuid := auth.uid();
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_conn      uuid;
  v_agency    uuid;
  v_client    uuid;
  v_request   uuid;
  v_id        uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  -- Resolve the connection + request from the SHARE (client cannot forge these).
  -- Everything must be live at submit time.
  select c.id, c.agency_company_id, c.client_company_id, s.request_id
    into v_conn, v_agency, v_client, v_request
    from public.agency_client_request_shares s
    join public.agency_client_connections c on c.id = s.connection_id
   where s.id = p_request_share_id
     and s.status = 'active'
     and c.status = 'active';
  if v_conn is null then raise exception 'share_not_active' using errcode = '42501'; end if;

  -- The caller must OWN the agency company, and it must act as an agency.
  if not public.owns_company(v_agency) then raise exception 'not_owner' using errcode = '42501'; end if;
  if not public.company_acts_as_agency(v_agency) then
    raise exception 'not_agency' using errcode = '42501';
  end if;

  -- The worker must be an ACTIVE roster member of THAT agency company.
  if not exists (
    select 1 from public.company_workers cw
    where cw.company_id = v_agency and cw.worker_id = p_worker_id and cw.status = 'active'
  ) then
    raise exception 'worker_not_on_roster' using errcode = '42501';
  end if;

  -- Idempotent: re-affirm an existing active offer, never duplicate.
  insert into public.agency_candidate_offers
    (connection_id, request_share_id, agency_company_id, client_company_id,
     request_id, worker_id, status, note, created_by)
  values
    (v_conn, p_request_share_id, v_agency, v_client, v_request, p_worker_id, 'offered', v_note, v_uid)
  -- A re-offer re-binds to the CURRENT active share/connection (a stale row
  -- from a previously revoked connection must never keep the old provenance).
  on conflict (agency_company_id, request_id, worker_id) where (status = 'offered')
  do update set connection_id     = excluded.connection_id,
                request_share_id  = excluded.request_share_id,
                client_company_id = excluded.client_company_id,
                note              = coalesce(excluded.note, public.agency_candidate_offers.note),
                updated_at        = now()
  returning id into v_id;
  return v_id;
end;
$function$;

drop function if exists public.agency_offer_owner_v1(uuid, uuid);
grant select on public.agency_candidate_offers to authenticated;

-- R2 P2-1: v1 callable again, exactly as on main.
grant execute on function public.respond_agency_candidate_offer_v1(uuid, text, text) to authenticated;

-- R2 P2-3: the offer read policy verbatim as 20260901052300 left it (before the
-- column it now references is dropped).
drop policy if exists agency_candidate_offers_select on public.agency_candidate_offers;
create policy agency_candidate_offers_select on public.agency_candidate_offers for select
  using (
    public.owns_company(agency_company_id)
    or (public.owns_company(client_company_id)
        and exists (select 1 from public.agency_client_connections c
                     where c.id = connection_id and c.status = 'active'))
    or public.is_admin()
  );

drop index if exists public.agency_candidate_offers_partner_share;
alter table public.agency_candidate_offers drop column if exists partner_share_id;
drop table if exists public.agency_partner_request_shares;
drop table if exists public.agency_partnerships;

commit;
