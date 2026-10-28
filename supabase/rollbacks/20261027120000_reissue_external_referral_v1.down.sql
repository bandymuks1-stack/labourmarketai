-- Rollback for 20261027120000_reissue_external_referral_v1
-- Drops ONLY the two service_role functions the forward migration created.
-- No table, column, policy or row is touched by the rollback. Tokens already
-- rotated by reissue_external_referral_v1 stay rotated (they are the links
-- that were e-mailed); the original tokens were never stored, so there is
-- nothing to restore. Apply via Supabase MCP apply_migration.

begin;

drop function if exists public.reissue_external_referral_v1(uuid, text);
drop function if exists public.external_referral_reprocess_candidates_v1();

commit;
