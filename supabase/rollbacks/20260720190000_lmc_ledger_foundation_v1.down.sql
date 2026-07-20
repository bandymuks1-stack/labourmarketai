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
-- target has zero rows). If ANY row exists in the LMC tables — including
-- the always-seeded (and possibly owner-modified) lmc_settings — this
-- rollback REFUSES to run without the explicit approval override below.
-- Because the forward migration always seeds lmc_settings, running this
-- rollback ALWAYS requires the override: removing the ledger foundation is
-- never a silent side effect. Setting the override against production is an
-- owner-only decision; the localhost-guarded db-proof harness sets it for
-- scratch databases.
--   select set_config('lmc.force_rollback', 'lmc-ledger-removal-approved', false);
do $guard$
declare
  v_rows bigint := 0;
  v_part bigint;
  v_force text := coalesce(current_setting('lmc.force_rollback', true), 'off');
  t text;
begin
  -- EXCLUSIVE LMC maintenance advisory lock FIRST: every write RPC holds the
  -- shared counterpart for its transaction, so this waits for in-flight
  -- writers to commit and queues later writers — the table locks below can
  -- then be taken in any order without deadlocking against an RPC.
  perform pg_advisory_xact_lock(hashtext('lmc_ledger')::bigint);
  -- Write-blocking locks (held to transaction end): a concurrent RPC
  -- insert is compatible with a plain SELECT's ACCESS SHARE lock, so the
  -- zero-row assertion must be taken under ACCESS EXCLUSIVE to remain true
  -- through the drops below.
  foreach t in array array[
    'public.lmc_settings',
    'public.lmc_transactions', 'public.lmc_lots',
    'public.lmc_lot_consumptions', 'public.lmc_accounts']
  loop
    if to_regclass(t) is not null then
      execute format('lock table %s in access exclusive mode', t);
    end if;
  end loop;
  foreach t in array array[
    'public.lmc_settings',
    'public.lmc_transactions', 'public.lmc_lots',
    'public.lmc_lot_consumptions', 'public.lmc_accounts']
  loop
    if to_regclass(t) is not null then
      execute format('select count(*) from %s', t) into v_part;
      v_rows := v_rows + coalesce(v_part, 0);
    end if;
  end loop;
  if v_rows > 0 and v_force <> 'lmc-ledger-removal-approved' then
    raise exception 'lmc_rollback_refused: % row(s) exist across the LMC tables (including seeded/owner-modified lmc_settings) — removal requires the explicit approval override lmc.force_rollback = lmc-ledger-removal-approved',
      v_rows using errcode = '42501';
  end if;
end;
$guard$;

-- Views first (depend on tables).
drop view if exists public.lmc_account_balances;
drop view if exists public.lmc_lot_balances;

-- RPCs / helpers.
drop function if exists public.lmc_reverse_v1(uuid, text, text, text, uuid);
-- Pre-rev21 signature (never shipped to production; scratch hygiene only).
drop function if exists public.lmc_reverse_v1(uuid, text, text, text);
drop function if exists public.lmc_expire_lots_v1(int);
drop function if exists public.lmc_spend_v1(bigint, text, text, uuid, uuid, uuid);
-- Pre-rev13 signature (never shipped to production; scratch hygiene only).
drop function if exists public.lmc_spend_v1(bigint, text, text, uuid, uuid);
drop function if exists public.lmc_admin_grant_v1(text, bigint, text, text, timestamptz, text);
drop function if exists public.lmc_record_purchase_v1(bigint, text, text, uuid, uuid);
drop function if exists public.lmc_grant_promotional_v1(text, uuid, text, text);
drop function if exists public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text, timestamptz, uuid);
drop function if exists public.lmc_assert_external_idempotency_key_v1(text);
-- Pre-rev15 signatures (never shipped to production; scratch hygiene only).
drop function if exists public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text, timestamptz);
drop function if exists public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text);
drop function if exists public.lmc_existing_by_idempotency_v1(uuid, text, text);
drop function if exists public.lmc_ensure_account_v1(uuid, uuid);

-- Triggers + policies. `IF EXISTS` does NOT cover an absent relation named
-- by ON, so each drop is guarded by to_regclass — the rollback stays
-- idempotent and can clean a partial state (second run, or a partially
-- failed forward apply).
do $cleanup$
begin
  if to_regclass('public.lmc_transactions') is not null then
    drop trigger if exists lmc_transactions_referral_guard on public.lmc_transactions;
    drop trigger if exists lmc_transactions_append_only on public.lmc_transactions;
    drop policy if exists lmc_transactions_select on public.lmc_transactions;
  end if;
  if to_regclass('public.lmc_lots') is not null then
    drop trigger if exists lmc_lots_append_only on public.lmc_lots;
    drop policy if exists lmc_lots_select on public.lmc_lots;
  end if;
  if to_regclass('public.lmc_lot_consumptions') is not null then
    drop trigger if exists lmc_lot_consumptions_append_only on public.lmc_lot_consumptions;
    drop policy if exists lmc_lot_consumptions_select on public.lmc_lot_consumptions;
  end if;
  if to_regclass('public.lmc_accounts') is not null then
    drop trigger if exists lmc_accounts_immutable on public.lmc_accounts;
    drop policy if exists lmc_accounts_select on public.lmc_accounts;
  end if;
  if to_regclass('public.lmc_settings') is not null then
    drop trigger if exists lmc_settings_update_guard on public.lmc_settings;
    drop trigger if exists lmc_settings_audit on public.lmc_settings;
    drop policy if exists lmc_settings_select on public.lmc_settings;
  end if;
end;
$cleanup$;
drop function if exists public.lmc_settings_update_guard();
drop function if exists public.lmc_settings_audit();
drop function if exists public.lmc_referral_insert_guard();
drop function if exists public.lmc_forbid_mutation();

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
