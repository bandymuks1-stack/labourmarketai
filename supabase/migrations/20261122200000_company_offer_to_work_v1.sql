-- 20261122200000_company_offer_to_work_v1
--
-- WHY (owner decision 2026-11-22, item 2): after the client's preliminary yes
-- to a company offer the whole path must work up to the real start of work:
--   need -> company offer -> the client's choice -> terms (scope, price,
--   dates, place, responsibilities) -> BOTH direct parties confirm the agreed
--   terms -> a project is created -> work starts.
-- A preliminary yes is not a contract. No legal obligation is invented and no
-- one consents on another's behalf. The client sees only its direct partner.
--
-- A walk of the journey (Lane H, local stack) showed the dead end: once the
-- client said yes, terms could no longer be proposed (offer_not_open), no
-- state recorded that both sides confirmed anything, and a company offer
-- could never reach a project (hand_off refuses organization_offer_not_a_unit,
-- because assigning a whole company would disclose all its employees).
--
-- WHAT (additive; NO existing function is replaced)
--   1. team_demand_offers.unit_team_org_id — the crew (one of the supplier's
--      own brigades) a company offer will work with. Nullable.
--   2. team_demand_offer_terms: place_text, and one explicit confirmation per
--      side (supplier_/receiver_confirmed_at, _by). Nullable.
--   3. propose_team_demand_offer_terms_v2 — v1 + place; also allowed after the
--      preliminary yes (status accepted), so the parties keep negotiating.
--   4. list_team_demand_offer_terms_v2 — v1 + place + the two confirmations.
--   5. confirm_team_demand_offer_terms_v1 — a party confirms THE LATEST
--      version, only after the preliminary yes; each side confirms for itself
--      only. Both confirmations on the same version = the agreed terms.
--      A newer version starts again with no confirmation.
--   6. name_team_demand_offer_unit_v1 — the supplier names its crew: a
--      brigade owned by the offering organization's owner, not archived, with
--      at least one active member who is on the offering COMPANY's active
--      roster (offer_crew_eligible_v1, so a brigade of another company of the
--      same owner is refused). Its members reach the project only through
--      the hand-off, exactly as a brigade offer's members do today. Changing
--      the crew after a confirmation clears both confirmations: the client
--      confirms again what it agreed to, crew included.
--   6a. offer_crew_eligible_v1 — that one rule, internal (no grant); the
--      crew picker (list_offer_crew_options_v1), the naming and the hand-off
--      all read it, so the picker never offers what the database refuses.
--   6b. list_offer_crew_options_v1 — the supplier side: the brigades it may
--      name for THIS offer (id, name, member count).
--   7. team_demand_offer_progress_v1 — both parties: where the offer stands
--      (named crew and its size, latest version, who confirmed, agreed).
--   8. hand_off_team_demand_offer_v2 — v1's rules; a company offer is handed
--      off only when the terms are agreed by both AND a crew is named, and
--      the CREW is assigned (never the whole company). A brigade offer is
--      handed off exactly as v1 does.
--
-- WHAT IS NOT DONE: v1 functions, policies and grants are untouched; no row
-- is changed. The app reads v2 and falls back to v1 while this is missing.
--
-- ROLLBACK: supabase/rollbacks/20261122200000_company_offer_to_work_v1.down.sql
-- (refuses while any confirmation, place or named crew exists).

begin;

-- ── 1–2. columns ─────────────────────────────────────────────────────────
alter table public.team_demand_offers
  add column if not exists unit_team_org_id uuid references public.organizations(id) on delete set null;

alter table public.team_demand_offer_terms
  add column if not exists place_text text check (place_text is null or char_length(place_text) <= 300),
  add column if not exists supplier_confirmed_at timestamptz,
  add column if not exists supplier_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists receiver_confirmed_at timestamptz,
  add column if not exists receiver_confirmed_by uuid references public.profiles(id) on delete set null;

-- Privacy erasure v3: the two new person references are severed by NULL
-- before an account is deleted, like decided_by / proposed_by on the same
-- table (20261019140000). The confirmation time stays; who confirmed goes.
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'team_demand_offer_terms', 'supplier_confirmed_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', 'FK SET NULL; the confirmation time is kept'),
  ('public', 'team_demand_offer_terms', 'receiver_confirmed_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', 'FK SET NULL; the confirmation time is kept')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;
-- ─────────────────────────────────────────────────────────────────────────

-- ── 3. propose_team_demand_offer_terms_v2 ────────────────────────────────
create or replace function public.propose_team_demand_offer_terms_v2(
  p_offer_id        uuid,
  p_capacity        integer default null,
  p_rate_text       text    default null,
  p_start_date      date    default null,
  p_end_date        date    default null,
  p_scope_text      text    default null,
  p_conditions_text text    default null,
  p_place_text      text    default null
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
  v_place    text := nullif(left(btrim(coalesce(p_place_text, '')), 300), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select t.id, t.status into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found then
    raise exception 'Not authorized to negotiate this offer' using errcode = '42501';
  end if;
  v_side := public.team_offer_party_side_v1(o.id);
  if v_side is null then
    raise exception 'Not authorized to negotiate this offer' using errcode = '42501';
  end if;
  -- Before the answer, and after the preliminary yes (the terms are agreed
  -- only when both confirm one version).
  if o.status not in ('offered', 'accepted') then
    raise exception 'offer_not_open' using errcode = '22023';
  end if;
  if p_capacity is null and v_rate is null and p_start_date is null and p_end_date is null
     and v_scope is null and v_cond is null and v_place is null then
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
       start_date, end_date, scope_text, conditions_text, place_text)
    values (o.id, v_version, v_side, uid, p_capacity, v_rate,
            p_start_date, p_end_date, v_scope, v_cond, v_place);

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_demand_offer_terms_proposed_v1', 'team_demand_offers', o.id,
    jsonb_build_object('version', v_version, 'side', v_side, 'offer_status', o.status, 'via', 'v2'));
  return jsonb_build_object('outcome', 'proposed', 'version', v_version);
end;
$$;

-- ── 4. list_team_demand_offer_terms_v2 ───────────────────────────────────
create or replace function public.list_team_demand_offer_terms_v2(
  p_offer_id uuid
) returns table (
  version            integer,
  proposed_side      text,
  mine               boolean,
  capacity           integer,
  rate_text          text,
  start_date         date,
  end_date           date,
  scope_text         text,
  conditions_text    text,
  place_text         text,
  status             text,
  created_at         timestamptz,
  decided_at         timestamptz,
  supplier_confirmed boolean,
  receiver_confirmed boolean,
  confirmed_by_me    boolean
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
  -- No profile id: which SIDE wrote or confirmed, never who.
  return query
  select t.version, t.proposed_side, (t.proposed_side = v_side), t.capacity,
         t.rate_text, t.start_date, t.end_date, t.scope_text, t.conditions_text,
         t.place_text, t.status, t.created_at, t.decided_at,
         (t.supplier_confirmed_at is not null), (t.receiver_confirmed_at is not null),
         case v_side when 'supplier' then t.supplier_confirmed_at is not null
                     else t.receiver_confirmed_at is not null end
    from public.team_demand_offer_terms t
   where t.offer_id = p_offer_id
   order by t.version desc;
end;
$$;

-- ── 5. confirm_team_demand_offer_terms_v1 ────────────────────────────────
-- Returns jsonb {outcome: 'confirmed' | 'agreed' | 'already_confirmed', version}.
-- Refusals: offer_not_accepted | terms_missing | terms_changed (22023), 42501.
create or replace function public.confirm_team_demand_offer_terms_v1(
  p_offer_id         uuid,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  o       record;
  v_side  text;
  v_terms record;
  v_both  boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- the offer first (the proposal RPC's lock order), then its terms
  select t.id, t.status into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found then
    raise exception 'Not authorized to confirm these terms' using errcode = '42501';
  end if;
  v_side := public.team_offer_party_side_v1(o.id);
  if v_side is null then
    raise exception 'Not authorized to confirm these terms' using errcode = '42501';
  end if;
  -- Confirmation follows the client's preliminary yes; before it there is
  -- nothing to confirm, and after the hand-off the agreement is closed.
  if o.status <> 'accepted' then
    raise exception 'offer_not_accepted' using errcode = '22023';
  end if;

  select t.id, t.version, t.status, t.supplier_confirmed_at, t.receiver_confirmed_at into v_terms
    from public.team_demand_offer_terms t
   where t.offer_id = o.id
   order by t.version desc
   limit 1
   for update;
  if v_terms.id is null or v_terms.status not in ('proposed', 'accepted') then
    raise exception 'terms_missing' using errcode = '22023';
  end if;
  -- Only the version ON THE SCREEN: a newer one refuses.
  if v_terms.version is distinct from p_expected_version then
    raise exception 'terms_changed' using errcode = '22023';
  end if;

  if (v_side = 'supplier' and v_terms.supplier_confirmed_at is not null)
     or (v_side = 'receiver' and v_terms.receiver_confirmed_at is not null) then
    return jsonb_build_object('outcome', 'already_confirmed', 'version', v_terms.version);
  end if;

  if v_side = 'supplier' then
    update public.team_demand_offer_terms
       set supplier_confirmed_at = now(), supplier_confirmed_by = uid
     where id = v_terms.id;
  else
    update public.team_demand_offer_terms
       set receiver_confirmed_at = now(), receiver_confirmed_by = uid
     where id = v_terms.id;
  end if;

  select (t.supplier_confirmed_at is not null and t.receiver_confirmed_at is not null) into v_both
    from public.team_demand_offer_terms t where t.id = v_terms.id;
  if v_both then
    update public.team_demand_offer_terms
       set status = 'accepted',
           decided_by = coalesce(decided_by, uid),
           decided_at = coalesce(decided_at, now())
     where id = v_terms.id;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid,
          case when v_both then 'team_demand_offer_terms_agreed_v1'
               else 'team_demand_offer_terms_confirmed_v1' end,
          'team_demand_offers', o.id,
          jsonb_build_object('version', v_terms.version, 'side', v_side));
  return jsonb_build_object('outcome', case when v_both then 'agreed' else 'confirmed' end,
                            'version', v_terms.version);
end;
$$;

-- ── 6a. offer_crew_eligible_v1 (internal) ────────────────────────────────
-- A brigade may be the crew of a company offer when it is a brigade (team)
-- owned by the offering organization's owner, not archived, and at least one
-- of its active members is on the offering COMPANY's active roster. Brigades
-- carry no company column, so the roster is the tie to the company.
create or replace function public.offer_crew_eligible_v1(p_team_org_id uuid, p_unit_team_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select true
      from public.organizations g
      join public.organizations u on u.id = p_unit_team_org_id
     where g.id = p_team_org_id
       and g.owner_profile_id is not null
       and g.legacy_company_id is not null
       and u.organization_type = 'team'
       and u.archived_at is null
       and u.owner_profile_id = g.owner_profile_id
       and exists (
         select 1
           from public.engagement_contexts ec
           join public.workers w on w.profile_id = ec.profile_id
           join public.company_workers cw on cw.worker_id = w.id
          where ec.organization_id = u.id
            and ec.relationship_slug = 'employee'
            and ec.status = 'active'
            and cw.company_id = g.legacy_company_id
            and cw.status = 'active')
     limit 1), false)
$$;
revoke all on function public.offer_crew_eligible_v1(uuid, uuid) from public;
revoke all on function public.offer_crew_eligible_v1(uuid, uuid) from anon;
revoke all on function public.offer_crew_eligible_v1(uuid, uuid) from authenticated;

-- ── 6b. list_offer_crew_options_v1 ───────────────────────────────────────
create or replace function public.list_offer_crew_options_v1(
  p_offer_id uuid
) returns table (
  unit_team_org_id uuid,
  name             text,
  member_count     integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select t.id, t.offer_kind, t.team_org_id into o
    from public.team_demand_offers t where t.id = p_offer_id;
  if not found or o.offer_kind <> 'organization'
     or public.team_offer_party_side_v1(o.id) is distinct from 'supplier' then
    return;
  end if;
  return query
  select u.id,
         coalesce(nullif(btrim(u.display_name), ''), '-'),
         (select count(*)::integer from public.engagement_contexts ec
           where ec.organization_id = u.id and ec.relationship_slug = 'employee' and ec.status = 'active')
    from public.organizations g
    join public.organizations u
      on u.owner_profile_id = g.owner_profile_id and u.organization_type = 'team' and u.archived_at is null
   where g.id = o.team_org_id
     and g.owner_profile_id is not null
     and public.offer_crew_eligible_v1(o.team_org_id, u.id)
   order by u.created_at
   limit 50;
end;
$$;

-- ── 6. name_team_demand_offer_unit_v1 ────────────────────────────────────
-- Returns jsonb {outcome: 'named' | 'unchanged'}. Refusals: offer_not_open |
-- not_an_organization_offer | unit_not_yours | unit_has_no_members (22023).
create or replace function public.name_team_demand_offer_unit_v1(
  p_offer_id         uuid,
  p_unit_team_org_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  o         record;
  v_owner   uuid;
  v_cleared integer := 0;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select t.id, t.status, t.offer_kind, t.team_org_id, t.unit_team_org_id into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found or public.team_offer_party_side_v1(o.id) is distinct from 'supplier' then
    raise exception 'Not authorized to name the crew' using errcode = '42501';
  end if;
  if o.offer_kind <> 'organization' then
    raise exception 'not_an_organization_offer' using errcode = '22023';
  end if;
  if o.status not in ('offered', 'accepted') then
    raise exception 'offer_not_open' using errcode = '22023';
  end if;
  select g.owner_profile_id into v_owner from public.organizations g where g.id = o.team_org_id;
  -- The crew is one of the offering organization's OWN brigades.
  if p_unit_team_org_id is null or not exists (
       select 1 from public.organizations u
        where u.id = p_unit_team_org_id
          and u.organization_type = 'team'
          and u.archived_at is null
          and u.owner_profile_id is not distinct from v_owner
          and v_owner is not null) then
    raise exception 'unit_not_yours' using errcode = '22023';
  end if;
  if not exists (
       select 1 from public.engagement_contexts ec
        where ec.organization_id = p_unit_team_org_id
          and ec.relationship_slug = 'employee'
          and ec.status = 'active') then
    raise exception 'unit_has_no_members' using errcode = '22023';
  end if;
  -- The crew belongs to the offering COMPANY, not only to its owner.
  if not public.offer_crew_eligible_v1(o.team_org_id, p_unit_team_org_id) then
    raise exception 'unit_not_of_company' using errcode = '22023';
  end if;
  if o.unit_team_org_id is not distinct from p_unit_team_org_id then
    return jsonb_build_object('outcome', 'unchanged', 'confirmations_cleared', false);
  end if;

  update public.team_demand_offers set unit_team_org_id = p_unit_team_org_id where id = o.id;
  -- A different crew is a different agreement: what either side confirmed
  -- before is no longer what will happen, so both confirm again.
  update public.team_demand_offer_terms
     set supplier_confirmed_at = null, supplier_confirmed_by = null,
         receiver_confirmed_at = null, receiver_confirmed_by = null
   where offer_id = o.id
     and (supplier_confirmed_at is not null or receiver_confirmed_at is not null);
  get diagnostics v_cleared = row_count;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_demand_offer_unit_named_v1', 'team_demand_offers', o.id,
    jsonb_build_object('unit_team_org_id', p_unit_team_org_id, 'previous', o.unit_team_org_id,
      'confirmations_cleared', v_cleared > 0));
  return jsonb_build_object('outcome', 'named', 'confirmations_cleared', v_cleared > 0);
end;
$$;

-- ── 7. team_demand_offer_progress_v1 ─────────────────────────────────────
-- Both parties; zero rows for anyone else. The crew is named and counted,
-- never listed person by person (members reach the project at hand-off).
create or replace function public.team_demand_offer_progress_v1(
  p_offer_id uuid
) returns table (
  my_side            text,
  offer_kind         text,
  status             text,
  unit_named         boolean,
  unit_name          text,
  unit_member_count  integer,
  latest_version     integer,
  latest_status      text,
  supplier_confirmed boolean,
  receiver_confirmed boolean,
  agreed             boolean
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
  select v_side,
         o.offer_kind,
         o.status,
         o.unit_team_org_id is not null,
         (select nullif(btrim(u.display_name), '') from public.organizations u where u.id = o.unit_team_org_id),
         (select count(*)::integer from public.engagement_contexts ec
           where o.unit_team_org_id is not null
             and ec.organization_id = o.unit_team_org_id
             and ec.relationship_slug = 'employee' and ec.status = 'active'),
         lt.version,
         lt.status,
         coalesce(lt.supplier_confirmed_at is not null, false),
         coalesce(lt.receiver_confirmed_at is not null, false),
         coalesce(lt.supplier_confirmed_at is not null and lt.receiver_confirmed_at is not null, false)
    from public.team_demand_offers o
    left join lateral (
      select t.version, t.status, t.supplier_confirmed_at, t.receiver_confirmed_at
        from public.team_demand_offer_terms t
       where t.offer_id = o.id
       order by t.version desc
       limit 1
    ) lt on true
   where o.id = p_offer_id;
end;
$$;

-- ── 8. hand_off_team_demand_offer_v2 ─────────────────────────────────────
-- v1's rules and refusals; a company offer needs the agreed terms and a
-- named crew, and the CREW is the assigned unit. Extra refusals:
-- terms_not_agreed | unit_not_named | unit_not_yours (22023).
create or replace function public.hand_off_team_demand_offer_v2(
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
  v_unit     uuid;
  v_owner    uuid;
  v_id       uuid;
  v_outcome  text := 'created';
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_project_id is null then
    raise exception 'project_required' using errcode = '22023';
  end if;

  select t.id, t.team_org_id, t.request_id, t.status, t.assignment_id, t.offer_kind, t.unit_team_org_id into o
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

  if o.offer_kind = 'team' then
    v_unit := o.team_org_id;
  else
    -- A company offer: the agreed terms (both sides confirmed the latest
    -- version) and the supplier's named crew — never the whole company.
    if not exists (
         select 1 from (
           select t.supplier_confirmed_at, t.receiver_confirmed_at
             from public.team_demand_offer_terms t
            where t.offer_id = o.id
            order by t.version desc
            limit 1) lt
          where lt.supplier_confirmed_at is not null and lt.receiver_confirmed_at is not null) then
      raise exception 'terms_not_agreed' using errcode = '22023';
    end if;
    if o.unit_team_org_id is null then
      raise exception 'unit_not_named' using errcode = '22023';
    end if;
    select g.owner_profile_id into v_owner from public.organizations g where g.id = o.team_org_id;
    if not exists (
         select 1 from public.organizations u
          where u.id = o.unit_team_org_id and u.organization_type = 'team'
            and u.archived_at is null and v_owner is not null
            and u.owner_profile_id = v_owner) then
      raise exception 'unit_not_yours' using errcode = '22023';
    end if;
    if not public.offer_crew_eligible_v1(o.team_org_id, o.unit_team_org_id) then
      raise exception 'unit_not_of_company' using errcode = '22023';
    end if;
    v_unit := o.unit_team_org_id;
  end if;

  select cr.organization_id, cr.profile_id into v_req
    from public.customer_requests cr where cr.id = o.request_id;
  select p.id, p.status, p.organization_id, p.company_id into v_project
    from public.projects p where p.id = p_project_id;
  if not found then
    raise exception 'Not authorized to assign this team' using errcode = '42501';
  end if;
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
     where ec.organization_id = v_unit
       and ec.relationship_slug = 'employee'
       and ec.status = 'active'
  ) then
    raise exception 'team_has_no_members' using errcode = '22023';
  end if;

  insert into public.team_assignments
      (team_org_id, project_id, work_object_id, task_id, assigned_by)
    values (v_unit, p_project_id, p_work_object_id, p_task_id, uid)
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
     where ta.team_org_id = v_unit
       and ta.project_id = p_project_id
       and ta.work_object_id is not distinct from p_work_object_id
       and ta.task_id is not distinct from p_task_id
       and ta.ended_at is null;
    v_outcome := 'already_assigned';
  else
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'team_assigned_v1', 'team_assignments', v_id,
      jsonb_build_object('team_org_id', v_unit, 'project_id', p_project_id,
                         'work_object_id', p_work_object_id, 'task_id', p_task_id,
                         'via_offer_id', o.id, 'offer_kind', o.offer_kind));
  end if;

  update public.team_demand_offers
     set status = 'assigned', assignment_id = v_id, handed_off_at = now()
   where id = o.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_demand_offer_handed_off_v1', 'team_demand_offers', o.id,
    jsonb_build_object('assignment_id', v_id, 'project_id', p_project_id,
                       'unit_team_org_id', v_unit, 'offer_kind', o.offer_kind, 'via', 'v2'));

  return jsonb_build_object('outcome', v_outcome, 'assignment_id', v_id);
end;
$$;

-- ── grants: signed-in callers only; every function re-checks the party ──
revoke all on function public.propose_team_demand_offer_terms_v2(uuid, integer, text, date, date, text, text, text) from public;
revoke all on function public.propose_team_demand_offer_terms_v2(uuid, integer, text, date, date, text, text, text) from anon;
grant execute on function public.propose_team_demand_offer_terms_v2(uuid, integer, text, date, date, text, text, text) to authenticated;
revoke all on function public.list_team_demand_offer_terms_v2(uuid) from public;
revoke all on function public.list_team_demand_offer_terms_v2(uuid) from anon;
grant execute on function public.list_team_demand_offer_terms_v2(uuid) to authenticated;
revoke all on function public.confirm_team_demand_offer_terms_v1(uuid, integer) from public;
revoke all on function public.confirm_team_demand_offer_terms_v1(uuid, integer) from anon;
grant execute on function public.confirm_team_demand_offer_terms_v1(uuid, integer) to authenticated;
revoke all on function public.list_offer_crew_options_v1(uuid) from public;
revoke all on function public.list_offer_crew_options_v1(uuid) from anon;
grant execute on function public.list_offer_crew_options_v1(uuid) to authenticated;
revoke all on function public.name_team_demand_offer_unit_v1(uuid, uuid) from public;
revoke all on function public.name_team_demand_offer_unit_v1(uuid, uuid) from anon;
grant execute on function public.name_team_demand_offer_unit_v1(uuid, uuid) to authenticated;
revoke all on function public.team_demand_offer_progress_v1(uuid) from public;
revoke all on function public.team_demand_offer_progress_v1(uuid) from anon;
grant execute on function public.team_demand_offer_progress_v1(uuid) to authenticated;
revoke all on function public.hand_off_team_demand_offer_v2(uuid, uuid, uuid, uuid) from public;
revoke all on function public.hand_off_team_demand_offer_v2(uuid, uuid, uuid, uuid) from anon;
grant execute on function public.hand_off_team_demand_offer_v2(uuid, uuid, uuid, uuid) to authenticated;

commit;
