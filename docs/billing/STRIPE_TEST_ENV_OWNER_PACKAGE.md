# STRIPE TEST — ENV OWNER PACKAGE (names only; never paste values into chat or logs)

Verdict: `STRIPE_TEST_ENV_PACKAGE_READY_PENDING_OWNER_INPUT`

Everything below is TEST mode. **No Stripe Live, no real prices, no
charges** — the config layer structurally blocks live keys
(`config-core.ts`: any `sk|pk|rk_live_` → `stripe_live_blocked`).

## 1. Required variable NAMES (9)

| Name | Value shape (never the value itself) |
|---|---|
| `PAYMENTS_ENABLED` | `true` to arm TEST billing (default `false`) |
| `BILLING_PROVIDER` | `stripe` |
| `STRIPE_MODE` | `test` |
| `STRIPE_SECRET_KEY` | `sk_test_…` (TEST secret key) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (from the TEST webhook endpoint) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` |
| `STRIPE_PRICE_WORKER_PLUS` | `price_…` (TEST price id) |
| `STRIPE_PRICE_COMPANY_PILOT` | `price_…` (TEST price id) |
| `STRIPE_PRICE_AGENCY_PILOT` | `price_…` (TEST price id) |

## 2. Scopes

- **Local** (`apps/web/.env.local`): all 9 — for local TEST checkout runs.
- **Vercel Preview**: all 9 as Preview-scoped vars. NOTE the recorded
  incident: an EMPTY-STRING `BILLING_PROVIDER` breaks every preview build
  (`docs/ops/vercel-preview-billing-provider-owner-action-v1.md`) — set a
  real value or do not set the var at all.
- **Production**: ONLY if TEST mode is deliberately exercised in prod, and
  only with `sk_test_`/`pk_test_` values. Live keys are refused by code.

## 3. Stripe TEST webhook endpoint

- URL: `https://labourmarket.ai/api/billing/webhook` (or the preview URL
  for preview testing).
- Events to enable: `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.paid`,
  `invoice.payment_succeeded`, `invoice.payment_failed`.
- Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.

## 4. Test-product creation sequence (Stripe dashboard, TEST mode)

1. Products → create `Worker Plus`, `Company Pilot`, `Agency Pilot`
   (placeholder TEST prices — real pricing is a later Commercial Train
   decision; `PRICING_READINESS_STATE = "draft_pricing"`).
2. For each, create a recurring monthly TEST price → copy the `price_…` id
   into the matching `STRIPE_PRICE_*` variable.
3. Create the webhook endpoint (§3) → copy `whsec_…`.
4. Developers → API keys (TEST) → copy `sk_test_` and `pk_test_`.

## 5. Rollback / disable sequence

Set `PAYMENTS_ENABLED=false` (or remove `BILLING_PROVIDER` entirely,
never empty-string) → the provider seam returns noop, every checkout
answers `payments_disabled`, entitlements stay permissive-free. No data
change required; existing TEST rows are inert.

## 6. What this does NOT authorize

Applying the #1035 migration (separate human gate), Stripe Live, real
prices, charges, LMC flags.
