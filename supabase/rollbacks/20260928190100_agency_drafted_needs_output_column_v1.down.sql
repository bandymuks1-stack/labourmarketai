-- ROLLBACK for 20260928190100_agency_drafted_needs_output_column_v1.sql
-- RECONSTRUCTED after the production apply; the production ledger stored NO rollback.
-- This migration replaced public.list_agency_drafted_needs_v1() with a version that also
-- returns `shared`. Reverting means re-creating the PREVIOUS definition from the migration
-- that introduced the function (20260928190000_agency_delegated_demand_and_placement_v1.sql);
-- it is not reproduced here to avoid inventing SQL that was never applied. Production incident path: forward-fix. Local resets only:
drop function if exists public.list_agency_drafted_needs_v1();
