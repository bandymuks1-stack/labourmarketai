-- 20261020010000_demand_company_one_rule_v1
--
-- @human-gate-approved (acknowledgement: RED by SECURITY DEFINER body replace of five
--   functions + one new helper; extends the owner-approved #2531 fix — "Pašalinti
--   dubliavimą rodymo / užklausų lygmenyje" — to every function with the same defect)
--
-- ── THE SYSTEMIC DEFECT ──────────────────────────────────────────────────
-- A need (customer_requests) belongs to an ORGANIZATION (organization_id, set
-- on every board-kind row in production). Five functions found its company
-- through the PERSON who posted it instead:
--     join companies c on c.profile_id = cr.profile_id
-- A person may own or run several companies (decision 0012), so each of these
-- returned or gated a need once per company that person owns — under the
-- wrong company's name, or with the wrong company's verification state:
--   list_open_demand_for_workers        worker board (fixed inline by 20261019200000)
--   list_open_demand_for_team_offer_v1  the needs a brigade / organization may offer itself to
--   list_team_demand_offers_for_team_v1 the brigade's own offers list (buyer name)
--   offer_team_to_demand_v1             the "is this need offerable" gate (verification)
--   contact_demand_owner_v1             a worker contacting the need's owner (verification flag)
--
-- ── ONE RULE ─────────────────────────────────────────────────────────────
-- `demand_company_id_v1(organization_id, profile_id)`: the company of the
-- need's OWN organization (organizations.legacy_company_id). Only a legacy row
-- without an organization (none today) falls back to the poster — and then to
-- ONE company (the oldest), never to every company they own. All five
-- functions now call it, so the rule exists once. Everything else in each
-- function is unchanged (gates, filters, limits, projections, grants).
--
-- Rollback: supabase/rollbacks/20261020010000_demand_company_one_rule_v1.down.sql
-- (restores the five production bodies byte-for-byte and drops the helper).

begin;

create or replace function public.demand_company_id_v1(p_organization_id uuid, p_profile_id uuid)
returns uuid
language sql
stable
set search_path to 'public'
as $function$
  select case
    when p_organization_id is not null then
      (select o.legacy_company_id from public.organizations o where o.id = p_organization_id)
    else
      (select c.id from public.companies c
        where c.profile_id = p_profile_id
        order by c.created_at, c.id
        limit 1)
  end
$function$;

-- Called only from inside the SECURITY DEFINER functions below (as their
-- owner); not an API door.
revoke all on function public.demand_company_id_v1(uuid, uuid) from public, anon, authenticated;

-- ── 1. worker board — the inline rule of 20261019200000, now the shared one ──
CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()
 RETURNS TABLE(id uuid, role_text text, country text, team_size integer, start_period text, accommodation text, created_at timestamp with time zone, company_name text, route_status text, location_label text, transport text, required_tools text[], structured jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker -> empty, never an error surface
  end if;

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         case
           when cr.payload ->> 'accommodation' in (
             'provided_free', 'provided_paid', 'provided_deducted',
             'not_provided', 'yes', 'no', 'unknown'
           ) then cr.payload ->> 'accommodation'
           else null
         end as accommodation,
         cr.created_at,
         coalesce(
           nullif(trim(c.display_name), ''),
           nullif(trim(c.legal_name), '')
         ) as company_name,
         'approved_direct_partner'::text as route_status,
         coalesce(
           (select nullif(trim(coalesce(cdl.city, cdl.location_label)), '')
              from public.company_demand_locations cdl
             where cdl.request_id = cr.id
               and cdl.active
             order by cdl.updated_at desc
             limit 1),
           nullif(trim(cr.location), '')
         ) as location_label,
         case
           when cr.payload ->> 'transport' in (
             'provided', 'compensated', 'not_provided', 'unknown'
           ) then cr.payload ->> 'transport'
           else null
         end as transport,
         case
           when jsonb_typeof(cr.payload -> 'required_tools') = 'array' then
             (select array_agg(v order by v)
                from jsonb_array_elements_text(cr.payload -> 'required_tools') as v
               where v in (
                 'bulldozer-operator', 'compactor-operator', 'crane-operator',
                 'equipment-operation', 'excavator-operator',
                 'forklift-operator', 'grader-operator', 'hand-tools',
                 'loader-operator', 'scaffolding'
               ))
           else null
         end as required_tools,
         -- Worker-safe structured_v2 projection - SQL-side whitelist, never
         -- the raw payload (see demand_structured_v2_public).
         public.demand_structured_v2_public(cr.payload -> 'structured_v2')
           as structured
    from public.customer_requests cr
    -- THE NEED'S OWN COMPANY — the one rule (20261020010000).
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
     and c.verification_status = 'verified'
   where cr.status = 'submitted'
     -- DIRECTION OF THE MARKET (owner window 7 section 4). A worker board
     -- shows DEMAND. agency_offer is an agency offering the people it HAS -
     -- supply - and rendering it here presents an offer as a vacancy.
     -- Closed allow-list: a future supply kind is invisible by default.
     -- The null branch keeps the pre-kind buyer-spine rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
   order by cr.created_at desc
   limit 100;
end
$function$;

-- ── 2. the needs a brigade / organization may offer itself to ─────────────
CREATE OR REPLACE FUNCTION public.list_open_demand_for_team_offer_v1(p_team_org_id uuid)
 RETURNS TABLE(request_id uuid, role_text text, country text, team_size integer, start_period text, company_name text, created_at timestamp with time zone, open_offer_id uuid, open_offer_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    return;
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
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
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
$function$;

-- ── 3. the brigade's own offers list (the buyer's name) ───────────────────
CREATE OR REPLACE FUNCTION public.list_team_demand_offers_for_team_v1(p_team_org_id uuid)
 RETURNS TABLE(offer_id uuid, request_id uuid, role_text text, country text, company_name text, status text, offered_at timestamp with time zone, responded_at timestamp with time zone, assignment_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    left join public.companies c on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
   where o.team_org_id = p_team_org_id
   order by o.offered_at desc
   limit 100;
end;
$function$;

-- ── 4. the "is this need offerable" gate ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.offer_team_to_demand_v1(p_team_org_id uuid, p_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
       and c.verification_status = 'verified'
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
  if v_kind = 'team' and v_members < 2 then
    raise exception 'team_too_small' using errcode = '22023';
  end if;

  if exists (select 1 from public.team_demand_offers o
              where o.team_org_id = p_team_org_id
                and o.request_id = p_request_id
                and o.status = 'declined') then
    raise exception 'previously_declined' using errcode = '22023';
  end if;

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
$function$;

-- ── 5. a worker contacting the need's owner ───────────────────────────────
CREATE OR REPLACE FUNCTION public.contact_demand_owner_v1(p_request_id uuid)
 RETURNS TABLE(owner_profile_id uuid, demand_title text, has_own_signal boolean, demand_open boolean, company_verified boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker → no row, never an error surface
  end if;

  return query
  select
    -- The owner id (and title) are revealed to the SERVER ACTION only when
    -- every gate holds; otherwise NULL while the flags stay honest. All
    -- inequality checks use IS DISTINCT FROM (NULL-safe by construction —
    -- the P0 secdef lesson: never a bare <> in a SECURITY DEFINER gate).
    case
      when s.ok and cr.status = 'submitted'
           and c.verification_status = 'verified'
           and cr.profile_id is distinct from uid
        then cr.profile_id
      else null
    end as owner_profile_id,
    case
      when s.ok and cr.status = 'submitted'
           and c.verification_status = 'verified'
           and cr.profile_id is distinct from uid
        then left(coalesce(cr.title, ''), 120)
      else null
    end as demand_title,
    s.ok as has_own_signal,
    (cr.status = 'submitted') as demand_open,
    (c.verification_status = 'verified') as company_verified
  from public.customer_requests cr
  left join public.companies c on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
  cross join lateral (
    select exists (
      select 1
        from public.demand_interest_signals dis
       where dis.request_id = cr.id
         and dis.worker_id = v_worker
         and dis.status is distinct from 'withdrawn'
    ) as ok
  ) s
  -- Existence-oracle closure: a row comes back ONLY when the caller holds
  -- their own active signal on this demand. A caller with no standing gets
  -- ZERO rows whether the demand exists or not — probing a guessed uuid
  -- reveals nothing (the P2 existence-oracle class from the secdef audit).
  where cr.id = p_request_id
    and s.ok;
end $function$;

-- The privilege sets production already has (authenticated only), re-asserted.
revoke all on function public.list_open_demand_for_workers() from public, anon;
grant execute on function public.list_open_demand_for_workers() to authenticated;
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public, anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from public, anon;
grant execute on function public.list_team_demand_offers_for_team_v1(uuid) to authenticated;
revoke all on function public.offer_team_to_demand_v1(uuid, uuid, text) from public, anon;
grant execute on function public.offer_team_to_demand_v1(uuid, uuid, text) to authenticated;
revoke all on function public.contact_demand_owner_v1(uuid) from public, anon;
grant execute on function public.contact_demand_owner_v1(uuid) to authenticated;

commit;
