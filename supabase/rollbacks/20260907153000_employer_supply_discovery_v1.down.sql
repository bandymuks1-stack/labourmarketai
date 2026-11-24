-- Rollback for 20260907153000_employer_supply_discovery_v1
--
-- The forward migration CREATES one function and does nothing else: no table,
-- no policy, no existing privilege, no row. Dropping the function is therefore
-- the whole rollback, and it is complete and lossless.
--
-- Safe to run whether or not the forward migration was applied (`if exists`).
-- After this, employers can no longer discover available workforce — which is
-- by definition the pre-migration state.

drop function if exists public.list_open_supply_for_employers();
