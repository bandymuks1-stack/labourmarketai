-- Rollback for 20260720190000_lmc_ledger_foundation_v1.sql
-- Removes ONLY the Wagon 1 LMC objects. No unrelated table, policy, grant or
-- function is touched (billing tables, finance/operator records, plans,
-- profiles, companies and audit_logs rows are preserved — audit_logs rows
-- written by LMC RPCs are ordinary append-only audit data and are kept).
--
-- Human-gated like the forward migration. Never run against production
-- without an explicit owner decision and a data-preservation review.

begin;

-- Views first (depend on tables).
drop view if exists public.lmc_account_balances;
drop view if exists public.lmc_lot_balances;

-- RPCs / helpers.
drop function if exists public.lmc_reverse_v1(uuid, text, text, text);
drop function if exists public.lmc_expire_lots_v1(int);
drop function if exists public.lmc_spend_v1(bigint, text, text, uuid, uuid);
drop function if exists public.lmc_admin_grant_v1(text, bigint, text, text, timestamptz, text);
drop function if exists public.lmc_record_purchase_v1(bigint, text, text, uuid, uuid);
drop function if exists public.lmc_grant_promotional_v1(text, uuid, text, text);
drop function if exists public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text);
-- Pre-rev3 signature (never shipped to production; scratch hygiene only).
drop function if exists public.lmc_existing_by_idempotency_v1(uuid, text, text);
drop function if exists public.lmc_ensure_account_v1(uuid, uuid);

-- Triggers + trigger functions.
drop trigger if exists lmc_transactions_referral_guard on public.lmc_transactions;
drop trigger if exists lmc_transactions_append_only on public.lmc_transactions;
drop trigger if exists lmc_lots_append_only on public.lmc_lots;
drop trigger if exists lmc_lot_consumptions_append_only on public.lmc_lot_consumptions;
drop trigger if exists lmc_accounts_immutable on public.lmc_accounts;
drop function if exists public.lmc_referral_insert_guard();
drop function if exists public.lmc_forbid_mutation();

-- Policies.
drop policy if exists lmc_lot_consumptions_select on public.lmc_lot_consumptions;
drop policy if exists lmc_lots_select on public.lmc_lots;
drop policy if exists lmc_transactions_select on public.lmc_transactions;
drop policy if exists lmc_accounts_select on public.lmc_accounts;
drop policy if exists lmc_settings_select on public.lmc_settings;

-- Tables (children first).
drop table if exists public.lmc_lot_consumptions;
drop table if exists public.lmc_lots;
drop table if exists public.lmc_transactions;
drop table if exists public.lmc_accounts;
drop table if exists public.lmc_settings;

-- Flag helper last (referenced by dropped triggers only).
drop function if exists public.lmc_flag_enabled(text);

commit;
