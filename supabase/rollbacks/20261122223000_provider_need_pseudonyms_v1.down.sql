-- Rollback for 20261122223000_provider_need_pseudonyms_v1
-- Restores the 20261122214700 bodies of the seven changed functions byte for
-- byte, re-keys open-need threads to the need id (the 20261122214700 shape),
-- restores the team_demand_offers.request_id column grant and the retired pair's
-- execute grant, then drops the alias functions, and the alias table when it is empty.
-- Apply via Supabase MCP apply_migration.

begin;

update public.conversations c
   set source_id = t.request_id
  from public.open_need_threads t
 where t.conversation_id = c.id
   and c.source_type = 'open_need';

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
  v_sees_fixtures := public.is_synthetic_viewer_v1()
    or exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name));

  return query
  select cr.id,
         coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')),
         cr.country,
         cr.team_size,
         cr.start_period,
         -- OPEN NEED (20261122160000): the client is not named on the board.
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
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end;
$function$;
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public, anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated, service_role;

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
         -- OPEN NEED (20261122160000): named only once the client accepted.
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
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from public, anon;
grant execute on function public.list_team_demand_offers_for_team_v1(uuid) to authenticated, service_role;

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
  return public.open_need_thread_ensure_v1(p_request_id, p_org_id, uid, 'board');
end $function$;
revoke all on function public.open_need_conversation_open_v1(uuid, uuid) from public, anon;
grant execute on function public.open_need_conversation_open_v1(uuid, uuid) to authenticated, service_role;

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
         left(coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')), 120)
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
  values (v_title, 'direct', p_provider, 'open_need', p_request_id)
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
      coalesce(nullif(btrim(cr.role_or_work_type), ''), cr.title) as source_title,
      case when cr.profile_id = auth.uid() then 'company_needs' end
        as source_route_hint
    from public.customer_requests cr
    where c.source_type = 'open_need'
      and cr.id = c.source_id
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
      join public.customer_requests cr on cr.id = c.source_id
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

grant select (request_id) on public.team_demand_offers to authenticated;
-- Re-granted in the original ACL order (authenticated, then service_role).
revoke execute on function public.list_open_demand_for_agencies() from service_role;
grant execute on function public.list_open_demand_for_agencies() to authenticated, service_role;
revoke execute on function public.mark_agency_can_offer(uuid, text) from service_role;
grant execute on function public.mark_agency_can_offer(uuid, text) to authenticated, service_role;

drop function if exists public.provider_need_of_alias_v1(uuid, uuid);
drop function if exists public.provider_need_alias_v1(uuid, uuid);
-- The alias table is dropped only when it is empty (doctrine: no DROP of a
-- table holding rows). Kept otherwise: with the functions gone nothing reads it.
do $$
declare
  v_rows boolean := false;
begin
  if to_regclass('public.provider_need_aliases') is not null then
    execute 'select exists (select 1 from public.provider_need_aliases)' into v_rows;
    if not v_rows then
      execute 'drop table public.provider_need_aliases';
    end if;
  end if;
end $$;

commit;
