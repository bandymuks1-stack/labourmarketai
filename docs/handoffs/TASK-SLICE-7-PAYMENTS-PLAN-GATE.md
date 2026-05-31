# Slice 7 — Payments / subscriptions — RED by default · needs-human-gate

**Status:** RED. Draft plan only. **No payment code, no provider, no env, no live
checkout, no migration applied, no merge, no deploy.** Per the train spec this
slice is RED by default and stops for explicit owner approval.

## Current state inventory (verified)

- **Pricing display is real & honest.** `lib/marketing/plans.ts` `getPlans()`
  reads the live `plans` table (migration 0001, read-only display); the pricing
  page renders tiers via `pricing-table.tsx`. After §18 cleanup the page states:
  *"Prices are not finalised yet and billing is never started for you on this
  page … activation is manual — reach out …"* — no checkout button, no auto
  billing.
- **No payment integration exists anywhere.** No Stripe/Montonio/Adyen SDK, no
  checkout, no webhook, no subscription state. This is deliberate.
- **Guards actively forbid payment code today.** At least 8 guards ban payment
  imports/wording, e.g. `journal-evidence-loop.test.ts`:
  `expect(all).not.toMatch(/stripe|montonio|checkout|subscription|pricing/i)`,
  and several RPC guards ban `from "stripe"`. The honesty guards
  (`check:pricing-honesty-copy`) ban "checkout now / subscription active /
  automatic billing / payment active".
- **Doctrine.** §18 (Realumo principas) + §18.1: sales/pilot is an **offline,
  AI-led process, not gates in the product.** Any in-product billing must not
  fake an active paid state.

So today the product is intentionally payment-free; "activation is manual" is
the true state.

## Why RED

Live payments require, at minimum: a payment provider account + **secret keys**
(owner-managed, never in repo), **env/secret** configuration on Vercel +
Supabase, **new schema** (customers/subscriptions/invoices + RLS), a **webhook**
endpoint with signature verification, and **relaxing the payment-ban guards**.
Every one of these is a RED trigger (billing, env/secrets, migration, RLS,
loosening guards). None may be done autonomously.

## Exact implementation plan (when the owner approves)

Phased; each phase is its own gated PR. Nothing below is implemented here.

**Phase A — Provider + commercial decision (owner).**
- Choose provider (Stripe vs Montonio — Baltic/EU/SEPA coverage matters).
- Decide model: subscription tiers vs per-demand vs per-seat; currency; VAT/MOSS
  handling (EU B2B reverse-charge). This is a business decision, not code.

**Phase B — Schema (RED migration, owner applies via Supabase MCP).**
- `billing_customers` (profile_id/organization_id → provider_customer_id), RLS
  own-only + admin.
- `subscriptions` (customer ref, plan slug → `plans`, status, current_period_end,
  provider_subscription_id), RLS own-read + admin; **writes only via webhook
  (service-role) or SECURITY DEFINER RPC** — never client-writable.
- Optional `invoices` mirror for receipts.
- Additive + reversible, §16 naming, passes `migration-safety`.

**Phase C — Provider API + webhook (RED, env required).**
- Server-only checkout-session creation (no secret on client).
- Webhook route with provider signature verification; updates `subscriptions`
  via service-role. Idempotent on event id.
- **Secrets** (`*_SECRET_KEY`, `*_WEBHOOK_SECRET`) set by the owner in Vercel +
  Supabase — never committed, never printed.

**Phase D — Product surface (GREEN-able once B+C live).**
- Replace "activation is manual — reach out" with a real checkout CTA **only for
  active, configured plans**; keep the honest fallback otherwise.
- Read-back of real subscription status (mirrors the slice-1/3/5/6 pattern).
- Update the payment-ban guards to a **scoped** allowance (allow the billing
  module only; keep the ban everywhere else) so drift is still caught.

**Phase E — Doctrine + honesty.**
- §9 changelog row; ensure no "subscription active"/"automatic billing" copy
  unless literally true; honest empty/zero states.

## Forbidden in this slice (confirmed not done)

No Stripe/live keys · no provider activation · no env/secret changes · no live
checkout · no migration applied · **no auto-merge** · no deploy.

## Recommendation

Hold for owner decision on Phase A (provider + model). The product is honestly
payment-free today and §18-compliant; nothing is broken or faked. Proceed only
on explicit owner approval, phase by phase, each behind its own human gate.
