# Gate G-7 / G-8 — the one price table + live Stripe activation (OWNER_GATE + EXTERNAL_GATE)

**Opened:** 2026-09-02 (FINAL COMPLETION, Train D1).
**Register rows:** [`docs/launch/FINAL_COMPLETION_REGISTER.md`](../launch/FINAL_COMPLETION_REGISTER.md) §3 G-7, G-8.

## What exists (inventory, do not rebuild)

| Piece | Where | State |
|---|---|---|
| Billing seam + Stripe TEST adapter, live keys hard-blocked (`stripe_live_blocked`) | `lib/billing/provider.ts`, `config-core.ts`, `providers/` | IMPLEMENTED (test) |
| Test chain: checkout → signature-verified idempotent webhook → subscription/payment rows → entitlement → admin billing centre | `app/api/billing/{test-checkout,webhook,portal}`, `lib/billing/*`, `dashboard/admin/billing` | IMPLEMENTED_UNPROVEN on prod; proven in the test-mode sprint (`docs/audits/stripe-test-mode-final-report.md`) |
| Entitlements v1 (subscription-derived; permissive while payments off) | `lib/billing/entitlements-v1.ts`, `effective-entitlements.ts` | IMPLEMENTED |
| Pre-payment plan registry (`free_worker`, pilot plans; `PAYMENTS_ENABLED=false` const) | `lib/billing/plans.ts` | IMPLEMENTED |
| LMC ledger (1 LMC = €1 platform credit, 23 RPCs, idempotent, compensation applied 2026-08-28) | prod | PRODUCTION_PROVEN |
| Manual paid-launch path (off-platform payment + admin manual grant) | `docs/launch/manual-paid-launch-runbook.md` | live |
| Public `/pricing` | honest "prices being prepared", nothing purchasable | live |
| Metering for numeric allowances (searches, reveals, …) | — | **MISSING** (gateFeature's usage param has no producer) |
| Billing-touching PRs are RED class verbatim | `CLAUDE.md` merge model | binding |

## The decision the owner must make (G-7): which table is canonical

Two owner-sourced price sets exist and disagree. Nothing below is invented; pick one column (or amend it) and the
implementation follows mechanically.

| Audience | **Set A — closed PR #754 (2026-07, "owner pricing implemented exactly")** | **Set B — V8 directive candidate (2026-08-13, `docs/commercial/pricing-candidate-v8-2026-08-13.md`, DRAFT_PRICING)** |
|---|---|---|
| Persons / workers | FREE €0 · AI PLUS €9.99 · VIP MEDIA €24.99 | FREE €0 · AI PLUS €19.99 · CAREER+ €29.99 |
| Companies / employers | FREE €0 (1 active ad) · PROJECT LAUNCH OFFER €99 (until 2026-10-31, records 15 % first-annual discount) | FREE €0 · START €49 · GROWTH €149 · SCALE/AGENCY €399 |
| Agencies | START €99.99 · GROWTH €249.99 · SCALE €499.99 | folded into SCALE/AGENCY €399 |
| LMC | 1 LMC = €1; top-ups 10/25/50/100/250 | same |
| Free-participation principle | workers browse/open/apply without paywall | same ("FREE must stay really useful") |

Constraints that hold whichever set is chosen:
- **Worker free tier is not negotiable** (owner direction: no paywall on basic labour-market participation).
- **Numeric allowances cannot be sold before metering exists** — Set B's per-tier quotas need a metering
  build first (Train D2 will ship metering behind the entitlement gate; until then tiers are feature-based).
- AI-differentiated plans need the AI provider live — it is (`AI_PROVIDER_MODE` set, 4 routes live).
- VAT: Stripe Tax (automatic) is the recommended path; Lithuanian entity, EU B2B reverse charge, B2C VAT
  by customer country. This is a configuration decision inside Stripe, not code.

**Owner action:** reply with "Set A", "Set B", or an amended table. Cost: none. Reversible: prices can change;
existing subscriptions keep their price until migrated.

## G-8 — live activation (EXTERNAL_GATE + RED PR)

After G-7:
1. Stripe dashboard (live mode): create the products/prices of the chosen table; enable **Stripe Tax**; set the
   webhook endpoint `https://labourmarket.ai/api/billing/webhook` (events: `checkout.session.completed`,
   `customer.subscription.*`, `invoice.*`, `charge.refunded`) and copy the signing secret.
2. Vercel production env: `PAYMENTS_ENABLED=true`, `BILLING_PROVIDER=stripe`, `STRIPE_MODE=live`,
   `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`,
   and the `STRIPE_PRICE_*` ids. (Agent cannot add Vercel env — classifier-blocked; owner action.)
3. Approve the RED PR that lifts the code live-block behind those env values (opened as DRAFT + `needs-human-gate`
   by Train D3). Cost: Stripe fees only on real charges. Reversible: env off → `stripe_live_blocked` again.
4. Proof (agent, after 1–3): smallest real checkout + immediate refund on a bounded org, renewal/upgrade/downgrade/
   cancel/failed-payment via Stripe test clocks in TEST first, webhook replay idempotency, entitlement flip,
   invoice/receipt, VAT line — recorded in the register.

## What Train D does meanwhile (no gate needed)

D2: everything provable in TEST mode — renewal, upgrade, downgrade, cancel, failed payment, webhook idempotency,
entitlement update, invoice/receipt, refund, credits/top-up (LMC), currency/VAT behaviour — with Stripe test clocks;
metering primitive for allowances; production-readiness guards. D3: the DRAFT live-enablement PR.
