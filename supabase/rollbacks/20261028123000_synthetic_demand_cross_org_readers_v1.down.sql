-- Rollback for 20261028123000_synthetic_demand_cross_org_readers_v1
-- Restores the three cross-organization demand readers exactly as the repo
-- last defined them, byte-for-byte:
--   list_open_demand_for_agencies()          from 20261003150000_org2_agency_capability_authority_v1
--   list_open_demand_for_workers()           from 20261020010000_demand_company_one_rule_v1 (ledger 20261020022321, MATCH)
--   list_open_demand_for_team_offer_v1(uuid) from 20261020010000_demand_company_one_rule_v1 (ledger 20261020022321, MATCH)
-- then drops the three helpers the forward migration added. Signatures,
-- SECURITY DEFINER, search_path and grants are the same in both directions.
-- No data impact (the forward migration writes no row).
-- Apply via Supabase MCP apply_migration — never `supabase db push`.

begin;

create or replace function public.list_open_demand_for_agencies()
returns table (
  id uuid,
  role_text text,
  country text,
  team_size integer,
  start_period text,
  duration text,
  created_at timestamptz,
  can_offer_marked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_company uuid;
  v_legacy  uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  v_company := public.caller_agency_company_id();
  if v_company is null then
    return;
  end if;
  select a.id into v_legacy from public.agencies a where a.profile_id = uid;

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         cr.duration,
         cr.created_at,
         exists (
           select 1
           from jsonb_array_elements(
                  coalesce(cr.payload -> 'agency_offers', '[]'::jsonb)
                ) o
           where o ->> 'agency_id' = v_company::text
              or (v_legacy is not null and o ->> 'agency_id' = v_legacy::text)
         )
    from public.customer_requests cr
   where cr.status = 'submitted'
     -- DIRECTION OF THE MARKET (unchanged): demand only; a future supply kind
     -- is invisible by default. The null branch keeps the pre-kind rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
   order by cr.created_at desc
   limit 100;
end
$$;

revoke all on function public.list_open_demand_for_agencies() from public, anon;
grant execute on function public.list_open_demand_for_agencies() to authenticated;

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

revoke all on function public.list_open_demand_for_workers() from public, anon;
grant execute on function public.list_open_demand_for_workers() to authenticated;

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

revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public, anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;

-- The readers above no longer call the helpers, so they can go.
drop function if exists public.demand_is_synthetic_fixture_v1(uuid, uuid);
drop function if exists public.is_synthetic_viewer_v1();
drop function if exists public.is_synthetic_fixture_label_v1(text[]);

commit;
