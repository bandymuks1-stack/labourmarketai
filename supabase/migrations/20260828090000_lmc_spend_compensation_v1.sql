-- ════════════════════════════════════════════════════════════════════════════
-- LMC SPEND COMPENSATION v1 — giving credit back when a paid action failed.
--
-- CLASS: RED. It alters money-ledger CHECK constraints and adds a credit-
-- creating RPC. It ships DISABLED (new flag defaults false) and must not be
-- applied without explicit owner approval.
--
-- ── THE GAP THIS CLOSES (measured on production 2026-08-28) ─────────────────
--
-- The ledger was proven correct on every path it has: top-up credits,
-- idempotent replay credits nothing twice, spend debits, replay debits nothing
-- twice, overspend is refused with the balance unchanged, a foreign actor
-- cannot debit an account, a purchase refund claws back only what is left, and
-- the ledger refuses UPDATE outright.
--
-- One path did not exist. `lmc_reverse_v1` reverses only transactions that
-- CREATED a credit lot — it resolves `lmc_lots.transaction_id = original.id`,
-- and a `spend` has no such row:
--
--     lmc_original_not_reversible: spend has no credit lot
--
-- So a user debited for an action that then failed, or was never delivered,
-- had no in-product remedy at all. The only remaining route was an admin grant
-- — a different transaction kind, behind a different flag, requiring a
-- verified recipient — which records the event as a PROMOTION rather than as
-- the restitution it actually is. That is not merely inconvenient: it makes
-- the ledger lie about why money moved.
--
-- ── WHY A NEW CREDIT AND NOT AN UNDO ───────────────────────────────────────
--
-- The ledger is append-only and that is not negotiable (`lmc_forbid_mutation`
-- rejects UPDATE and DELETE on every ledger table). Compensation is therefore
-- a COMPENSATING CREDIT: a new transaction, linked to the spend it answers,
-- with its own lot. The spend stays in the record exactly as it happened. A
-- reader can always reconstruct what was charged, what was given back, and
-- why — which an in-place reversal would have destroyed.
--
-- ── WHY A NEW KIND AND NOT `reversal` ──────────────────────────────────────
--
-- `reversal` / `refund_reversal` / `chargeback_reversal` all CONSUME a credit
-- lot: they take value away. This does the opposite — it creates value to
-- restore a debit. Reusing the word would have made the three existing kinds
-- mean two different things depending on what they pointed at, and every
-- report summing them would have been wrong by twice the amount.
--
-- ── INVARIANTS (each has a test in the guard suite) ─────────────────────────
--   * only a `spend` may be compensated;
--   * never more than was spent, across ANY number of calls;
--   * idempotent by key, with the same actor+reason fingerprint the rest of
--     the ledger uses;
--   * the initiating actor must own the account or be an admin;
--   * concurrent retries serialise on the account row — two racing calls
--     cannot both create a credit;
--   * append-only is untouched;
--   * restored value keeps the EXPIRY it had. Compensating expiring credit
--     with permanent credit would hand back more than was taken.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Vocabulary: one new transaction kind and one new lot source ─────────
--
-- Both CHECKs are REPLACED rather than dropped: at no point in this
-- transaction is the column unconstrained.

alter table public.lmc_transactions
  drop constraint if exists lmc_transactions_kind_check;
alter table public.lmc_transactions
  add constraint lmc_transactions_kind_check check (kind = any (array[
    'purchased', 'promotional_signup', 'promotional_activity', 'admin_grant',
    'referral_reward', 'spend', 'expiry',
    'reversal', 'refund_reversal', 'chargeback_reversal',
    'spend_compensation'
  ]));

-- Linkage: a compensation is meaningless without the spend it answers, so it
-- joins the set of kinds for which `original_transaction_id` is REQUIRED — and
-- for which every other kind is forbidden from carrying one.
alter table public.lmc_transactions
  drop constraint if exists lmc_tx_reversal_linkage;
alter table public.lmc_transactions
  add constraint lmc_tx_reversal_linkage check (
    (kind = any (array['reversal', 'refund_reversal', 'chargeback_reversal',
                       'spend_compensation']))
    = (original_transaction_id is not null)
  );

alter table public.lmc_lots
  drop constraint if exists lmc_lots_source_kind_check;
alter table public.lmc_lots
  add constraint lmc_lots_source_kind_check check (source_kind = any (array[
    'purchased', 'promotional_signup', 'promotional_activity', 'admin_grant',
    'referral_reward', 'spend_compensation'
  ]));

-- Expiry policy: a compensation lot may carry an expiry or not, because it
-- MIRRORS what it restores. Compensating expiring promotional credit with
-- permanent credit would return more than was taken; compensating purchased
-- credit with expiring credit would return less. The RPC computes it; the
-- constraint simply admits both, exactly as `referral_reward` already does.
alter table public.lmc_lots
  drop constraint if exists lmc_lots_expiry_policy;
alter table public.lmc_lots
  add constraint lmc_lots_expiry_policy check (
    (source_kind = any (array['promotional_signup', 'promotional_activity',
                              'admin_grant']) and expires_at is not null)
    or (source_kind = 'purchased' and expires_at is null)
    or (source_kind = any (array['referral_reward', 'spend_compensation']))
  );

-- ── 2. Kill-switch — ships OFF, class `admin` ──────────────────────────────
--
-- `admin`, not `owner_only`: compensation returns a user's OWN credit after a
-- failure this platform caused. It moves no external money and creates no
-- financial commitment, so gating it behind the owner-only class would make
-- the remedy for our own outage harder to reach than the outage. It is still
-- a flag, still default-false, and still audited on every flip.

-- `lmc_settings.key` carries its own closed CHECK, so a flag is not merely a
-- row — the vocabulary has to admit it first. (Found by the production
-- dry-run: the first attempt inserted the row and was refused by
-- `lmc_settings_key_check`, which is the constraint doing its job.)
alter table public.lmc_settings
  drop constraint if exists lmc_settings_key_check;
alter table public.lmc_settings
  add constraint lmc_settings_key_check check (key = any (array[
    'lmc_purchases_enabled', 'lmc_promotional_grants_enabled',
    'lmc_referrals_enabled', 'stripe_lmc_topups_enabled',
    'live_payments_enabled', 'lmc_spending_enabled',
    'lmc_compensation_enabled'
  ]));

insert into public.lmc_settings (key, enabled) values
  ('lmc_compensation_enabled', false)
on conflict (key) do nothing;

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
    when 'lmc_compensation_enabled'       then 'admin'
    when 'stripe_lmc_topups_enabled'      then 'owner_only'
    when 'live_payments_enabled'          then 'owner_only'
    else 'system_locked'
  end;
$$;

-- ── 3. lmc_compensate_spend_v1 ─────────────────────────────────────────────

create or replace function public.lmc_compensate_spend_v1(
  p_original_transaction_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_actor_profile_id uuid default null,
  p_amount_cents bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig public.lmc_transactions%rowtype;
  v_account public.lmc_accounts%rowtype;
  v_existing jsonb;
  v_already bigint;
  v_max bigint;
  v_amount bigint;
  v_expires timestamptz;
  v_tx uuid;
begin
  perform pg_advisory_xact_lock_shared(hashtext('lmc_ledger')::bigint);
  perform public.lmc_assert_external_idempotency_key_v1(p_idempotency_key);

  if p_reason is null or char_length(trim(p_reason)) = 0
     or char_length(p_reason) > 300 then
    raise exception 'lmc_reason_required' using errcode = '22023';
  end if;
  -- Complete provenance: every restitution records WHO authorised it.
  if p_actor_profile_id is null then
    raise exception 'lmc_actor_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_profile_id) then
    raise exception 'lmc_unknown_actor' using errcode = '22023';
  end if;

  select * into v_orig from public.lmc_transactions
   where id = p_original_transaction_id;
  if not found then
    raise exception 'lmc_original_not_found' using errcode = '22023';
  end if;

  -- ONLY a spend. Compensating a credit would mint value out of nothing, and
  -- compensating a reversal would undo a refund — both are silently wrong in a
  -- way a balance check would not catch until month end.
  if v_orig.kind <> 'spend' then
    raise exception 'lmc_not_a_spend: % cannot be compensated — only a spend can',
      v_orig.kind using errcode = '22023';
  end if;

  -- Serialise every compensation of this account against every other, so two
  -- concurrent retries cannot each pass the over-compensation check.
  perform 1 from public.lmc_accounts where id = v_orig.account_id for update;

  -- REPLAY resolution before the kill-switch (same order as lmc_spend_v1 and
  -- lmc_record_purchase_v1): a committed compensation must stay
  -- acknowledgeable even if the flag is flipped off in the window between the
  -- winner committing and the loser retrying. The fingerprint is the original
  -- linkage + actor + EXACT reason: a retry that changes the justification is
  -- a conflict, never `already_processed`.
  v_existing := public.lmc_existing_by_idempotency_v1(
    v_orig.account_id, p_idempotency_key, 'spend_compensation',
    p_amount_cents => p_amount_cents,
    p_original_transaction_id => v_orig.id,
    p_actor_profile_id => p_actor_profile_id,
    p_reason_exact => p_reason);
  if v_existing is not null then
    return v_existing;
  end if;

  perform public.lmc_require_flag_v1('lmc_compensation_enabled');

  -- Actor AUTHORITY. NULL-safe by construction: for a company account
  -- `profile_id` is necessarily NULL (subject XOR), and a bare comparison
  -- would make the whole OR chain NULL — which `if not (NULL)` skips, waving
  -- an unrelated actor straight through. This is the rev33 defect from
  -- lmc_reverse_v1, written correctly here the first time.
  select * into v_account from public.lmc_accounts where id = v_orig.account_id;
  if not (
    (v_account.profile_id is not null
       and v_account.profile_id = p_actor_profile_id)
    or (v_account.company_id is not null and exists (
          select 1 from public.companies c
           where c.id = v_account.company_id
             and c.profile_id = p_actor_profile_id))
    or exists (select 1 from public.profiles pa
                where pa.id = p_actor_profile_id and pa.active_role = 'admin')
    or exists (select 1 from public.profile_roles pr
                where pr.profile_id = p_actor_profile_id and pr.role = 'admin')
  ) then
    raise exception 'lmc_actor_not_authorized: the initiating actor must own the affected account or be an admin'
      using errcode = '42501';
  end if;

  -- OVER-COMPENSATION GUARD. Computed from the ledger, across ALL prior
  -- compensations of this spend — not from a boolean "already compensated"
  -- flag, so partial compensations sum correctly and a second full one is
  -- refused rather than doubling the refund.
  select coalesce(sum(t.amount_cents), 0) into v_already
    from public.lmc_transactions t
   where t.original_transaction_id = v_orig.id
     and t.kind = 'spend_compensation';

  v_max := v_orig.amount_cents - v_already;
  if v_max <= 0 then
    raise exception 'lmc_already_compensated: spend % is fully compensated (% of % cents)',
      v_orig.id, v_already, v_orig.amount_cents using errcode = '23505';
  end if;

  -- NULL means "make the user whole" — the common case, and the one a caller
  -- should not have to compute. An explicit amount enables partial
  -- compensation (partial delivery) without a second RPC later.
  v_amount := coalesce(p_amount_cents, v_max);
  if v_amount <= 0 or v_amount > 100000000 then
    raise exception 'lmc_invalid_amount' using errcode = '22023';
  end if;
  if v_amount > v_max then
    raise exception 'lmc_over_compensation: % cents requested but only % remain of a % cent spend',
      v_amount, v_max, v_orig.amount_cents using errcode = '22023';
  end if;

  -- Restore the value WITH the expiry it had. The spend consumed lots
  -- promotional-and-expiring first (lmc_spend_v1's FIFO), so the earliest
  -- expiry among the consumed lots is the honest ceiling: returning permanent
  -- credit for expiring credit would hand back more than was taken.
  select min(l.expires_at) into v_expires
    from public.lmc_lot_consumptions c
    join public.lmc_lots l on l.id = c.lot_id
   where c.transaction_id = v_orig.id
     and l.expires_at is not null;

  insert into public.lmc_transactions
    (account_id, kind, amount_cents, idempotency_key,
     original_transaction_id, reason, actor_profile_id)
  values (v_orig.account_id, 'spend_compensation', v_amount, p_idempotency_key,
          v_orig.id, p_reason, p_actor_profile_id)
  returning id into v_tx;

  insert into public.lmc_lots
    (account_id, transaction_id, source_kind, amount_cents, expires_at)
  values (v_orig.account_id, v_tx, 'spend_compensation', v_amount, v_expires);

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (p_actor_profile_id, 'lmc_compensate_spend', 'lmc_transactions', v_tx,
          jsonb_build_object('original_transaction_id', v_orig.id,
                             'amount_cents', v_amount,
                             'already_compensated_cents', v_already,
                             'expires_at', v_expires,
                             'reason', p_reason));

  return jsonb_build_object(
    'transaction_id', v_tx, 'account_id', v_orig.account_id,
    'kind', 'spend_compensation', 'amount_cents', v_amount,
    'expires_at', v_expires, 'already_processed', false);
end;
$$;

-- ── 4. Grants — server-side monetary write, service_role only ──────────────
revoke all on function public.lmc_compensate_spend_v1(uuid, text, text, uuid, bigint) from public;
grant execute on function public.lmc_compensate_spend_v1(uuid, text, text, uuid, bigint) to service_role;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: supabase/rollbacks/20260828090000_lmc_spend_compensation_v1.down.sql
--
-- Reversible ONLY while no `spend_compensation` row exists — the down script
-- asserts that and refuses otherwise, because narrowing the CHECK back would
-- either fail or (worse) require deleting money records from an append-only
-- ledger. If compensations have been issued, the correct rollback is to flip
-- `lmc_compensation_enabled` to false and LEAVE the vocabulary in place: the
-- feature stops, the history stays readable.
-- ════════════════════════════════════════════════════════════════════════════
