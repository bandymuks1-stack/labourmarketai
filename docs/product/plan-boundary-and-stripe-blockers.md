# Plan Boundary + Stripe-Sprint Blocker List

> The pre-payment plan boundary (what each plan WILL include) and the explicit
> blocker list the **later, separate** Stripe sprint must clear before any money
> moves. Implementation: `apps/web/lib/billing/`. Guarded by
> `lib/guards/no-live-payments.test.ts`. Subordinate to
> [`pre-payment-product-readiness.md`](./pre-payment-product-readiness.md) §4.

## State today

`PAYMENTS_ENABLED = false`. No Stripe SDK, no checkout/billing route, no card
collected. Paid tiers render a **"payment not enabled — request pilot access"**
state; access is granted **manually by an admin** (pilot access).

## Plan → feature → limit

| Plan | Audience | Access today | Key entitlements |
|------|----------|--------------|------------------|
| **Free Worker** | worker | free | profile · journal · basic skills · readiness checklist (1 country) |
| **Worker Plus** | worker | payment_not_enabled (pilot-manual) | expanded CV · multi-country readiness (10) · document-expiry reminders · priority visibility *(later, not active)* |
| **Company Pilot** | company | payment_not_enabled (pilot-manual) | create needs (5) · candidate readiness summaries · booking requests · communication · team matching |
| **Agency Pilot** | agency | payment_not_enabled (pilot-manual) | multi-company · worker pool · doc-readiness tracking · booking pipeline · needs (25) |
| **Admin / Internal** | admin | internal | verify documents · manage country rules · manage pilots |

Entitlements are limits / booleans only — never a charge. `gateFeature()` resolves
`ok` / `payment_not_enabled` / `not_in_plan` / `over_limit` with a CTA.

## Stripe-sprint blocker list (must clear before money moves)

A separate sprint owns these — none are started here:

1. **Provider decision** — Stripe vs Montonio (EU/Baltic local methods). Unstarted.
2. **`subscriptions` write path** — the table exists (`external_ref` unused);
   needs create/update RPCs + webhook reconciliation.
3. **Checkout flow + route** — none exists (guarded absent); needs a hosted
   checkout, success/cancel handling, and idempotency.
4. **Webhook handler** — signature verification, event → subscription state.
5. **Entitlement ENFORCEMENT** — `gateFeature()` exists but is informational;
   flipping `PAYMENTS_ENABLED` must turn `payment_not_enabled`/`over_limit` into
   real blocks + an upgrade path.
6. **Pilot → paid migration** — admin-granted pilot access must convert cleanly
   to a real subscription without losing data.
7. **Tax / invoicing** — VAT handling per country, invoice generation, receipts.
8. **Pricing finalisation** — `plans.price_eur_monthly` is null; prices are not set.
9. **Dunning / past_due / cancellation** lifecycle UX.
10. **Legal** — terms/refund/billing policy reviewed by counsel (legal pages are
    still honest placeholder shells).
11. **Secrets** — Stripe keys in Vercel env only, never in repo (untouched here).

## Can the Stripe test-mode sprint start after this sprint?

**Yes — the preconditions are in place:** the plan boundary, feature map, and
entitlement helpers exist; payments are provably off; the gate is one flag flip
away from enforcement. The blockers above are the Stripe sprint's actual backlog.
