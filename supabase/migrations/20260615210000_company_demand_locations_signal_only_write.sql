-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude review.
-- Never `db push`.
--
-- Company demand locations — signal-only write hardening (v1.1).
--
-- WHY: the #423 owner write policy gated only `owner_id = auth.uid()` + demand
-- ownership. It did NOT restrict coordinates or geocode_status, so an
-- authenticated user could bypass the app helper via a direct PostgREST write
-- and self-insert, ON THEIR OWN DEMAND, a row with geocode_status='verified',
-- geo_precision='coordinates' and real latitude/longitude — i.e. fabricate a
-- "verified" map point. The app helper is already signal-only; this closes the
-- DB so the rule holds for ALL client writes, not just the app path.
--
-- MODEL (this migration):
--   * the owner write path (insert AND update via the user's own client) may
--     ONLY create SIGNAL-ONLY rows: latitude/longitude null, geo_precision
--     not 'coordinates', geocode_status in ('pending','manual');
--   * 'verified' + coordinates are RESERVED for a future admin/geocoder path
--     (a SECURITY DEFINER RPC bypasses RLS — not built here);
--   * a partial unique index prevents EXACT-duplicate signal rows per demand
--     (genuine multi-site demands stay allowed: different country/city/label/
--     address = different rows).
--
-- Additive/idempotent where possible; the only mutation is replacing the write
-- POLICY (drop + recreate in one transaction — no open window). No table/column
-- drop, no data change, no grant change, no new SECURITY DEFINER function.
-- The DROP/CREATE POLICY is the migration-safety RED flag → @human-gate.
--
-- ROLLBACK: supabase/rollbacks/20260615210000_company_demand_locations_signal_only_write.down.sql
--   (drops the dedup index and restores the prior, unclamped owner write policy).
-- ============================================================================

-- @human-gate-approved
begin;

-- 1) Clamp the owner write path (insert + update) to SIGNAL-ONLY rows.
drop policy if exists company_demand_locations_write on public.company_demand_locations;
create policy company_demand_locations_write on public.company_demand_locations
  for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
        from public.customer_requests cr
       where cr.id = request_id
         and cr.profile_id = auth.uid()
    )
    and latitude is null
    and longitude is null
    and geo_precision <> 'coordinates'
    and geocode_status in ('pending', 'manual')
  );

-- 2) Prevent EXACT-duplicate signal rows per demand. Multi-site stays allowed:
--    a different country / city / label / address is a different row.
create unique index if not exists company_demand_locations_signal_dedup_idx
  on public.company_demand_locations (
    request_id,
    country_code,
    coalesce(lower(city), ''),
    coalesce(lower(location_label), ''),
    coalesce(lower(address_text), '')
  )
  where latitude is null;

commit;

-- ROLLBACK (see the .down.sql sibling):
--   drop index if exists public.company_demand_locations_signal_dedup_idx;
--   drop policy if exists company_demand_locations_write on public.company_demand_locations;
--   create policy company_demand_locations_write ... (prior unclamped owner policy)
