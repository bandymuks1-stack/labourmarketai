-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714190000 — Billing offer windows + Launch Offer discount eligibility
-- (Pricing & Payments slice, Sprint v2 §9–§10).
--
-- OWNER REQUIREMENT this encodes:
--   * PROJECT LAUNCH OFFER (companies, 99 €/mo) is visible/orderable until
--     2026-10-31 (inclusive, UTC day).
--   * Companies that ACTIVATE the Launch Offer before that deadline
--     automatically become eligible for a 15% discount on their FIRST annual
--     subscription IF that annual subscription is activated before 2027-01-01.
--     The SYSTEM must remember the eligibility automatically — that memory is
--     the `billing_offer_eligibility` table below; the write happens in the
--     server-only webhook/subscription-store path
--     (apps/web/lib/billing/offer-store.ts), never from the client.
--
-- Honesty / safety invariants:
--   * PAYMENTS remain OFF (PAYMENTS_ENABLED=false kill-switch; live Stripe
--     keys hard-blocked). These tables are production-SHAPED architecture;
--     rows only ever appear from the TEST-mode webhook chain until the owner
--     activates billing.
--   * test_mode defaults true on every eligibility row (same convention as
--     billing_subscriptions).
--   * Writes are SERVER-only via the service-role client; the authenticated
--     session gets SELECT only (owner sees own eligibility, admin sees all).
--   * Additive only; no existing table/policy/grant is touched; reversible.
--
-- ROLLBACK: supabase/rollbacks/20260714190000_billing_plans_offers_v1.down.sql
-- (also inlined in the -- DOWN block at the end of this file).
-- ============================================================================

begin;

-- ── 1. billing_offer_windows — §10 slug registry of commercial offer windows ─
-- Owner-governed config rows: what window an offer is valid in and what
-- discount it carries. Code constants (apps/web/lib/billing/offers.ts) mirror
-- the seeds; the table is the extensible registry for future offers.
create table if not exists public.billing_offer_windows (
  slug             text primary key check (char_length(slug) <= 64),
  kind             text not null check (kind in ('activation_window', 'discount')),
  valid_from       date,
  -- activation_window: last day (inclusive) an offer can be activated.
  -- discount: last day (exclusive) the discounted purchase can be activated.
  valid_until      date not null,
  discount_percent int check (discount_percent is null
                              or (discount_percent between 1 and 100)),
  description      text check (description is null or char_length(description) <= 400),
  created_at       timestamptz not null default now()
);

insert into public.billing_offer_windows
  (slug, kind, valid_until, discount_percent, description)
values
  ('launch_offer_99_window', 'activation_window', date '2026-10-31', null,
   'PROJECT LAUNCH OFFER (companies, 99 EUR/mo, unlimited job ads + internal promotion) can be activated up to and including 2026-10-31 (UTC).'),
  ('launch_offer_15pct_annual', 'discount', date '2027-01-01', 15,
   '15% discount on the FIRST annual subscription for companies that activated the Launch Offer before 2026-10-31; the annual subscription must be activated before 2027-01-01 (UTC, exclusive).')
on conflict (slug) do nothing;

-- ── 2. billing_offer_eligibility — the automatic "system remembers" record ──
create table if not exists public.billing_offer_eligibility (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid not null references public.profiles(id) on delete cascade,
  offer_slug               text not null references public.billing_offer_windows(slug),
  -- when the qualifying activation happened (subscription period start /
  -- webhook activation moment) — must fall inside the earning window; the
  -- window check lives in code (offers.ts) because SQL CHECKs cannot
  -- reference the registry row.
  activation_at            timestamptz not null,
  earned_from_plan         text not null check (char_length(earned_from_plan) <= 64),
  earned_at                timestamptz not null default now(),
  -- deadline by which the discounted purchase must be activated (exclusive).
  apply_before             timestamptz not null,
  discount_percent         int not null default 15 check (discount_percent between 1 and 100),
  consumed_at              timestamptz check (consumed_at is null or consumed_at >= earned_at),
  consumed_subscription_id text check (consumed_subscription_id is null
                                       or char_length(consumed_subscription_id) <= 128),
  test_mode                boolean not null default true,
  unique (profile_id, offer_slug)
);

create index if not exists billing_offer_eligibility_profile_idx
  on public.billing_offer_eligibility (profile_id, offer_slug);

-- ── 3. RLS — owner reads own eligibility; admin reads all; NO client write ──
alter table public.billing_offer_windows enable row level security;
alter table public.billing_offer_eligibility enable row level security;

drop policy if exists billing_offer_windows_select on public.billing_offer_windows;
create policy billing_offer_windows_select on public.billing_offer_windows
  for select to authenticated
  using (true); -- commercial config, no personal data

drop policy if exists billing_offer_eligibility_select on public.billing_offer_eligibility;
create policy billing_offer_eligibility_select on public.billing_offer_eligibility
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies: writes are SERVER-only via service role.

-- ── 4. Grants ────────────────────────────────────────────────────────────────
revoke all on public.billing_offer_windows from anon;
revoke all on public.billing_offer_eligibility from anon;
grant select on public.billing_offer_windows to authenticated;
grant select on public.billing_offer_eligibility to authenticated;
grant select on public.billing_offer_windows to service_role;
grant select, insert, update on public.billing_offer_eligibility to service_role;
-- Eligibility rows are never deleted (audit of an earned commercial right).
revoke delete on public.billing_offer_eligibility from service_role;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via
-- supabase/rollbacks/20260714190000_billing_plans_offers_v1.down.sql):
--   drop policy if exists billing_offer_eligibility_select on public.billing_offer_eligibility;
--   drop policy if exists billing_offer_windows_select on public.billing_offer_windows;
--   drop index if exists billing_offer_eligibility_profile_idx;
--   drop table if exists public.billing_offer_eligibility;
--   drop table if exists public.billing_offer_windows;
-- ════════════════════════════════════════════════════════════════════════════
