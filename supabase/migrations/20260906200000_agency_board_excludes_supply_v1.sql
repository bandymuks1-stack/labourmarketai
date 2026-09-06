-- 20260906200000_agency_board_excludes_supply_v1
--
-- @human-gate-approved
--
-- The annotation is an ACKNOWLEDGEMENT, not an auto-merge pass: it lets CI
-- report the two intentional findings (SECURITY DEFINER body replace, and the
-- GRANT/REVOKE that re-asserts the existing privilege set) without masking
-- them, and it moves this PR to the RED class.
--
-- RED CLASS — SECURITY DEFINER body replace. Applied via Supabase MCP
-- `apply_migration`. Never `supabase db push`.
--
-- ── THE FIFTH SURFACE OF THE SAME DEFECT ─────────────────────────────────
--
-- Window 8 closed four surfaces that could not tell the two DIRECTIONS of
-- the market apart, and #1588 closed the worker board. This is the same
-- defect, one surface further out, found by sweeping every SECURITY DEFINER
-- reader of `customer_requests` for a body that never mentions `kind`.
--
-- `list_open_demand_for_agencies()` is the gated read behind the agency's
-- "open demand" board — the work an agency can offer its people for. It
-- selects EVERY `customer_requests` row with `status = 'submitted'`, with NO
-- filter on `kind`.
--
-- So an agency browsing for work to fill is shown OTHER AGENCIES' OFFERS as
-- demand it could staff. Measured on production 2026-09-06, called through
-- the real RPC under a real agency's own auth context:
--
--   rows the agency sees              12
--   of which kind = 'agency_offer'     2   ← supply rendered as demand
--   of which kind = 'company_request' 10
--
-- Two agencies both saying "we have people" are shown each other as
-- customers. That is the same inversion the worker board had: a board whose
-- whole meaning is one direction, serving rows from the other.
--
-- ── WHAT THIS CHANGES ────────────────────────────────────────────────────
--
-- ONE added predicate, identical in shape and reasoning to the one #1588 put
-- on the worker board. Everything else is byte-identical to the live body:
-- same signature, same columns, same SECURITY DEFINER, same `search_path`,
-- same agency-only caller gate, same ordering, same limit, same grants.
--
--   and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
--
-- `kind is null` is required for the same reason as on the worker board:
-- rows written by the original `save_customer_request` (migration 0028)
-- predate the `kind` column and are genuine demand.
--
-- The list is a CLOSED ALLOW-LIST, not a deny-list of `agency_offer`, so a
-- future supply-side kind is invisible to this board by DEFAULT and becomes
-- visible only by a deliberate edit here. This mirrors
-- `apps/web/lib/demand/market-direction.ts`, which is the ONE closed-set
-- direction rule for the TypeScript surfaces; the guard
-- `market-direction-surfaces.test.ts` fails on a deny-list.
--
-- NOT WIDENED: strictly narrowing. No new row becomes visible to anyone, no
-- policy is touched, no grant changes, no column is added. An agency sees a
-- SUBSET of what it sees today.
--
-- An agency does NOT stop seeing its own offers: those are read by
-- `listOwnCustomerRequests` (the readback #1591 split into needs vs offered
-- capacity), not by this board. Verified on production — of the 12 rows this
-- agency saw, 3 were its own, and its own OFFERS are read back under
-- "Jūsų pasiūlyti pajėgumai" by a different path entirely.
--
-- ── RECREATE, NOT ALTER ──────────────────────────────────────────────────
--
-- `create or replace function` keeps NONE of the properties the new
-- definition omits — it re-defaults each one. The live function is
--
--   STABLE SECURITY DEFINER SET search_path TO 'public'
--
-- (read with `pg_get_functiondef`), so all three are restated below. This is
-- not theoretical: the first draft of #1588 omitted `stable` and would have
-- silently downgraded a read-only function to VOLATILE.
--
-- ROLLBACK: supabase/rollbacks/20260906200000_agency_board_excludes_supply_v1.down.sql
-- restores the current live body verbatim. Reversible with no data change —
-- this migration writes no rows and alters no table.

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
     -- DIRECTION OF THE MARKET. This board is the work an agency can staff,
     -- so it shows DEMAND. `agency_offer` is another agency offering the
     -- people it HAS - supply - and rendering it here shows two agencies
     -- each other as customers. Closed allow-list: a future supply kind is
     -- invisible by default. The null branch keeps the pre-`kind` rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
   order by cr.created_at desc
   limit 100;
end
$$;

-- Re-assert the live privilege set exactly. `from anon` is NAMED, not merely
-- covered by `from public`: the 2026-07-22 secdef closure migration cannot
-- reach a function replaced after it, and on a clean local reset the
-- environment's default privileges can hand anon EXECUTE.
revoke all on function public.list_open_demand_for_agencies() from public;
revoke all on function public.list_open_demand_for_agencies() from anon;
grant execute on function public.list_open_demand_for_agencies() to authenticated;
