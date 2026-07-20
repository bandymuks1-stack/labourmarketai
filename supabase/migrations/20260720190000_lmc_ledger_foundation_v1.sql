-- @human-gate-approved
-- RED classes acknowledged (security definer / grant-revoke / create trigger):
-- LMC Commercial System Train v1 — Wagon 1 (immutable LMC ledger foundation).
--
-- DRAFT — needs-human-gate — DO NOT APPLY without explicit owner OK.
-- DO NOT APPLY automatically. Apply ONLY via Supabase MCP apply_migration
-- after explicit owner approval. Never `db push`.
--
-- Contract: docs/product/lmc-commercial-system-train-v1.md
-- ROLLBACK: supabase/rollbacks/20260720190000_lmc_ledger_foundation_v1.down.sql
--
-- WHAT THIS IS
--   The smallest coherent append-only ledger for LMC — the internal
--   LabourMarket.ai platform credit (1 LMC = 1 EUR of internal credit,
--   stored as bigint LMC-cents; 100 LMC-cents = 1 LMC — no floating point).
--   LMC is an internal platform credit only: not a cryptocurrency, not an
--   investment, not an electronic-money claim, not a withdrawable balance,
--   not a promise of future cash redemption.
--
-- INVARIANTS ENFORCED AT THE DATABASE BOUNDARY
--   * Append-only: no RLS write policies, insert/update/delete REVOKEd from
--     anon/authenticated/service_role, and BEFORE UPDATE OR DELETE triggers
--     raise unconditionally — even table-owner code paths are refused.
--     Writes happen ONLY through the SECURITY DEFINER RPCs below.
--   * Balance is DERIVED (views); no overwritable balance column exists.
--   * Idempotency at DB level: unique (account_id, idempotency_key).
--   * Every reversal references its original entry; at most ONE reversal per
--     original entry (partial unique index).
--   * Signup/activity promotions are once-per-account (partial unique
--     indexes) — a daily-repeat grant is structurally impossible.
--   * referral_reward entries are IMPOSSIBLE while lmc_referrals_enabled is
--     false (BEFORE INSERT trigger; default false; fail-closed when the
--     settings row is absent). No referral rate exists anywhere.
--   * Promotional lots carry expiry (60-day default); purchased lots NEVER
--     expire (CHECK: expires_at must be NULL for purchased).
--   * Spend allocation consumes promotional/expiring value before purchased
--     value, deterministically (expires_at asc, then created_at asc, id).
--   * No negative spendable balance: spends run under an account row lock
--     (SELECT ... FOR UPDATE) and fail atomically on insufficiency.
--   * Admin grants require a VERIFIED recipient email (auth.users
--     email_confirmed_at), bounded amount, campaign, reason, expiry,
--     idempotency key, actor — with immutable provenance + audit_logs row.
--
-- EVERY COMMERCIAL FLAG SHIPS DISABLED (lmc_settings seeds, all false):
--   lmc_purchases_enabled, lmc_promotional_grants_enabled,
--   lmc_referrals_enabled, stripe_lmc_topups_enabled, live_payments_enabled,
--   lmc_spending_enabled (spend kill-switch — disabling every flag freezes
--   even already-issued credits: complete behavioural rollback).
--   TS mirror: apps/web/lib/billing/lmc-flags.ts (false as const, guard-pinned).
--
-- ADDITIVE ONLY: no existing table/policy/grant/function is touched.
-- Idempotently re-appliable (create or replace / if not exists / on conflict
-- do nothing) so the scratch-DB negative controls can restore weakened
-- objects by re-applying this file.

begin;

-- ── 1. lmc_settings — server-governed DB-level flags (all default FALSE) ────
create table if not exists public.lmc_settings (
  key        text primary key check (key in (
               'lmc_purchases_enabled',
               'lmc_promotional_grants_enabled',
               'lmc_referrals_enabled',
               'stripe_lmc_topups_enabled',
               'live_payments_enabled',
               'lmc_spending_enabled')),
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.lmc_settings (key, enabled) values
  ('lmc_purchases_enabled', false),
  ('lmc_promotional_grants_enabled', false),
  ('lmc_referrals_enabled', false),
  ('stripe_lmc_topups_enabled', false),
  ('live_payments_enabled', false),
  ('lmc_spending_enabled', false)
on conflict (key) do nothing;

-- Every commercial flag change is accountable: a flip must record WHO
-- (updated_by required), WHEN (updated_at stamped by trigger, not left at
-- the insert-time default) and leaves an immutable audit_logs row — even
-- through the direct service_role UPDATE path.
create or replace function public.lmc_settings_update_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.enabled is distinct from old.enabled then
    if new.updated_by is null then
      raise exception 'lmc_flag_actor_required: flag changes must record updated_by'
        using errcode = '22023';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger lmc_settings_update_guard
  before update on public.lmc_settings
  for each row execute function public.lmc_settings_update_guard();

create or replace function public.lmc_settings_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.enabled is distinct from old.enabled then
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (new.updated_by, 'lmc_flag_changed', 'lmc_settings', null,
            jsonb_build_object('key', new.key,
                               'from', old.enabled, 'to', new.enabled));
  end if;
  return null;
end;
$$;

create or replace trigger lmc_settings_audit
  after update on public.lmc_settings
  for each row execute function public.lmc_settings_audit();

-- Fail-closed flag read: a missing row is FALSE. (Read-only; gate points in
-- the write RPCs use lmc_require_flag_v1 below, which locks the row.)
create or replace function public.lmc_flag_enabled(p_key text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select s.enabled from public.lmc_settings s where s.key = p_key),
    false);
$$;

-- Kill-switch gate for NEW monetary writes. Takes FOR SHARE on the flag row,
-- held to transaction end: an emergency flag flip (row-exclusive UPDATE)
-- BLOCKS until every in-flight writer commits, and no writer that starts
-- after the flip commits can pass — the check-then-write race is closed and
-- "disable everything" is a true serialization point. Missing row = FALSE.
create or replace function public.lmc_require_flag_v1(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  select s.enabled into v_enabled
    from public.lmc_settings s
   where s.key = p_key
   for share;
  if not coalesce(v_enabled, false) then
    raise exception '%', replace(p_key, '_enabled', '_disabled')
      using errcode = '42501';
  end if;
end;
$$;

-- ── 2. lmc_accounts — one owner-scoped account per eligible identity ────────
create table if not exists public.lmc_accounts (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('person', 'company')),
  profile_id   uuid references public.profiles(id) on delete restrict,
  company_id   uuid references public.companies(id) on delete restrict,
  created_at   timestamptz not null default now(),
  constraint lmc_accounts_subject_xor check (
    (subject_type = 'person'  and profile_id is not null and company_id is null) or
    (subject_type = 'company' and company_id is not null and profile_id is null))
);

create unique index if not exists lmc_accounts_one_per_profile
  on public.lmc_accounts (profile_id) where profile_id is not null;
create unique index if not exists lmc_accounts_one_per_company
  on public.lmc_accounts (company_id) where company_id is not null;

-- ── 3. lmc_transactions — the immutable append-only ledger ──────────────────
create table if not exists public.lmc_transactions (
  id                       uuid primary key default gen_random_uuid(),
  account_id               uuid not null references public.lmc_accounts(id) on delete restrict,
  kind                     text not null check (kind in (
                             'purchased',
                             'promotional_signup',
                             'promotional_activity',
                             'admin_grant',
                             'referral_reward',
                             'spend',
                             'expiry',
                             'reversal',
                             'refund_reversal',
                             'chargeback_reversal')),
  -- bigint LMC-cents (100 = 1 LMC); always positive, sign implied by kind.
  amount_cents             bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  currency                 text not null default 'LMC' check (currency = 'LMC'),
  idempotency_key          text not null check (char_length(idempotency_key) between 8 and 200),
  original_transaction_id  uuid references public.lmc_transactions(id),
  campaign                 text check (campaign is null or char_length(campaign) <= 120),
  reason                   text not null check (char_length(reason) between 1 and 300),
  actor_profile_id         uuid references public.profiles(id) on delete restrict,
  recipient_email_at_grant text check (recipient_email_at_grant is null
                                       or char_length(recipient_email_at_grant) <= 320),
  metadata                 jsonb not null default '{}'::jsonb
                             check (char_length(metadata::text) <= 2000),
  created_at               timestamptz not null default now(),
  -- Reversal kinds MUST reference the original entry; others must not.
  constraint lmc_tx_reversal_linkage check (
    (kind in ('reversal', 'refund_reversal', 'chargeback_reversal'))
      = (original_transaction_id is not null)),
  -- Promotional/admin credits must carry a campaign/source.
  constraint lmc_tx_campaign_required check (
    kind not in ('promotional_signup', 'promotional_activity', 'admin_grant')
      or campaign is not null),
  -- Admin grants carry immutable actor + verified-recipient provenance.
  constraint lmc_tx_admin_provenance check (
    kind <> 'admin_grant'
      or (actor_profile_id is not null and recipient_email_at_grant is not null)),
  constraint lmc_tx_idempotency unique (account_id, idempotency_key)
);

create index if not exists lmc_transactions_account_idx
  on public.lmc_transactions (account_id, created_at);

-- At most ONE reversal per original entry — a duplicate reversal is refused
-- by the database itself.
create unique index if not exists lmc_one_reversal_per_original
  on public.lmc_transactions (original_transaction_id)
  where original_transaction_id is not null;

-- Signup / activity promotions are ONCE per account, ever. This also makes
-- any automatic daily-repeat promotional grant structurally impossible.
create unique index if not exists lmc_one_signup_grant_per_account
  on public.lmc_transactions (account_id) where kind = 'promotional_signup';
create unique index if not exists lmc_one_activity_grant_per_account
  on public.lmc_transactions (account_id) where kind = 'promotional_activity';

-- Admin-grant idempotency keys are GLOBALLY unique (not just per account):
-- replay resolution must not depend on mutable email ownership, so a key can
-- never legitimately appear on two accounts for admin grants.
create unique index if not exists lmc_admin_grant_key_global
  on public.lmc_transactions (idempotency_key) where kind = 'admin_grant';

-- ── 4. lmc_lots — remaining-value containers for credit transactions ────────
create table if not exists public.lmc_lots (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.lmc_accounts(id) on delete restrict,
  transaction_id uuid not null unique references public.lmc_transactions(id) on delete restrict,
  source_kind    text not null check (source_kind in (
                   'purchased',
                   'promotional_signup',
                   'promotional_activity',
                   'admin_grant',
                   'referral_reward')),
  amount_cents   bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  -- Promotional value MUST expire; purchased value must NEVER be expired by
  -- promotional rules (referral expiry policy is decided at owner gate).
  constraint lmc_lots_expiry_policy check (
    (source_kind in ('promotional_signup', 'promotional_activity', 'admin_grant')
       and expires_at is not null)
    or (source_kind = 'purchased' and expires_at is null)
    or (source_kind = 'referral_reward'))
);

create index if not exists lmc_lots_account_idx
  on public.lmc_lots (account_id, expires_at);

-- ── 5. lmc_lot_consumptions — immutable allocation lines ────────────────────
create table if not exists public.lmc_lot_consumptions (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.lmc_accounts(id) on delete restrict,
  lot_id           uuid not null references public.lmc_lots(id) on delete restrict,
  transaction_id   uuid not null references public.lmc_transactions(id) on delete restrict,
  consumption_kind text not null check (consumption_kind in (
                     'spend', 'expiry', 'reversal',
                     'refund_reversal', 'chargeback_reversal')),
  amount_cents     bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  created_at       timestamptz not null default now(),
  constraint lmc_consumption_once_per_tx unique (lot_id, transaction_id)
);

create index if not exists lmc_lot_consumptions_lot_idx
  on public.lmc_lot_consumptions (lot_id);
create index if not exists lmc_lot_consumptions_tx_idx
  on public.lmc_lot_consumptions (transaction_id);

-- One expiry consumption per lot, ever.
create unique index if not exists lmc_one_expiry_per_lot
  on public.lmc_lot_consumptions (lot_id) where consumption_kind = 'expiry';

-- ── 6. Append-only triggers — refuse UPDATE/DELETE for every code path ──────
create or replace function public.lmc_forbid_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'lmc_append_only: % on %.% is forbidden — the LMC ledger is immutable',
    tg_op, tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

create or replace trigger lmc_transactions_append_only
  before update or delete on public.lmc_transactions
  for each row execute function public.lmc_forbid_mutation();
create or replace trigger lmc_lots_append_only
  before update or delete on public.lmc_lots
  for each row execute function public.lmc_forbid_mutation();
create or replace trigger lmc_lot_consumptions_append_only
  before update or delete on public.lmc_lot_consumptions
  for each row execute function public.lmc_forbid_mutation();
create or replace trigger lmc_accounts_immutable
  before update or delete on public.lmc_accounts
  for each row execute function public.lmc_forbid_mutation();

-- ── 7. Referral guard — referral entries impossible while disabled ──────────
create or replace function public.lmc_referral_insert_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if new.kind = 'referral_reward' then
    -- FOR SHARE: same flip-serialization as lmc_require_flag_v1 — a
    -- referral insert in flight blocks a concurrent disable until it
    -- commits, and no insert passes after the disable commits.
    select s.enabled into v_enabled
      from public.lmc_settings s
     where s.key = 'lmc_referrals_enabled'
     for share;
    if not coalesce(v_enabled, false) then
      raise exception 'lmc_referrals_disabled: referral_reward entries are impossible while lmc_referrals_enabled is false'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger lmc_transactions_referral_guard
  before insert on public.lmc_transactions
  for each row execute function public.lmc_referral_insert_guard();

-- ── 8. Derived balances — views only, RLS of base tables applies ────────────
create or replace view public.lmc_lot_balances
with (security_invoker = true) as
select
  l.id as lot_id,
  l.account_id,
  l.transaction_id,
  l.source_kind,
  l.amount_cents,
  l.expires_at,
  l.created_at,
  coalesce(c.consumed_cents, 0) as consumed_cents,
  l.amount_cents - coalesce(c.consumed_cents, 0) as remaining_cents,
  (l.expires_at is not null and l.expires_at <= now()) as is_expired,
  case
    when l.expires_at is not null and l.expires_at <= now() then 0
    else l.amount_cents - coalesce(c.consumed_cents, 0)
  end as spendable_cents
from public.lmc_lots l
left join (
  select lot_id, sum(amount_cents) as consumed_cents
  from public.lmc_lot_consumptions
  group by lot_id
) c on c.lot_id = l.id;

create or replace view public.lmc_account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.subject_type,
  a.profile_id,
  a.company_id,
  coalesce(sum(b.spendable_cents), 0) as available_cents,
  coalesce(sum(b.spendable_cents)
    filter (where b.source_kind <> 'purchased'), 0) as promotional_available_cents,
  coalesce(sum(b.spendable_cents)
    filter (where b.source_kind = 'purchased'), 0) as purchased_available_cents,
  coalesce(sum(b.remaining_cents) filter (where b.is_expired), 0)
    as expired_remainder_cents
from public.lmc_accounts a
left join public.lmc_lot_balances b on b.account_id = a.id
group by a.id, a.subject_type, a.profile_id, a.company_id;

-- ── 9. Internal helpers (service-side only) ─────────────────────────────────
create or replace function public.lmc_ensure_account_v1(
  p_profile_id uuid default null,
  p_company_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  -- This helper is an independently exposed service-role write path, so it
  -- takes the shared maintenance lock itself (a re-acquisition inside the
  -- other RPCs is a no-op) — the rollback's exclusive lock queues EVERY
  -- ledger writer, including direct account creation.
  perform pg_advisory_xact_lock_shared(hashtext('lmc_ledger')::bigint);
  if (p_profile_id is null) = (p_company_id is null) then
    raise exception 'lmc_invalid_subject: exactly one of profile or company required'
      using errcode = '22023';
  end if;
  if p_profile_id is not null then
    if not exists (select 1 from public.profiles where id = p_profile_id) then
      raise exception 'lmc_unknown_profile' using errcode = '22023';
    end if;
    insert into public.lmc_accounts (subject_type, profile_id)
    values ('person', p_profile_id)
    on conflict do nothing
    returning id into v_account;
    if v_account is not null then
      -- Provenance for the actual creation (idempotent re-calls skip this).
      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
      values (null, 'lmc_account_created', 'lmc_accounts', v_account,
              jsonb_build_object('subject_type', 'person',
                                 'profile_id', p_profile_id));
    else
      select id into v_account from public.lmc_accounts
        where profile_id = p_profile_id;
    end if;
  else
    if not exists (select 1 from public.companies where id = p_company_id) then
      raise exception 'lmc_unknown_company' using errcode = '22023';
    end if;
    insert into public.lmc_accounts (subject_type, company_id)
    values ('company', p_company_id)
    on conflict do nothing
    returning id into v_account;
    if v_account is not null then
      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
      values (null, 'lmc_account_created', 'lmc_accounts', v_account,
              jsonb_build_object('subject_type', 'company',
                                 'company_id', p_company_id));
    else
      select id into v_account from public.lmc_accounts
        where company_id = p_company_id;
    end if;
  end if;
  return v_account;
end;
$$;

-- Reserved idempotency-key namespaces: system-derived keys (the expiry
-- worker's 'lmc-expiry:<lot_id>') may never be claimed by an externally
-- keyed operation, or the worker would treat the foreign row as its own
-- processing record and skip the lot forever.
create or replace function public.lmc_assert_external_idempotency_key_v1(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or p_key like 'lmc-expiry:%' then
    raise exception 'lmc_reserved_idempotency_key: the lmc-expiry: namespace is system-reserved'
      using errcode = '22023';
  end if;
end;
$$;

-- Shared idempotency lookup: returns the existing transaction (as jsonb)
-- when the same (account, key) was already committed with the SAME payload;
-- raises lmc_idempotency_conflict when the key is being reused for a
-- different kind OR with different operation-defining fields (amount,
-- reversal linkage, campaign, purchase reference, admin-grant lot expiry).
-- A replay must be an exact replay — a changed payload is never silently
-- mapped to the old result. (Free-text reason is deliberately not part of
-- the fingerprint.)
create or replace function public.lmc_existing_by_idempotency_v1(
  p_account uuid,
  p_key text,
  p_kind text,
  p_amount_cents bigint default null,
  p_original_transaction_id uuid default null,
  p_campaign text default null,
  p_reference text default null,
  p_expires_at timestamptz default null,
  p_actor_profile_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.lmc_transactions%rowtype;
begin
  select * into v_existing
    from public.lmc_transactions
   where account_id = p_account and idempotency_key = p_key;
  if not found then
    return null;
  end if;
  if v_existing.kind <> p_kind then
    raise exception 'lmc_idempotency_conflict: key % already used for kind %',
      p_key, v_existing.kind using errcode = '23505';
  end if;
  if p_amount_cents is not null and v_existing.amount_cents <> p_amount_cents then
    raise exception 'lmc_idempotency_conflict: key % already used with a different amount',
      p_key using errcode = '23505';
  end if;
  if p_original_transaction_id is not null
     and v_existing.original_transaction_id is distinct from p_original_transaction_id then
    raise exception 'lmc_idempotency_conflict: key % already used for a different original entry',
      p_key using errcode = '23505';
  end if;
  if p_campaign is not null
     and v_existing.campaign is distinct from p_campaign then
    raise exception 'lmc_idempotency_conflict: key % already used with a different campaign',
      p_key using errcode = '23505';
  end if;
  if p_reference is not null
     and (v_existing.metadata ->> 'reference') is distinct from p_reference then
    raise exception 'lmc_idempotency_conflict: key % already used with a different reference',
      p_key using errcode = '23505';
  end if;
  if p_expires_at is not null
     and (select l.expires_at from public.lmc_lots l
           where l.transaction_id = v_existing.id) is distinct from p_expires_at then
    raise exception 'lmc_idempotency_conflict: key % already used with a different expiry',
      p_key using errcode = '23505';
  end if;
  -- A replay must come from the SAME initiator: a foreign actor may not read
  -- another initiator's committed result through the replay path.
  if p_actor_profile_id is not null
     and v_existing.actor_profile_id is distinct from p_actor_profile_id then
    raise exception 'lmc_idempotency_conflict: key % already used by a different actor',
      p_key using errcode = '23505';
  end if;
  return jsonb_build_object(
    'transaction_id', v_existing.id,
    'account_id', v_existing.account_id,
    'kind', v_existing.kind,
    'amount_cents', v_existing.amount_cents,
    'already_processed', true);
end;
$$;

-- ── 10. lmc_grant_promotional_v1 — signup / activity grants (50 LMC each) ───
-- Service-side only. Amounts are FIXED at 5000 LMC-cents (50 LMC) per the
-- binding registration promotion; once-per-account enforced by the partial
-- unique indexes in §3. NEVER a daily reward.
create or replace function public.lmc_grant_promotional_v1(
  p_kind text,
  p_profile_id uuid,
  p_campaign text,
  p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_existing jsonb;
  v_tx uuid;
  v_amount constant bigint := 5000; -- 50 LMC, fixed
  v_expires timestamptz := now() + interval '60 days';
begin
  -- Shared LMC maintenance lock: writers hold it for the transaction, the
  -- rollback's guard takes it EXCLUSIVE before any table lock — overlap
  -- quiesces safely instead of deadlocking.
  perform pg_advisory_xact_lock_shared(hashtext('lmc_ledger')::bigint);
  perform public.lmc_assert_external_idempotency_key_v1(p_idempotency_key);
  if p_kind not in ('promotional_signup', 'promotional_activity') then
    raise exception 'lmc_invalid_promotional_kind: %', p_kind using errcode = '22023';
  end if;
  if p_campaign is null or char_length(trim(p_campaign)) = 0 then
    raise exception 'lmc_campaign_required' using errcode = '22023';
  end if;

  -- Committed exact replays resolve BEFORE the kill-switch: a disabled flag
  -- blocks NEW grants but never the acknowledgement of an already-committed
  -- one (a replay must stay idempotent across flag flips).
  select id into v_account from public.lmc_accounts
   where profile_id = p_profile_id;
  if v_account is not null then
    v_existing := public.lmc_existing_by_idempotency_v1(
      v_account, p_idempotency_key, p_kind,
      p_amount_cents => v_amount, p_campaign => p_campaign);
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  perform public.lmc_require_flag_v1('lmc_promotional_grants_enabled');
  -- Verified signup only: the recipient must have a confirmed email.
  if not exists (
    select 1 from auth.users u
     where u.id = p_profile_id and u.email_confirmed_at is not null) then
    raise exception 'lmc_recipient_not_verified' using errcode = '42501';
  end if;

  v_account := public.lmc_ensure_account_v1(p_profile_id => p_profile_id);
  -- Serialize all writes for this account.
  perform 1 from public.lmc_accounts where id = v_account for update;

  v_existing := public.lmc_existing_by_idempotency_v1(
    v_account, p_idempotency_key, p_kind,
    p_amount_cents => v_amount, p_campaign => p_campaign);
  if v_existing is not null then
    return v_existing;
  end if;

  begin
    insert into public.lmc_transactions
      (account_id, kind, amount_cents, idempotency_key, campaign, reason)
    values
      (v_account, p_kind, v_amount, p_idempotency_key, p_campaign,
       'registration promotion: ' || p_kind)
    returning id into v_tx;
  exception when unique_violation then
    -- A different idempotency key hit the once-per-account index: the grant
    -- already happened. Refuse honestly instead of double-granting.
    raise exception 'lmc_duplicate_grant: % already granted for this account', p_kind
      using errcode = '23505';
  end;

  insert into public.lmc_lots
    (account_id, transaction_id, source_kind, amount_cents, expires_at)
  values (v_account, v_tx, p_kind, v_amount, v_expires);

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (null, 'lmc_grant_promotional', 'lmc_transactions', v_tx,
          jsonb_build_object('kind', p_kind, 'amount_cents', v_amount,
                             'campaign', p_campaign, 'expires_at', v_expires));

  return jsonb_build_object(
    'transaction_id', v_tx, 'account_id', v_account, 'kind', p_kind,
    'amount_cents', v_amount, 'already_processed', false);
end;
$$;

-- ── 11. lmc_record_purchase_v1 — settled top-up credit (no expiry) ──────────
create or replace function public.lmc_record_purchase_v1(
  p_amount_cents bigint,
  p_reference text,
  p_idempotency_key text,
  p_profile_id uuid default null,
  p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_existing jsonb;
  v_tx uuid;
begin
  perform pg_advisory_xact_lock_shared(hashtext('lmc_ledger')::bigint);
  perform public.lmc_assert_external_idempotency_key_v1(p_idempotency_key);
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'lmc_invalid_amount' using errcode = '22023';
  end if;
  if p_reference is null or char_length(trim(p_reference)) = 0
     or char_length(p_reference) > 200 then
    raise exception 'lmc_reference_required' using errcode = '22023';
  end if;
  if (p_profile_id is null) = (p_company_id is null) then
    raise exception 'lmc_invalid_subject: exactly one of profile or company required'
      using errcode = '22023';
  end if;

  -- Committed exact replays resolve BEFORE the kill-switch (see grant RPC).
  select id into v_account from public.lmc_accounts
   where (p_profile_id is not null and profile_id = p_profile_id)
      or (p_company_id is not null and company_id = p_company_id);
  if v_account is not null then
    v_existing := public.lmc_existing_by_idempotency_v1(
      v_account, p_idempotency_key, 'purchased',
      p_amount_cents => p_amount_cents, p_reference => p_reference);
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  perform public.lmc_require_flag_v1('lmc_purchases_enabled');

  v_account := public.lmc_ensure_account_v1(p_profile_id, p_company_id);
  perform 1 from public.lmc_accounts where id = v_account for update;

  v_existing := public.lmc_existing_by_idempotency_v1(
    v_account, p_idempotency_key, 'purchased',
    p_amount_cents => p_amount_cents, p_reference => p_reference);
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.lmc_transactions
    (account_id, kind, amount_cents, idempotency_key, reason, metadata)
  values
    (v_account, 'purchased', p_amount_cents, p_idempotency_key,
     'settled LMC top-up', jsonb_build_object('reference', p_reference))
  returning id into v_tx;

  insert into public.lmc_lots
    (account_id, transaction_id, source_kind, amount_cents, expires_at)
  values (v_account, v_tx, 'purchased', p_amount_cents, null);

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (null, 'lmc_record_purchase', 'lmc_transactions', v_tx,
          jsonb_build_object('amount_cents', p_amount_cents,
                             'reference', p_reference));

  return jsonb_build_object(
    'transaction_id', v_tx, 'account_id', v_account, 'kind', 'purchased',
    'amount_cents', p_amount_cents, 'already_processed', false);
end;
$$;

-- ── 12. lmc_admin_grant_v1 — bounded admin promotional grant ────────────────
-- Callable by an AUTHENTICATED ADMIN only (public.is_admin() in-body gate).
-- Recipient is resolved by VERIFIED email; provenance (actor, resolved
-- recipient, email at grant time, campaign, reason, expiry) is immutable.
create or replace function public.lmc_admin_grant_v1(
  p_recipient_email text,
  p_amount_cents bigint,
  p_reason text,
  p_campaign text,
  p_expires_at timestamptz,
  p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_recipient uuid;
  v_email text;
  v_account uuid;
  v_existing jsonb;
  v_tx uuid;
  v_cap constant bigint := 100000; -- 1000 LMC per grant (owner-adjustable later)
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('lmc_ledger')::bigint);
  perform public.lmc_assert_external_idempotency_key_v1(p_idempotency_key);
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > v_cap then
    raise exception 'lmc_invalid_amount: must be positive and <= % LMC-cents', v_cap
      using errcode = '22023';
  end if;
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'lmc_reason_required' using errcode = '22023';
  end if;
  if p_campaign is null or char_length(trim(p_campaign)) = 0 then
    raise exception 'lmc_campaign_required' using errcode = '22023';
  end if;
  if p_expires_at is null then
    raise exception 'lmc_invalid_expiry: required, future, <= 365 days'
      using errcode = '22023';
  end if;
  -- The future/365-day WINDOW check is deliberately deferred until after the
  -- idempotency lookup below: an identical replay must stay idempotent even
  -- after the originally granted expiry has elapsed.

  -- GLOBAL replay resolution FIRST — independent of mutable email ownership.
  -- A committed admin grant is identified by its (globally unique) key, and
  -- the stored recipient_email_at_grant is the identity fingerprint: even if
  -- the email address was later reassigned to a different verified profile,
  -- an identical retry returns the ORIGINAL transaction instead of issuing a
  -- second grant to the address's new owner. Any payload difference conflicts.
  declare
    v_prior public.lmc_transactions%rowtype;
    v_prior_expires timestamptz;
  begin
    select * into v_prior
      from public.lmc_transactions
     where idempotency_key = p_idempotency_key and kind = 'admin_grant';
    if found then
      if lower(v_prior.recipient_email_at_grant)
         is distinct from lower(trim(p_recipient_email)) then
        raise exception 'lmc_idempotency_conflict: key % already used for a different recipient',
          p_idempotency_key using errcode = '23505';
      end if;
      if v_prior.amount_cents <> p_amount_cents then
        raise exception 'lmc_idempotency_conflict: key % already used with a different amount',
          p_idempotency_key using errcode = '23505';
      end if;
      if v_prior.campaign is distinct from p_campaign then
        raise exception 'lmc_idempotency_conflict: key % already used with a different campaign',
          p_idempotency_key using errcode = '23505';
      end if;
      select l.expires_at into v_prior_expires
        from public.lmc_lots l where l.transaction_id = v_prior.id;
      if v_prior_expires is distinct from p_expires_at then
        raise exception 'lmc_idempotency_conflict: key % already used with a different expiry',
          p_idempotency_key using errcode = '23505';
      end if;
      return jsonb_build_object(
        'transaction_id', v_prior.id,
        'account_id', v_prior.account_id,
        'kind', v_prior.kind,
        'amount_cents', v_prior.amount_cents,
        'already_processed', true);
    end if;
  end;

  -- Kill-switch AFTER replay resolution: a disabled flag blocks NEW grants,
  -- never the acknowledgement of an already-committed one.
  perform public.lmc_require_flag_v1('lmc_promotional_grants_enabled');

  -- Verified recipient resolution: confirmed email, existing profile.
  select u.id, u.email into v_recipient, v_email
    from auth.users u
   where lower(u.email) = lower(trim(p_recipient_email))
     and u.email_confirmed_at is not null;
  if v_recipient is null then
    raise exception 'lmc_recipient_not_found_or_unverified' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = v_recipient) then
    raise exception 'lmc_recipient_has_no_profile' using errcode = '22023';
  end if;

  v_account := public.lmc_ensure_account_v1(p_profile_id => v_recipient);
  perform 1 from public.lmc_accounts where id = v_account for update;

  v_existing := public.lmc_existing_by_idempotency_v1(
    v_account, p_idempotency_key, 'admin_grant',
    p_amount_cents => p_amount_cents, p_campaign => p_campaign,
    p_expires_at => p_expires_at);
  if v_existing is not null then
    return v_existing;
  end if;

  -- Time-dependent window check runs only for a NEW grant (see note above).
  if p_expires_at <= now() or p_expires_at > now() + interval '365 days' then
    raise exception 'lmc_invalid_expiry: required, future, <= 365 days'
      using errcode = '22023';
  end if;

  insert into public.lmc_transactions
    (account_id, kind, amount_cents, idempotency_key, campaign, reason,
     actor_profile_id, recipient_email_at_grant)
  values
    (v_account, 'admin_grant', p_amount_cents, p_idempotency_key, p_campaign,
     p_reason, uid, v_email)
  returning id into v_tx;

  insert into public.lmc_lots
    (account_id, transaction_id, source_kind, amount_cents, expires_at)
  values (v_account, v_tx, 'admin_grant', p_amount_cents, p_expires_at);

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'lmc_admin_grant', 'lmc_transactions', v_tx,
          jsonb_build_object('recipient_profile_id', v_recipient,
                             'recipient_email', v_email,
                             'amount_cents', p_amount_cents,
                             'campaign', p_campaign, 'reason', p_reason,
                             'expires_at', p_expires_at));

  return jsonb_build_object(
    'transaction_id', v_tx, 'account_id', v_account, 'kind', 'admin_grant',
    'amount_cents', p_amount_cents, 'already_processed', false);
end;
$$;

-- ── 13. lmc_spend_v1 — atomic spend, promotional/expiring value first ───────
create or replace function public.lmc_spend_v1(
  p_amount_cents bigint,
  p_reason text,
  p_idempotency_key text,
  p_profile_id uuid default null,
  p_company_id uuid default null,
  p_actor_profile_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_existing jsonb;
  v_tx uuid;
  v_remaining bigint;
  v_take bigint;
  v_available bigint;
  r record;
begin
  perform pg_advisory_xact_lock_shared(hashtext('lmc_ledger')::bigint);
  perform public.lmc_assert_external_idempotency_key_v1(p_idempotency_key);
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'lmc_invalid_amount' using errcode = '22023';
  end if;
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'lmc_reason_required' using errcode = '22023';
  end if;
  -- Complete audit provenance: every spend records WHO initiated it.
  if p_actor_profile_id is null then
    raise exception 'lmc_actor_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_profile_id) then
    raise exception 'lmc_unknown_actor' using errcode = '22023';
  end if;

  if (p_profile_id is null) = (p_company_id is null) then
    raise exception 'lmc_invalid_subject' using errcode = '22023';
  end if;
  select id into v_account from public.lmc_accounts
   where (p_profile_id is not null and profile_id = p_profile_id)
      or (p_company_id is not null and company_id = p_company_id);

  -- Committed exact replays resolve BEFORE the kill-switch: a retried spend
  -- that already debited the balance must report already_processed, not a
  -- disabled error (which would invite a second spend under a new key).
  if v_account is not null then
    v_existing := public.lmc_existing_by_idempotency_v1(
      v_account, p_idempotency_key, 'spend',
      p_amount_cents => p_amount_cents,
      p_actor_profile_id => p_actor_profile_id);
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  -- DB-level kill-switch: when spending is disabled, even already-issued
  -- credits are frozen for NEW spends (complete behavioural rollback).
  perform public.lmc_require_flag_v1('lmc_spending_enabled');

  -- Actor AUTHORITY, not just existence: the recorded initiator must own the
  -- debited personal account, own the debited company, or carry the
  -- dual-signal admin role — a spend can never be attributed to an
  -- unrelated profile. (Finer-grained company member authority is a later
  -- wagon; owner-or-admin is the fail-closed v1 rule.)
  if not (
    (p_profile_id is not null and p_actor_profile_id = p_profile_id)
    or (p_company_id is not null and exists (
          select 1 from public.companies c
           where c.id = p_company_id and c.profile_id = p_actor_profile_id))
    or exists (select 1 from public.profiles pa
                where pa.id = p_actor_profile_id and pa.active_role = 'admin')
    or exists (select 1 from public.profile_roles pr
                where pr.profile_id = p_actor_profile_id and pr.role = 'admin')
  ) then
    raise exception 'lmc_actor_not_authorized: the initiating actor must own the debited account or be an admin'
      using errcode = '42501';
  end if;

  if v_account is null then
    raise exception 'lmc_insufficient_balance' using errcode = 'P0001';
  end if;

  -- Account row lock: serializes concurrent spends — overspend is impossible.
  perform 1 from public.lmc_accounts where id = v_account for update;

  v_existing := public.lmc_existing_by_idempotency_v1(
    v_account, p_idempotency_key, 'spend',
    p_amount_cents => p_amount_cents,
    p_actor_profile_id => p_actor_profile_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select coalesce(sum(
    case when l.expires_at is not null and l.expires_at <= now() then 0
         else l.amount_cents - coalesce(c.consumed, 0) end), 0)
    into v_available
    from public.lmc_lots l
    left join (
      select lot_id, sum(amount_cents) as consumed
      from public.lmc_lot_consumptions group by lot_id) c on c.lot_id = l.id
   where l.account_id = v_account;

  if v_available < p_amount_cents then
    raise exception 'lmc_insufficient_balance: available % < requested %',
      v_available, p_amount_cents using errcode = 'P0001';
  end if;

  insert into public.lmc_transactions
    (account_id, kind, amount_cents, idempotency_key, reason,
     actor_profile_id)
  values (v_account, 'spend', p_amount_cents, p_idempotency_key, p_reason,
          p_actor_profile_id)
  returning id into v_tx;

  -- Deterministic allocation: expiring (promotional) lots first by earliest
  -- expiry, then non-expiring (purchased) lots oldest-first; id tie-break.
  v_remaining := p_amount_cents;
  for r in
    select l.id as lot_id,
           l.amount_cents - coalesce(c.consumed, 0) as lot_remaining
      from public.lmc_lots l
      left join (
        select lot_id, sum(amount_cents) as consumed
        from public.lmc_lot_consumptions group by lot_id) c on c.lot_id = l.id
     where l.account_id = v_account
       and (l.expires_at is null or l.expires_at > now())
       and l.amount_cents - coalesce(c.consumed, 0) > 0
     order by (l.expires_at is null) asc, l.expires_at asc,
              l.created_at asc, l.id asc
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, r.lot_remaining);
    insert into public.lmc_lot_consumptions
      (account_id, lot_id, transaction_id, consumption_kind, amount_cents)
    values (v_account, r.lot_id, v_tx, 'spend', v_take);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    -- Defensive: cannot happen under the account lock; keep the spend atomic.
    raise exception 'lmc_allocation_failed' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (p_actor_profile_id, 'lmc_spend', 'lmc_transactions', v_tx,
          jsonb_build_object('amount_cents', p_amount_cents, 'reason', p_reason));

  return jsonb_build_object(
    'transaction_id', v_tx, 'account_id', v_account, 'kind', 'spend',
    'amount_cents', p_amount_cents, 'already_processed', false);
end;
$$;

-- ── 14. lmc_expire_lots_v1 — deterministic promotional expiry ───────────────
-- Records an append-only `expiry` transaction for every promotional lot whose
-- expires_at has passed and which still has unconsumed remainder. Purchased
-- lots (expires_at IS NULL) are structurally out of reach. Idempotent: the
-- derived idempotency key `lmc-expiry:<lot_id>` and the one-expiry-per-lot
-- index make a second run a no-op.
create or replace function public.lmc_expire_lots_v1(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_tx uuid;
  v_remaining bigint;
  r record;
begin
  perform pg_advisory_xact_lock_shared(hashtext('lmc_ledger')::bigint);
  if p_limit is null or p_limit <= 0 or p_limit > 1000 then
    raise exception 'lmc_invalid_limit' using errcode = '22023';
  end if;
  -- Candidate set EXCLUDES completed lots BEFORE the LIMIT, so a batch can
  -- never be wedged by already-consumed / already-expired old lots: only
  -- expired lots that still have unconsumed remainder and no expiry record
  -- occupy the window.
  for r in
    select l.id as lot_id, l.account_id
      from public.lmc_lots l
     where l.expires_at is not null and l.expires_at <= now()
       and not exists (select 1 from public.lmc_lot_consumptions ec
                        where ec.lot_id = l.id
                          and ec.consumption_kind = 'expiry')
       and (select coalesce(sum(c.amount_cents), 0)
              from public.lmc_lot_consumptions c
             where c.lot_id = l.id) < l.amount_cents
     order by l.expires_at asc, l.id asc
     limit p_limit
  loop
    -- Serialize with spends on the same account.
    perform 1 from public.lmc_accounts where id = r.account_id for update;
    select l.amount_cents - coalesce(sum(c.amount_cents), 0)
      into v_remaining
      from public.lmc_lots l
      left join public.lmc_lot_consumptions c on c.lot_id = l.id
     where l.id = r.lot_id
     group by l.id, l.amount_cents;
    if v_remaining is null or v_remaining <= 0 then
      continue;
    end if;
    if exists (select 1 from public.lmc_transactions
                where account_id = r.account_id
                  and idempotency_key = 'lmc-expiry:' || r.lot_id::text) then
      continue;
    end if;
    insert into public.lmc_transactions
      (account_id, kind, amount_cents, idempotency_key, reason)
    values (r.account_id, 'expiry', v_remaining,
            'lmc-expiry:' || r.lot_id::text, 'promotional lot expiry')
    returning id into v_tx;
    insert into public.lmc_lot_consumptions
      (account_id, lot_id, transaction_id, consumption_kind, amount_cents)
    values (r.account_id, r.lot_id, v_tx, 'expiry', v_remaining);
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (null, 'lmc_expire_lot', 'lmc_transactions', v_tx,
            jsonb_build_object('lot_id', r.lot_id, 'amount_cents', v_remaining));
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('expired_lots', v_count);
end;
$$;

-- ── 15. lmc_reverse_v1 — reversal referencing the original entry ────────────
-- Reverses the REMAINING unspent value of the original credit's lot.
-- refund_reversal / chargeback_reversal apply to purchased originals only;
-- plain reversal applies to promotional/admin/referral credits. Idempotent by
-- key; a second reversal with a different key is refused (DB unique index).
-- Recovery of already-spent value is Wagon 6 fraud tooling (owner gate).
create or replace function public.lmc_reverse_v1(
  p_original_transaction_id uuid,
  p_kind text,
  p_reason text,
  p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig public.lmc_transactions%rowtype;
  v_lot public.lmc_lots%rowtype;
  v_existing jsonb;
  v_remaining bigint;
  v_tx uuid;
begin
  perform pg_advisory_xact_lock_shared(hashtext('lmc_ledger')::bigint);
  if p_kind not in ('reversal', 'refund_reversal', 'chargeback_reversal') then
    raise exception 'lmc_invalid_reversal_kind: %', p_kind using errcode = '22023';
  end if;
  perform public.lmc_assert_external_idempotency_key_v1(p_idempotency_key);
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'lmc_reason_required' using errcode = '22023';
  end if;

  select * into v_orig from public.lmc_transactions
   where id = p_original_transaction_id;
  if not found then
    raise exception 'lmc_original_not_found' using errcode = '22023';
  end if;

  select * into v_lot from public.lmc_lots
   where transaction_id = v_orig.id;
  if not found then
    raise exception 'lmc_original_not_reversible: % has no credit lot', v_orig.kind
      using errcode = '22023';
  end if;

  if p_kind in ('refund_reversal', 'chargeback_reversal')
     and v_lot.source_kind <> 'purchased' then
    raise exception 'lmc_reversal_kind_mismatch: % requires a purchased original',
      p_kind using errcode = '22023';
  end if;
  if p_kind = 'reversal' and v_lot.source_kind = 'purchased' then
    raise exception 'lmc_reversal_kind_mismatch: purchased originals need refund_reversal or chargeback_reversal'
      using errcode = '22023';
  end if;

  perform 1 from public.lmc_accounts where id = v_orig.account_id for update;

  -- Amount is derived (remaining at first execution), so the replay
  -- fingerprint is the ORIGINAL-ENTRY LINKAGE: reusing this key for a
  -- different original transaction must conflict, never report the old
  -- reversal as already_processed.
  v_existing := public.lmc_existing_by_idempotency_v1(
    v_orig.account_id, p_idempotency_key, p_kind,
    p_original_transaction_id => v_orig.id);
  if v_existing is not null then
    return v_existing;
  end if;

  if exists (select 1 from public.lmc_transactions
              where original_transaction_id = v_orig.id) then
    raise exception 'lmc_already_reversed' using errcode = '23505';
  end if;

  select v_lot.amount_cents - coalesce(sum(c.amount_cents), 0)
    into v_remaining
    from public.lmc_lot_consumptions c
   where c.lot_id = v_lot.id;
  v_remaining := coalesce(v_remaining, v_lot.amount_cents);
  if v_remaining <= 0 then
    raise exception 'lmc_nothing_to_reverse: original value fully consumed (recovery is Wagon 6 tooling)'
      using errcode = 'P0001';
  end if;

  insert into public.lmc_transactions
    (account_id, kind, amount_cents, idempotency_key,
     original_transaction_id, reason)
  values (v_orig.account_id, p_kind, v_remaining, p_idempotency_key,
          v_orig.id, p_reason)
  returning id into v_tx;

  insert into public.lmc_lot_consumptions
    (account_id, lot_id, transaction_id, consumption_kind, amount_cents)
  values (v_orig.account_id, v_lot.id, v_tx, p_kind, v_remaining);

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (null, 'lmc_reverse', 'lmc_transactions', v_tx,
          jsonb_build_object('original_transaction_id', v_orig.id,
                             'kind', p_kind, 'amount_cents', v_remaining,
                             'reason', p_reason));

  return jsonb_build_object(
    'transaction_id', v_tx, 'account_id', v_orig.account_id, 'kind', p_kind,
    'amount_cents', v_remaining, 'already_processed', false);
end;
$$;

-- ── 16. RLS — SELECT-only, owner/company-owner/admin scoped, fail-closed ────
alter table public.lmc_settings enable row level security;
alter table public.lmc_accounts enable row level security;
alter table public.lmc_transactions enable row level security;
alter table public.lmc_lots enable row level security;
alter table public.lmc_lot_consumptions enable row level security;

drop policy if exists lmc_settings_select on public.lmc_settings;
create policy lmc_settings_select on public.lmc_settings
  for select to authenticated
  using (public.is_admin());

drop policy if exists lmc_accounts_select on public.lmc_accounts;
create policy lmc_accounts_select on public.lmc_accounts
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.companies c
                where c.id = company_id and c.profile_id = auth.uid())
    or public.is_admin());

drop policy if exists lmc_transactions_select on public.lmc_transactions;
create policy lmc_transactions_select on public.lmc_transactions
  for select to authenticated
  using (exists (
    select 1 from public.lmc_accounts a
     where a.id = account_id
       and (a.profile_id = auth.uid()
            or exists (select 1 from public.companies c
                        where c.id = a.company_id and c.profile_id = auth.uid())
            or public.is_admin())));

drop policy if exists lmc_lots_select on public.lmc_lots;
create policy lmc_lots_select on public.lmc_lots
  for select to authenticated
  using (exists (
    select 1 from public.lmc_accounts a
     where a.id = account_id
       and (a.profile_id = auth.uid()
            or exists (select 1 from public.companies c
                        where c.id = a.company_id and c.profile_id = auth.uid())
            or public.is_admin())));

drop policy if exists lmc_lot_consumptions_select on public.lmc_lot_consumptions;
create policy lmc_lot_consumptions_select on public.lmc_lot_consumptions
  for select to authenticated
  using (exists (
    select 1 from public.lmc_accounts a
     where a.id = account_id
       and (a.profile_id = auth.uid()
            or exists (select 1 from public.companies c
                        where c.id = a.company_id and c.profile_id = auth.uid())
            or public.is_admin())));

-- No INSERT/UPDATE/DELETE policy on any LMC table, ever: writes are RPC-only.

-- ── 17. Grants — fail closed; ledger writes impossible outside the RPCs ─────
revoke all on public.lmc_settings from anon, authenticated;
revoke all on public.lmc_accounts from anon, authenticated;
revoke all on public.lmc_transactions from anon, authenticated;
revoke all on public.lmc_lots from anon, authenticated;
revoke all on public.lmc_lot_consumptions from anon, authenticated;
revoke all on public.lmc_lot_balances from anon, authenticated;
revoke all on public.lmc_account_balances from anon, authenticated;

grant select on public.lmc_accounts to authenticated;
grant select on public.lmc_transactions to authenticated;
grant select on public.lmc_lots to authenticated;
grant select on public.lmc_lot_consumptions to authenticated;
grant select on public.lmc_settings to authenticated; -- RLS: admin rows only
grant select on public.lmc_lot_balances to authenticated;
grant select on public.lmc_account_balances to authenticated;

-- Even the service role may NOT write the ledger directly: every monetary
-- write goes through the SECURITY DEFINER RPCs (owned by the migration role),
-- which are the only remaining write path. Settings stay service-managable
-- (config, not ledger).
grant select on public.lmc_settings to service_role;
grant select, insert, update on public.lmc_settings to service_role;
revoke delete on public.lmc_settings from service_role;
grant select on public.lmc_accounts to service_role;
grant select on public.lmc_transactions to service_role;
grant select on public.lmc_lots to service_role;
grant select on public.lmc_lot_consumptions to service_role;
grant select on public.lmc_lot_balances to service_role;
grant select on public.lmc_account_balances to service_role;
revoke insert, update, delete on public.lmc_accounts from service_role;
revoke insert, update, delete on public.lmc_transactions from service_role;
revoke insert, update, delete on public.lmc_lots from service_role;
revoke insert, update, delete on public.lmc_lot_consumptions from service_role;

-- Function execution: fail closed, then grant narrowly.
revoke all on function public.lmc_flag_enabled(text) from public;
revoke all on function public.lmc_require_flag_v1(text) from public;
revoke all on function public.lmc_forbid_mutation() from public;
revoke all on function public.lmc_referral_insert_guard() from public;
revoke all on function public.lmc_ensure_account_v1(uuid, uuid) from public;
revoke all on function public.lmc_assert_external_idempotency_key_v1(text) from public;
revoke all on function public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text, timestamptz, uuid) from public;
revoke all on function public.lmc_grant_promotional_v1(text, uuid, text, text) from public;
revoke all on function public.lmc_record_purchase_v1(bigint, text, text, uuid, uuid) from public;
revoke all on function public.lmc_admin_grant_v1(text, bigint, text, text, timestamptz, text) from public;
revoke all on function public.lmc_spend_v1(bigint, text, text, uuid, uuid, uuid) from public;
revoke all on function public.lmc_expire_lots_v1(int) from public;
revoke all on function public.lmc_reverse_v1(uuid, text, text, text) from public;

grant execute on function public.lmc_flag_enabled(text) to authenticated, service_role;
grant execute on function public.lmc_require_flag_v1(text) to service_role;
-- Server-side monetary writes only:
grant execute on function public.lmc_ensure_account_v1(uuid, uuid) to service_role;
grant execute on function public.lmc_assert_external_idempotency_key_v1(text) to service_role;
grant execute on function public.lmc_existing_by_idempotency_v1(uuid, text, text, bigint, uuid, text, text, timestamptz, uuid) to service_role;
grant execute on function public.lmc_grant_promotional_v1(text, uuid, text, text) to service_role;
grant execute on function public.lmc_record_purchase_v1(bigint, text, text, uuid, uuid) to service_role;
grant execute on function public.lmc_spend_v1(bigint, text, text, uuid, uuid, uuid) to service_role;
grant execute on function public.lmc_expire_lots_v1(int) to service_role;
grant execute on function public.lmc_reverse_v1(uuid, text, text, text) to service_role;
-- Admin grant: authenticated admins only (in-body public.is_admin() gate).
grant execute on function public.lmc_admin_grant_v1(text, bigint, text, text, timestamptz, text) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN: supabase/rollbacks/20260720190000_lmc_ledger_foundation_v1.down.sql
-- (removes ONLY the lmc_* objects created here; preserves all unrelated
-- billing data — proven by db-proof 22/23.)
-- ════════════════════════════════════════════════════════════════════════════
