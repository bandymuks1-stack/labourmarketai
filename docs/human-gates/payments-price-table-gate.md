# Gate G-7 / G-8 — the one price table + live Stripe activation (OWNER_GATE + EXTERNAL_GATE)

**Opened:** 2026-09-02 (FINAL COMPLETION, Train D1). **G-7 CLOSED 2026-09-05** (owner approval + same-day correction). **G-8 OPEN** (owner-only external actions below).
**Register rows:** [`docs/launch/FINAL_COMPLETION_REGISTER.md`](../launch/FINAL_COMPLETION_REGISTER.md) §3 G-7, G-8.

## The approved LAUNCH pricing (owner, 2026-09-05) — canonical, not a permanent ceiling

| Plan | Monthly | Who | Real included value | Real limit | Enforcement |
|---|---|---|---|---|---|
| PERSON | €0 | every person / worker / learner | the whole identity loop (journal, CV, skills, documents, board, bookings, card, project asks) | none | free surfaces; no person plan is sellable (`worker_plus` deferred) |
| ORGANIZATION FREE | €0 | any organization — employer, staffing provider, contractor, training provider | matching shortlist, candidate contact, bookings, projects, instructions, confirmation | **1 concurrent active position / open workforce need** | `free_organization` (`company_create_needs: 1`) via the open-needs gate on the ONE demand creation path |
| ORGANIZATION | **€99** | the same organization, at operating scale | everything above at scale, project operations, readiness, reports, CSV, journal review | **up to 10** concurrent active positions | `company_pilot` (`company_create_needs: 10`); Stripe subscription bound to the organization |
| ORGANIZATION — INDIVIDUAL | agreed individually | more than 10 active positions | — | — | the 11th need is refused with the contact path (`/company-need`); no automatic tier, no published price, never a silent charge |

DEFERRED (not sold, not priced): ai_plus, vip_media, agency_start/growth/scale, the €299 alternative, LMC top-ups, priority visibility, media upsells, annual pricing, enterprise/custom pricing, institution pricing.

Where the truth lives (no second source): the FIGURE only in `public.plans.price_eur_monthly` (`free` = 0, `business` = 99 — the row that renders as "Organization"; `agency` / `enterprise` rows inactive); the BOUNDARY in `lib/billing/plans.ts` (limits, never a figure); readiness in `lib/billing/readiness.ts` (`PRICING_READINESS_STATE = "owner_confirmed"`). Stripe price id slot: `STRIPE_PRICE_COMPANY_PILOT` = the ORGANIZATION price (the other two slots stay empty).

## What exists (inventory, do not rebuild)

| Piece | Where | State |
|---|---|---|
| Billing seam + Stripe adapter; live resolves ONLY through the owner-armed path (`STRIPE_MODE=live` + complete live keys + `STRIPE_LIVE_ACTIVATION=approved-by-owner` + `PRICING_READINESS_STATE=owner_confirmed`) | `lib/billing/config-core.ts`, `provider.ts`, `providers/` | IMPLEMENTED (#1441) |
| Checkout (organization-bound, sellable plan only) → signature-verified idempotent webhook (mode-matched) → `billing_customers` / `billing_subscriptions` / `payment_webhook_events` → entitlements → account state → Customer Portal | `app/api/billing/{test-checkout,webhook,portal}`, `lib/billing/*`, `components/app/account-billing-section.tsx` | IMPLEMENTED; production chain NOT PROVEN (0 rows ever) |
| Open-needs seam FREE 1 / ORGANIZATION 10 / above → individual plan | `lib/billing/open-needs-gate.ts` → `lib/demand/demand-request.ts` (the ONE demand path; chat + visual form both) | IMPLEMENTED (#1441), enforced once a Stripe adapter state is active |
| Public `/pricing` — €0 / €99 from the DB figure + "Need more? Contact us" | `components/marketing/pricing-table.tsx` | IMPLEMENTED |
| LMC ledger | prod | PROVEN; top-ups DEFERRED |

## G-8 — OWNER ACTIONS (external; nothing here can be done from the repository)

1. **Stripe Dashboard (LIVE mode on)** → Products → *Add product*: name `LabourMarket.ai — Organization`, recurring, **€99.00 / month**, currency EUR, tax behaviour *exclusive* (Stripe Tax applies VAT). Copy the **price id** (`price_…`). Verify: the product shows one active monthly price of €99.00.
2. **Stripe → Settings → Tax**: enable Stripe Tax (Lithuanian entity; EU B2B reverse charge, B2C VAT by customer country). Verify: Tax status *Active*.
3. **Stripe → Developers → Webhooks → Add endpoint** (LIVE): URL `https://labourmarket.ai/api/billing/webhook`; events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Copy the **signing secret** (`whsec_…`). Verify: endpoint status *Enabled*.
4. **Stripe → Settings → Billing → Customer portal**: save a configuration (cancel subscription: on; update payment method: on; invoice history: on). Verify: "Configuration saved".
5. **Vercel → Project → Settings → Environment Variables (Production)** — set: `PAYMENTS_ENABLED=true`, `BILLING_PROVIDER=stripe`, `STRIPE_MODE=live`, `STRIPE_SECRET_KEY` (`sk_live_…`), `STRIPE_WEBHOOK_SECRET` (`whsec_…` from step 3), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_live_…`), `STRIPE_PRICE_COMPANY_PILOT` (the price id from step 1), `STRIPE_LIVE_ACTIVATION=approved-by-owner`. Leave `STRIPE_PRICE_WORKER_PLUS` / `STRIPE_PRICE_AGENCY_PILOT` unset. Verify: 8 production variables present (values never pasted anywhere else).
6. **GitHub PR #1441** — RED class (billing): review and **approve + merge** (squash). Verify: merged; Vercel production deployment created (the Hobby rate limit must have lifted).
7. **The smallest legitimate real payment**: sign in as an organization owner → `/dashboard/account` → "Order the Organization plan" → Stripe Checkout → pay with a real card. Verify (agent, read-only): `payment_webhook_events` (signed, processed), `billing_subscriptions` row `active` bound to the organization, account page shows the plan and status, the 11th need is refused with the individual-plan path, Customer Portal opens; then **refund** in Stripe → `charge.refunded` recorded, state read back.

Reversible at any time: remove `STRIPE_LIVE_ACTIVATION` (or set `PAYMENTS_ENABLED=false`) → `stripe_live_blocked`; no data migration involved.
