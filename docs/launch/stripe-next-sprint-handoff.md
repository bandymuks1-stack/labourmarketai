# Stripe — next sprint handoff

This stage does **not** connect Stripe. This file tells the next sprint exactly
what to do, so launch can proceed safely without payments now.

## Hard boundary this stage kept
- No Stripe checkout, no Stripe secret/env, no live billing, no `pay now`, no
  `subscription active`, no fake paywall unlock, no provider switch to Stripe,
  no real payment, no DB apply for billing.
- `lib/billing/config-core.ts` keeps live **impossible** to activate; the
  `no-live-payments` guard stays strengthened.

## What the Stripe sprint must do (in order)
1. **Test mode first**: `PAYMENTS_ENABLED=true` + `BILLING_PROVIDER=stripe` +
   `STRIPE_MODE=test` + `sk_test_…` + `whsec_…` (env only, never committed).
2. Wire the **test** checkout → webhook → subscription → entitlement chain
   (the inert model in `payment-logic-before-stripe.md` becomes live-in-test).
3. Map the **entitlement matrix** → real `visibility.ts` widening (replace the
   "fake unlock" guard path with a real `billingLive` gate).
4. Add **billing status** surfaces (pending/active/cancelled/failed) + invoices /
   receipts / refunds / cancellation.
5. Replace honest "payments being prepared" copy with real states **only** once
   the test chain is proven.
6. Go live **only** after owner approval; live keys via env, never committed.

## Acceptance for the Stripe sprint
- `no-live-payments` guard still passes in test mode (live still blocked).
- No live key literal in source; Stripe SDK only in the allowlisted adapter.
- Entitlements never widen visibility unless `billingLive` is truly true.
- Owner explicitly approves the live switch.

## Inputs ready for them
- Inert plan/entitlement/billing-status model (this stage).
- `visibility.ts` already flags `wouldBeFakePaidUnlock` — the exact seam to make real.
