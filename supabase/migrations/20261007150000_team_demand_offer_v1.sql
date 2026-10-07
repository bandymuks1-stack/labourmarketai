-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- @human-gate-approved — RED by construction (SECURITY DEFINER functions,
-- GRANT/REVOKE, CREATE POLICY on a new table). Safety class: strictly
-- ADDITIVE (one new table, two indexes, one policy, eight new function names).
-- It redefines NO existing function, trigger, policy, grant, column or
-- constraint. The annotation states the ROUTE, not the decision.
--
-- 20261007150000 — OFFER A TEAM / BRIGADE AGAINST ONE DEMAND, AS ONE UNIT
-- (owner decision E6; capability DEM-6 / WRK-6).
--
-- CHAIN: brigade -> demand -> authorized offer -> receiving-side visibility ->
--        accept / decline -> assignment to a project (team_assignments).
--
-- WHY A NEW RELATION, AND WHY NOT THE TWO OBVIOUS ONES (reuse assessment).
--   * `team_enquiries` runs employer -> team and carries NO demand reference;
--     consent there is ORG-scoped. Reusing it would silently widen a consent
--     boundary from ONE demand to EVERY demand that employer holds
--     (capability-register DEM-6, STEP B stop of 2026-09-14).
--   * `agency_candidate_offers` is keyed on (agency company, WORKER, connection,
--     request share): its subject is one worker on an agency roster reached
--     through a connection + share handshake. A team is an `organizations` row,
--     its members are engagement_contexts, and there is no connection/share
--     between a brigade and a demand owner. Bending it would put an
--     organization id into a worker_id column.
--   What IS reused: the demand (`customer_requests`, owner and market-direction
--   rule), the team (`organizations.organization_type='team'` + active
--   'employee' engagement_contexts), the aggregates source
--   (worker_skills / team_details, same facts as get_team_capability_summary_v1
--   and the TeamMatchInputV1 contract), the assignment relation
--   (`team_assignments`, same table, same unique index, same audit action), and
--   the existing disclosure of members (list_team_assignment_members_v1).
--
-- PRIVACY (binding): an offer discloses NOTHING about any member.
--   The receiving organisation reads TEAM-LEVEL aggregates only: member count,
--   deployable size, availability, skill counts, language counts, consent
--   completeness. No profile id, no worker id, no name, no history, no contact.
--   A team of fewer than 2 active members cannot be offered (one person is not
--   a brigade, and a "team" of one would disclose that person's whole profile
--   while skipping their individual consent).
--   Member identity reaches the receiving side exactly where it already does
--   today and nowhere earlier: after the unit is assigned to a project, the
--   project's managers read members through list_team_assignment_members_v1.
--   Nothing in this migration widens that function or any policy.
--
-- AUTHORITY (every operand coalesce'd; NULL denies):
--   offer / withdraw : manages the TEAM (manages_organization or team owner).
--   read offers      : the demand's receiver (demand owner profile, or an org
--                      demand-access role) sees aggregates; the offering team's
--                      managers see their own offers; nobody else sees anything
--                      (anon: no EXECUTE; outsiders: zero rows, no oracle).
--   accept / decline : the demand's receiver only.
--   hand-off         : the receiver AND can_manage_project(project), and the
--                      project must belong to the demand's organisation.
--   Market direction : only DEMAND kinds (null / company_request /
--                      buyer_request) in status 'submitted' from a verified
--                      company are offerable — the worker-board closed
--                      allow-list, never a deny-list.
--
-- HAND-OFF AND `assign_team_to_work_v1` (flagged honestly). That function
-- requires the caller to manage BOTH the project AND the team. A receiving
-- organisation by definition does not manage the offering team, and the
-- offering team's manager does not manage the receiver's project, so the
-- function cannot be invoked by either party alone. The team's side
-- AUTHORIZED the unit at offer time (the offer row, written by the team's
-- manager, IS that authorization); `hand_off_team_demand_offer_v1` therefore
-- performs the SAME single write the existing function performs — one
-- team_assignments row, same unique index, same ON CONFLICT idempotency, same
-- 'team_assigned_v1' audit action, same scope/status/active-member validation —
-- with the receiver-side authority described above. No per-person rows, no
-- fan-out, no new gate, no payment or confirmation step. Ending the assignment
-- stays end_team_assignment_v1 (unchanged).
--
-- WHAT IS ADDED
--   table  public.team_demand_offers      (RLS: offering managers + admin read;
--                                          NO write policy)
--   index  team_demand_offers_one_open_v1 (unique, partial: one OPEN offer per
--                                          team per demand)
--   index  team_demand_offers_request_idx
--   policy team_demand_offers_select_v1
--   fn  team_offer_receiver_v1(uuid)                         INTERNAL, no grants
--   fn  list_open_demand_for_team_offer_v1(uuid)             authenticated
--   fn  offer_team_to_demand_v1(uuid, uuid, text)            authenticated
--   fn  withdraw_team_demand_offer_v1(uuid)                  authenticated
--   fn  list_team_demand_offers_for_team_v1(uuid)            authenticated
--   fn  list_team_offers_for_request_v1(uuid)                authenticated
--   fn  respond_team_demand_offer_v1(uuid, text)             authenticated
--   fn  hand_off_team_demand_offer_v1(uuid, uuid, uuid, uuid) authenticated
--
-- GRANTS: table: revoke all from public, anon, authenticated; grant select to
-- authenticated (writes are RPC-only). Functions: revoke all from public,
-- anon; grant execute to authenticated (team_offer_receiver_v1: none).
--
-- ROLLBACK: supabase/rollbacks/20261007150000_team_demand_offer_v1.down.sql
-- REFUSES while any offer row exists (real history — forward-fix instead);
-- with zero rows it drops everything above and nothing else.
--
-- DEPENDS ON (must already be applied): 20261003150600 (team_assignments),
-- 20260716130000 (team_details), 20260705220000 (team spine), 0028 + 20260806200000
-- (customer_requests.organization_id, has_org_demand_access).
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.team_assignments') is null then
    raise exception 'team_assignments missing (apply 20261003150600 first)';
  end if;
  if to_regclass('public.team_details') is null then
    raise exception 'team_details missing (apply 20260716130000 first)';
  end if;
  if to_regprocedure('public.has_org_demand_access(uuid)') is null then
    raise exception 'has_org_demand_access missing (apply 20260806200000 first)';
  end if;
end $$;

-- ── 1. The relation ─────────────────────────────────────────────────────────
create table if not exists public.team_demand_offers (
  id                     uuid primary key default gen_random_uuid(),
  team_org_id            uuid not null references public.organizations(id) on delete restrict,
  request_id             uuid not null references public.customer_requests(id) on delete cascade,
  status                 text not null default 'offered'
                           check (status in ('offered', 'accepted', 'declined', 'withdrawn', 'assigned')),
  note                   text check (note is null or char_length(note) <= 500),
  member_count_at_offer  integer not null check (member_count_at_offer >= 2),
  offered_by             uuid references public.profiles(id) on delete set null,
  offered_at             timestamptz not null default now(),
  responded_by           uuid references public.profiles(id) on delete set null,
  responded_at           timestamptz,
  assignment_id          uuid references public.team_assignments(id) on delete set null,
  handed_off_at          timestamptz,
  constraint team_demand_offers_response_chk
    check ((status in ('offered', 'withdrawn')) or responded_at is not null),
  constraint team_demand_offers_handoff_chk
    check ((status = 'assigned') = (handed_off_at is not null))
);

-- ONE open offer per (team, demand). History (declined / withdrawn / assigned)
-- is unlimited, which keeps every past decision on the record.
create unique index if not exists team_demand_offers_one_open_v1
  on public.team_demand_offers (team_org_id, request_id)
  where status in ('offered', 'accepted');
create index if not exists team_demand_offers_request_idx
  on public.team_demand_offers (request_id);
create index if not exists team_demand_offers_team_idx
  on public.team_demand_offers (team_org_id);

alter table public.team_demand_offers enable row level security;

revoke all on public.team_demand_offers from public, anon, authenticated;
grant select on public.team_demand_offers to authenticated;

-- The OFFERING side reads its own rows. The receiving side reads through
-- list_team_offers_for_request_v1 (aggregates only) — never the raw row.
drop policy if exists team_demand_offers_select_v1 on public.team_demand_offers;
create policy team_demand_offers_select_v1 on public.team_demand_offers
  for select to authenticated
  using (
    coalesce(
      public.manages_organization(team_org_id)
      or public.is_admin()
      or exists (select 1 from public.organizations o
                  where o.id = team_demand_offers.team_org_id
                    and o.owner_profile_id = auth.uid()),
      false)
  );

-- ── 2. Receiver predicate (internal; no grants) ────────────────────────────
-- The demand's receiver: the profile that owns the demand, or a member of the
-- owning organisation holding a demand-access role (the existing helper).
create or replace function public.team_offer_receiver_v1(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1 from public.customer_requests cr
     where cr.id = p_request
       and auth.uid() is not null
       and (cr.profile_id = auth.uid()
            or public.has_org_demand_access(cr.organization_id))
  ), false);
$$;
revoke all on function public.team_offer_receiver_v1(uuid) from public, anon, authenticated;

-- ── 3. list_open_demand_for_team_offer_v1 ──────────────────────────────────
-- The open DEMAND a team's manager may offer against: the SAME curated
-- whitelist the worker board serves (no payload, no contact, no owner id),
-- the same closed direction allow-list, verified companies only. A team's
-- manager who is not the manager of p_team_org_id gets nothing.
create or replace function public.list_open_demand_for_team_offer_v1(
  p_team_org_id uuid
) returns table (
  request_id     uuid,
  role_text      text,
  country        text,
  team_size      integer,
  start_period   text,
  company_name   text,
  created_at     timestamptz,
  open_offer_id  uuid,
  open_offer_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce((
       exists (select 1 from public.organizations o
                where o.id = p_team_org_id and o.organization_type = 'team')
       and (public.manages_organization(p_team_org_id)
            or exists (select 1 from public.organizations o
                        where o.id = p_team_org_id and o.owner_profile_id = uid))
     ), false) then
    return; -- not this team's manager -> empty, never an error surface
  end if;

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), '')),
         cr.created_at,
         o.id,
         o.status
    from public.customer_requests cr
    join public.companies c
      on c.profile_id = cr.profile_id
     and c.verification_status = 'verified'
    left join public.team_demand_offers o
      on o.request_id = cr.id and o.team_org_id = p_team_org_id
     and o.status in ('offered', 'accepted')
   where cr.status = 'submitted'
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     and cr.profile_id <> uid
     and not coalesce(public.has_org_demand_access(cr.organization_id), false)
   order by cr.created_at desc
   limit 100;
end;
$$;
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public, anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;

-- ── 4. offer_team_to_demand_v1 ─────────────────────────────────────────────
-- Returns jsonb {outcome, offer_id}. outcome: created | already_offered.
-- Refusals RAISE: 42501 (authority) or 22023 with a stable word. A demand that
-- does not exist, is closed, is supply, is unverified or is the caller's own
-- all answer the SAME word (demand_not_offerable) — no existence oracle.
create or replace function public.offer_team_to_demand_v1(
  p_team_org_id uuid,
  p_request_id  uuid,
  p_note        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_note    text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_members integer;
  v_id      uuid;
  v_existing uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_team_org_id is null or p_request_id is null then
    raise exception 'team_and_demand_required' using errcode = '22023';
  end if;

  if not coalesce((
       exists (select 1 from public.organizations o
                where o.id = p_team_org_id and o.organization_type = 'team')
       and (public.manages_organization(p_team_org_id)
            or exists (select 1 from public.organizations o
                        where o.id = p_team_org_id and o.owner_profile_id = uid))
     ), false) then
    raise exception 'Not authorized to offer this team' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.customer_requests cr
      join public.companies c
        on c.profile_id = cr.profile_id and c.verification_status = 'verified'
     where cr.id = p_request_id
       and cr.status = 'submitted'
       and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
       and cr.profile_id <> uid
       and not coalesce(public.has_org_demand_access(cr.organization_id), false)
  ) then
    raise exception 'demand_not_offerable' using errcode = '22023';
  end if;

  select count(*)::integer into v_members
    from public.engagement_contexts ec
   where ec.organization_id = p_team_org_id
     and ec.relationship_slug = 'employee'
     and ec.status = 'active';
  if v_members < 2 then
    raise exception 'team_too_small' using errcode = '22023';
  end if;

  -- A declined offer is the receiver's answer; the same team does not ask the
  -- same demand again (no re-offer loop, no pressure).
  if exists (select 1 from public.team_demand_offers o
              where o.team_org_id = p_team_org_id
                and o.request_id = p_request_id
                and o.status = 'declined') then
    raise exception 'previously_declined' using errcode = '22023';
  end if;

  -- Abuse cap: one team holds a bounded number of OPEN offers at once.
  if (select count(*) from public.team_demand_offers o
       where o.team_org_id = p_team_org_id
         and o.status in ('offered', 'accepted')) >= 20 then
    raise exception 'offer_limit_reached' using errcode = '22023';
  end if;

  insert into public.team_demand_offers
      (team_org_id, request_id, note, member_count_at_offer, offered_by)
    values (p_team_org_id, p_request_id, v_note, v_members, uid)
  on conflict (team_org_id, request_id) where status in ('offered', 'accepted')
  do nothing
  returning id into v_id;

  if v_id is null then
    select o.id into v_existing
      from public.team_demand_offers o
     where o.team_org_id = p_team_org_id and o.request_id = p_request_id
       and o.status in ('offered', 'accepted');
    return jsonb_build_object('outcome', 'already_offered', 'offer_id', v_existing);
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_demand_offered_v1', 'team_demand_offers', v_id,
    jsonb_build_object('team_org_id', p_team_org_id, 'request_id', p_request_id,
                       'member_count', v_members));
  return jsonb_build_object('outcome', 'created', 'offer_id', v_id);
end;
$$;
revoke all on function public.offer_team_to_demand_v1(uuid, uuid, text) from public, anon;
grant execute on function public.offer_team_to_demand_v1(uuid, uuid, text) to authenticated;

-- ── 5. withdraw_team_demand_offer_v1 ───────────────────────────────────────
-- The team's manager takes the offer back while it is open (offered or
-- accepted-but-not-yet-assigned). An assigned unit is ended through
-- end_team_assignment_v1, never here.
create or replace function public.withdraw_team_demand_offer_v1(
  p_offer_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  o   record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select t.id, t.team_org_id, t.request_id, t.status into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found or not coalesce(
       public.manages_organization(o.team_org_id)
       or exists (select 1 from public.organizations g
                   where g.id = o.team_org_id and g.owner_profile_id = uid),
       false) then
    raise exception 'Not authorized to withdraw this offer' using errcode = '42501';
  end if;
  if o.status = 'withdrawn' then return 'already_withdrawn'; end if;
  if o.status not in ('offered', 'accepted') then
    raise exception 'offer_not_open' using errcode = '22023';
  end if;
  update public.team_demand_offers
     set status = 'withdrawn', responded_by = uid, responded_at = now()
   where id = o.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_demand_offer_withdrawn_v1', 'team_demand_offers', o.id,
    jsonb_build_object('team_org_id', o.team_org_id, 'request_id', o.request_id));
  return 'withdrawn';
end;
$$;
revoke all on function public.withdraw_team_demand_offer_v1(uuid) from public, anon;
grant execute on function public.withdraw_team_demand_offer_v1(uuid) to authenticated;

-- ── 6. list_team_demand_offers_for_team_v1 — the offering side's own view ──
create or replace function public.list_team_demand_offers_for_team_v1(
  p_team_org_id uuid
) returns table (
  offer_id       uuid,
  request_id     uuid,
  role_text      text,
  country        text,
  company_name   text,
  status         text,
  offered_at     timestamptz,
  responded_at   timestamptz,
  assignment_id  uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce(
       public.manages_organization(p_team_org_id)
       or exists (select 1 from public.organizations g
                   where g.id = p_team_org_id and g.owner_profile_id = uid),
       false) then
    return;
  end if;
  return query
  select o.id, o.request_id, cr.role_or_work_type, cr.country,
         coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), '')),
         o.status, o.offered_at, o.responded_at, o.assignment_id
    from public.team_demand_offers o
    join public.customer_requests cr on cr.id = o.request_id
    left join public.companies c on c.profile_id = cr.profile_id
   where o.team_org_id = p_team_org_id
   order by o.offered_at desc
   limit 100;
end;
$$;
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from public, anon;
grant execute on function public.list_team_demand_offers_for_team_v1(uuid) to authenticated;

-- ── 7. list_team_offers_for_request_v1 — the RECEIVING side, aggregates ONLY ─
-- The privacy boundary of the whole feature. Returned per offer: the team's
-- display name and TEAM-LEVEL facts. There is no profile id, no worker id, no
-- member name and no member-level row in the projection, and no code path in
-- this function reads one into the result. Zero rows for anyone who is not the
-- demand's receiver (no oracle, no error).
create or replace function public.list_team_offers_for_request_v1(
  p_request_id uuid
) returns table (
  offer_id            uuid,
  team_org_id         uuid,
  team_name           text,
  status              text,
  note                text,
  offered_at          timestamptz,
  responded_at        timestamptz,
  assignment_id       uuid,
  member_count        integer,
  deployable_min      integer,
  deployable_max      integer,
  availability_status text,
  available_from      date,
  destination_countries text[],
  accommodation_needed boolean,
  transport_own       boolean,
  details_updated_at  timestamptz,
  skills              jsonb,
  languages           jsonb,
  consented_members   integer
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
  if not public.team_offer_receiver_v1(p_request_id) then
    return;
  end if;

  return query
  select o.id,
         o.team_org_id,
         coalesce(nullif(trim(g.display_name), ''), 'Team'),
         o.status,
         o.note,
         o.offered_at,
         o.responded_at,
         o.assignment_id,
         (select count(*)::integer from public.engagement_contexts ec
           where ec.organization_id = o.team_org_id
             and ec.relationship_slug = 'employee' and ec.status = 'active'),
         d.deployable_size_min,
         d.deployable_size_max,
         d.availability_status,
         d.available_from,
         d.destination_countries,
         d.accommodation_needed,
         d.transport_own,
         d.updated_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'slug', s.slug,
                    'declared', s.declared,
                    'confirmed', s.confirmed) order by s.declared desc, s.slug)
             from (
               select sk.slug,
                      count(distinct w.id)::integer as declared,
                      (count(distinct w.id) filter (where ws.verified))::integer as confirmed
                 from public.engagement_contexts ec
                 join public.workers w        on w.profile_id = ec.profile_id
                 join public.worker_skills ws on ws.worker_id = w.id
                 join public.skills sk        on sk.id = ws.skill_id
                where ec.organization_id = o.team_org_id
                  and ec.relationship_slug = 'employee' and ec.status = 'active'
                group by sk.slug
                order by declared desc, sk.slug
                limit 30) s
         ), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'code', l.lang, 'level', l.level, 'count', l.n)
                  order by l.n desc, l.lang)
             from (
               select wl.lang, wl.level, count(distinct w.id)::integer as n
                 from public.engagement_contexts ec
                 join public.workers w          on w.profile_id = ec.profile_id
                 join public.worker_languages wl on wl.worker_id = w.id
                where ec.organization_id = o.team_org_id
                  and ec.relationship_slug = 'employee' and ec.status = 'active'
                group by wl.lang, wl.level
                limit 30) l
         ), '[]'::jsonb),
         (select count(distinct ec.profile_id)::integer
            from public.engagement_contexts ec
            join public.invitations i
              on i.organization_id = o.team_org_id
             and i.invitation_type = 'join_team'
             and i.status = 'accepted'
             and i.accepted_by_profile_id = ec.profile_id
           where ec.organization_id = o.team_org_id
             and ec.relationship_slug = 'employee' and ec.status = 'active')
    from public.team_demand_offers o
    join public.organizations g on g.id = o.team_org_id
    left join public.team_details d on d.org_id = o.team_org_id
   where o.request_id = p_request_id
     and o.status in ('offered', 'accepted', 'assigned')
   order by o.offered_at desc
   limit 50;
end;
$$;
revoke all on function public.list_team_offers_for_request_v1(uuid) from public, anon;
grant execute on function public.list_team_offers_for_request_v1(uuid) to authenticated;

-- ── 8. respond_team_demand_offer_v1 — accept / decline ─────────────────────
-- Returns text: accepted | declined | already_accepted | already_declined.
-- Accepting discloses NOTHING further: member identity still flows only
-- through the assignment (hand-off), exactly as for every team today.
create or replace function public.respond_team_demand_offer_v1(
  p_offer_id uuid,
  p_decision text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  o   record;
  v_open boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('accept', 'decline') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  select t.id, t.team_org_id, t.request_id, t.status into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found or not public.team_offer_receiver_v1(o.request_id) then
    raise exception 'Not authorized to answer this offer' using errcode = '42501';
  end if;

  if o.status = 'accepted' and p_decision = 'accept' then return 'already_accepted'; end if;
  if o.status = 'declined' and p_decision = 'decline' then return 'already_declined'; end if;
  if o.status not in ('offered') and not (o.status = 'accepted' and p_decision = 'decline') then
    raise exception 'offer_not_open' using errcode = '22023';
  end if;

  if p_decision = 'accept' then
    select (cr.status = 'submitted') into v_open
      from public.customer_requests cr where cr.id = o.request_id;
    if not coalesce(v_open, false) then
      raise exception 'demand_closed' using errcode = '22023';
    end if;
    -- The unit must still be a team: members may have left since the offer.
    if (select count(*) from public.engagement_contexts ec
         where ec.organization_id = o.team_org_id
           and ec.relationship_slug = 'employee' and ec.status = 'active') < 2 then
      raise exception 'team_too_small' using errcode = '22023';
    end if;
  end if;

  update public.team_demand_offers
     set status = case p_decision when 'accept' then 'accepted' else 'declined' end,
         responded_by = uid, responded_at = now()
   where id = o.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid,
          case p_decision when 'accept' then 'team_demand_offer_accepted_v1'
                          else 'team_demand_offer_declined_v1' end,
          'team_demand_offers', o.id,
          jsonb_build_object('team_org_id', o.team_org_id, 'request_id', o.request_id));
  return case p_decision when 'accept' then 'accepted' else 'declined' end;
end;
$$;
revoke all on function public.respond_team_demand_offer_v1(uuid, text) from public, anon;
grant execute on function public.respond_team_demand_offer_v1(uuid, text) to authenticated;

-- ── 9. hand_off_team_demand_offer_v1 — accepted offer -> team_assignments ───
-- Returns jsonb {outcome, assignment_id}. outcome: created | already_assigned.
-- See the header: the same single write assign_team_to_work_v1 performs, with
-- the receiver's authority over the project and the team's recorded offer as
-- the team-side authorization.
create or replace function public.hand_off_team_demand_offer_v1(
  p_offer_id       uuid,
  p_project_id     uuid,
  p_work_object_id uuid default null,
  p_task_id        uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  o          record;
  v_req      record;
  v_project  record;
  v_id       uuid;
  v_outcome  text := 'created';
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_project_id is null then
    raise exception 'project_required' using errcode = '22023';
  end if;

  select t.id, t.team_org_id, t.request_id, t.status, t.assignment_id into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found
     or not public.team_offer_receiver_v1(o.request_id)
     or not coalesce(public.can_manage_project(p_project_id), false) then
    raise exception 'Not authorized to assign this team' using errcode = '42501';
  end if;

  if o.status = 'assigned' then
    return jsonb_build_object('outcome', 'already_assigned', 'assignment_id', o.assignment_id);
  end if;
  if o.status <> 'accepted' then
    raise exception 'offer_not_accepted' using errcode = '22023';
  end if;

  select cr.organization_id, cr.profile_id into v_req
    from public.customer_requests cr where cr.id = o.request_id;
  select p.id, p.status, p.organization_id, p.company_id into v_project
    from public.projects p where p.id = p_project_id;
  if not found then
    raise exception 'Not authorized to assign this team' using errcode = '42501';
  end if;
  -- The project must be the DEMAND OWNER's own: the offer was made against
  -- that organisation's demand, not against anyone else's project.
  if not coalesce(
       (v_req.organization_id is not null
          and v_project.organization_id is not distinct from v_req.organization_id)
       or exists (select 1 from public.companies c
                   where c.id = v_project.company_id and c.profile_id = v_req.profile_id),
       false) then
    raise exception 'project_not_of_demand_owner' using errcode = '22023';
  end if;
  if v_project.status = 'completed' then
    raise exception 'project_completed' using errcode = '22023';
  end if;

  if p_work_object_id is not null and p_task_id is not null then
    raise exception 'one_scope_only' using errcode = '22023';
  end if;
  if p_task_id is not null and not exists (
       select 1 from public.work_tasks t
        where t.id = p_task_id and t.project_id = p_project_id
          and t.status in ('todo', 'in_progress', 'blocked')) then
    raise exception 'task_not_assignable' using errcode = '22023';
  end if;
  if p_work_object_id is not null and not exists (
       select 1 from public.work_objects w
        where w.id = p_work_object_id and w.status = 'active'
          and (w.project_id = p_project_id
               or (w.project_id is null
                   and w.organization_id is not distinct from v_project.organization_id))) then
    raise exception 'object_not_assignable' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.engagement_contexts ec
     where ec.organization_id = o.team_org_id
       and ec.relationship_slug = 'employee'
       and ec.status = 'active'
  ) then
    raise exception 'team_has_no_members' using errcode = '22023';
  end if;

  insert into public.team_assignments
      (team_org_id, project_id, work_object_id, task_id, assigned_by)
    values (o.team_org_id, p_project_id, p_work_object_id, p_task_id, uid)
  on conflict (
      team_org_id, project_id,
      coalesce(work_object_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(task_id,        '00000000-0000-0000-0000-000000000000'::uuid)
    ) where ended_at is null
  do nothing
  returning id into v_id;

  if v_id is null then
    select ta.id into v_id
      from public.team_assignments ta
     where ta.team_org_id = o.team_org_id
       and ta.project_id = p_project_id
       and ta.work_object_id is not distinct from p_work_object_id
       and ta.task_id is not distinct from p_task_id
       and ta.ended_at is null;
    v_outcome := 'already_assigned';
  else
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'team_assigned_v1', 'team_assignments', v_id,
      jsonb_build_object('team_org_id', o.team_org_id, 'project_id', p_project_id,
                         'work_object_id', p_work_object_id, 'task_id', p_task_id,
                         'via_offer_id', o.id));
  end if;

  update public.team_demand_offers
     set status = 'assigned', assignment_id = v_id, handed_off_at = now()
   where id = o.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_demand_offer_handed_off_v1', 'team_demand_offers', o.id,
    jsonb_build_object('assignment_id', v_id, 'project_id', p_project_id));

  return jsonb_build_object('outcome', v_outcome, 'assignment_id', v_id);
end;
$$;
revoke all on function public.hand_off_team_demand_offer_v1(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.hand_off_team_demand_offer_v1(uuid, uuid, uuid, uuid) to authenticated;

commit;
