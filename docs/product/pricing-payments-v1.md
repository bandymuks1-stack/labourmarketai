# Pricing & Payments v1 (Sprint v2 §9–§11) — architecture + activation runbook

Status: **production-SHAPED, payments OFF**. The kill-switch
(`PAYMENTS_ENABLED=false` in `apps/web/lib/billing/plans.ts`) stays false;
live Stripe keys are hard-blocked (`config-core.ts`); everything below is
either live-safe informational UI or gated behind owner activation.

## 1. Owner-confirmed price table (exact, test-pinned)

Pinned by `apps/web/lib/billing/plans-v2.test.ts` — a price change fails CI
until the test is deliberately updated.

| Audience | Plan slug | Name | Monthly price |
|---|---|---|---|
| Person | `free_person` | FREE | 0 € |
| Person | `ai_plus` | AI PLUS | 9.99 € |
| Person | `vip_media` | VIP MEDIA | 24.99 € |
| Company | `free_company` | FREE | 0 € |
| Company | `launch_offer_99` | PROJECT LAUNCH OFFER | 99 € |
| Agency | `agency_start` | START | 99.99 € |
| Agency | `agency_growth` | GROWTH | 249.99 € |
| Agency | `agency_scale` | SCALE | 499.99 € |

Source of truth: `PLAN_CATALOGUE_V2` in `apps/web/lib/billing/plans.ts`
(typed, price cents, EUR). The legacy `PRE_PAYMENT_PLANS` catalogue is
untouched; legacy keys resolve via `LEGACY_PLAN_ALIASES`
(`free_worker→free_person`, `worker_plus→ai_plus`,
`company_pilot→launch_offer_99`, `agency_pilot→agency_start`;
`admin_internal` stays legacy-internal).

Entitlement shape per plan (`PlanV2Entitlements`): `activeAdLimit`
(number | "unlimited"), `internalPromotion`, `aiAssistMonthlyRuns`,
`mediaGalleryItems`, `visibilityBoost` (architecture flag — no UI claims it),
`managedCompanies`. Owner ad rule encoded: normal company tiers get a FINITE
ad allowance (free company = 1 active ad); the Launch Offer is the only
unlimited company exception.

## 2. Launch Offer + automatic 15% first-annual discount

Logic: `apps/web/lib/billing/offers.ts` (pure, tested in `offers.test.ts`).

- Launch Offer activation window: **until 2026-10-31 inclusive (UTC)** —
  shown on the public pricing page.
- Companies activating inside the window **automatically** earn eligibility
  for **15% off their FIRST annual subscription**, valid if that annual
  subscription is activated **before 2027-01-01 (UTC, exclusive)**.
- The system remembers automatically: the webhook chain
  (`subscription-store.ts → maybeRecordLaunchOfferEligibility →
  offer-store.ts`) writes a `billing_offer_eligibility` row when a
  `launch_offer_99` (or aliased `company_pilot`) subscription becomes
  active/trialing inside the window. Idempotent
  (`unique (profile_id, offer_slug)`), best-effort, degrades to
  needs-migration until the table exists.
- Consumption seam: `firstAnnualDiscountApplies()` +
  `applyFirstAnnualDiscountCents()` (15%, rounded to cents) + a Stripe TEST
  coupon (see `scripts/billing/stripe-test-products.md` §2). Wiring the coupon
  into an annual checkout is an activation-sprint step (annual prices are not
  sold yet).

Migration: `supabase/migrations/20260714190000_billing_plans_offers_v1.sql`
(`billing_offer_windows` registry + `billing_offer_eligibility`; RLS
owner/admin SELECT, server-only writes; -- DOWN + paired rollback file). DRAFT
— owner gate.

## 3. Job-ad product architecture (no purchase flow)

Registry: `apps/web/lib/billing/ad-products.ts` (static, typed) mirrored by
`supabase/migrations/20260714191000_ad_products_registry_v1.sql` (DRAFT).
Slugs: `single_ad`, `ai_promoted_ad`, `premium_promoted_ad`,
`international_ad`, `package_5`, `package_20`, `agency_package`,
`extra_promotion`.

- Every product: `price_cents = NULL` (owner has NOT confirmed ad prices —
  honest unknown) and `active = false`. RLS hides inactive rows from
  non-admins; the public pricing page lists them ONLY under an explicit
  "in preparation" section — names, no prices, no buy affordance.
- Entitlement resolution: `resolveActiveAdAllowance(plan, purchasedCredits)`
  — plan allowance + purchased ad credits; an "unlimited" plan
  short-circuits. Credits live in `credit_balances`/`credit_ledger` (§4).
- Activation: owner sets prices + flips `active` (service-role/SQL), adds
  purchase wiring in a later gated sprint.

## 4. Usage, credits, cost engine (§11)

Migration: `supabase/migrations/20260714200000_usage_cost_tracking_v1.sql`
(DRAFT): `usage_categories` registry (ai, storage, emails, bandwidth,
database, payments, media, voice, video), append-only `usage_events`
(update/delete revoked from every role incl. service_role), `credit_types`
registry (ad_credits, ai_credits), `credit_balances` (mutable, server-only
writes), append-only `credit_ledger`.

Code:
- `usage-core.ts` (pure validation/row building; metadata bounded ≤2000 chars
  serialized — REJECTED when over, never silently truncated) +
  `usage.ts` (server-only `recordUsageEvent`, never throws, honest
  needs-migration degradation).
- `cost-engine-core.ts` (pure rollup) + `cost-engine.ts` (server-only
  `getCustomerCostReportBestEffort(profileId)`).

**Documented decision — AI cost is READ-TIME rolled up from `ai_runs`**
(`actual_cost_usd` written by the shared AI router, gated draft
`20260714150000_ai_runs_audit_v1.sql`). `ai_runs` stays the single source of
truth; rows are NOT mirrored into `usage_events` (no double-write drift, no
backfill job). The other 8 categories report `not_instrumented` with
`knownCostUsd = null` until a real collector writes rows — numbers are never
fabricated; unknown-cost events are counted separately, never valued at 0.

## 5. Payment flow (test mode, once activated)

```
user (paid plan CTA)
  → POST /api/billing/test-checkout        [checkout-core gate: valid stripe_test
                                            config, paid plan (legacy or V2),
                                            eligible role, configured TEST price]
  → Stripe TEST Checkout session            [adapter: providers/stripe-test.ts —
                                            the ONLY file allowed to import the SDK]
  → Stripe webhook → POST /api/billing/webhook
      1. signature verified (whsec_, TEST)
      2. live events REJECTED (assertTestEvent)
      3. idempotency via payment_webhook_events (unique provider+event_id)
      4. checkout.session.completed / customer.subscription.* →
         subscription-store.upsertSubscription (billing_subscriptions)
           └─ Launch Offer hook → billing_offer_eligibility (automatic memory)
      5. invoice.payment_succeeded → applyInvoicePayment(+ parseInvoiceRenewal:
         a paid invoice extends current_period_start/end — renewal bookkeeping)
         invoice.payment_failed → last_payment_status=failed, status=past_due
  → entitlements: resolveEntitlements (entitlements-v1.ts) reads the
    subscription state; V2 limits come from PLAN_CATALOGUE_V2 entitlements.
```

## 6. Public pricing page honesty

`app/[locale]/(marketing)/pricing/page.tsx` renders
`components/marketing/pricing-catalogue-v2.tsx`: three audience columns with
the exact prices, the Launch Offer highlighted with its 2026-10-31 validity
and the 15% first-annual note (LT primary + en/ru/nl/de, `pricingV2.*`), a
visible "payment activation in preparation" banner, and the ONLY CTA being
the real waitlist/contact flow (`/api/waitlist`). No fake buy buttons.
Guarded by `apps/web/lib/guards/pricing-v2-honesty.test.ts` plus the existing
`pricing-public-surface` / `billing-readiness` / SR-5 guards.

## 7. Admin surface

`/dashboard/admin/billing` additionally shows the V2 catalogue (slugs,
audiences, prices, honest not-enabled state, alias map) and the Launch Offer
eligibility table with an explicit "migration not applied" notice until
`20260714190000` lands.

## 8. Activation runbook (owner gates, in order)

1. **Apply 3 migrations** (Supabase MCP `apply_migration`, never `db push`):
   `20260714190000_billing_plans_offers_v1`,
   `20260714191000_ad_products_registry_v1`,
   `20260714200000_usage_cost_tracking_v1`
   (plus the earlier gated `20260613200000_billing_test_mode_records` and
   `20260714150000_ai_runs_audit_v1` if not yet applied — the billing chain
   and AI-cost rollup depend on them). Update `docs/APPLIED_LEDGER.md`.
2. **Create Stripe TEST products** per
   `scripts/billing/stripe-test-products.md`; set the 6 `STRIPE_PRICE_*` env
   vars + `STRIPE_SECRET_KEY` (sk_test_) + `STRIPE_WEBHOOK_SECRET` (whsec_).
3. **Flip flags**: `PAYMENTS_ENABLED=true`, `BILLING_PROVIDER=stripe`,
   `STRIPE_MODE=test`. (The in-code `PAYMENTS_ENABLED` const in plans.ts is a
   separate, deliberate second switch and stays false until the owner flips
   it in a reviewed PR.)
4. Verify: test checkout on `/dashboard/admin/billing`, webhook events
   recorded, subscription row appears, Launch Offer eligibility row appears
   for a test company activation.
5. **Live remains blocked by design** (any `sk_live_`/`pk_live_`/
   `STRIPE_MODE=live` → `stripe_live_blocked`). Going live requires the owner
   to change that policy in code — an explicit RED-class decision outside
   this slice.

## 9. Test coverage added in this slice

- `plans-v2.test.ts` — price exactness (9.99/24.99/99/99.99/249.99/499.99),
  slugs, aliases, kill-switch pin, V2 checkout gate.
- `offers.test.ts` — window boundaries (2026-10-31 / 2027-01-01), 15% math,
  eligibility row building, consumption rules.
- `ad-products.test.ts` — registry completeness, all-inactive + null prices,
  ad allowance resolution (finite + credits; unlimited exception).
- `usage-core.test.ts` — category registry, quantity/cost/metadata bounds.
- `cost-engine-core.test.ts` — AI rollup math, unknown-cost counting,
  not-instrumented honesty.
- `webhook-core.test.ts` (extended) — `parseInvoiceRenewal`.
- `lib/guards/pricing-v2-honesty.test.ts` — page wiring, no fake activation
  language in `pricingV2.*` across the 5 active locales, no checkout
  affordance in the catalogue component, catalogue↔i18n key parity.
