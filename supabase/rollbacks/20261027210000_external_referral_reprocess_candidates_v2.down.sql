-- Rollback for 20261027210000_external_referral_reprocess_candidates_v2
-- Drops ONLY the read-only function the forward migration created. No data
-- impact. The runner then reports needs_migration and sends nothing.
-- Apply via Supabase MCP apply_migration.

begin;

drop function if exists public.external_referral_reprocess_candidates_v2();

commit;
