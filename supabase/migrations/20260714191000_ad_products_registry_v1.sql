-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714191000 — Job-ad product registry (Pricing & Payments slice,
-- Sprint v2 §10 — job ad pricing ARCHITECTURE).
--
-- OWNER REQUIREMENT this encodes: normal company subscriptions do NOT include
-- unlimited job advertisements (the Launch Offer is the only exception).
-- Extra ads and promotion are sold as ad PRODUCTS. This migration prepares
-- the §10 slug registry for those products — it does NOT create a purchase
-- flow, a checkout, or any price the owner has not confirmed.
--
-- Honesty / safety invariants:
--   * every row seeds with price_cents = NULL (owner has NOT set ad prices
--     yet — a NULL price is honest; a made-up number would not be) and
--     active = false (nothing is purchasable);
--   * activation is an owner action (set price_cents + active=true via SQL /
--     a future admin surface) — no code path in this slice flips `active`;
--   * entitlement jsonb describes what the product grants (ad credits,
--     promotion level, international reach) in a bounded document;
--   * SELECT for authenticated users is limited to ACTIVE rows (plus admins),
--     so an unpriced draft product can never leak as a public offer;
--   * additive only; reversible; no existing object touched.
--
-- ROLLBACK: supabase/rollbacks/20260714191000_ad_products_registry_v1.down.sql
-- ============================================================================

begin;

create table if not exists public.ad_products (
  slug        text primary key check (slug in (
                'single_ad',
                'ai_promoted_ad',
                'premium_promoted_ad',
                'international_ad',
                'package_5',
                'package_20',
                'agency_package',
                'extra_promotion'
              )),
  audience    text not null default 'company' check (audience in ('company', 'agency', 'any')),
  -- NULL = owner has not confirmed a price yet (honest unknown, never 0).
  price_cents int check (price_cents is null or price_cents >= 0),
  currency    text not null default 'EUR' check (currency = 'EUR'),
  active      boolean not null default false,
  entitlement jsonb not null default '{}'::jsonb
                check (char_length(entitlement::text) <= 2000),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.ad_products (slug, audience, price_cents, active, entitlement, sort_order) values
  ('single_ad',           'company', null, false, '{"ad_credits": 1}'::jsonb, 10),
  ('ai_promoted_ad',      'company', null, false, '{"ad_credits": 1, "promotion": "ai"}'::jsonb, 20),
  ('premium_promoted_ad', 'company', null, false, '{"ad_credits": 1, "promotion": "premium"}'::jsonb, 30),
  ('international_ad',    'company', null, false, '{"ad_credits": 1, "international": true}'::jsonb, 40),
  ('package_5',           'company', null, false, '{"ad_credits": 5}'::jsonb, 50),
  ('package_20',          'company', null, false, '{"ad_credits": 20}'::jsonb, 60),
  ('agency_package',      'agency',  null, false, '{"ad_credits": 20, "promotion": "standard"}'::jsonb, 70),
  ('extra_promotion',     'any',     null, false, '{"promotion": "boost", "applies_to": "existing_ad"}'::jsonb, 80)
on conflict (slug) do nothing;

-- ── RLS — active rows readable; drafts admin-only; NO client write path ─────
alter table public.ad_products enable row level security;

drop policy if exists ad_products_select on public.ad_products;
create policy ad_products_select on public.ad_products
  for select to authenticated
  using (active = true or public.is_admin());
-- No insert/update/delete policies: owner activates via service role / SQL.

revoke all on public.ad_products from anon;
grant select on public.ad_products to authenticated;
grant select, insert, update on public.ad_products to service_role;
revoke delete on public.ad_products from service_role; -- registry rows retire via active=false

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via
-- supabase/rollbacks/20260714191000_ad_products_registry_v1.down.sql):
--   drop policy if exists ad_products_select on public.ad_products;
--   drop table if exists public.ad_products;
-- ════════════════════════════════════════════════════════════════════════════
