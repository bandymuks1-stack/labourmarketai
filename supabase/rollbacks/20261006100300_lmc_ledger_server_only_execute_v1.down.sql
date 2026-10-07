-- ROLLBACK of 20261006100300_lmc_ledger_server_only_execute_v1.
-- Restores the previous (unintended) platform-default `authenticated` EXECUTE on
-- the twelve server-only lmc_* functions. NOTE: this re-opens the authority gap
-- the forward migration closes; use only to revert a deployment problem.
begin;

grant execute on function public.lmc_require_flag_v1(text) to authenticated;
grant execute on function public.lmc_set_flag_v1(text, boolean, uuid) to authenticated;
grant execute on function public.lmc_ensure_account_v1(uuid, uuid) to authenticated;
grant execute on function public.lmc_assert_external_idempotency_key_v1(text) to authenticated;
grant execute on function public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text, timestamptz, uuid, text) to authenticated;
grant execute on function public.lmc_admin_grant_existing_v1(text, uuid, text, bigint, text, text, timestamptz, boolean) to authenticated;
grant execute on function public.lmc_grant_promotional_v1(text, uuid, text, text) to authenticated;
grant execute on function public.lmc_record_purchase_v1(bigint, text, text, uuid, uuid) to authenticated;
grant execute on function public.lmc_spend_v1(bigint, text, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.lmc_expire_lots_v1(int) to authenticated;
grant execute on function public.lmc_reverse_v1(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.lmc_compensate_spend_v1(uuid, text, text, uuid, bigint) to authenticated;

commit;
