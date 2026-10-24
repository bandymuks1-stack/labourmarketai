# Owner decision memo — VAT / Stripe Tax on the €99 Organization plan

Date: 2026-10-23 · Status: **DECIDED — Option A (keep Stripe Tax), CONDITIONAL** · Class: billing / tax (owner-gated)

> **Owner decision 2026-10-23:** Option A (§3), on condition that the VAT
> registration of the legal entity receiving the payments is confirmed.
> `automatic_tax`, the €99 price and the tax-exclusive principle stay as they are.
> Nothing changes on them without confirmed data. Results of the verification
> are in §7.

Nothing in this memo arms live billing, changes Stripe account settings, or
promises customers any tax handling. No tax statement goes on a customer page
until a real live subscription payment has completed end to end.

## 1. What the code does today (verified 2026-10-23, `main` @ 511aff5)

**One path.** The €99 Organization plan (plan key `company_pilot`, DB row
`plans.business`, `price_eur_monthly = 99`) is sold only through
`POST /api/billing/test-checkout` (`apps/web/app/api/billing/test-checkout/route.ts`).
Despite the name, that route serves live mode: `getBillingProvider()` returns
`createStripeProvider()` (`lib/billing/providers/stripe-test.ts`), which is
mode-aware since D3 and uses `sk_live_` when the config is `stripe_live`.
`createCheckoutSession` is the only subscription Checkout call in the repo and
sends:

- `mode: "subscription"`
- `automatic_tax: { enabled: true }`
- `billing_address_collection: "required"`
- `tax_id_collection: { enabled: true }`
- `customer_update: { address: "auto", name: "auto" }` for a reused customer

These are pinned by `lib/billing/checkout-tax-pins.test.ts` and
`lib/billing/trial.test.ts` (`params.automatic_tax` equals `{ enabled: true }`).
The €1 `lm_pilot_pass` uses `createOneTimeCheckoutSession` (`mode: "payment"`,
no `automatic_tax`; pinned by `pilot-pass-core.test.ts`).

**How a refusal would be recorded.** If Stripe refuses the session, the adapter
returns `{ ok: false, reason: <first 200 chars of the Stripe error message> }`,
the route calls `markCheckoutOperationFailed()`, and that writes
`status = 'failed'` and `failure_reason` on the `billing_checkout_operations`
row. The route then answers HTTP 400 `{ ok:false, reason }`. Nothing else
records it: there is no server log line and no funnel event.

**What production shows (read-only SQL, 2026-10-23):**

| created (UTC) | plan | status | test_mode | provider_session_id | failure_reason |
|---|---|---|---|---|---|
| 2026-09-05 19:25 | company_pilot | expired | false | `cs_live_…` | null |
| 2026-09-22 07:33 | company_pilot | open (past expiry) | false | `cs_live_…` | null |
| 2026-10-02 16:08 | company_pilot | open (past expiry) | false | `cs_live_…` | null |

No row is `failed`. All three have a live Checkout Session id, so **Stripe
created all three live sessions with `automatic_tax.enabled = true`**. The
starting hypothesis ("Stripe rejects the session, so the €99 path cannot take
a payment") is **not** what happened, at least up to 2026-10-02. Stripe
refuses `automatic_tax` only when Stripe Tax is not set up on the account at
all (no head-office address / tax settings). It accepts the session when tax
settings exist but no tax **registration** has been added, and it then
calculates **0 VAT** everywhere.

Live webhook events received so far: one `checkout.session.completed`, one
`invoice.paid` and one `invoice.payment_succeeded`, all from the €1 pass on
2026-10-23. There has been no live `checkout.session.expired`, which is why two
rows still say `open` after their expiry. That is harmless, because admission
closes a stale row on the next click (`isOperationReusable`), but the evidence
table is misleading (see §5).

**Not verifiable from the repo:** the live Stripe dashboard state (Tax status,
head-office address, registrations, whether the €99 price's tax behaviour is
`exclusive`). The `employer.vat-via-stripe-tax` RETIRED note says Stripe Tax is
not configured. The accepted sessions mean tax *settings* do exist. The likely
reconciliation is "settings present, no registrations". The owner should check
this in Stripe → Settings → Tax.

## 2. Why this has to be decided

- With no registrations, a live €99 subscription would collect **€99 and 0 VAT**.
  The price is "tax-exclusive" in `plan-catalogue.ts`, yet nothing would be
  added. The seller, UAB "Nonstop Group", is VAT-registered (LT100010790613,
  `legal.terms`), so VAT may still be owed. It would come out of the €99, and
  the Stripe invoice would show no VAT. The accountant must confirm.
- The repo contradicts itself:
  - `plan-catalogue.ts` → taxBasis `exclusive`, "Stripe Tax adds VAT"
  - `checkout-tax-pins.test.ts` / `trial.test.ts` → pin `automatic_tax`
  - `lib/guards/plan-catalogue-consistency.test.ts` comment → "Stripe Tax adds VAT"
  - `docs/human-gates/payments-price-table-gate.md` step 2 → "enable Stripe Tax"
  - `lib/public-claims/registry.ts` → `employer.vat-via-stripe-tax` RETIRED,
    "owner refused Stripe Tax registration (2026-10-23)"
  - `/pricing` (`pricing.faq[2].a`) → no VAT mention
  - **still live:** `accountBilling.subscribe.chargedToday` (en, lt, de, nl, pl,
    ru), shown on the account billing card when the trial is off: *"Stripe shows
    the exact amount with VAT before you pay."* This promises customers tax
    handling, so it should be neutralised under **either** option.

## 3. Option A — keep Stripe Tax, add registrations

**Owner act (Stripe dashboard, not code):** Stripe → Settings → Tax. Confirm the
head-office address and add the LT VAT registration. The accountant decides
whether OSS (EU B2C) applies. Check that the €99 price has tax behaviour
`exclusive`.

**Code (small):**
- Keep `automatic_tax`, the address/tax-id collection and both pin tests.
- `plan-catalogue.ts` taxBasis stays `exclusive`. Update the provenance to cite
  this decision.
- Neutralise `chargedToday` now: remove the VAT clause, or say "Stripe shows the
  final amount before you pay".
- Leave `employer.vat-via-stripe-tax` **RETIRED** and leave `/pricing` without
  "+ VAT" until a real live subscription has completed with a correct tax line.
  Only then does a follow-up PR restate "€99/month + VAT" on `/pricing`
  (`pricing.faq[2].a` or the price card) and set the claim LIVE with that page key.

Trade-off: correct VAT on every invoice and EU reverse charge via the collected
VAT id. Costs: Stripe Tax fees (check current Stripe pricing) and the owner's
dashboard work. It reverses the 2026-10-23 refusal.

## 4. Option B — keep Stripe Tax off

**Owner decides one more thing:** is €99 **VAT-inclusive** (the customer pays
€99 and the company remits VAT out of it) or **VAT-exclusive** (VAT is added,
which then has to be invoiced outside Stripe Tax)? Without Stripe Tax, only the
**inclusive** variant is something Stripe Checkout can charge as-is. Exclusive
without Stripe Tax needs manual tax rates (`tax_rates` on the line item), which
is a separate decision and change.

**Code (prepared after the owner picks):**
- `stripe-test.ts`: remove `automatic_tax`. Keep
  `billing_address_collection: "required"` and `tax_id_collection` only if the
  owner still wants address and VAT id on the invoice (recommended for B2B
  invoices). Without `automatic_tax`, `customer_update` is only needed if the
  address is still collected.
- `checkout-tax-pins.test.ts` and `trial.test.ts`: invert the pin. The session
  must **not** contain `automatic_tax`, so a decision reversal is a deliberate test edit.
- `plan-catalogue.ts`: taxBasis `inclusive` (extend `PlanTaxBasis`) or
  `exclusive` with a manual-rate note. Update the provenance.
  `plan-catalogue-consistency.test.ts`: update the comment and the expectation.
- `registry.ts`: `employer.vat-via-stripe-tax` stays RETIRED. Update the note to
  "Stripe Tax off by owner decision; price is VAT-<inclusive|exclusive>".
- `/pricing`: state the basis ("€99/month, VAT included" or "+ VAT") **only
  after** a live subscription has completed. Until then, stay silent as today.
- `chargedToday`: remove the VAT clause (all six locales).
- `docs/human-gates/payments-price-table-gate.md`: drop step 2 and fix the tax
  behaviour in step 1.

Trade-off: no Stripe Tax fees and no dashboard work. If inclusive, VAT is
absorbed (about €17.18 of €99 at LT 21%) and the invoice tax line has to be
handled by the accountant outside Stripe.

## 5. Separate finding (no decision needed, not fixed here)

The live webhook endpoint has not delivered `checkout.session.expired`, so
expired operations stay `open` in the evidence table. To fix it, subscribe the
live endpoint to `checkout.session.expired` (a Stripe dashboard act by the owner).

## 6. Recommendation

The owner recorded a refusal of Stripe Tax registration on 2026-10-23, so the
consistent path is **Option B**. The prices should be **VAT-inclusive**, which
Checkout can charge without Stripe Tax. Address and VAT-id collection should
stay, for B2B invoices. Have the accountant confirm the VAT treatment of a
LT-registered seller selling SaaS to EU businesses and consumers before any
"VAT included" text appears on `/pricing`.

## 7. Verification after the decision (2026-10-23, read-only)

**Stripe account legal entity and VAT registration — NOT VERIFIED.**
- The repo states the seller as UAB "Nonstop Group", company code 302676973,
  VAT LT100010790613 (`legal.terms.sections[0].items[0]`). The number has the
  valid LT format (12 digits).
- The stored webhook payloads are minimised to `{id, type, created, summary}`,
  so the invoice's `account_name` / `account_country` / `account_tax_ids` are
  not in the database. This session has no Stripe credentials, which is
  correct. The EU VIES check was refused by the session's network proxy.
- **Remaining owner step:** open Stripe → Settings → Business details and
  confirm the legal entity is UAB "Nonstop Group" (LT). Then open Stripe →
  Settings → Tax: head office LT, and add the LT VAT registration
  (LT100010790613). Accountant: decide whether OSS is needed for EU B2C. Check
  the VAT number at
  https://ec.europa.eu/taxation_customs/vies/ (LT 100010790613).

**€1 pilot pass — completed end to end in live mode.**
- Stripe → webhook: `checkout.session.completed` (livemode, `mode=payment`,
  `payment_status=paid`, `amount_total=100` EUR, purpose `lm_pilot_pass`,
  `pilot_days=30`), plus `invoice.paid` and `invoice.payment_succeeded`. All
  three arrived within about 2 s of the event (2026-10-23 05:34:48 UTC) and are
  `processed=true` with no error.
- Database: one `billing_subscriptions` row, `pilotpass_cs_live_…`,
  `plan_key=company_pilot`, `status=active`, `test_mode=false`,
  `cancel_at_period_end=true`, `current_period_end=2026-11-22 05:34:48 UTC`,
  organization 20b2c802-….
- Entitlements: `getEffectiveEntitlements` reads that row (organization
  subject, `test_mode` matching the live config). `effectivePilotPassStatus`
  keeps it `active` until 2026-11-22 05:34:48 and `expired` after, so the
  organization holds the Organization plan for 30 days.
- Cancellation: by design there is nothing to cancel. It is a one-time
  payment, no Stripe subscription exists, nothing renews, and access ends by
  itself on 2026-11-22. A refund (`charge.refunded`) is recorded but does not
  revoke access, which is by design (webhook-core). **Not tested:** cancelling
  a real recurring €99 subscription (portal → `customer.subscription.deleted`).
  That needs a paid €99 subscription first.

**The three €99 Checkout sessions — created, NOT paid.**
- All three operations have a `cs_live_…` session id. None is `completed`, and
  `completed_at` is null.
- No live `checkout.session.completed` exists for them. The only live one is the
  €1 pass. There is no live `billing_subscriptions` row other than the
  pilot pass.
- Caveat: the earliest live webhook event stored is from 2026-10-23. A payment
  in September would only be missed if the live webhook endpoint did not exist
  yet. To rule that out finally, check Stripe → Payments for €99 charges,
  which also needs the dashboard.

**Code change prepared (draft, not merged):** keeps `automatic_tax` and both pin
tests. It removes the customer-facing VAT promise from
`accountBilling.subscribe.chargedToday` (en, lt, de, nl, pl, ru) and updates the
`employer.vat-via-stripe-tax` note (the claim stays RETIRED). It adds a
re-confirmation comment to `plan-catalogue.ts`. `/pricing` is unchanged.
"+ VAT" goes on `/pricing` and the claim goes LIVE only after a real live €99
subscription has completed with a correct tax line.
