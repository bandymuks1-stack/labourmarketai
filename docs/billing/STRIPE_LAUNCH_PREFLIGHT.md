# STRIPE LAUNCH PREFLIGHT — factual repo-side audit

Status: `STRIPE_PRODUCTION_PREFLIGHT_COMPLETE_TEST_MODE_WORK_PENDING`
Audited: 2026-08-05 at production main `5be4baf6` (read-only; no Stripe API
calls; no secret values in this document — env var NAMES only).

> ⚠ PARTIALLY SUPERSEDED BY #1014 (merged `52c34584`, same day). The
> "Current factual configuration" table below describes the PRE-#1014 state
> at its stated audit point and is kept as the audit record. Now FIXED on
> main: API version pin (compile-time `2026-05-27.dahlia`), `invoice.paid`
> handled, retry-safe webhook idempotency (`duplicate-processed` /
> `duplicate-unprocessed` split, `markWebhookFailed` keeps the record open),
> re-subscribe collision guarded (a LIVE subscription of the same owner+plan
> is never overwritten — `conflict-live-subscription`). STILL TRUE: no
> Customer Portal; person-only billing mapping (no organization billing
> subject — see `docs/architecture/MULTI_ORGANIZATION_RELATIONSHIP_DOCTRINE.md`
> §7, required before any org plan goes live); `PAYMENTS_ENABLED=false`;
> Stripe Live NOT authorized.

## Current factual configuration

| Item | Fact |
|---|---|
| SDK | `stripe@22.2.1` (`apps/web/package.json`) |
| API version pin | **NONE** — `new Stripe(secret)` with no `apiVersion` (`lib/billing/providers/stripe-test.ts:26`); SDK-default applies |
| Checkout | `app/api/billing/test-checkout/route.ts` → `checkout-core.ts`; subscription mode; `client_reference_id = user.id`; canonical-origin hardened |
| Customer Portal | **DOES NOT EXIST** (no cancel / manage / update-payment-method surface) |
| Webhook | `app/api/billing/webhook/route.ts`; raw-body-then-verify via `constructEvent`; `livemode!==false` rejected (`live_event_rejected`) |
| Events handled | `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_succeeded`, `invoice.payment_failed` — **`invoice.paid` NOT handled** (silently 200-OK'd as `ignored`) |
| Idempotency | `payment_webhook_events` `unique(provider,event_id)`; insert-before-process (defect — see risks) |
| Plans | `lib/billing/plans.ts`: `free_worker`, `worker_plus`, `company_pilot`, `agency_pilot`, `admin_internal`; static `PAYMENTS_ENABLED=false` guard-pinned |
| Price env vars | `STRIPE_PRICE_WORKER_PLUS` / `_COMPANY_PILOT` / `_AGENCY_PILOT` (TEST only; **no live price vars exist**) |
| Missing price behaviour | Fail-closed at 3 layers (`price_not_configured`; button hidden) — no silent grant |
| Entitlement fallback | `enforced=false` outside valid stripe_test config → everything allowed (deliberate pilot permissiveness); with billing active + tables erroring → degrade to FREE, never grant |
| Redirect-grants-access? | **No.** Success URL param is never read; `checkout.session.completed` writes `incomplete`; entitlement requires `active/trialing` from subscription webhooks |
| Live blocking | 4 layers: env schema, `config-core` priority-1 live block (`sk_live_`/`pk_live_`/`rk_live_` shape → `stripe_live_blocked`), `requireStripeTestSecret` re-check, `no-live-payments` build guard; webhook rejects `livemode:true` |
| BILLING_PROVIDER empty-string break | **FIXED** (`blankAsAbsent` preprocess + regression test) |
| Customer mapping | **Person↔customer only** (`owner_id → profiles.id`); NO organization↔customer mapping; `billing_customers` table is dead schema (no reader/writer) |
| Schema | `20260613200000_billing_test_mode_records.sql` (3 tables, RLS owner-or-admin read, service-role-only writes) — **NOT in APPLIED_LEDGER**, but **RECONCILED 2026-08-05 by read-only prod check**: all three tables EXIST in production project `gorgitwvdzxbnaxhrsrw` with **0 rows each**. The migration was applied without a ledger entry (ledger-integrity gap) → a reconciliation ledger row must be added (docs-only, ships with the Test-Mode fixes PR). |
| Prod rows (verified 2026-08-05) | `billing_customers` 0, `billing_subscriptions` 0, `payment_webhook_events` 0 |
| Preview vs Production webhook config | UNKNOWN from repo — must be checked in Vercel/Stripe dashboards |

## Missing items

1. `invoice.paid` handler (currently ignored with 200).
2. `apiVersion` pin — parser reads `current_period_start/end` on Subscription
   and `invoice.subscription`, which moved on Basil-and-later API versions;
   mismatch degrades **silently** to nulls/no-ops.
3. Customer Portal (cancel/manage/update card) + a stable profile→`cus_…`
   lookup (`billing_customers` unwired).
4. Ledger reconciliation for the billing migration.
5. Live price ids / live env path (intentionally absent — live is a hard
   owner gate).
6. Organization↔customer mapping (company/agency plans currently bill an
   individual profile; seats undefined).
7. Entitlement enforcement breadth: exactly 1 real server gate
   (`booking_requests`); 12 feature keys are declared-boundary-only.

## Security risks

| Sev | Risk |
|---|---|
| HIGH | **Webhook event loss**: idempotency row inserted BEFORE processing; processing error → marked processed-with-error → HTTP 200 → Stripe never retries → replay hits `duplicate` → state change lost forever. No reconciliation job exists. |
| HIGH | **Re-subscribe collision**: two unique constraints (`(provider,provider_subscription_id)` vs `(owner_id,plan_key,provider)`); a re-subscribe after cancel, or checkout by a user holding a manual pilot override, violates the second → `23505` → swallowed into 200 → **user pays, gets nothing, silently**. |
| MED | `recordWebhookEvent` returning `"error"` is unhandled → event processed with no idempotency record → replayable. |
| MED | Silent API-version drift (see missing #2). |
| NOTE | Go-live requires a code change by design (`assertTestEvent` rejects `livemode:true`); flipping env vars is not sufficient — a safety property to keep. |

## Exact Test-Mode implementation plan (Track 8)

1. **Reconcile ledger** (read-only prod check → add ledger row or owner-gated
   apply). Everything below no-ops to `needs-migration` without the tables.
2. Pin `apiVersion` in `stripe-test.ts` to match `webhook-core.ts` field
   shapes (or migrate the parsers to Basil shapes and pin Basil).
3. Add `invoice.paid` to `HANDLED` + route dispatch (treat as
   `invoice.payment_succeeded`).
4. Fix re-subscribe collision **in code** (on `23505` from
   `(owner_id,plan_key,provider)`, update the existing row by that key) —
   avoids a migration; a constraint-drop migration stays owner-gated if ever
   preferred.
5. Make failures retryable: non-2xx on processing error; record idempotency
   only after success (or `processed=false` + reprocess-on-retry); handle
   `recorded === "error"`.
6. **Owner-supplied env** (names only): `PAYMENTS_ENABLED=true`,
   `BILLING_PROVIDER=stripe`, `STRIPE_MODE=test`, `STRIPE_SECRET_KEY`
   (sk_test_…), `STRIPE_WEBHOOK_SECRET` (whsec_…), 3 × `STRIPE_PRICE_*`
   test ids; webhook endpoint registered against the Production deployment
   URL and subscribed to all six events.
7. Then (not blocking Test proof): Customer Portal + `billing_customers`
   wiring + organization↔customer mapping.

Existing runbooks: `docs/audits/stripe-test-activation-runbook.md`,
`docs/audits/stripe-test-mode-final-report.md`,
`docs/ops/vercel-preview-billing-provider-owner-action-v1.md`.

## Exact Live Mode gate (owner-only, NOT authorized)

Live requires ALL of: Test-Mode full proof (§12 of the train), production QA
journey proof, pilot analytics ready, pricing economics calculated, owner
approval of live products/prices/currency/VAT doctrine, new live secrets
(owner-only), removal of the deliberate `assertTestEvent` live block in a
dedicated owner-approved PR, and a rollback/disable switch. None of this is
performed by the train without explicit owner approval.
