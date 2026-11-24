-- @human-gate-approved (acknowledgement only: RED, NOT applied; owner approval of this exact SQL required)
-- 20261122170000_open_need_board_no_client_identity_v1
--
-- WHY (owner decision 2026-11-22, the open agency board): registered
-- agencies and other providers see open needs (profession, country, start,
-- duration, requirements) WITH NO CLIENT IDENTITY, and may offer without
-- prior approval. A walk of the journey (Lane H, local stack) showed the
-- open-needs list and the offerer's own offer list both returning the
-- client company's name to any team / company / agency manager.
--
-- WHAT
--   1. list_open_demand_for_team_offer_v1 — same signature, same filters;
--      company_name is always NULL. (Kept so a running app that still reads
--      v1 keeps working, without the name.)
--   2. list_team_demand_offers_for_team_v1 — same signature; company_name
--      only once the client answered yes (status accepted / assigned).
--   3. list_open_needs_for_offer_v2(uuid) — NEW: the same rows and caller
--      rule as (1), plus duration, language, required skills (active
--      catalogue slugs, the worker board's derivation) and tools (closed
--      list). No company, person or free-text column.
-- Every other line of (1) and (2) is the latest repo definition
-- ((1) 20261028123000_synthetic_demand_cross_org_readers_v1,
-- (2) 20261020010000_demand_company_one_rule_v1), except one more line in
-- each, and in (3): role_text comes from role_or_work_type ONLY. The former
-- fallback to the request's free-text title is dropped, because a title can
-- name the client (R2 P3-1 on #3630). duration and language_requirement stay:
-- they are short structured fields of the need form, not a description.
-- (Renumbered from 20261122140000, which #3620 also uses: R2 P2-1.)
--
-- WHAT IS NOT DONE: no table, policy, grant widening or row change. The
-- receiving side (the client) is unchanged. The offer thread is unchanged:
-- whether an offerer may message the client before the client answers is
-- an open owner question, not decided here.
--
-- ROLLBACK: supabase/rollbacks/20261122170000_open_need_board_no_client_identity_v1.down.sql
-- (restores (1) and (2) verbatim and drops (3); refuses nothing — no data).

begin;

CREATE OR REPLACE FUNCTION public.list_open_demand_for_team_offer_v1(p_team_org_id uuid)
 RETURNS TABLE(request_id uuid, role_text text, country text, team_size integer, start_period text, company_name text, created_at timestamp with time zone, open_offer_id uuid, open_offer_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_sees_fixtures boolean;
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
  -- A synthetic viewer (QA identity, or a team / organization that is itself
  -- a fixture) keeps seeing fixtures; everyone else does not (20261028123000).
  v_sees_fixtures := public.is_synthetic_viewer_v1()
    or exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name));

  return query
  select cr.id,
         nullif(btrim(cr.role_or_work_type), ''),
         cr.country,
         cr.team_size,
         cr.start_period,
         -- NO CLIENT IDENTITY ON THE OPEN BOARD (owner decision 2026-11-22):
         -- the column stays for compatibility and is always empty.
         null::text,
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
     -- SYNTHETIC QA FIXTURES (20261028123000): another organization's fixture
     -- need is not market reality. Kept for the need's own people and for a
     -- synthetic viewer (lib/qa/synthetic-fixture.ts).
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end;
$function$;

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
         nullif(btrim(cr.role_or_work_type), ''),
         cr.country,
         -- The client is named to the offerer only once the client has
         -- answered yes (agreed in principle, or assigned the unit); before
         -- that, and after a no or a withdrawal, the need stays anonymous.
         case when o.status in ('accepted', 'assigned')
              then coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), ''))
         end,
         o.status, o.offered_at, o.responded_at, o.assignment_id
    from public.team_demand_offers o
    join public.customer_requests cr on cr.id = o.request_id
    left join public.companies c on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
   where o.team_org_id = p_team_org_id
   order by o.offered_at desc
   limit 100;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_open_needs_for_offer_v2(p_team_org_id uuid)
 RETURNS TABLE(request_id uuid, role_text text, country text, team_size integer, start_period text, duration text, language_requirement text, need_skill_slugs text[], required_tools text[], created_at timestamp with time zone, open_offer_id uuid, open_offer_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_sees_fixtures boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- The same caller rule as list_open_demand_for_team_offer_v1: a manager or
  -- the owner of the team / company / agency that would make the offer.
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
  v_sees_fixtures := public.is_synthetic_viewer_v1()
    or exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name));

  -- WHAT THE NEED IS, NEVER WHOSE IT IS: profession, country, size, start,
  -- duration, language, required skills (active catalogue slugs) and tools
  -- (closed list). No company, no person, no free text (a summary or a note
  -- can name the client).
  return query
  select cr.id,
         nullif(btrim(cr.role_or_work_type), ''),
         cr.country,
         cr.team_size,
         cr.start_period,
         nullif(btrim(cr.duration), ''),
         nullif(btrim(cr.language_requirement), ''),
         (select array_agg(distinct v order by v)
            from jsonb_array_elements_text(
                   case
                     when jsonb_typeof(cr.payload -> 'structured_need' -> 'skill_slugs') = 'array'
                       then cr.payload -> 'structured_need' -> 'skill_slugs'
                     when jsonb_typeof(cr.payload -> 'need_skills' -> 'slugs') = 'array'
                       then cr.payload -> 'need_skills' -> 'slugs'
                     else '[]'::jsonb
                   end) as v
           where exists (select 1 from public.skills s
                          where s.slug = v and s.is_active is not false)),
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
         end,
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
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end;
$function$;

-- The replaced readers keep exactly their earlier grants (signed-in only).
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public;
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from public;
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from anon;
grant execute on function public.list_team_demand_offers_for_team_v1(uuid) to authenticated;

revoke all on function public.list_open_needs_for_offer_v2(uuid) from public;
revoke all on function public.list_open_needs_for_offer_v2(uuid) from anon;
grant execute on function public.list_open_needs_for_offer_v2(uuid) to authenticated;

commit;
