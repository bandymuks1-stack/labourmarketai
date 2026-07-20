-- Rollback for 20260720190000_lmc_ledger_foundation_v1.sql
-- Removes ONLY the Wagon 1 LMC objects. No unrelated table, policy, grant or
-- function is touched (billing tables, finance/operator records, plans,
-- profiles, companies and audit_logs rows are preserved — audit_logs rows
-- written by LMC RPCs are ordinary append-only audit data and are kept).
--
-- Human-gated like the forward migration. Never run against production
-- without an explicit owner decision and a data-preservation review.

begin;

-- ── Zero-row safety guard (AGENTS.md: DROP TABLE only after asserting the
-- target has zero rows). If ANY committed ledger row exists, this rollback
-- REFUSES to run: dropping an immutable financial ledger with data is an
-- owner-only decision. The explicit override below exists ONLY for local
-- scratch databases (the db-proof harness sets it); never set it against
-- production.
--   select set_config('lmc.force_rollback', 'force-delete-scratch-ledger', false);
do $guard$
declare
  v_rows bigint := 0;
  v_part bigint;
  v_force text := coalesce(current_setting('lmc.force_rollback', true), 'off');
  t text;
begin
  foreach t in array array[
    'public.lmc_transactions', 'public.lmc_lots',
    'public.lmc_lot_consumptions', 'public.lmc_accounts']
  loop
    if to_regclass(t) is not null then
      execute format('select count(*) from %s', t) into v_part;
      v_rows := v_rows + coalesce(v_part, 0);
    end if;
  end loop;
  if v_rows > 0 and v_force <> 'force-delete-scratch-ledger' then
    raise exception 'lmc_rollback_refused: % committed ledger row(s) exist — dropping a populated immutable ledger is an owner-only decision (scratch override: lmc.force_rollback)',
      v_rows using errcode = '42501';
  end if;
end;
$guard$;

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
drop function if exists public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text, timestamptz);
drop function if exists public.lmc_assert_external_idempotency_key_v1(text);
-- Pre-rev3/rev4 signatures (never shipped to production; scratch hygiene only).
drop function if exists public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text);
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

-- Flag helpers last (referenced by dropped triggers/RPCs only).
drop function if exists public.lmc_require_flag_v1(text);
drop function if exists public.lmc_flag_enabled(text);

commit;
