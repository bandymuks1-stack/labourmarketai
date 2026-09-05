-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE (BILLING SAFETY — MANDATORY BEFORE REAL CUSTOMERS,
--    owner directive 2026-09-05) ──────────────────────────────────────────────
--
-- SAFETY CLASS: RED (billing). Draft PR + `needs-human-gate`; apply ONLY via
-- Supabase MCP `apply_migration` after explicit owner approval. Never
-- `supabase db push`. The annotation acknowledges the findings the static gate
-- emits for this file (grant-or-revoke for the new table's privileges, the
-- constraint remodel on billing_customers) — it is an acknowledgement, not an
-- auto-merge pass.
--
-- 20260905190000 — Billing safety invariants v1. ADDITIVE; NO DATA LOSS; no
-- RLS loosening (the new table is admin-SELECT + service-role-write, exactly
-- the posture of the three tables from 20260613200000).
--
-- Production preflight (read-only, 2026-09-05): billing_subscriptions 0 rows,
-- payment_webhook_events 0 rows, billing_customers 1 row (test_mode = true).
--
-- WHAT
--   1. billing_subscriptions — ORDERING + AMOUNT EVIDENCE columns:
--        last_event_id / last_event_created_at — the Stripe event that last
--          moved this row; the store refuses an OLDER event (never regresses
--          active → incomplete from a late delivery);
--        provider_price_id / unit_amount_cents / currency — what Stripe says
--          this subscription bills (reconciliation compares it to the ONE
--          configured price; the figure customers see stays ONLY in
--          plans.price_eur_monthly — this is provider evidence, not a price
--          source).
--   2. payment_webhook_events.event_created_at — Stripe's own `created`
--      timestamp per event (out-of-order forensics).
--   3. billing_customers — ONE provider customer per (owner, provider, MODE).
--      The original unique (owner_id, provider) cannot hold a TEST customer
--      and a LIVE customer for the same profile, so a profile that ever had a
--      test mapping would hand a `cus_` TEST id to LIVE Stripe (checkout
--      fails "No such customer"). The remodel widens the key by test_mode;
--      the 1 existing row is untouched.
--   4. billing_checkout_operations — the SERVER-SIDE BILLING-OPERATION
--      IDENTITY behind every Checkout Session: one OPEN operation per
--      (scope, plan, provider) at a time (partial unique index), each carrying
--      the Stripe idempotency key derived from it, its window (expires_at —
--      the Checkout Session expires at the same instant), the server-resolved
--      price id, and the session / subscription ids once known. Two tabs, a
--      double click, a refresh or a retry collide on the index and REUSE the
--      same key → Stripe replays the same session; a second payable
--      subscription can never be minted inside the window.
--
-- WRITES stay SERVER-only (service role); authenticated gets RLS-scoped
-- SELECT (admin only for the operations table — it is an audit/evidence
-- record, like payment_webhook_events).
--
-- ROLLBACK: supabase/rollbacks/20260905190000_billing_safety_invariants_v1.down.sql
-- (also mirrored, commented, at the end of this file).
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.billing_subscriptions') is null
     or to_regclass('public.billing_customers') is null
     or to_regclass('public.payment_webhook_events') is null then
    raise exception 'billing tables missing — 20260613200000 expected before this migration';
  end if;
end $$;

-- 1. billing_subscriptions — ordering + amount evidence ─────────────────────
alter table public.billing_subscriptions
  add column if not exists last_event_id text,
  add column if not exists last_event_created_at timestamptz,
  add column if not exists provider_price_id text,
  add column if not exists unit_amount_cents integer,
  add column if not exists currency text;

comment on column public.billing_subscriptions.last_event_created_at is
  'Stripe `created` of the event that last moved this row. The store applies '
  'an incoming subscription/invoice event ONLY if it is not older than this '
  '(out-of-order protection: a late checkout.session.completed can never '
  'regress active -> incomplete). NULL = never set (legacy rows).';

comment on column public.billing_subscriptions.provider_price_id is
  'The Stripe price id this subscription bills, as reported by the '
  'signature-verified subscription object. Reconciliation compares it to the '
  'ONE configured price (STRIPE_PRICE_COMPANY_PILOT). Evidence only — never '
  'a price source; the figure lives in plans.price_eur_monthly.';

-- 2. payment_webhook_events — Stripe created timestamp ──────────────────────
alter table public.payment_webhook_events
  add column if not exists event_created_at timestamptz;

create index if not exists payment_webhook_events_created_idx
  on public.payment_webhook_events (event_created_at);

-- 3. billing_customers — one provider customer per (owner, provider, MODE) ──
--    Widening idiom: the dropped key is re-added with test_mode appended in the
--    same statement block. Safe on the 1-row table; nothing is deleted.
alter table public.billing_customers
  drop constraint if exists billing_customers_owner_id_provider_key;
alter table public.billing_customers
  add constraint billing_customers_owner_provider_mode_key
  unique (owner_id, provider, test_mode);

-- 4. billing_checkout_operations — server-side checkout identity ────────────
create table if not exists public.billing_checkout_operations (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null references public.profiles(id) on delete cascade,
  organization_id          uuid references public.organizations(id) on delete set null,
  -- 'organization:<uuid>' | 'profile:<uuid>' — the billing-subject scope the
  -- operation belongs to (immutable; survives organization deletion).
  scope_key                text not null,
  plan_key                 text not null,
  provider                 text not null default 'stripe' check (provider in ('stripe')),
  -- the SERVER-resolved price id (env slot) that was sent to Stripe — evidence
  provider_price_id        text not null,
  -- the Stripe idempotency key derived from THIS record (co2_<scope>_<plan>_<id>)
  idempotency_key          text not null unique,
  provider_session_id      text,
  provider_subscription_id text,
  status                   text not null default 'open'
                             check (status in ('open','completed','expired','failed','superseded')),
  test_mode                boolean not null default true,
  -- which product surface asked (web account page, chat, mobile …)
  source                   text not null default 'web',
  expires_at               timestamptz not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  completed_at             timestamptz,
  failure_reason           text
);

-- ONE open operation per (scope, plan, provider): concurrent requests collide
-- here and reuse the winner's key instead of minting a second session.
create unique index if not exists billing_checkout_operations_open_scope_uniq
  on public.billing_checkout_operations (scope_key, plan_key, provider)
  where status = 'open';

create unique index if not exists billing_checkout_operations_session_uniq
  on public.billing_checkout_operations (provider, provider_session_id)
  where provider_session_id is not null;

create index if not exists billing_checkout_operations_owner_idx
  on public.billing_checkout_operations (owner_id, created_at);

comment on table public.billing_checkout_operations is
  'Server-side identity of every Checkout Session request (billing safety v1). '
  'One OPEN row per (scope, plan) at a time; its id derives the Stripe '
  'idempotency key and its expires_at is the Checkout Session expiry, so a '
  'retry/double-click/second tab replays the same session. Writes are '
  'service-role only; admin SELECT only (evidence record).';

-- RLS — admin reads; NO authenticated write path (service role writes) ──────
alter table public.billing_checkout_operations enable row level security;

drop policy if exists billing_checkout_operations_select on public.billing_checkout_operations;
create policy billing_checkout_operations_select on public.billing_checkout_operations
  for select to authenticated
  using (public.is_admin());

grant select on public.billing_checkout_operations to authenticated;
grant select, insert, update on public.billing_checkout_operations to service_role;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (mirror of supabase/rollbacks/20260905190000_billing_safety_invariants_v1.down.sql)
--
--   -- refuses while billing_checkout_operations holds rows or while the
--   -- evidence columns carry values (operator archives first — no silent loss)
--   drop table if exists public.billing_checkout_operations;
--   alter table public.billing_customers
--     drop constraint if exists billing_customers_owner_provider_mode_key;
--   alter table public.billing_customers
--     add constraint billing_customers_owner_id_provider_key unique (owner_id, provider);
--   drop index if exists public.payment_webhook_events_created_idx;
--   alter table public.payment_webhook_events drop column if exists event_created_at;
--   alter table public.billing_subscriptions
--     drop column if exists last_event_id,
--     drop column if exists last_event_created_at,
--     drop column if exists provider_price_id,
--     drop column if exists unit_amount_cents,
--     drop column if exists currency;
-- ════════════════════════════════════════════════════════════════════════
