# Stripe Test-Mode Sprint — Final Proof Pack

> Closeout of the Stripe **test-mode** payments sprint. A complete, testable
> payment chain — checkout → webhook → subscription → entitlement → admin — with
> **no real money, no live keys, no public live checkout**. Companion:
> [`../product/plan-boundary-and-stripe-blockers.md`](../product/plan-boundary-and-stripe-blockers.md).

## 1. What was implemented

The full test chain, env-gated and inert until the owner provides a TEST config:

```
checkout(test) → Stripe test session → webhook signature verify →
  subscription/payment rows → entitlement update → gateFeature unlocks →
  admin visibility
```

- **PR1** — billing foundation + Stripe test-mode provider adapter; config core
  (LIVE hard-blocked); evolved `no-live-payments` guard + `no-secret-leakage`.
- **PR2** — three test-mode billing tables (RED, owner-applied).
- **PR3** — strict test-checkout route + test-mode pricing UI.
- **PR4** — signature-verified, idempotent test webhook.
- **PR5** — entitlement enforcement v1 (subscription-derived, permissive while off).
- **PR6** — admin billing center + manual pilot override.
- **PR7** — pricing UX hardening (3 honest states) + no-live-claim guard.
- **PR8** — this report.

## 2. Branches / PR numbers / merge SHAs

| PR | Title | # | State | SHA |
|----|-------|---|-------|-----|
| 1 | foundation + provider adapter | #367 | merged | `122c367` |
| 2 | test-mode billing tables | #368 | **RED draft — owner applies** | — |
| 3 | strict test-checkout route + pricing UI | #369 | merged | `7c0b195` |
| 4 | signature-verified webhook | #370 | merged | `37c7839` |
| 5 | entitlement enforcement v1 | #371 | merged | `6e6f9f1` |
| 6 | admin billing center + override | #372 | merged | `8b87e2a` |
| 7 | pricing UX hardening + guard | #373 | merged | `0721861` |
| 8 | final proof pack (this) | — | this PR | — |

## 3. DB migration status

**PR2 `20260613200000_billing_test_mode_records` — RED draft, owner-applied** via
Supabase MCP `apply_migration` (like the prior `#358`). Three additive tables:
`billing_customers`, `billing_subscriptions` (full status enum, periods,
`cancel_at_period_end`, `last_payment_status`, `test_mode`; **no money amount**),
`payment_webhook_events` (idempotency via `unique(provider,event_id)`). RLS:
owner/admin SELECT; **server-only writes** (service_role); legacy `subscriptions`
(0 rows) untouched. Until applied, every billing surface degrades to
`needs-migration` honestly. Dual migration baseline bumped 79 → 80.

## 4. Payment provider status

`lib/billing/config-core.ts` resolves `disabled | stripe_test |
stripe_live_blocked`. **OFF by default.** Activates ONLY with
`PAYMENTS_ENABLED=true` + `BILLING_PROVIDER=stripe` + `STRIPE_MODE=test` +
`sk_test_` + `whsec_`. A live mode OR any live key (`sk_live_`/`pk_live_`/
`rk_live_`) → `stripe_live_blocked`, never an active provider. The Stripe SDK is
imported in exactly one file (`providers/stripe-test.ts`, allowlisted).

## 5. Test checkout status

`POST /api/billing/test-checkout` — strict gate (`evaluateCheckoutRequest`):
auth + a paid pilot plan + eligible caller (audience role / admin) + a configured
test price; otherwise an honest, specific error. The provider is **noop** unless
config is `stripe_test`, so a disabled/live config can never create a session.
Pricing shows the test-checkout block **only** in test mode (clear TEST badge);
no public "Pay now". **Ready to run once the owner adds the test config + price
ids** (see §16).

## 6. Webhook status

`POST /api/billing/webhook` — raw-body **signature verification** via the
provider + the configured TEST webhook secret; **live events rejected (400)**;
**idempotent** by `event_id`; processes `checkout.session.completed`,
`customer.subscription.*`, `invoice.payment_*`; writes via the service-role
store. Business logic never runs without a verified signature.

## 7. Subscription state status

`billing_subscriptions` carries the full lifecycle: `none/trialing/active/
past_due/unpaid/cancelled/incomplete/expired`, periods, `cancel_at_period_end`,
`last_payment_status`. A failed invoice → `past_due`. Read-then-merge upsert
keeps owner/plan linkage from checkout when later events omit it.

## 8. Entitlement enforcement status

`resolveEntitlements` + `entitlementAllows` (pure, 18 tests): admin / active
subscription / `past_due` grace / manual override / free fallback.
**PERMISSIVE while billing is disabled** (the pilot is never retroactively
locked); **enforced once test mode is active** — paid features need an active
context; cancelled/expired/unpaid → free. Wired into `proposeBookingAction`
(route/action enforcement, not just UI) via `hasFeature`.

## 9. Admin billing status

`/dashboard/admin/billing` — config state, subscriptions (manual/test markers),
webhook events, last payment, entitlement source, live-readiness blockers, and a
**manual pilot-access grant/revoke** (admin-gated, stored as a `manual_…` test
row). Always labelled TEST / "live is hard-blocked"; **admin cannot enable live**.

## 10. Pricing UX status

One honest billing-status banner with three states (disabled / test-mode /
live-blocked) + a "future live prepared but inactive" note. The plan boundary and
test-checkout block self-gate by state. No misleading live copy.

## 11. Tests / guards / build

All PRs green: typecheck + lint + build + the full guard suite (~3051 tests).
New/updated guards: `no-live-payments` (strengthened — test SDK allowed in the
adapter only, live key literals + live activation fail the build),
`no-secret-leakage`, `pricing-no-live-claim`, and the `chat-visibility-rls`
service-role allowlist (webhook store + admin billing action, audited). Pure
suites: config, checkout-core, webhook-core, entitlements-v1.

## 12. Production smoke

`/pricing` is 200 with the disabled-state banner (test env absent in prod →
honest "payments off"). `/api/billing/test-checkout` and `/api/billing/webhook`
are registered. `/dashboard/admin/billing` is auth-gated (307 → login). No live
keys present → everything resolves to the disabled/needs-migration honest state.

## 13. Confirmation

**No live payments. No live keys. No money. No public live checkout.**
`PAYMENTS_ENABLED` default false; live is hard-blocked in code and guarded.

## 14. Can a live-payments readiness sprint start?

**Not yet — first run + validate the TEST chain** (owner provides §16). Once the
test chain is proven end-to-end in Stripe test mode, a live-readiness sprint can
begin; it must clear §15.

## 15. Blocker list for live payments

1. Prove the TEST chain end-to-end (checkout → webhook → subscription →
   entitlement) in Stripe test mode.
2. Apply PR2 (`billing_test_mode_records`) to prod.
3. A deliberate, reviewed flip to live (new live keys in Vercel env only; the
   guard must be consciously evolved to permit live — currently it fails the
   build on any live key/mode).
4. Final pricing set on the Stripe prices (no money amount is stored today).
5. Tax/VAT + invoicing + receipts.
6. Dunning / `past_due` / cancellation UX end-to-end.
7. Legal: terms, refund/cancellation policy, billing policy (counsel).
8. Live webhook endpoint + signing secret in Vercel env.

## 16. What the owner must provide to RUN the test checkout

In **Vercel env / `.env.local` (TEST values, never committed)**:
- `PAYMENTS_ENABLED=true`, `BILLING_PROVIDER=stripe`, `STRIPE_MODE=test`
- `STRIPE_SECRET_KEY=sk_test_…`
- `STRIPE_WEBHOOK_SECRET=whsec_…` (from `stripe listen` or the test endpoint)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`
- `STRIPE_PRICE_WORKER_PLUS` / `STRIPE_PRICE_COMPANY_PILOT` /
  `STRIPE_PRICE_AGENCY_PILOT` = the **test** `price_…` ids
In **Stripe (test mode)**:
- create the 3 products + recurring test prices;
- add a webhook endpoint → `https://<domain>/api/billing/webhook` with the
  events in §6, and copy its signing secret to `STRIPE_WEBHOOK_SECRET`.
Then test with Stripe test cards (e.g. `4242 4242 4242 4242`). **For live later:**
the owner also provides Stripe account, company legal name, VAT, billing address,
support email, refund/cancellation policy, final pricing, and **live keys in
Vercel env only** — none of which are needed for the test chain.

## 17. What was NOT touched

No live Stripe, no live keys, no money, no public live checkout; no DNS, no Vercel
production env/secrets, no bank data, no live billing settings; no committed
secrets; no real card data; no destructive migrations; no RLS loosening; no fake
paid/active status; the `no-live-payments` guard was strengthened, never disabled.

---

### Note on Telegram progress reports
labourmarketai has **no connected Telegram reporter** (the agantai bot is a
separate project and must not be mixed). Per-PR progress is therefore recorded in
the PR descriptions + this report rather than sent to Telegram.
