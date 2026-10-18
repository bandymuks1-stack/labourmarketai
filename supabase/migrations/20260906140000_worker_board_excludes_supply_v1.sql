-- 20260906140000_worker_board_excludes_supply_v1
--
-- @human-gate-approved
--
-- The annotation is an ACKNOWLEDGEMENT, not an auto-merge pass: it lets CI
-- report the two intentional findings (SECURITY DEFINER body replace, and
-- the GRANT/REVOKE that re-asserts the existing privilege set) without
-- masking them, and it moves this PR to the RED class — draft, labelled
-- `needs-human-gate`, applied only after explicit owner approval.
--
-- RED CLASS — SECURITY DEFINER body replace. Draft PR + `needs-human-gate`
-- + owner approval, applied via Supabase MCP `apply_migration`. Never
-- `supabase db push`.
--
-- ── WHAT IS WRONG ON PRODUCTION TODAY ────────────────────────────────────
--
-- `list_open_demand_for_workers()` is the gated read behind the worker
-- opportunity board. It selects EVERY `customer_requests` row with
-- `status = 'submitted'` whose company is verified — with NO filter on
-- `kind`.
--
-- `kind` distinguishes the two DIRECTIONS of the market:
--
--   company_request  a company NEEDS people          → a worker may act on it
--   buyer_request    a customer needs a job done     → a worker may act on it
--   agency_offer     an agency HAS people to offer   → SUPPLY, not demand
--
-- Measured on production 2026-09-06 (`execute_sql`, read-only):
--
--   kind             submitted + verified company    role_or_work_type null
--   ---------------  ----------------------------    ----------------------
--   company_request  7                               6
--   agency_offer     2                               2
--
-- So 2 of the 9 rows every worker sees on the board — 22% — are agency
-- partnership OFFERS rendered as open jobs. Both are titled "Agency
-- partnership — offer" and carry no role, no country and no headcount,
-- because a supply row was never meant to be read as a vacancy. A worker
-- can express interest in them.
--
-- This is the honesty defect behind owner window 7 §4: the platform must
-- support BOTH "MAN REIKIA" and "AŠ TURIU / GALIU" — and must never show
-- one as the other. It cannot be fixed above the database: the function's
-- closed column whitelist does not return `kind`, so no caller can tell
-- the directions apart.
--
-- ── WHAT THIS CHANGES ────────────────────────────────────────────────────
--
-- ONE added predicate. Everything else is byte-identical to the live body:
-- same signature, same closed column whitelist, same SECURITY DEFINER,
-- same `search_path=public`, same worker-only caller gate, same verified-
-- company join, same ordering, same limit, same grants.
--
--   and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
--
-- `kind is null` is REQUIRED, not defensive: rows written by the original
-- `save_customer_request` (migration 0028) predate the `kind` column and
-- are genuine worker-facing demand. Dropping them would empty the board for
-- the buyer spine. Verified on production: 1 submitted row carries a null
-- kind.
--
-- The list is a CLOSED ALLOW-LIST, not a deny-list of `agency_offer`: a
-- future supply-side kind must be invisible to workers by DEFAULT and
-- become visible only by a deliberate edit here.
--
-- NOT WIDENED: this is strictly narrowing. No new row becomes visible to
-- anyone, no policy is touched, no grant changes, no column is added to the
-- whitelist. A worker sees a SUBSET of what they see today.
--
-- ── RECREATE, NOT ALTER ──────────────────────────────────────────────────
--
-- `create or replace function` DROPS a function's `SET` configuration when
-- the new definition omits it (trap recorded 2026-09-03: a replaced body
-- silently lost `search_path`, leaving a SECURITY DEFINER function with the
-- caller's search_path). `set search_path = public` is therefore restated
-- below, and the grants are re-asserted after the replace so the live
-- privilege set (postgres, authenticated) is reproduced exactly rather than
-- assumed to survive.
--
-- VOLATILITY IS THE SAME TRAP, AND THIS MIGRATION FELL INTO IT (found
-- 2026-09-06, before apply). A replace with no volatility marker does not
-- keep the old one — it resets the function to the VOLATILE default. Read
-- from production with `pg_get_functiondef`, the live function is
-- `STABLE SECURITY DEFINER`; the first draft of this migration declared
-- only `security definer`, so applying it would have silently downgraded a
-- read-only function to VOLATILE and cost the planner every stable-function
-- optimisation on the board read. `stable` is therefore restated below.
-- The rule generalises: a `create or replace` must restate EVERY property
-- of the live definition, because the parser defaults each omitted one.
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
     -- DIRECTION OF THE MARKET (owner window 7 §4). A worker board shows
     -- DEMAND. `agency_offer` is an agency offering the people it HAS —
     -- supply — and rendering it here presents an offer as a vacancy.
     -- Closed allow-list: a future supply kind is invisible by default.
     -- The null branch keeps the pre-`kind` buyer-spine rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
   order by cr.created_at desc
   limit 100;
end
$$;

-- Re-assert the live privilege set exactly (a replace does not drop these,
-- but stating them keeps the migration self-contained and idempotent).
--
-- `from anon` is NAMED, not merely covered by `from public`: the 2026-07-22
-- secdef closure migration revokes anon from every SECURITY DEFINER function
-- it knows about, and it cannot reach one created after it. On a clean local
-- reset the environment's default privileges can hand anon EXECUTE, so a
-- function that relies on `from public` alone is anon-reachable there while
-- looking closed in production. The guard
-- (`secdef-local-reset-reproducibility`) enforces exactly this.
revoke all on function public.list_open_demand_for_workers() from public;
revoke all on function public.list_open_demand_for_workers() from anon;
grant execute on function public.list_open_demand_for_workers() to authenticated;
