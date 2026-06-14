-- ============================================================================
-- RED / OWNER-GATED — NOT YET APPLIED. Apply to prod via Supabase MCP
-- `apply_migration` after owner + Chat-Claude review. Never `db push`.
--
-- Worker demand visibility — the narrowest possible bridge that lets a WORKER
-- see open employer demand on their opportunities board, with NO RLS widening
-- (mirrors the applied agency bridge 20260611150000_s5_agency_demand_visibility).
--
--   public.list_open_demand_for_workers() -> setof curated row
--     Caller gate: the caller OWNS a worker (workers.profile_id = auth.uid()).
--     Returns ONLY status='submitted' customer_requests and ONLY a curated,
--     non-personal column set: id, role_text (role_or_work_type), country,
--     team_size, start_period, accommodation (payload enum value), created_at.
--     NEVER profile_id, NEVER location/contacts, NEVER the free-text
--     need_summary / notes. Definer read; the customer_requests SELECT RLS
--     (owner-or-admin, 0028) stays untouched.
--
-- This read-only function is what lights up the already-shipped worker board
-- (app/[locale]/dashboard/opportunities + lib/opportunities/*). Until it
-- exists the board honestly shows a "being prepared" state and never fakes a
-- need; the moment it exists the board returns real demand with no code change.
--
-- Doctrine §4: default-closed preserved — visibility goes through a gated
-- DEFINER function with a curated projection, not a policy. §19: nothing here
-- ranks anything; the list is recency-ordered facts. §7: no match decision is
-- made here. ROLLBACK at the bottom (new function only; fully reversible).
-- ============================================================================

begin;

-- ── list_open_demand_for_workers: curated open-demand read ────────────────
create or replace function public.list_open_demand_for_workers()
returns table (
  id            uuid,
  role_text     text,
  country       text,
  team_size     int,
  start_period  text,
  accommodation text,
  created_at    timestamptz
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
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         -- accommodation is an enum offer value (provided_free / provided_paid
         -- / provided_deducted / not_provided), not free text → safe to expose.
         nullif(btrim(coalesce(cr.payload ->> 'accommodation', '')), '') as accommodation,
         cr.created_at
    from public.customer_requests cr
   where cr.status = 'submitted'
   order by cr.created_at desc
   limit 100;
end $$;

revoke all on function
  public.list_open_demand_for_workers() from public;
grant execute on function
  public.list_open_demand_for_workers() to authenticated;

commit;

-- ROLLBACK (reverse SQL — new function only; reversible):
-- drop function if exists public.list_open_demand_for_workers();
