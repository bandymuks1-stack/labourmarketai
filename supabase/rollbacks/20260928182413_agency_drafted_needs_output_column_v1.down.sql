-- ROLLBACK for 20260928182413_agency_drafted_needs_output_column_v1.sql
-- RECONSTRUCTED after the production apply; the production ledger stored NO rollback.
-- This migration replaced public.list_agency_drafted_needs_v1() with a version that also
-- returns `shared`. Reverting means re-creating the PREVIOUS definition from the migration
-- that introduced the function; it is not reproduced here to avoid inventing SQL that was
-- never applied. Production incident path: forward-fix. Local resets only:
drop function if exists public.list_agency_drafted_needs_v1();
