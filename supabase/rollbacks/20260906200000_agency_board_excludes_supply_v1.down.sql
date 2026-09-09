-- Rollback for 20260906200000_agency_board_excludes_supply_v1
--
-- Restores the CURRENT live body of `list_open_demand_for_agencies()` — the
-- same function WITHOUT the `kind` predicate the forward migration adds.
-- Verified against production 2026-09-06 with `pg_get_functiondef`: the live
-- function is `STABLE SECURITY DEFINER` with `SET search_path TO 'public'`,
-- and all three properties are restated below, because a `create or replace`
-- keeps none of the properties the new definition omits.
--
-- Generated from the forward migration's own body with the direction
-- predicate removed, so the pair cannot drift apart by hand. (#1588 shipped a
-- hand-written rollback that a paste fault had left invalid; this is why.)
--
-- Safe and complete: the forward migration writes no rows and alters no
-- table, so restoring the body is the whole rollback. Applying this makes
-- agency_offer rows visible on the agency demand board again (the defect),
-- which is by definition the intended pre-migration state.

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
  uid      uuid := auth.uid();
  v_agency uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select a.id into v_agency from public.agencies a where a.profile_id = uid;
  if v_agency is null then
    return;
  end if;

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
           where o ->> 'agency_id' = v_agency::text
         )
    from public.customer_requests cr
   where cr.status = 'submitted'
   order by cr.created_at desc
   limit 100;
end
$$;

-- Re-assert the live privilege set exactly, as the forward migration does.
revoke all on function public.list_open_demand_for_agencies() from public;
revoke all on function public.list_open_demand_for_agencies() from anon;
grant execute on function public.list_open_demand_for_agencies() to authenticated;
