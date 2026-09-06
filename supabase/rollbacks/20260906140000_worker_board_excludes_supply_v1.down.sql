-- Rollback for 20260906140000_worker_board_excludes_supply_v1
--
-- Restores the CURRENT live body of `list_open_demand_for_workers()` — the
-- same function WITHOUT the `kind` predicate the forward migration adds.
-- Byte-identical to production as read on 2026-09-06 (`pg_get_functiondef`),
-- including `security definer` and `set search_path = public`, which a
-- `create or replace` would otherwise drop.
--
-- Safe and complete: the forward migration writes no rows and alters no
-- table, so reverting the body is the whole rollback. Applying this makes
-- agency_offer rows visible to workers again (the defect), which is the
-- intended pre-migration state.

create or replace function` DROPS a function's `SET` configuration when
-- the new definition omits it (trap recorded 2026-09-03: a replaced body
-- silently lost `search_path`, leaving a SECURITY DEFINER function with the
-- caller's search_path). `set search_path = public` is therefore restated
-- below, and the grants are re-asserted after the replace so the live
-- privilege set (postgres, authenticated) is reproduced exactly rather than
-- assumed to survive.
--
-- ROLLBACK: supabase/rollbacks/20260906140000_worker_board_excludes_supply_v1.down.sql
-- restores the CURRENT live body verbatim (the same function without the
-- predicate). Reversible with no data change — this migration writes no
-- rows and alters no table.

create or replace function public.list_open_demand_for_workers()
returns table (
  id uuid,
  role_text text,
  country text,
  team_size integer,
  start_period text,
  accommodation text,
  created_at timestamptz,
  company_name text,
  route_status text,
  location_label text,
  transport text,
  required_tools text[],
  structured jsonb
)
language plpgsql
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
         -- Worker-safe structured_v2 projection — SQL-side whitelist, never
         -- the raw payload (see demand_structured_v2_public).
         public.demand_structured_v2_public(cr.payload -> 'structured_v2')
           as structured
    from public.customer_requests cr
    join public.companies c
      on c.profile_id = cr.profile_id
     and c.verification_status = 'verified'
   where cr.status = 'submitted'
   order by cr.created_at desc
   limit 100;
end
$$;

-- Re-assert the live privilege set exactly (a replace does not drop these,
-- but stating them keeps the migration self-contained and idempotent).
revoke all on function public.list_open_demand_for_workers() from public;
revoke all on function public.list_open_demand_for_workers() from anon;
grant execute on function public.list_open_demand_for_workers() to authenticated;

