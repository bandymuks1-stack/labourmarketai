-- 20261122223000_provider_need_pseudonyms_v1
--
-- RED tier (needs-human-gate). NOT applied to any shared database. Production
-- apply only via Supabase MCP apply_migration after the owner approves THIS
-- migration by name. Stacked on 20261122214700_open_need_messaging_v1 (#3647),
-- itself stacked on 20261122170000 (#3630). Apply order: 170000, 214700, 223000.
-- 20261122214700 and this migration are ONE approval unit (R2 2026-11-23).
--
-- WHY (owner decision 2026-11-22, the worker-board linkage): workers keep
-- seeing the employer's name on the worker board, so ANY real need id a
-- provider (agency, subcontractor, brigade) holds can be joined to it and name
-- the client. Providers therefore see ONLY order pseudonyms issued to their
-- own organization; the pseudonym-to-need mapping lives server-side only.
--
-- WHAT
--   1. provider_need_aliases — one RANDOM alias per (provider organization,
--      need). Random, not derived: a hash of known ids could be recomputed by
--      anyone holding the need id. No app role reads or writes it.
--   2. provider_need_alias_v1 / provider_need_of_alias_v1 — get-or-create and
--      resolve; internal to the definer functions below (no app role).
--   3. The provider readers return the alias in the request_id column (same
--      signatures): the board (list_open_demand_for_team_offer_v1 and #3630's
--      list_open_needs_for_offer_v2) and the sent offers
--      (list_team_demand_offers_for_team_v1). The board gives the DAY of
--      posting, never the exact time (an exact timestamp joins the worker
--      board). The bodies are #3630's (20261122170000), aliased; that and
--      20261122214700 must be applied first (order guard below).
--   4. Every provider action takes the alias only: offer_team_to_demand_v1 and
--      open_need_conversation_open_v1 resolve it for the caller's organization;
--      a real need id resolves to nothing (the "not offerable" / "not allowed"
--      answer), so a held id tests nothing.
--   5. Open-need threads carry the alias in conversations.source_id (what a
--      participant can read); conversation_source_context and
--      disclose_open_need_identity_v1 reach the need through the server-only
--      open_need_threads ledger. Existing open-need threads are re-keyed.
--      The thread subject and context use the need's role only, never its
--      free-text title (#3630's rule).
--   6. team_demand_offers.request_id is no longer readable by app roles (the
--      supplier reads its offers through the alias-returning function).
--   7. The retired Model A pair (list_open_demand_for_agencies — every open need's
--      id — and mark_agency_can_offer — an oracle on any need id) is no longer
--      executable by app roles. Their surface has redirected since W1; the app's
--      reader degrades to its existing "not available" state.
--
-- NOT CHANGED: the worker board (workers keep the employer's name — owner);
-- client-side reads (the client sees its own need ids); shares and accepted
-- offers the client itself made (the client engaged).
--
-- RESIDUAL (said plainly): a provider who ALSO reads the worker board can still
-- compare a need's visible content (role, country, team size, start) with
-- worker-board rows. Exact keys are gone (ids, timestamps); content similarity
-- cannot be removed while workers see the employer next to the same content.
--
-- Rollback: supabase/rollbacks/20261122223000_provider_need_pseudonyms_v1.down.sql
-- Apply via Supabase MCP apply_migration only.

begin;

-- 0) Order guard: #3630's reader v2 and #3647's thread ledger must exist.
do $$
begin
  if to_regprocedure('public.list_open_needs_for_offer_v2(uuid)') is null
     or to_regclass('public.open_need_threads') is null then
    raise exception '20261122223000 needs 20261122170000 (#3630) and 20261122214700 (#3647) applied first';
  end if;
end $$;

-- 1) The alias ledger.
create table if not exists public.provider_need_aliases (
  alias           uuid primary key default gen_random_uuid(),
  provider_org_id uuid not null,
  request_id      uuid not null,
  created_at      timestamptz not null default now(),
  unique (provider_org_id, request_id)
);
alter table public.provider_need_aliases enable row level security;
revoke all on table public.provider_need_aliases from public, anon, authenticated;
-- No policy: no app role reads or writes it.

-- 2) Get-or-create and resolve (internal).
create or replace function public.provider_need_alias_v1(p_org_id uuid, p_request_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_alias uuid;
begin
  if p_org_id is null or p_request_id is null then
    return null;
  end if;
  insert into public.provider_need_aliases (provider_org_id, request_id)
  values (p_org_id, p_request_id)
  on conflict (provider_org_id, request_id) do nothing;
  select a.alias into v_alias from public.provider_need_aliases a
   where a.provider_org_id = p_org_id and a.request_id = p_request_id;
  return v_alias;
end $$;
revoke all on function public.provider_need_alias_v1(uuid, uuid) from public, anon, authenticated;

create or replace function public.provider_need_of_alias_v1(p_org_id uuid, p_alias uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.request_id from public.provider_need_aliases a
   where a.provider_org_id = p_org_id and a.alias = p_alias;
$$;
revoke all on function public.provider_need_of_alias_v1(uuid, uuid) from public, anon, authenticated;

-- 3) The provider readers return the alias. They are #3630's bodies
--    (20261122170000: no client name, role only, no free-text title), with
--    the need id replaced by the provider's alias and the exact posting time
--    by its day. VOLATILE: a read issues the alias. One body per function
--    (R2 2026-11-23); the grants are #3630's, unchanged.
CREATE OR REPLACE FUNCTION public.list_open_demand_for_team_offer_v1(p_team_org_id uuid)
 RETURNS TABLE(request_id uuid, role_text text, country text, team_size integer, start_period text, company_name text, created_at timestamp with time zone, open_offer_id uuid, open_offer_status text)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
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
  select public.provider_need_alias_v1(p_team_org_id, cr.id),
         nullif(btrim(cr.role_or_work_type), ''),
         cr.country,
         cr.team_size,
         cr.start_period,
         -- NO CLIENT IDENTITY ON THE OPEN BOARD (owner decision 2026-11-22):
         -- the column stays for compatibility and is always empty.
         null::text,
         date_trunc('day', cr.created_at),
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
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public;
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.list_team_demand_offers_for_team_v1(p_team_org_id uuid)
 RETURNS TABLE(offer_id uuid, request_id uuid, role_text text, country text, company_name text, status text, offered_at timestamp with time zone, responded_at timestamp with time zone, assignment_id uuid)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
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
  select o.id, public.provider_need_alias_v1(p_team_org_id, o.request_id),
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
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from public;
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from anon;
grant execute on function public.list_team_demand_offers_for_team_v1(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.list_open_needs_for_offer_v2(p_team_org_id uuid)
 RETURNS TABLE(request_id uuid, role_text text, country text, team_size integer, start_period text, duration text, language_requirement text, need_skill_slugs text[], required_tools text[], created_at timestamp with time zone, open_offer_id uuid, open_offer_status text)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
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
  select public.provider_need_alias_v1(p_team_org_id, cr.id),
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
         date_trunc('day', cr.created_at),
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
revoke all on function public.list_open_needs_for_offer_v2(uuid) from public;
revoke all on function public.list_open_needs_for_offer_v2(uuid) from anon;
grant execute on function public.list_open_needs_for_offer_v2(uuid) to authenticated;

-- 4) Every provider action takes the alias only.
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

  -- PSEUDONYMS (20261122223000): the provider names the need by ITS alias only;
  -- a real need id (from anywhere) resolves to nothing — the same answer as a
  -- need that cannot be offered, so it tests nothing.
  p_request_id := public.provider_need_of_alias_v1(p_team_org_id, p_request_id);
  if p_request_id is null then
    raise exception 'demand_not_offerable' using errcode = '22023';
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
revoke all on function public.offer_team_to_demand_v1(uuid, uuid, text) from public, anon;
grant execute on function public.offer_team_to_demand_v1(uuid, uuid, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.open_need_conversation_open_v1(p_request_id uuid, p_org_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- The board gate, called: zero rows unless the caller manages p_org_id and
  -- the need is open, verified, not its own and offerable to that org.
  if not exists (
    select 1 from public.list_open_demand_for_team_offer_v1(p_org_id) b
     where b.request_id = p_request_id
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- p_request_id is the provider's alias (the board gives nothing else); the
  -- need behind it is resolved here, server-side only (20261122223000).
  return public.open_need_thread_ensure_v1(
    public.provider_need_of_alias_v1(p_org_id, p_request_id), p_org_id, uid, 'board');
end $function$;
revoke all on function public.open_need_conversation_open_v1(uuid, uuid) from public, anon;
grant execute on function public.open_need_conversation_open_v1(uuid, uuid) to authenticated, service_role;

-- 5) Open-need threads carry the alias; the need is reached through the ledger.
CREATE OR REPLACE FUNCTION public.open_need_thread_ensure_v1(p_request_id uuid, p_org_id uuid, p_provider uuid, p_via text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner uuid;
  v_title text;
  v_id    uuid;
begin
  select cr.profile_id,
         left(nullif(btrim(cr.role_or_work_type), ''), 120)
    into v_owner, v_title
    from public.customer_requests cr
   where cr.id = p_request_id;
  if v_owner is null or p_provider is null or v_owner = p_provider then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Per organization (R3): the same person acting for two organizations gets
  -- two threads, never one shared across them.
  select t.conversation_id into v_id
    from public.open_need_threads t
    join public.conversation_participants me
      on me.conversation_id = t.conversation_id and me.profile_id = p_provider and me.revoked_at is null
   where t.request_id = p_request_id
     and t.provider_org_id = p_org_id
     and t.opened_by = p_provider;
  if v_id is not null then
    return v_id;
  end if;

  -- The same abuse cap as every new conversation (lib/communication/rate-caps.ts).
  if (select count(*) from public.conversations
       where created_by = p_provider and created_at >= now() - interval '24 hours') >= 20 then
    raise exception 'rate limited' using errcode = 'P0001';
  end if;

  insert into public.conversations (subject, kind, created_by, source_type, source_id)
  -- The thread's source is the provider's ALIAS, never the need id (participants
  -- read conversations.source_id); the ledger keeps the need, server-side.
  values (v_title, 'direct', p_provider, 'open_need', public.provider_need_alias_v1(p_org_id, p_request_id))
  returning id into v_id;
  insert into public.conversation_participants (conversation_id, profile_id, added_by)
  values (v_id, p_provider, p_provider), (v_id, v_owner, p_provider);
  insert into public.open_need_threads (conversation_id, request_id, provider_org_id, opened_by)
  values (v_id, p_request_id, p_org_id, p_provider);
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (coalesce(auth.uid(), p_provider), 'open_need_conversation_opened_v1', 'conversations', v_id,
          jsonb_build_object('request_id', p_request_id, 'org_id', p_org_id, 'via', p_via));
  return v_id;
end $function$;
revoke all on function public.open_need_thread_ensure_v1(uuid, uuid, uuid, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.conversation_source_context(p_conversation_ids uuid[])
 RETURNS TABLE(conversation_id uuid, source_type text, source_title text, source_route_hint text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.id,
    c.source_type,
    src.source_title,
    src.source_route_hint
  from public.conversations c
  join lateral (
    select
      cr.title as source_title,
      case when cr.profile_id = auth.uid() then 'company_scouting' end
        as source_route_hint
    from public.customer_requests cr
    where c.source_type in ('scouting', 'demand_interest')
      and cr.id = c.source_id
    union all
    -- open_need (20261122160000) → the need's role or title; the need owner
    -- gets the route to its needs, the provider gets no route.
    select
      nullif(btrim(cr.role_or_work_type), '') as source_title,
      case when cr.profile_id = auth.uid() then 'company_needs' end
        as source_route_hint
    from public.open_need_threads t
    join public.customer_requests cr on cr.id = t.request_id
    where c.source_type = 'open_need'
      and t.conversation_id = c.id
    union all
    select
      so.title as source_title,
      'service_requests' as source_route_hint
    from public.service_offering_requests sor
    join public.service_offerings so on so.id = sor.offering_id
    where c.source_type = 'accepted_service_request'
      and sor.id = c.source_id
    union all
    select
      br.role_text as source_title,
      'bookings' as source_route_hint
    from public.booking_requests br
    where c.source_type = 'accepted_booking'
      and br.id = c.source_id
  ) src on true
  where c.id = any(p_conversation_ids)
    and c.source_type is not null
    and c.source_id is not null
    and nullif(btrim(coalesce(src.source_title, '')), '') is not null
    and public.is_conversation_participant(c.id);
$function$;
revoke all on function public.conversation_source_context(uuid[]) from public, anon;
grant execute on function public.conversation_source_context(uuid[]) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.disclose_open_need_identity_v1(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  v_new integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.conversations c
      join public.open_need_threads t on t.conversation_id = c.id
      join public.customer_requests cr on cr.id = t.request_id
      join public.conversation_participants cp
        on cp.conversation_id = c.id and cp.profile_id = uid and cp.revoked_at is null
     where c.id = p_conversation_id
       and c.source_type = 'open_need'
       and cr.profile_id = uid
  ) then
    -- Same answer for "no such thread" and "not yours".
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.open_need_identity_disclosures (conversation_id, disclosed_by)
  values (p_conversation_id, uid)
  on conflict (conversation_id) do nothing;
  get diagnostics v_new = row_count;
  if v_new > 0 then
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'open_need_identity_disclosed_v1', 'conversations', p_conversation_id, '{}'::jsonb);
  end if;
  return true;
end $function$;
revoke all on function public.disclose_open_need_identity_v1(uuid) from public, anon;
grant execute on function public.disclose_open_need_identity_v1(uuid) to authenticated, service_role;

-- Existing open-need threads: the source becomes the provider's alias.
update public.conversations c
   set source_id = public.provider_need_alias_v1(t.provider_org_id, t.request_id)
  from public.open_need_threads t
 where t.conversation_id = c.id
   and c.source_type = 'open_need'
   and c.source_id = t.request_id;

-- 6) The raw offer row no longer carries the need id for app roles.
revoke select (request_id) on public.team_demand_offers from authenticated;

-- 7) The retired Model A pair, closed to app roles.
revoke execute on function public.list_open_demand_for_agencies() from public, anon, authenticated;
revoke execute on function public.mark_agency_can_offer(uuid, text) from public, anon, authenticated;

commit;
