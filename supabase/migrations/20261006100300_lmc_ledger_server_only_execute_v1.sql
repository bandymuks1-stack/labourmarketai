-- @human-gate-approved
-- ============================================================================
-- RISK ACKNOWLEDGEMENT, NOT AN APPROVAL. RED by construction (REVOKE/GRANT on
-- SECURITY DEFINER money functions). Route: draft PR + needs-human-gate,
-- owner-channel apply via Supabase MCP apply_migration. NO OWNER APPROVAL
-- EXISTS YET. Must not be applied to production; CI must not auto-merge it.
--
-- 20261006100300 - LMC LEDGER: server-side monetary writes are service_role only
--
-- THE DEFECT (audit 2026-10-06, finding F-8; reproduced on the repo's replayed
-- schema: has_function_privilege('authenticated', <fn>, 'execute') = true).
-- 20260720190000_lmc_ledger_foundation_v1 states its own intent in the grants
-- block: "Function execution: fail closed, then grant narrowly ... Server-side
-- monetary writes only: grant execute ... to service_role", and revokes every
-- lmc_* function FROM PUBLIC. But the platform's default privileges also grant
-- EXECUTE directly to the named roles anon and authenticated, and a revoke from
-- PUBLIC does not touch a grant held by a named role (20260828090000 documents
-- exactly this for anon). The 20260722160000 secdef closure swept `anon` for the
-- functions that existed then and deliberately left `authenticated` (the app
-- calls many definers as authenticated) - so the lmc_* functions kept
-- `authenticated` EXECUTE although the foundation says service_role only.
--
-- Effect: ANY signed-in user can call, through PostgREST, SECURITY DEFINER
-- functions that mint, spend, reverse, expire and grant ledger credit:
--   lmc_record_purchase_v1, lmc_grant_promotional_v1, lmc_reverse_v1,
--   lmc_expire_lots_v1, lmc_spend_v1, lmc_compensate_spend_v1, ...
-- The only thing between them and the ledger is a feature flag
-- (lmc_require_flag_v1), which is a kill switch, not authorization: the day a
-- purchase/grant flag is enabled for the product, every account may call the
-- purchase RPC with an arbitrary amount and reference. (lmc_spend_v1 and
-- lmc_compensate_spend_v1 additionally check that the actor owns the account;
-- the purchase / promotional / reverse / expire functions do not authenticate
-- the caller at all.)
--
-- INTENT RECOVERED, NOT INVENTED: the application calls exactly two lmc_*
-- functions - lmc_admin_grant_v1 (authenticated admin; in-body is_admin() gate,
-- granted to `authenticated` by the foundation) and lmc_compensate_spend_v1 (via
-- createAdminClient(), i.e. service_role). lmc_flag_enabled / lmc_flag_policy_v1
-- are the read-only, non-secret introspection helpers the foundation grants to
-- authenticated. Everything else is documented service_role-only.
--
-- WHAT CHANGES
--   * REVOKE EXECUTE FROM public, anon, authenticated (idempotent) and
--     (re-)GRANT to service_role on the twelve server-only functions:
--       lmc_require_flag_v1, lmc_set_flag_v1, lmc_ensure_account_v1,
--       lmc_assert_external_idempotency_key_v1, lmc_existing_by_idempotency_v1,
--       lmc_admin_grant_existing_v1, lmc_grant_promotional_v1,
--       lmc_record_purchase_v1, lmc_spend_v1, lmc_expire_lots_v1,
--       lmc_reverse_v1, lmc_compensate_spend_v1.
--
-- WHAT DOES NOT CHANGE
--   * lmc_admin_grant_v1, lmc_flag_enabled, lmc_flag_policy_v1 keep their
--     authenticated grant. SECURITY DEFINER callers still reach the revoked
--     helpers (execute is checked for the function OWNER inside a definer).
--   * No function body is touched - 20261003151000 patches the bodies of
--     lmc_admin_grant_v1 / lmc_grant_promotional_v1 by pg_get_functiondef regex;
--     CREATE OR REPLACE keeps ACLs, and this migration redefines nothing, so the
--     two apply in either order.
--
-- ROLLBACK: supabase/rollbacks/20261006100300_lmc_ledger_server_only_execute_v1.down.sql
-- (restores the previous, unintended `authenticated` EXECUTE).
-- ============================================================================

begin;

revoke all on function public.lmc_require_flag_v1(text) from public, anon, authenticated;
revoke all on function public.lmc_set_flag_v1(text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.lmc_ensure_account_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lmc_assert_external_idempotency_key_v1(text) from public, anon, authenticated;
revoke all on function public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.lmc_admin_grant_existing_v1(text, uuid, text, bigint, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.lmc_grant_promotional_v1(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.lmc_record_purchase_v1(bigint, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lmc_spend_v1(bigint, text, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lmc_expire_lots_v1(int) from public, anon, authenticated;
revoke all on function public.lmc_reverse_v1(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.lmc_compensate_spend_v1(uuid, text, text, uuid, bigint) from public, anon, authenticated;

grant execute on function public.lmc_require_flag_v1(text) to service_role;
grant execute on function public.lmc_set_flag_v1(text, boolean, uuid) to service_role;
grant execute on function public.lmc_ensure_account_v1(uuid, uuid) to service_role;
grant execute on function public.lmc_assert_external_idempotency_key_v1(text) to service_role;
grant execute on function public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text, timestamptz, uuid, text) to service_role;
grant execute on function public.lmc_admin_grant_existing_v1(text, uuid, text, bigint, text, text, timestamptz, boolean) to service_role;
grant execute on function public.lmc_grant_promotional_v1(text, uuid, text, text) to service_role;
grant execute on function public.lmc_record_purchase_v1(bigint, text, text, uuid, uuid) to service_role;
grant execute on function public.lmc_spend_v1(bigint, text, text, uuid, uuid, uuid) to service_role;
grant execute on function public.lmc_expire_lots_v1(int) to service_role;
grant execute on function public.lmc_reverse_v1(uuid, text, text, text, uuid) to service_role;
grant execute on function public.lmc_compensate_spend_v1(uuid, text, text, uuid, bigint) to service_role;

commit;
