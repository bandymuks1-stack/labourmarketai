# Stripe TEST-Mode Activation Runbook

> The exact, owner-driven steps to RUN the full test checkout end-to-end. The
> code + DB are ready and merged; the chain's signature verification + event
> parsing are proven (`lib/billing/webhook-signature.integration.test.ts`). The
> only remaining steps need **your Stripe test account + test keys** — which I do
> not hold and cannot set in Vercel env without your action. **TEST mode only —
> never live keys, never real money.**

## What is already done

- Billing tables applied to prod (`20260613202244_billing_test_mode_records`).
- `/api/billing/test-checkout`, `/api/billing/webhook`, `/dashboard/admin/billing`
  live (currently honest-disabled — no test config).
- Guards: `no-live-payments`, `no-secret-leakage`, `pricing-no-live-claim` green;
  build fails on any `sk_live_`/`pk_live_`/`rk_live_` or live mode.

## Step 1 — Stripe test dashboard (TEST mode)

In Stripe **test mode** (toggle top-right), create 3 products + a recurring
**test** price each (test-only amounts are fine until final pricing):
- Worker Plus → price id → `STRIPE_PRICE_WORKER_PLUS`
- Company Pilot → price id → `STRIPE_PRICE_COMPANY_PILOT`
- Agency Pilot → price id → `STRIPE_PRICE_AGENCY_PILOT`

## Step 2 — Webhook endpoint (test)

Developers → Webhooks → Add endpoint:
- URL: `https://labourmarket.ai/api/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`
  (`invoice.paid` is the modern success event on the pinned API version —
  subscribing to `invoice.payment_succeeded` alone can miss the payment)
- Copy the **signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.

## Step 3 — Env (TEST values, never committed)

Set in **Vercel → Project → Settings → Environment Variables** (and/or
`.env.local` for local), then redeploy:

```
PAYMENTS_ENABLED=true
BILLING_PROVIDER=stripe
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
STRIPE_PRICE_WORKER_PLUS=price_…
STRIPE_PRICE_COMPANY_PILOT=price_…
STRIPE_PRICE_AGENCY_PILOT=price_…
```

Use ONLY `sk_test_`/`pk_test_`/`whsec_` (test). A live key fails the build by design.

## Step 4 — Confirm test mode is on

`curl -s -X POST https://labourmarket.ai/api/billing/test-checkout \
  -H 'content-type: application/json' -d '{"planKey":"company_pilot"}'`
- Before: `{"reason":"payments_disabled","testMode":false}` (disabled).
- After test config: `{"reason":"not_authenticated"}` → **test mode is ON** (the
  config gate passed; auth is the next gate). `/en/pricing` then shows the
  TEST-MODE checkout block + "TEST MODE" banner.

## Step 5 — End-to-end test checkout

1. Log in as a **company** user (or admin) on the live site.
2. Go to `/en/pricing` → the test-checkout block → **Company Pilot** → Start test
   checkout.
3. Stripe test checkout opens → pay with test card **`4242 4242 4242 4242`**, any
   future expiry, any CVC/ZIP.
4. Stripe fires the webhook → our `/api/billing/webhook` verifies it.

### Verify the chain
- **`/dashboard/admin/billing`** (admin): the subscription row appears (status
  `active`/`trialing`), the webhook event is listed, last payment status shows.
- DB (read-only, via Supabase): `select status, plan_key, test_mode from
  public.billing_subscriptions;` and `select event_type, processed from
  public.payment_webhook_events;` — rows present, `test_mode = true`.
- Entitlement: the company can now send a booking request (the `booking_requests`
  Company-Pilot feature) — previously `not-entitled` when enforced.

## Alternative — Stripe CLI (local, no browser)

```
stripe login                       # test mode
stripe listen --forward-to localhost:3000/api/billing/webhook
#   → prints a whsec_… → put it in .env.local as STRIPE_WEBHOOK_SECRET, restart
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_failed
```
Watch the app log + `/dashboard/admin/billing` update. (Triggered events use
Stripe's sample objects; for owner/plan linkage use a real checkout from Step 5.)

## Negative checks (already enforced / unit-proven)

- `PAYMENTS_ENABLED=false` → checkout `payments_disabled`. ✓ (live now)
- `STRIPE_MODE=live` / any `sk_live_`/`pk_live_`/`rk_live_` → config
  `stripe_live_blocked` + build fails. ✓ (guard)
- invalid webhook signature / wrong secret → rejected. ✓ (signature proof)
- duplicate event → idempotent (unique `provider,event_id`). ✓ (DB probe)
- unknown plan / unauthenticated → reject. ✓ (checkout-core)
- cancelled → entitlement removed; `invoice.payment_failed` → `past_due`. ✓
  (entitlements + DB probe)

## Step 6 — Customer self-service (added by the commercial readiness audit)

After a test subscription exists, open `/dashboard/account`:
- the return from checkout is acknowledged (`?billing=test_success`);
- the real subscription status + period end are shown;
- **Manage billing** opens the Stripe **customer portal** — cancel, change card,
  download invoices.

Enable the portal once in Stripe: **Settings → Billing → Customer portal →**
save a configuration (test mode). Without a saved configuration the portal API
returns an error and the button reports it honestly instead of opening.

### Cancel / re-subscribe check
1. Cancel in the portal → `customer.subscription.deleted` → status `cancelled`
   → the paid feature is refused again.
2. Subscribe again with the same user+plan → a NEW Stripe subscription id
   rebinds the same row → the feature works again. (Before the audit this hit
   the `(owner_id, plan_key, provider)` unique index, the write was dropped, and
   Stripe still received HTTP 200 — a paid-but-not-entitled customer.)

## Step 7 — LMC credit for testers (separate from Stripe)

Crediting LMC does NOT require Stripe. It requires the owner to switch
`lmc_promotional_grants_enabled` on in `public.lmc_settings` (service-role only,
via `lmc_set_flag_v1`). Until then the admin form at `/dashboard/admin/billing`
refuses honestly with `lmc_promotional_grants_disabled` and credits nothing.

Once on: `/dashboard/admin/billing` → **LMC ledger** → recipient email (a
verified account), amount (≤ 1000 LMC), reason, campaign, expiry (≤ 365 days),
idempotency key. A repeat with the same key returns the original grant instead
of crediting twice.

Schedule `pnpm -C apps/web lmc:expire-lots` (daily) so expired promotional
credit is actually shed — the function had no caller at all before this audit.

## Hard line

No live Stripe, no live keys, no real money, no public live checkout. Live
activation is a separate, deliberate sprint that must consciously evolve the
`no-live-payments` guard and add live keys in Vercel env only.
