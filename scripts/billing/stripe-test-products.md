# Stripe TEST products — owner runbook (Pricing & Payments v1)

> PRINT-ONLY runbook. Nothing in the repo calls the Stripe API to create
> products; the owner creates these by hand in the **Stripe TEST dashboard**
> (dashboard.stripe.com → toggle *Test mode* ON). Live mode is hard-blocked in
> code (`apps/web/lib/billing/config-core.ts`) — a live key can never activate
> billing, by design.

## 1. Products + monthly prices to create (all EUR, recurring monthly)

| Product name (suggested) | Plan slug | Monthly price | Env var for the TEST price id |
|---|---|---|---|
| LabourMarket.ai AI PLUS | `ai_plus` | 9.99 € | `STRIPE_PRICE_AI_PLUS` |
| LabourMarket.ai VIP MEDIA | `vip_media` | 24.99 € | `STRIPE_PRICE_VIP_MEDIA` |
| LabourMarket.ai PROJECT LAUNCH OFFER | `launch_offer_99` | 99.00 € | `STRIPE_PRICE_LAUNCH_OFFER` |
| LabourMarket.ai Agency START | `agency_start` | 99.99 € | `STRIPE_PRICE_AGENCY_START` |
| LabourMarket.ai Agency GROWTH | `agency_growth` | 249.99 € | `STRIPE_PRICE_AGENCY_GROWTH` |
| LabourMarket.ai Agency SCALE | `agency_scale` | 499.99 € | `STRIPE_PRICE_AGENCY_SCALE` |

Free tiers (`free_person`, `free_company`) need NO Stripe product.
Legacy pilot tiers keep their existing env vars (`STRIPE_PRICE_WORKER_PLUS`,
`STRIPE_PRICE_COMPANY_PILOT`, `STRIPE_PRICE_AGENCY_PILOT`) if still wanted.

## 2. Launch Offer 15% first-annual coupon (seam)

Create a TEST **coupon**: `15% off, duration: once`, restricted to annual
prices, suggested id `LAUNCH15-FIRST-ANNUAL`. The eligibility memory is
automatic (`billing_offer_eligibility`, migration `20260714190000`); applying
the coupon at annual checkout is the activation-sprint wiring step. The 15%
math lives in `apps/web/lib/billing/offers.ts`
(`applyFirstAnnualDiscountCents`).

Annual prices themselves (e.g. Launch Offer 1188.00 €/yr before discount) are
created only when the owner decides to sell annual terms.

## 3. After creating products

1. Copy each TEST price id (`price_…`) into the matching env var
   (Vercel env / `.env.local` — never committed).
2. Set the webhook endpoint (TEST): `https://<host>/api/billing/webhook`,
   events: `checkout.session.completed`, `customer.subscription.*`,
   `invoice.payment_succeeded`, `invoice.payment_failed`. Copy the signing
   secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
3. Set `STRIPE_SECRET_KEY` to the TEST secret (`sk_test_…`).
4. Flip `PAYMENTS_ENABLED=true`, `BILLING_PROVIDER=stripe`, `STRIPE_MODE=test`.

Full activation gates: `docs/product/pricing-payments-v1.md` §8.
