-- ============================================================================
-- ROLLBACK for 20260627174500_requester_identity_for_provider.sql
--
-- Fully reversible: the migration adds ONLY a read function (no table, column,
-- policy, grant on any table, or data). Dropping the function restores the prior
-- state exactly. The app degrades gracefully (provider inbox renders without the
-- requester name) once the function is gone, so this rollback is side-effect free.
-- ============================================================================

begin;

drop function if exists public.requester_identities_for_provider(uuid[]);

commit;
