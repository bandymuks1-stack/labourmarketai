-- DOWN / rollback for 20260705200000_worker_demand_transport.sql
--
-- Restores the EXACT applied Model-A definition (20260702170000, incl. the
-- counterpart columns company_name + route_status) — the transport column
-- disappears and the app's loader degrades gracefully (need.transport becomes
-- null; the board shows "—"). No table, no data is touched. Apply via
-- Supabase MCP apply_migration, never db push.
--
-- NOTE: if the location-label draft (20260705130000) was applied to prod
-- AFTER 20260702170000, re-apply it after this rollback to restore the
-- location_label column (the loader tolerates its absence either way).

begin;

drop function if exists public.list_open_demand_for_workers();

create or replace function public.list_open_demand_for_workers()
returns table (
  id            uuid,
  role_text     text,
  country       text,
  team_size     int,
  start_period  text,
  accommodation text,
  created_at    timestamptz,
  company_name  text,
  route_status  text
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
         -- notes, never payload.role, never payload.location.
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
         -- Model A: identity of the VERIFIED company only. Coalesce of the
         -- trimmed display/legal name; NULL never leaks anything.
         coalesce(
           nullif(trim(c.display_name), ''),
           nullif(trim(c.legal_name), '')
         ) as company_name,
         'approved_direct_partner'::text as route_status
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
