-- 20261122210000_agency_open_need_candidates_v1
--
-- WHY (owner decision 2026-11-22, item 3): an agency may propose SPECIFIC
-- workers on an anonymised open need without any earlier link to the client.
--   * The first offer carries professional facts only (qualification,
--     experience, languages, availability).
--   * The name and other identifying data are revealed only on a proper
--     legal basis and under access control: anonymised until the client
--     chooses the candidate AND the worker consents (accepts the booking).
--   * Contacts, personal documents and confidential data are never shown.
--   * An agency never sees another agency's offers.
--   * The client selects, talks and continues hiring through the platform.
-- Decision 0033: the client sees only its direct partner — the agency.
--
-- Today a named candidate needs a prior agency↔client connection AND a
-- need share (agency_candidate_offers.connection_id / request_share_id are
-- NOT NULL); an open-board agency could offer only its company.
--
-- WHAT (additive; NO existing function, policy or grant is changed)
--   1. team_demand_offer_candidates — workers an agency attaches to ITS
--      company offer on an open need. RLS forced, no policy, no grant.
--   2. add_offer_candidate_v1(offer, worker) — the OWNER of the agency
--      company (owns_company, the same authority as the existing
--      submit_agency_candidate_offer_v1) on a company offer made by an
--      AGENCY. The worker must be on that agency's ACTIVE roster AND have
--      chosen to be discoverable to companies (worker_profile_discoverable:
--      the person's own current consent, paused while an account deletion
--      is open). Roster membership alone is NOT consent to be shown to a
--      company the worker has no relationship with. At most 10 open
--      candidates per offer.
--   3. withdraw_offer_candidate_v1(candidate) — the agency's owner, OR the
--      worker themself ("do not propose me").
--   3a. list_my_offer_candidacies_v1() — the worker: every time an agency
--      proposed them (agency, the need's role, status, dates). This is the
--      worker's notice in the product (shown on their Bookings page) and the
--      privacy export's read for this table. The client is never named here.
--   4. list_offer_candidates_v1(offer) — either party:
--        supplier: its own roster worker's display name (already its own);
--        receiver: a pseudonym ('Candidate ' + 6 chars of the candidate id)
--                  and professional facts only — experience years, work
--                  country, availability, languages (code + level), skills
--                  (catalogue slug + confirmed flag). No name, photo, bio,
--                  headline, contact, document or worker id.
--      Every read re-checks that the worker is still on the agency's active
--      roster and still discoverable, and that the offer is still open: a
--      worker who left the agency or withdrew consent disappears from the
--      client's list (the agency still sees the row, marked unavailable).
--   5. select_offer_candidate_v1(candidate, note) — the CLIENT (the need's
--      receiver) chooses one candidate, re-checked as above. Choosing
--      CONNECTS the client company with the agency — a standing connection
--      (the existing agency↔client connection, or a new active one accepted
--      by the client now), which the client can end on its Partners page;
--      the copy says so before the click. The new connection carries NO
--      person's e-mail: invited_email is NOT NULL on that table (an invite
--      field), so it holds a non-routable marker
--      (open-need+<client id>@connection.invalid, RFC 2606), never the
--      client user's login address. The existing need share is used, the
--      candidate becomes a standard agency_candidate_offers row, and the EXISTING accept path (respond_agency_candidate_
--      offer_v1) proposes the booking to the worker. From there the canonical
--      chain is unchanged: the worker accepts or declines the booking, an
--      accepted booking starts the engagement, and only then is the worker
--      named to the client (caller_has_worker_relation_v1, unchanged).
--
-- ROLLBACK: supabase/rollbacks/20261122210000_agency_open_need_candidates_v1.down.sql
-- (refuses while any candidate row exists).

begin;

create table if not exists public.team_demand_offer_candidates (
  id                 uuid primary key default gen_random_uuid(),
  offer_id           uuid not null references public.team_demand_offers(id) on delete cascade,
  worker_id          uuid not null references public.workers(id) on delete cascade,
  added_by           uuid references public.profiles(id) on delete set null,
  status             text not null default 'offered' check (status in ('offered', 'withdrawn', 'selected')),
  created_at         timestamptz not null default now(),
  withdrawn_at       timestamptz,
  selected_at        timestamptz,
  selected_by        uuid references public.profiles(id) on delete set null,
  candidate_offer_id uuid references public.agency_candidate_offers(id) on delete set null
);
-- One open (or chosen) place per worker per offer.
-- @plan-cache-proof: n/a — uniqueness only (one open place per worker per offer); every read filters by offer_id through the primary key's companion scan on a table of at most 50 rows per offer
create unique index if not exists team_demand_offer_candidates_one_open_v1
  on public.team_demand_offer_candidates (offer_id, worker_id) where status <> 'withdrawn';

alter table public.team_demand_offer_candidates enable row level security;
alter table public.team_demand_offer_candidates force row level security;
revoke all on public.team_demand_offer_candidates from public, anon, authenticated;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'team_demand_offer_candidates', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1): the proposal of this worker goes with the worker', 'a candidate place on an offer; no history of its own'),
  ('public', 'team_demand_offer_candidates', 'added_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', 'who attached the candidate; the row stays with the offer'),
  ('public', 'team_demand_offer_candidates', 'selected_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', 'who chose the candidate; the row stays with the offer')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;
-- ─────────────────────────────────────────────────────────────────────────

-- The agency company behind an offering organization, or NULL when the
-- organization does not act as an agency — by the ONE capability rule
-- (ORG-2: company_acts_as_agency = the type OR a declared workforce role),
-- never a second, independent company_type gate. Internal (no grant).
create or replace function public.offer_agency_company_v1(p_team_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.legacy_company_id
    from public.organizations o
   where o.id = p_team_org_id
     and o.organization_type = 'company'
     and o.legacy_company_id is not null
     and coalesce(public.company_acts_as_agency(o.legacy_company_id), false)
$$;
revoke all on function public.offer_agency_company_v1(uuid) from public;
revoke all on function public.offer_agency_company_v1(uuid) from anon;
revoke all on function public.offer_agency_company_v1(uuid) from authenticated;

-- Whether a worker may be shown to a company with no relationship, as the
-- agency's candidate: still on the agency's ACTIVE roster, and discoverable
-- by their own current consent. Internal (no grant).
create or replace function public.offer_candidate_available_v1(p_agency_company_id uuid, p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select true
      from public.company_workers cw
      join public.workers w on w.id = cw.worker_id
     where cw.company_id = p_agency_company_id
       and cw.worker_id = p_worker_id
       and cw.status = 'active'
       and w.profile_id is not null
       and public.worker_profile_discoverable(w.profile_id)
     limit 1), false)
$$;
revoke all on function public.offer_candidate_available_v1(uuid, uuid) from public;
revoke all on function public.offer_candidate_available_v1(uuid, uuid) from anon;
revoke all on function public.offer_candidate_available_v1(uuid, uuid) from authenticated;

-- ── add ──────────────────────────────────────────────────────────────────
-- Returns jsonb {outcome: 'added' | 'already_added', candidate_id}.
-- Refusals (22023): not_an_agency_offer | offer_not_open | worker_not_on_roster
-- | worker_not_discoverable | candidate_limit_reached.
create or replace function public.add_offer_candidate_v1(
  p_offer_id  uuid,
  p_worker_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  o        record;
  v_agency uuid;
  v_id     uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select t.id, t.status, t.offer_kind, t.team_org_id into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found then
    raise exception 'Not authorized to propose candidates on this offer' using errcode = '42501';
  end if;
  v_agency := public.offer_agency_company_v1(o.team_org_id);
  if v_agency is null then
    -- Not an agency's offer: its own supplier is told so; anyone else learns nothing.
    if public.team_offer_party_side_v1(o.id) is distinct from 'supplier' then
      raise exception 'Not authorized to propose candidates on this offer' using errcode = '42501';
    end if;
    raise exception 'not_an_agency_offer' using errcode = '22023';
  end if;
  -- The same authority as submit_agency_candidate_offer_v1: the agency's owner.
  if not public.owns_company(v_agency) then
    raise exception 'Not authorized to propose candidates on this offer' using errcode = '42501';
  end if;
  if o.offer_kind <> 'organization' then
    raise exception 'not_an_agency_offer' using errcode = '22023';
  end if;
  if o.status not in ('offered', 'accepted') then
    raise exception 'offer_not_open' using errcode = '22023';
  end if;
  -- Only the agency's OWN active roster: a person it represents.
  if p_worker_id is null or not exists (
       select 1 from public.company_workers cw
        where cw.company_id = v_agency and cw.worker_id = p_worker_id and cw.status = 'active') then
    raise exception 'worker_not_on_roster' using errcode = '22023';
  end if;
  -- Roster membership is not consent to be shown to a stranger: the worker's
  -- own discoverability choice is.
  if not public.offer_candidate_available_v1(v_agency, p_worker_id) then
    raise exception 'worker_not_discoverable' using errcode = '22023';
  end if;

  select c.id into v_id from public.team_demand_offer_candidates c
   where c.offer_id = o.id and c.worker_id = p_worker_id and c.status <> 'withdrawn';
  if v_id is not null then
    return jsonb_build_object('outcome', 'already_added', 'candidate_id', v_id);
  end if;
  if (select count(*) from public.team_demand_offer_candidates c
       where c.offer_id = o.id and c.status = 'offered') >= 10 then
    raise exception 'candidate_limit_reached' using errcode = '22023';
  end if;

  insert into public.team_demand_offer_candidates (offer_id, worker_id, added_by)
    values (o.id, p_worker_id, uid)
  returning id into v_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'offer_candidate_added_v1', 'team_demand_offers', o.id,
    jsonb_build_object('candidate_id', v_id, 'agency_company_id', v_agency));
  return jsonb_build_object('outcome', 'added', 'candidate_id', v_id);
end;
$$;

-- ── withdraw ─────────────────────────────────────────────────────────────
create or replace function public.withdraw_offer_candidate_v1(
  p_candidate_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  c    record;
  v_by text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select k.id, k.offer_id, k.status, k.worker_id, t.team_org_id into c
    from public.team_demand_offer_candidates k
    join public.team_demand_offers t on t.id = k.offer_id
   where k.id = p_candidate_id for update of k;
  if not found then
    raise exception 'Not authorized to withdraw this candidate' using errcode = '42501';
  end if;
  -- The agency's owner, or the worker themself.
  if exists (select 1 from public.workers w where w.id = c.worker_id and w.profile_id = uid) then
    v_by := 'worker';
  elsif public.owns_company(public.offer_agency_company_v1(c.team_org_id)) then
    v_by := 'agency';
  else
    raise exception 'Not authorized to withdraw this candidate' using errcode = '42501';
  end if;
  if c.status = 'withdrawn' then
    return 'already_withdrawn';
  end if;
  if c.status = 'selected' then
    -- Chosen by the client: from here the booking is the worker's decision.
    raise exception 'candidate_already_selected' using errcode = '22023';
  end if;
  update public.team_demand_offer_candidates
     set status = 'withdrawn', withdrawn_at = now() where id = c.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'offer_candidate_withdrawn_v1', 'team_demand_offers', c.offer_id,
    jsonb_build_object('candidate_id', c.id, 'by', v_by));
  return 'withdrawn';
end;
$$;

-- ── the worker's own: every proposal of them ─────────────────────────────
create or replace function public.list_my_offer_candidacies_v1()
returns table (
  candidate_id   uuid,
  agency_name    text,
  role           text,
  status         text,
  created_at     timestamptz,
  withdrawn_at   timestamptz,
  selected_at    timestamptz,
  booking_status text
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
  -- The worker's own rows only; the agency is the worker's own (its roster);
  -- the client is never named — the need's role only.
  return query
  select k.id,
         coalesce(nullif(btrim(co.display_name), ''), nullif(btrim(co.legal_name), ''), '-'),
         -- The need's own public heading (what agencies already read on the
         -- open board), else its role.
         coalesce(nullif(btrim(cr.title), ''), nullif(btrim(cr.role_or_work_type), '')),
         k.status,
         k.created_at,
         k.withdrawn_at,
         k.selected_at,
         (select b.status from public.booking_requests b
            join public.agency_candidate_offers a on a.booking_id = b.id
           where a.id = k.candidate_offer_id)
    from public.team_demand_offer_candidates k
    join public.workers w on w.id = k.worker_id and w.profile_id = auth.uid()
    join public.team_demand_offers t on t.id = k.offer_id
    left join public.organizations g on g.id = t.team_org_id
    left join public.companies co on co.id = g.legacy_company_id
    left join public.customer_requests cr on cr.id = t.request_id
   order by k.created_at desc
   limit 200;
end;
$$;

-- ── list ─────────────────────────────────────────────────────────────────
create or replace function public.list_offer_candidates_v1(
  p_offer_id uuid
) returns table (
  candidate_id       uuid,
  label              text,
  status             text,
  experience_years   integer,
  work_country       text,
  availability       text,
  available_from     date,
  languages          jsonb,
  skills             jsonb,
  booking_status     text,
  created_at         timestamptz,
  available          boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_side   text;
  v_agency uuid;
  v_open   boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  v_side := public.team_offer_party_side_v1(p_offer_id);
  if v_side is null then
    return;
  end if;
  select public.offer_agency_company_v1(t.team_org_id), t.status in ('offered', 'accepted')
    into v_agency, v_open
    from public.team_demand_offers t where t.id = p_offer_id;
  -- The supplier side is the agency's owner (the add/withdraw authority).
  if v_agency is null or (v_side = 'supplier' and not public.owns_company(v_agency)) then
    return;
  end if;
  return query
  select k.id,
         -- The supplier knows its own roster; the client sees a pseudonym.
         case when v_side = 'supplier'
              then coalesce(nullif(btrim(w.display_name), ''), 'Candidate ' || upper(left(replace(k.id::text, '-', ''), 6)))
              else 'Candidate ' || upper(left(replace(k.id::text, '-', ''), 6)) end,
         k.status,
         w.experience_years,
         w.current_location_country,
         w.availability_status,
         w.available_from,
         coalesce((select jsonb_agg(jsonb_build_object('lang', l.lang, 'level', l.level) order by l.lang)
                     from public.worker_languages l where l.worker_id = w.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('slug', s.slug, 'confirmed', coalesce(ws.verified, false)) order by s.slug)
                     from public.worker_skills ws join public.skills s on s.id = ws.skill_id
                    where ws.worker_id = w.id and s.is_active is not false), '[]'::jsonb),
         (select b.status from public.booking_requests b
            join public.agency_candidate_offers a on a.booking_id = b.id
           where a.id = k.candidate_offer_id),
         k.created_at,
         public.offer_candidate_available_v1(v_agency, k.worker_id)
    from public.team_demand_offer_candidates k
    join public.workers w on w.id = k.worker_id
   where k.offer_id = p_offer_id
     and (v_side = 'supplier'
          -- The client: never a withdrawn row; an OPEN candidate only while
          -- the offer is open and the worker is still the agency's and still
          -- discoverable. A chosen one stays (its booking is under way).
          or k.status = 'selected'
          or (k.status = 'offered' and v_open and public.offer_candidate_available_v1(v_agency, k.worker_id)))
   order by k.created_at
   limit 50;
end;
$$;

-- ── select (the client) ──────────────────────────────────────────────────
-- Returns jsonb {outcome: 'selected' | 'already_selected', candidate_offer_id,
-- booking_id}. Refusals (22023): candidate_not_open | candidate_not_available
-- | demand_closed | client_company_unknown | not_an_agency_offer |
-- connection_conflict; and every refusal of the
-- existing booking path (propose_booking_request_v3) unchanged.
create or replace function public.select_offer_candidate_v1(
  p_candidate_id uuid,
  p_note         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  c         record;
  o         record;
  r         record;
  v_agency  uuid;
  v_client  uuid;
  v_conn    uuid;
  v_share   uuid;
  v_aco     uuid;
  v_booking uuid;
  v_note    text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select k.id, k.offer_id, k.worker_id, k.status, k.candidate_offer_id, k.added_by into c
    from public.team_demand_offer_candidates k where k.id = p_candidate_id for update;
  if not found or public.team_offer_party_side_v1(c.offer_id) is distinct from 'receiver' then
    raise exception 'Not authorized to choose this candidate' using errcode = '42501';
  end if;
  if c.status = 'selected' then
    return jsonb_build_object('outcome', 'already_selected', 'candidate_offer_id', c.candidate_offer_id,
      'booking_id', (select a.booking_id from public.agency_candidate_offers a where a.id = c.candidate_offer_id));
  end if;
  if c.status <> 'offered' then
    raise exception 'candidate_not_open' using errcode = '22023';
  end if;

  select t.id, t.team_org_id, t.request_id, t.offered_by, t.status into o
    from public.team_demand_offers t where t.id = c.offer_id for update;
  if o.status not in ('offered', 'accepted') then
    raise exception 'candidate_not_open' using errcode = '22023';
  end if;
  v_agency := public.offer_agency_company_v1(o.team_org_id);
  if v_agency is null then
    raise exception 'not_an_agency_offer' using errcode = '22023';
  end if;
  -- Still the agency's worker, still discoverable by their own choice.
  if not public.offer_candidate_available_v1(v_agency, c.worker_id) then
    raise exception 'candidate_not_available' using errcode = '22023';
  end if;
  select cr.id, cr.status, cr.organization_id, cr.profile_id into r
    from public.customer_requests cr where cr.id = o.request_id;
  if r.status <> 'submitted' then
    raise exception 'demand_closed' using errcode = '22023';
  end if;
  v_client := public.demand_company_id_v1(r.organization_id, r.profile_id);
  if v_client is null or v_client = v_agency then
    raise exception 'client_company_unknown' using errcode = '22023';
  end if;

  -- The client's own choice is its consent to a STANDING connection with
  -- this agency (the copy says so; it is ended on the Partners page): the
  -- existing active connection, or a new one it accepts now. The new row
  -- carries no person's e-mail — a non-routable marker (RFC 2606 .invalid)
  -- fills the NOT NULL invite field; no login address is ever copied.
  select ac.id into v_conn
    from public.agency_client_connections ac
   where ac.agency_company_id = v_agency and ac.client_company_id = v_client and ac.status = 'active'
   limit 1;
  if v_conn is null then
    begin
      insert into public.agency_client_connections
          (agency_company_id, client_company_id, invited_email, status, invited_by, accepted_by, accepted_at)
        values (v_agency, v_client,
                'open-need+' || replace(v_client::text, '-', '') || '@connection.invalid',
                'active', coalesce(o.offered_by, uid), uid, now())
      returning id into v_conn;
      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
      values (uid, 'agency_client_connection_from_open_need_v1', 'agency_client_connections', v_conn,
        jsonb_build_object('offer_id', o.id, 'candidate_id', c.id, 'request_id', r.id));
    exception when unique_violation then
      -- A connection was made meanwhile (another choice, or an invite the
      -- client accepted): use it; never surface the raw 23505.
      select ac.id into v_conn
        from public.agency_client_connections ac
       where ac.agency_company_id = v_agency and ac.client_company_id = v_client and ac.status = 'active'
       limit 1;
      if v_conn is null then
        raise exception 'connection_conflict' using errcode = '22023';
      end if;
    end;
  end if;
  select s.id into v_share
    from public.agency_client_request_shares s
   where s.connection_id = v_conn and s.request_id = r.id and s.status = 'active';
  if v_share is null then
    insert into public.agency_client_request_shares (connection_id, request_id, status, shared_by)
      values (v_conn, r.id, 'active', uid)
    returning id into v_share;
  end if;

  -- The standard candidate offer, as the agency's own (decision 0033).
  insert into public.agency_candidate_offers
      (connection_id, request_share_id, agency_company_id, client_company_id, request_id, worker_id, status, note, created_by)
    values (v_conn, v_share, v_agency, v_client, r.id, c.worker_id, 'offered', null, coalesce(c.added_by, o.offered_by, uid))
  on conflict do nothing
  returning id into v_aco;
  if v_aco is null then
    select a.id into v_aco from public.agency_candidate_offers a
     where a.agency_company_id = v_agency and a.request_id = r.id and a.worker_id = c.worker_id and a.status = 'offered';
  end if;

  -- The EXISTING accept path: the booking is proposed to the worker, who
  -- decides; nothing here accepts anything on the worker's behalf.
  v_booking := public.respond_agency_candidate_offer_v1(v_aco, 'accepted', v_note);

  update public.team_demand_offer_candidates
     set status = 'selected', selected_at = now(), selected_by = uid, candidate_offer_id = v_aco
   where id = c.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'offer_candidate_selected_v1', 'team_demand_offers', o.id,
    jsonb_build_object('candidate_id', c.id, 'candidate_offer_id', v_aco, 'booking_id', v_booking));
  return jsonb_build_object('outcome', 'selected', 'candidate_offer_id', v_aco, 'booking_id', v_booking);
end;
$$;

revoke all on function public.add_offer_candidate_v1(uuid, uuid) from public;
revoke all on function public.add_offer_candidate_v1(uuid, uuid) from anon;
grant execute on function public.add_offer_candidate_v1(uuid, uuid) to authenticated;
revoke all on function public.withdraw_offer_candidate_v1(uuid) from public;
revoke all on function public.withdraw_offer_candidate_v1(uuid) from anon;
grant execute on function public.withdraw_offer_candidate_v1(uuid) to authenticated;
revoke all on function public.list_my_offer_candidacies_v1() from public;
revoke all on function public.list_my_offer_candidacies_v1() from anon;
grant execute on function public.list_my_offer_candidacies_v1() to authenticated;
revoke all on function public.list_offer_candidates_v1(uuid) from public;
revoke all on function public.list_offer_candidates_v1(uuid) from anon;
grant execute on function public.list_offer_candidates_v1(uuid) to authenticated;
revoke all on function public.select_offer_candidate_v1(uuid, text) from public;
revoke all on function public.select_offer_candidate_v1(uuid, text) from anon;
grant execute on function public.select_offer_candidate_v1(uuid, text) to authenticated;

commit;
