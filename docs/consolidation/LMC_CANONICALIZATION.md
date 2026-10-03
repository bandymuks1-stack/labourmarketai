# LMC canonicalization — CURRENT / DUPLICATE / MISSING / CANONICAL TARGET

Date 2026-10-03. Base origin/main 5933d507e. Scope: docs + one detection guard. No migration, no price change, no production write, no LMC enablement.

Owner rule: 1 LMC = EUR 1. Four separate concepts: LMC (internal credit) / PLAN (what an organization subscribes to) / ENTITLEMENT (what a plan lets you do) / PAYMENT RAIL (Stripe). None stands in for another.

Prod reads (SELECT only, project gorgitwvdzxbnaxhrsrw, 2026-10-03): `public.plans` = free 0 active; business 99 active (named Organization / Organizacija); agency NULL inactive; enterprise NULL inactive. `lmc_settings` = 7 keys, all enabled=false. Ledger counts from the 2026-10-03 audit (LMC_BILLING_MODEL): 0 accounts, 0 transactions, 0 lots, 0 consumptions, 0 billing_subscriptions.

## 1. CURRENT

### 1.1 LMC (one ledger, built, unarmed)

| Item | Source of truth today |
|---|---|
| Ledger | `lmc_transactions`, append-only (migrations 20260720190000_lmc_ledger_foundation_v1, 20260828090000_lmc_spend_compensation_v1). Amount bigint LMC-cents (100 = 1 LMC), positive; sign implied by kind. |
| Lots | `lmc_lots`: remaining-value container per credit tx. Purchased lots never expire; promotional/admin lots must expire; referral exempt. |
| Lot consumption | `lmc_lot_consumptions`: allocation lines for spend / expiry / reversal. |
| Balance | DERIVED by views `lmc_lot_balances`, `lmc_account_balances`. No balance column exists. |
| Credit | RPCs `lmc_grant_promotional_v1`, `lmc_record_purchase_v1`, `lmc_admin_grant_v1`. |
| Debit | `lmc_spend_v1` (row-locked account; promo/expiring lots first, then oldest purchased; atomic fail on insufficiency). |
| Expiry | `lmc_expire_lots_v1(limit)`. No scheduler exists. |
| Reversal / refund | `lmc_reverse_v1` (claws back what is left of a credit lot), `lmc_compensate_spend_v1` (spend becomes a new lot). |
| Kill switches | `lmc_settings` (7 flags, all false) via `lmc_set_flag_v1`; TS mirror `lib/billing/lmc-flags.ts` (`false as const`). |
| App callers | Read-only balance (`lib/lmc/lmc-account.ts`), admin ledger and grant (`lib/lmc/admin-ledger.ts`, `lib/admin/lmc-actions.ts`), `lib/lmc/compensation.ts` (no call site). Nothing calls spend, purchase, promo grant, expiry or reverse. |
| Entitlement interaction | NONE. An LMC balance never gates a plan feature; a plan never mints LMC. Correct, and pinned by the Stripe/LMC separation guard. |

### 1.2 PLAN / ENTITLEMENT / PAYMENT RAIL: three catalogues

| Catalogue | Where | Holds | Authority today |
|---|---|---|---|
| A. CODE | `lib/billing/plans.ts` `PRE_PAYMENT_PLANS`: free_worker, worker_plus (deferred), free_organization, company_pilot, agency_pilot (deferred), admin_internal | Plan boundary: audience, accessState, launch, entitlement limits (`company_create_needs` 1 / 10). No figure (guard-pinned). | The ENTITLEMENT decision: `entitlements-v1.ts` resolver, then `open-needs-gate.ts`. |
| B. DB | `public.plans`: free, business, agency, enterprise | Display names, `price_eur_monthly`, `active`, legacy `features` jsonb. Publicly readable only through `public_plans_v1()`. | The one home of the DISPLAY FIGURE (data-applied 2026-09-05, APPLIED_LEDGER). `features` is stale (seed says projects 10 / job_demands 25) and read by no gate. |
| C. STRIPE | `STRIPE_PRICE_WORKER_PLUS`, `_COMPANY_PILOT`, `_AGENCY_PILOT`, read only in `lib/billing/prices.ts` | Provider price ids; amount, currency and tax behaviour live inside Stripe. Only `COMPANY_PILOT` is used for launch. | The CHARGED amount. |

Key mapping (implicit until now; made explicit and pinned by the guard in this PR):

- code `free_organization` = DB `free` = no Stripe slot
- code `company_pilot` = DB `business` = `STRIPE_PRICE_COMPANY_PILOT`
- code `worker_plus` / `agency_pilot` = deferred Stripe slots, no DB row. DB `agency` / `enterprise` are retired rows and are NOT the same thing as `agency_pilot`.
- `free_worker`, `admin_internal`: no DB or Stripe counterpart.

Entitlement source: code catalogue A, resolved by the single resolver (subscription row written by the Stripe webhook state machine in `subscription-store.ts`, or an admin manual override, mapped to a plan key, limits read from A). Neither the Stripe price id nor the DB row decides an entitlement.

Payment rail: Stripe subscriptions only (checkout, signature-verified idempotent webhook, `billing_subscriptions`). No Stripe route sells LMC; top-ups: flag owner_only, no route exists (MDD-20).

### 1.3 The duplicated EUR 99, traced to its meaning

| Place | Meaning | Evidence |
|---|---|---|
| DB `plans.business.price_eur_monthly = 99` | ORGANIZATION plan, per MONTH, EUR, DISPLAY figure on /pricing. The column carries no tax basis; the owner decision says exclusive. | prod SELECT today; APPLIED_LEDGER "launch pricing DATA update" |
| Stripe live price behind `STRIPE_PRICE_COMPANY_PILOT` | ORGANIZATION plan, EUR 99 recurring monthly, tax-EXCLUSIVE, Stripe Tax adds VAT, one active price. The amount cannot be read from repo or env; verifiable only in the Stripe dashboard. | docs/human-gates/payments-price-table-gate.md; MASTER_COMPLETION_MAP_2026-09-05; checkout-tax-pins.test.ts |
| Code | NO figure (pinned by launch-pricing.test.ts). "99" appears only in comments and tests describing the approved price. | plans.ts |
| Historical W1 `launch_offer_99` (PR #754, closed) | A DIFFERENT concept: 99.00/mo with UNLIMITED ads, valid until 2026-10-31. Superseded; must not be confused with the approved plan. | docs/product/lmc-canonical-commercial-catalogue-v1.md |
| Owner-approved price | ORGANIZATION EUR 99 / month, tax-exclusive, up to 10 concurrent active positions. FREE 0 (1 position). PERSON 0. Above 10: individual plan. "0/0/99", 2026-09-05, corrected the same day. LMC and top-ups deferred. | payments-price-table-gate.md; plans.ts header |

Verdict: the 99 in the DB and in Stripe is the SAME semantic price (Organization, monthly, EUR, tax-exclusive) stated twice for two purposes (display vs charge). That is legitimate only while the two stay equal. Nothing in the repo can prove they are equal; the Stripe side cannot be read from code. Not a live defect today (0 subscriptions).

## 2. DUPLICATE

1. Three plan catalogues with different key spaces and no declared mapping (detection added in this PR; authority change is owner decision 1).
2. EUR 99 held in DB (display) and Stripe (charge) with no reconciliation; stale W1 `launch_offer_99` lore in older docs.
3. `plans.features` jsonb duplicates code entitlements and is wrong (10 projects / 25 demands vs code 1 / 10); no gate reads it.
4. Draft #895 adds a FOURTH catalogue (`lib/commercial/catalogue.ts`: 5 plans x 21 axes, most prices null). Its text says it mirrors, but it is unmerged and RED.
5. Plan names checked outside the resolver: `reconcile.ts`, `metadata-core.ts`, `open-needs-gate.ts`, `account-billing-section.tsx`, `pre-payment-plan-boundary.tsx`.

Ledger / wallet duplicates: NONE. W1 credit_balances / ad_credits / ai_credits were rejected. `usage_cost_events` is a EUR cost ledger, not a balance.

## 3. MISSING

- Any caller of spend, purchase, promo grant, expiry or reverse; no expiry scheduler.
- Action-to-LMC price map (MDD-09), top-up denominations (MDD-03), top-up route (MDD-20), VAT and refund policy for LMC, an owner-class activation path for `live_payments_enabled` / `stripe_lmc_topups_enabled`.
- Plan-to-price reconciliation: nothing reads the Stripe amount; nothing asserts DB figure = Stripe amount.
- A plan-to-LMC rule (do plans include monthly LMC? undecided; today no).
- `public.plans` has no currency or tax-basis column (implicitly EUR, implicitly exclusive).
- Webhook `payload.refs` (P1); enforcement of plan claims beyond three features (B4).

## 4. CANONICAL TARGET (proposal; decisions in section 5)

| Concern | Canonical | Others become |
|---|---|---|
| LMC ledger | `lmc_transactions` + `lmc_lots` + `lmc_lot_consumptions`; balance via `lmc_account_balances`. Unchanged. | Nothing else may hold a balance. |
| Spend caller (future) | ONE server-side function in `lib/lmc/` calling `lmc_spend_v1` with a deterministic idempotency key, fed by ONE action-to-LMC cost map. Not built, not enabled. | No feature calls the RPC directly. |
| Top-up | `lmc_record_purchase_v1` after a verified payment event; Stripe only transports the payment. | Stripe never mints or holds LMC. |
| PLAN + ENTITLEMENT catalogue | CODE `PRE_PAYMENT_PLANS` (boundary, limits, sellable flag, keys): already the only thing any gate reads. | DB `plans` = derived DISPLAY adapter (names + figure through the explicit key map); its `features` jsonb loses authority. Stripe slots = derived PAYMENT adapter keyed by plan key. |
| Plan figure | One owner-approved figure per sellable plan (EUR/month, tax-exclusive). Short-term home stays `plans.price_eur_monthly`. Stripe amount must equal it, verified by a read-only check. | Stripe amount is verified against the DB figure, never the reverse. |
| Mapping | `MAPPING` in `plan-catalogue-consistency.test.ts` (this PR). Promote to an exported constant in `lib/billing/plans.ts` only after owner decision 1. | Adapters import it. |
| #895 | Input to decision 1; do not merge as a parallel catalogue. | |

## 5. OWNER / RED items (none were done)

1. Confirm CODE `PRE_PAYMENT_PLANS` as the canonical plan/entitlement catalogue (versus adopting #895's). Moving the figure out of the DB into code is a price-source change and RED.
2. Verify in the Stripe dashboard that the live price behind `STRIPE_PRICE_COMPANY_PILOT` is EUR 99 / month recurring, tax-exclusive, single active price, and record the result.
3. Deprecate `plans.features` and the retired DB `agency` / `enterprise` rows (migration with rollback; RED if it touches grants).
4. Decide whether plans ever include monthly LMC (none today).
5. All LMC commercial MDDs (price map, top-up amounts, VAT/refund, owner-class flag activation) before any `lmc_*` flag flips.
6. Ratify the key MAPPING (free_organization = free, company_pilot = business).

No price was changed; no LMC flag was changed.

## 6. What this PR adds

`apps/web/lib/guards/plan-catalogue-consistency.test.ts`: a pure-source drift detector, no behaviour change. It fails if a sellable code plan lacks a DB slug or Stripe slot; code gains an unmapped plan or a EUR figure; `prices.ts` resolves a different key/slot set than declared; a `STRIPE_PRICE_*` slot is missing from `env.ts` or `.env.example`; the applied-ledger plans record diverges from the approved 0/0/99 (retired rows must stay unpriced and inactive); the seed migration seeds a different slug set or any migration sets a plan price outside the ledger; the public registry lists an unmapped slug. It cannot see Stripe's amount or live DB rows (by design: no network).
