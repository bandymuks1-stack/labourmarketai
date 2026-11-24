-- ============================================================================
-- 20260705130000 — worker demand location label (PR8, Market Map / Location).
-- Recreates list_open_demand_for_workers() ADDING ONE curated column:
--
--   location_label — the demand's COARSE place name (city/region granularity),
--   coalesced from the owner's structured market-map location
--   (company_demand_locations.city → .location_label) and falling back to the
--   demand's own free-text location field, trimmed. It is the BUSINESS
--   location of a VERIFIED company's demand — the same granularity the market
--   map is designed around ("signal-only" layer, 20260615210000).
--
-- WHY: matching (PR4/PR5) supports city-level location fit end-to-end, but
-- the worker-visible RPC exposed only the country — so a worker's own
-- preferred city (preferred_locations, own-rows RLS) had nothing to match
-- against and the city tier of the engine was data-starved on the worker
-- side. This closes exactly that gap with ONE coarse label.
--
-- WHAT IS DELIBERATELY NOT EXPOSED (unchanged exclusions):
--   - address_text / locality (finer than city) — NEVER;
--   - free-text title / need_summary / notes / payload.role — NEVER;
--   - contacts / profile ids — NEVER;
--   - worker locations flow NOWHERE here — this is company→worker business
--     data only; preferred_locations stays own-rows-only (§20).
--
-- Everything else is byte-identical to the applied Model-A definition
-- (20260702170000): worker-only caller gate, verified-company approval join,
-- accommodation whitelist, pinned search_path, definer read, execute
-- revoked from public and granted to authenticated.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER recreate +
-- GRANT are RED-class). Ships as a needs-human-gate DRAFT with the exact
-- SQL; prod apply stays manual via Supabase MCP after DI approval — never
-- db push. Rollback restores the exact Model-A definition.
-- ============================================================================

begin;

drop function if exists public.list_open_demand_for_workers();

create or replace function public.list_open_demand_for_workers()
returns table (
  id             uuid,
  role_text      text,
  country        text,
  team_size      int,
  start_period   text,
  accommodation  text,
  created_at     timestamptz,
  company_name   text,
  route_status   text,
  location_label text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker → empty, never an error surface
  end if;

  return query
  select cr.id,
         -- Structured columns ONLY — never the free-text title / need_summary /
         -- notes, never payload.role.
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
         -- Model A: identity of the VERIFIED company only.
         coalesce(
           nullif(trim(c.display_name), ''),
           nullif(trim(c.legal_name), '')
         ) as company_name,
         'approved_direct_partner'::text as route_status,
         -- COARSE place label (city/region) — structured market-map location
         -- first, demand's own location text as fallback. NEVER address_text,
         -- NEVER locality.
         coalesce(
           (select nullif(trim(coalesce(cdl.city, cdl.location_label)), '')
              from public.company_demand_locations cdl
             where cdl.request_id = cr.id
               and cdl.active
             order by cdl.updated_at desc
             limit 1),
           nullif(trim(cr.location), '')
         ) as location_label
    from public.customer_requests cr
    join public.companies c
      on c.profile_id = cr.profile_id
     and c.verification_status = 'verified'   -- the approval gate (model A)
   where cr.status = 'submitted'
   order by cr.created_at desc
   limit 100;
end $$;

revoke all on function
  public.list_open_demand_for_workers() from public;
grant execute on function
  public.list_open_demand_for_workers() to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260705130000_worker_demand_location_label.down.sql
-- restores the exact 20260702170000 Model-A definition (no location_label).
