-- DOWN / rollback for 20260705210000_worker_demand_required_tools.sql
--
-- Restores the EXACT prior repo-latest definition (20260705200000 — the
-- transport recreate, which itself carries the applied Model-A body
-- 20260702170000 + the location_label column 20260705130000 + the transport
-- enum column) — the required_tools column disappears and the app's loader
-- degrades gracefully (need.requiredTools becomes null; the board shows the
-- honest "not stated"). No table, no data is touched. Apply via Supabase MCP
-- apply_migration, never db push.
--
-- NOTE: if 20260705200000 was NOT applied to prod before this migration
-- (i.e. this one is rolled back on top of an older applied definition),
-- restore the definition that was actually live instead — the loader
-- tolerates the absence of the optional columns either way.

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
  location_label text,
  transport      text
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
         ) as location_label,
         -- Transport condition — STRICT enum whitelist mirroring the
         -- accommodation projection. Anything outside the closed set (incl.
         -- any free text) projects as NULL, never reaches a worker.
         case
           when cr.payload ->> 'transport' in (
             'provided', 'compensated', 'not_provided', 'unknown'
           ) then cr.payload ->> 'transport'
           else null
         end as transport
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
