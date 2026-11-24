-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- @human-gate-approved — RED by construction (SECURITY DEFINER functions,
-- GRANT/REVOKE, one CHECK constraint re-expressed, five existing functions
-- replaced with the SAME signatures). Additive for data: one new nullable-free
-- column with a default (existing rows = 'team', which is what they are), one
-- new table, no row is updated or deleted.
--
-- 20261011200000 — SUPPLY OFFER NEGOTIATION v1 (owner P0, 2026-10-11:
-- supply → demand → match → offer → conversation → NEGOTIATION → agreement →
-- project). Extends the E6 relation `team_demand_offers` (20261007150000) —
-- never a second offer system.
--
-- WHAT THE OWNER FOUND MISSING, AND WHAT THIS ADDS
--   1. "A company must not be forced to create an artificial team org."
--      offer_kind: 'team' (a brigade, ≥ 2 members, unchanged) or
--      'organization' (a company or agency offers ITSELF — its people, its
--      service, as a subcontractor). Same table, same authority
--      (manages_organization / owner), same direction allow-list, same caps.
--      The ≥ 2 rule now binds the 'team' kind only.
--   2. "The receiver must see WHAT need it is" (the "- / NL / Van Dijk Bouw"
--      list): the two offering-side lists label the need with
--      coalesce(role_or_work_type, title). 8 of 13 open needs carry no
--      role_or_work_type (closed slug by design), so the title is the only
--      honest name. Disclosed ONLY to a manager of an organization that may
--      offer against that need — the same audience that already sees its
--      country, size, start and company name.
--   3. "Only accept / decline is not negotiation." team_demand_offer_terms:
--      VERSIONED terms (capacity, rate as text, dates, scope, conditions),
--      written by EITHER side while the offer is open. A new version
--      supersedes the open one (history is kept, nothing is overwritten).
--      The side that did NOT write the open version answers it:
--        - the receiver accepts the supplier's terms (as before), or
--        - the supplier accepts the receiver's counter-proposal (new);
--      a party never accepts its own proposal.
--   4. "Accepting is not a signed contract." status 'accepted' keeps its
--      name and meaning in the data — agreed IN PRINCIPLE on the accepted
--      terms version. Nothing here creates, implies or stores a contract.
--   5. Hand-off: unchanged for a brigade. An 'organization' offer is NOT a
--      unit — assigning a whole company as a team would disclose every
--      employee to the project — so hand_off refuses it with a stable word;
--      the parties continue in their conversation.
--
-- PRIVACY (unchanged boundary): the receiver still reads aggregates only
-- (list_team_offers_for_request_v2 = v1 + offer_kind; consent count is NULL
-- for an organization offer, where join_team consent does not apply). Terms
-- carry no profile id: list_team_demand_offer_terms_v1 says only which SIDE
-- wrote a version and whether it is the caller's own side.
--
-- WHAT IS ADDED
--   column team_demand_offers.offer_kind text not null default 'team'
--   check  team_demand_offers_member_count_at_offer_check -> >= 0, plus
--          team_demand_offers_kind_members_chk (team kind needs >= 2)
--   table  public.team_demand_offer_terms (RLS on, NO policy, NO grant:
--          read and written only through the functions below)
--   fn  team_offer_party_side_v1(uuid)                 INTERNAL, no grants
--   fn  propose_team_demand_offer_terms_v1(...)        authenticated
--   fn  list_team_demand_offer_terms_v1(uuid)          authenticated
--   fn  list_team_offers_for_request_v2(uuid)          authenticated
-- WHAT IS REPLACED (same signature, diff-minimal, generated from the applied
-- 20261007150000 bodies):
--   list_open_demand_for_team_offer_v1, offer_team_to_demand_v1,
--   list_team_demand_offers_for_team_v1, respond_team_demand_offer_v1,
--   hand_off_team_demand_offer_v1
--
-- ROLLBACK: supabase/rollbacks/20261011200000_supply_offer_negotiation_v1.down.sql
-- REFUSES while any terms row or any 'organization' offer exists (real
-- history — forward-fix instead); otherwise restores the five 20261007150000
-- bodies verbatim and drops everything above.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.team_demand_offers') is null then
    raise exception 'team_demand_offers missing (apply 20261007150000 first)';
  end if;
end $$;

-- ── 1. Offer kind ───────────────────────────────────────────────────────────
alter table public.team_demand_offers
  add column if not exists offer_kind text not null default 'team';
alter table public.team_demand_offers
  drop constraint if exists team_demand_offers_offer_kind_chk;
alter table public.team_demand_offers
  add constraint team_demand_offers_offer_kind_chk
  check (offer_kind in ('team', 'organization'));

-- The >= 2 rule binds a brigade only. Re-expressed, never loosened for 'team'.
alter table public.team_demand_offers
  drop constraint if exists team_demand_offers_member_count_at_offer_check;
alter table public.team_demand_offers
  add constraint team_demand_offers_member_count_at_offer_check
  check (member_count_at_offer >= 0);
alter table public.team_demand_offers
  drop constraint if exists team_demand_offers_kind_members_chk;
alter table public.team_demand_offers
  add constraint team_demand_offers_kind_members_chk
  check (offer_kind <> 'team' or member_count_at_offer >= 2);

-- ── 2. Versioned terms ──────────────────────────────────────────────────────
create table if not exists public.team_demand_offer_terms (
  id              uuid primary key default gen_random_uuid(),
  offer_id        uuid not null references public.team_demand_offers(id) on delete cascade,
  version         integer not null check (version between 1 and 50),
  proposed_side   text not null check (proposed_side in ('supplier', 'receiver')),
  proposed_by     uuid references public.profiles(id) on delete set null,
  capacity        integer check (capacity is null or capacity between 1 and 500),
  rate_text       text check (rate_text is null or char_length(rate_text) <= 200),
  start_date      date,
  end_date        date,
  scope_text      text check (scope_text is null or char_length(scope_text) <= 2000),
  conditions_text text check (conditions_text is null or char_length(conditions_text) <= 2000),
  status          text not null default 'proposed'
                    check (status in ('proposed', 'superseded', 'accepted', 'declined')),
  decided_by      uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint team_demand_offer_terms_version_uq unique (offer_id, version),
  constraint team_demand_offer_terms_dates_chk
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint team_demand_offer_terms_decided_chk
    check ((status in ('proposed', 'superseded')) or decided_at is not null)
);
-- One OPEN version per offer.
create unique index if not exists team_demand_offer_terms_one_open_v1
  on public.team_demand_offer_terms (offer_id) where status = 'proposed';

alter table public.team_demand_offer_terms enable row level security;
revoke all on public.team_demand_offer_terms from public, anon, authenticated;

-- ── 3. Which side of THIS offer is the caller (internal; no grants) ────────
-- 'supplier' = manages (or owns) the offering organization;
-- 'receiver' = the need's owner / org demand-access holder (team_offer_receiver_v1);
-- NULL = no party. Supplier is checked first; an organization cannot offer
-- against its own need (the offer RPC refuses it), so both cannot hold.
create or replace function public.team_offer_party_side_v1(p_offer_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  o   record;
begin
  if uid is null or p_offer_id is null then
    return null;
  end if;
  select t.team_org_id, t.request_id into o
    from public.team_demand_offers t where t.id = p_offer_id;
  if not found then
    return null;
  end if;
  if coalesce(public.manages_organization(o.team_org_id)
              or exists (select 1 from public.organizations g
                          where g.id = o.team_org_id and g.owner_profile_id = uid),
              false) then
    return 'supplier';
  end if;
  if public.team_offer_receiver_v1(o.request_id) then
    return 'receiver';
  end if;
  return null;
end;
$$;
revoke all on function public.team_offer_party_side_v1(uuid) from public, anon, authenticated;

-- ── 4. propose_team_demand_offer_terms_v1 ──────────────────────────────────
-- Either side writes the next version while the offer is open ('offered').
-- Returns jsonb {outcome: 'proposed', version}. Refusals RAISE 42501 or 22023
-- with a stable word: offer_not_open | terms_empty | terms_limit_reached.
create or replace function public.propose_team_demand_offer_terms_v1(
  p_offer_id        uuid,
  p_capacity        integer default null,
  p_rate_text       text    default null,
  p_start_date      date    default null,
  p_end_date        date    default null,
  p_scope_text      text    default null,
  p_conditions_text text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  o          record;
  v_side     text;
  v_version  integer;
  v_rate     text := nullif(left(btrim(coalesce(p_rate_text, '')), 200), '');
  v_scope    text := nullif(left(btrim(coalesce(p_scope_text, '')), 2000), '');
  v_cond     text := nullif(left(btrim(coalesce(p_conditions_text, '')), 2000), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select t.id, t.status, t.team_org_id, t.request_id into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found then
    raise exception 'Not authorized to negotiate this offer' using errcode = '42501';
  end if;
  v_side := public.team_offer_party_side_v1(o.id);
  if v_side is null then
    raise exception 'Not authorized to negotiate this offer' using errcode = '42501';
  end if;
  if o.status <> 'offered' then
    raise exception 'offer_not_open' using errcode = '22023';
  end if;
  if p_capacity is null and v_rate is null and p_start_date is null
     and p_end_date is null and v_scope is null and v_cond is null then
    raise exception 'terms_empty' using errcode = '22023';
  end if;
  if p_capacity is not null and (p_capacity < 1 or p_capacity > 500) then
    raise exception 'terms_invalid' using errcode = '22023';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'terms_invalid' using errcode = '22023';
  end if;

  select coalesce(max(t.version), 0) + 1 into v_version
    from public.team_demand_offer_terms t where t.offer_id = o.id;
  if v_version > 50 then
    raise exception 'terms_limit_reached' using errcode = '22023';
  end if;

  update public.team_demand_offer_terms
     set status = 'superseded'
   where offer_id = o.id and status = 'proposed';

  insert into public.team_demand_offer_terms
      (offer_id, version, proposed_side, proposed_by, capacity, rate_text,
       start_date, end_date, scope_text, conditions_text)
    values (o.id, v_version, v_side, uid, p_capacity, v_rate,
            p_start_date, p_end_date, v_scope, v_cond);

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_demand_offer_terms_proposed_v1', 'team_demand_offers', o.id,
    jsonb_build_object('version', v_version, 'side', v_side));
  return jsonb_build_object('outcome', 'proposed', 'version', v_version);
end;
$$;
revoke all on function public.propose_team_demand_offer_terms_v1(uuid, integer, text, date, date, text, text) from public, anon;
grant execute on function public.propose_team_demand_offer_terms_v1(uuid, integer, text, date, date, text, text) to authenticated;

-- ── 5. list_team_demand_offer_terms_v1 — both parties, every version ───────
-- No profile id in the projection: only which SIDE wrote a version and
-- whether that side is the caller's. Zero rows for anyone else.
create or replace function public.list_team_demand_offer_terms_v1(
  p_offer_id uuid
) returns table (
  version         integer,
  proposed_side   text,
  mine            boolean,
  capacity        integer,
  rate_text       text,
  start_date      date,
  end_date        date,
  scope_text      text,
  conditions_text text,
  status          text,
  created_at      timestamptz,
  decided_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_side text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  v_side := public.team_offer_party_side_v1(p_offer_id);
  if v_side is null then
    return;
  end if;
  return query
  select t.version, t.proposed_side, (t.proposed_side = v_side), t.capacity,
         t.rate_text, t.start_date, t.end_date, t.scope_text, t.conditions_text,
         t.status, t.created_at, t.decided_at
    from public.team_demand_offer_terms t
   where t.offer_id = p_offer_id
   order by t.version desc;
end;
$$;
revoke all on function public.list_team_demand_offer_terms_v1(uuid) from public, anon;
grant execute on function public.list_team_demand_offer_terms_v1(uuid) to authenticated;

-- ── 6. list_team_offers_for_request_v2 — v1 + offer_kind ──────────────────
-- The receiver must know whether a brigade (a unit it can assign) or an
-- organization (a company / agency offering itself) is speaking. Same
-- aggregate-only projection as v1; consent is NULL for an organization offer.
create or replace function public.list_team_offers_for_request_v2(
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
  consented_members   integer,
  offer_kind          text
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
  select v1.offer_id, v1.team_org_id, v1.team_name, v1.status, v1.note,
         v1.offered_at, v1.responded_at, v1.assignment_id, v1.member_count,
         v1.deployable_min, v1.deployable_max, v1.availability_status,
         v1.available_from, v1.destination_countries, v1.accommodation_needed,
         v1.transport_own, v1.details_updated_at, v1.skills, v1.languages,
         case when o.offer_kind = 'team' then v1.consented_members else null end,
         o.offer_kind
    from public.list_team_offers_for_request_v1(p_request_id) v1
    join public.team_demand_offers o on o.id = v1.offer_id;
end;
$$;
revoke all on function public.list_team_offers_for_request_v2(uuid) from public, anon;
grant execute on function public.list_team_offers_for_request_v2(uuid) to authenticated;

-- ── 7. The five E6 functions, same signatures (generated, diff-minimal) ────
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
                where o.id = p_team_org_id
                  and o.organization_type in ('team', 'company', 'agency'))
       and (public.manages_organization(p_team_org_id)
            or exists (select 1 from public.organizations o
                        where o.id = p_team_org_id and o.owner_profile_id = uid))
     ), false) then
    return; -- not this team's manager -> empty, never an error surface
  end if;

  return query
  select cr.id,
         coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')),
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
     and cr.organization_id is distinct from p_team_org_id
   order by cr.created_at desc
   limit 100;
end;
$$;
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public, anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;

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
  v_kind    text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_team_org_id is null or p_request_id is null then
    raise exception 'team_and_demand_required' using errcode = '22023';
  end if;

  if not coalesce((
       exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and o.organization_type in ('team', 'company', 'agency'))
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
       and cr.organization_id is distinct from p_team_org_id
  ) then
    raise exception 'demand_not_offerable' using errcode = '22023';
  end if;

  select count(*)::integer into v_members
    from public.engagement_contexts ec
   where ec.organization_id = p_team_org_id
     and ec.relationship_slug = 'employee'
     and ec.status = 'active';
  select case when o.organization_type = 'team' then 'team' else 'organization' end
    into v_kind
    from public.organizations o where o.id = p_team_org_id;
  -- A brigade is at least two people; a company or agency offers ITSELF
  -- (its people, its service, as a subcontractor) and needs no team org.
  if v_kind = 'team' and v_members < 2 then
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
      (team_org_id, request_id, note, member_count_at_offer, offered_by, offer_kind)
    values (p_team_org_id, p_request_id, v_note, v_members, uid, v_kind)
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
                       'member_count', v_members, 'offer_kind', v_kind));
  return jsonb_build_object('outcome', 'created', 'offer_id', v_id);
end;
$$;
revoke all on function public.offer_team_to_demand_v1(uuid, uuid, text) from public, anon;
grant execute on function public.offer_team_to_demand_v1(uuid, uuid, text) to authenticated;

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
  select o.id, o.request_id,
         coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')),
         cr.country,
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
  v_side text;
  v_terms record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('accept', 'decline') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  select t.id, t.team_org_id, t.request_id, t.status, t.offer_kind into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found then
    raise exception 'Not authorized to answer this offer' using errcode = '42501';
  end if;
  v_side := public.team_offer_party_side_v1(o.id);
  if v_side is null then
    raise exception 'Not authorized to answer this offer' using errcode = '42501';
  end if;

  -- NEGOTIATION (20261011200000): the open terms version, if any, is answered
  -- by the side that did NOT write it. A party never accepts its own proposal.
  select t.id, t.proposed_side into v_terms
    from public.team_demand_offer_terms t
   where t.offer_id = o.id and t.status = 'proposed'
   for update;
  if v_side = 'supplier' then
    -- The offering side answers only a counter-proposal of the receiver;
    -- taking the offer back stays withdraw_team_demand_offer_v1.
    if p_decision <> 'accept' or v_terms.id is null or v_terms.proposed_side <> 'receiver' then
      raise exception 'Not authorized to answer this offer' using errcode = '42501';
    end if;
  elsif p_decision = 'accept' and v_terms.id is not null and v_terms.proposed_side = 'receiver' then
    raise exception 'terms_await_other_side' using errcode = '22023';
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
    if o.offer_kind = 'team' and (select count(*) from public.engagement_contexts ec
         where ec.organization_id = o.team_org_id
           and ec.relationship_slug = 'employee' and ec.status = 'active') < 2 then
      raise exception 'team_too_small' using errcode = '22023';
    end if;
  end if;

  update public.team_demand_offers
     set status = case p_decision when 'accept' then 'accepted' else 'declined' end,
         responded_by = uid, responded_at = now()
   where id = o.id;
  if v_terms.id is not null then
    update public.team_demand_offer_terms
       set status = case p_decision when 'accept' then 'accepted' else 'declined' end,
           decided_by = uid, decided_at = now()
     where id = v_terms.id;
  end if;
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

  select t.id, t.team_org_id, t.request_id, t.status, t.assignment_id, t.offer_kind into o
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
  -- A company / agency offered ITSELF, not a unit: assigning its whole
  -- organization as a team would disclose every employee to the project.
  if o.offer_kind <> 'team' then
    raise exception 'organization_offer_not_a_unit' using errcode = '22023';
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

-- ROLLBACK
-- see supabase/rollbacks/20261011200000_supply_offer_negotiation_v1.sql.down.sql
