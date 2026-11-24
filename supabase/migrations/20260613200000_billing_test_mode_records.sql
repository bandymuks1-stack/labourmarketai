-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner review. Never `db push`.
--
-- Stripe sprint (PR2) — Billing TEST-mode records. Three additive tables for the
-- Stripe test chain. The legacy `subscriptions` table (0001, 0 rows, unused) is
-- left UNTOUCHED and is superseded by `billing_subscriptions`.
--
-- Honesty / safety invariants:
--   * test_mode defaults true on every row — this is the test chain;
--   * writes are SERVER-only (the webhook uses the service-role client); the
--     authenticated session gets SELECT only (RLS-scoped) — no client write path;
--   * payment_webhook_events enforces idempotency via unique (provider, event_id);
--   * NO money amount is stored (pricing is not final); status/period/flags only;
--   * additive + reversible; no destructive change, no RLS loosening.
-- ============================================================================

-- @human-gate-approved
begin;

-- 1. billing_customers — our profile ↔ provider customer (test) ─────────────
create table if not exists public.billing_customers (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles(id) on delete cascade,
  provider             text not null default 'stripe' check (provider in ('stripe')),
  provider_customer_id text not null,
  test_mode            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider, provider_customer_id),
  unique (owner_id, provider)
);

-- 2. billing_subscriptions — the subscription state (test) ──────────────────
create table if not exists public.billing_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null references public.profiles(id) on delete cascade,
  plan_key                 text not null,
  provider                 text not null default 'stripe' check (provider in ('stripe')),
  provider_customer_id     text,
  provider_subscription_id text,
  status                   text not null default 'none'
                             check (status in ('none','trialing','active','past_due',
                                               'unpaid','cancelled','incomplete','expired')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  last_payment_status      text
                             check (last_payment_status is null or last_payment_status in
                                    ('succeeded','failed','pending','none')),
  test_mode                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (provider, provider_subscription_id),
  unique (owner_id, plan_key, provider)
);
create index if not exists billing_subscriptions_owner_idx
  on public.billing_subscriptions (owner_id, status);

-- 3. payment_webhook_events — idempotency + safe audit (test) ───────────────
create table if not exists public.payment_webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'stripe' check (provider in ('stripe')),
  event_id     text not null,
  event_type   text not null,
  test_mode    boolean not null default true,
  payload      jsonb not null default '{}'::jsonb,
  processed    boolean not null default false,
  processed_at timestamptz,
  error        text,
  created_at   timestamptz not null default now(),
  unique (provider, event_id)
);
create index if not exists payment_webhook_events_type_idx
  on public.payment_webhook_events (event_type, created_at);

-- 4. RLS — owner reads own; admin reads all; NO authenticated write ─────────
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.payment_webhook_events enable row level security;

drop policy if exists billing_customers_select on public.billing_customers;
create policy billing_customers_select on public.billing_customers
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists billing_subscriptions_select on public.billing_subscriptions;
create policy billing_subscriptions_select on public.billing_subscriptions
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Webhook events are an internal audit log — admin read only.
drop policy if exists payment_webhook_events_select on public.payment_webhook_events;
create policy payment_webhook_events_select on public.payment_webhook_events
  for select to authenticated
  using (public.is_admin());
-- No insert/update/delete policies: writes are SERVER-only via the service role.

-- 5. Grants — authenticated SELECT (RLS-scoped); service_role writes (webhook) ─
grant select on public.billing_customers to authenticated;
grant select on public.billing_subscriptions to authenticated;
grant select on public.payment_webhook_events to authenticated;
grant select, insert, update on public.billing_customers to service_role;
grant select, insert, update on public.billing_subscriptions to service_role;
grant select, insert, update on public.payment_webhook_events to service_role;

commit;

-- ROLLBACK: see supabase/rollbacks/20260613200000_billing_test_mode_records.down.sql
