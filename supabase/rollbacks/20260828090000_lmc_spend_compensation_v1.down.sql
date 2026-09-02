-- ════════════════════════════════════════════════════════════════════════════
-- DOWN: LMC SPEND COMPENSATION v1
--
-- READ THIS BEFORE RUNNING IT.
--
-- There are TWO rollbacks here, and which one is correct depends on a single
-- fact: whether any compensation has actually been issued.
--
--   A) NO `spend_compensation` rows exist — the feature was applied but never
--      used. Full structural rollback is safe, and this script performs it.
--
--   B) Compensations HAVE been issued. This script REFUSES, deliberately.
--      Narrowing `lmc_transactions_kind_check` back would either fail against
--      the existing rows or require deleting them, and deleting money records
--      from an append-only ledger is exactly the thing the ledger exists to
--      make impossible. The correct rollback in that case is operational, not
--      structural:
--
--          update public.lmc_settings
--             set enabled = false, updated_by = <an admin profile id>
--           where key = 'lmc_compensation_enabled';
--
--      The feature stops immediately (the RPC's flag gate refuses every new
--      call) and the history stays readable. Leave the vocabulary in place.
--
-- Recovery path if the RPC itself is faulty but the data is fine: drop only
-- the function (section 1) and leave everything else. No caller can then issue
-- a compensation, and no record is lost.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 0. Refuse the destructive case, loudly ─────────────────────────────────
do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows from public.lmc_transactions
   where kind = 'spend_compensation';
  if v_rows > 0 then
    raise exception
      'REFUSING ROLLBACK: % spend_compensation transaction(s) exist. Narrowing the CHECK would require deleting money records from an append-only ledger. Disable the feature instead: update public.lmc_settings set enabled=false, updated_by=<admin> where key=''lmc_compensation_enabled''.',
      v_rows;
  end if;
end
$$;

-- ── 1. The RPC ─────────────────────────────────────────────────────────────
drop function if exists public.lmc_compensate_spend_v1(uuid, text, text, uuid, bigint);

-- ── 2. Flag policy back to the pre-migration mapping ───────────────────────
create or replace function public.lmc_flag_policy_v1(p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_key
    when 'lmc_purchases_enabled'          then 'admin'
    when 'lmc_promotional_grants_enabled' then 'admin'
    when 'lmc_referrals_enabled'          then 'admin'
    when 'lmc_spending_enabled'           then 'admin'
    when 'stripe_lmc_topups_enabled'      then 'owner_only'
    when 'live_payments_enabled'          then 'owner_only'
    else 'system_locked'
  end;
$$;

-- The settings ROW is left in place ON PURPOSE. `lmc_settings` carries an
-- audit trigger and a delete would be a silent hole in the flag history; an
-- orphan `false` row is inert (`lmc_flag_policy_v1` now returns
-- `system_locked` for it, so nothing can even flip it).
--
-- Which means `lmc_settings_key_check` must KEEP admitting the key — narrowing
-- it back would reject the very row this script deliberately preserves, and
-- the rollback would fail on its last step after having already dropped the
-- function. It stays widened, and that is not a leak: an admitted key with no
-- policy entry is `system_locked`.

-- ── 3. Vocabulary back to the pre-migration sets ───────────────────────────
-- Safe only because section 0 proved no row uses the new values.

alter table public.lmc_lots drop constraint if exists lmc_lots_expiry_policy;
alter table public.lmc_lots
  add constraint lmc_lots_expiry_policy check (
    (source_kind = any (array['promotional_signup', 'promotional_activity',
                              'admin_grant']) and expires_at is not null)
    or (source_kind = 'purchased' and expires_at is null)
    or (source_kind = 'referral_reward')
  );

alter table public.lmc_lots drop constraint if exists lmc_lots_source_kind_check;
alter table public.lmc_lots
  add constraint lmc_lots_source_kind_check check (source_kind = any (array[
    'purchased', 'promotional_signup', 'promotional_activity', 'admin_grant',
    'referral_reward'
  ]));

alter table public.lmc_transactions drop constraint if exists lmc_tx_reversal_linkage;
alter table public.lmc_transactions
  add constraint lmc_tx_reversal_linkage check (
    (kind = any (array['reversal', 'refund_reversal', 'chargeback_reversal']))
    = (original_transaction_id is not null)
  );

alter table public.lmc_transactions drop constraint if exists lmc_transactions_kind_check;
alter table public.lmc_transactions
  add constraint lmc_transactions_kind_check check (kind = any (array[
    'purchased', 'promotional_signup', 'promotional_activity', 'admin_grant',
    'referral_reward', 'spend', 'expiry',
    'reversal', 'refund_reversal', 'chargeback_reversal'
  ]));

commit;
