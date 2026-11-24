-- DOWN / rollback for 20260705200000_worker_demand_transport.sql
--
-- Restores the TRUE PREDECESSOR definition VERBATIM: the 20260705130000
-- location-label body (the applied Model-A body 20260702170000 + the ONE
-- coarse location_label column). The transport column disappears and the
-- app's loader degrades gracefully (need.transport becomes null; the board
-- shows "—"). No table, no data is touched. Apply via Supabase MCP
-- apply_migration, never db push.
--
-- HISTORY (wagon-3 rollback caveat, closed 2026-07-05): the first version of
-- this file restored the OLDER Model-A-only body (20260702170000), silently
-- dropping the location_label column on rollback. Corrected to restore the
-- immediately-previous definition (20260705130000) — rollback-file-only fix,
-- no migration semantics change. Guard-pinned in
-- apps/web/lib/guards/equipment-tools-layer.test.ts (rollback-chain block).

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
