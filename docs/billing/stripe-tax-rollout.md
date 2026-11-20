# Stripe Tax rollout: organization paid plans (TEST first, OFF by default)

Owner order, 2026-10-23: use Stripe Tax for organization paid plans. The seller
is a Lithuanian UAB and follows Lithuanian VAT law. Lithuanian B2B customers pay
standard 21% VAT when it applies. Foreign B2B customers get Stripe Tax's
treatment, including reverse charge **when its conditions are confirmed**.
Store the company details, the VAT number, its verification result, the invoice
and the tax calculation basis. When automatic taxation cannot be determined
reliably, grant no ad-hoc exemption: send the transaction to review. Keep the
existing payments, webhook and subscription architecture. Implement and test in
TEST first, and before LIVE give the owner the price, the test results and the
owner actions.

> **Public copy rule:** until Stripe Tax runs in production
> (`BILLING_STRIPE_TAX_ENABLED=true` on the live adapter, with live
> registrations), no public page may say that Stripe Tax calculates VAT.
> `lib/guards/stripe-tax-integration.test.ts` fails if any message namespace
> other than `adminBilling` / `accountBilling` names Stripe Tax.

## 1. Price

| Plan | Price | Fit |
|---|---|---|
| **Stripe Tax Basic** | **0.5% of each transaction** where you are registered to collect tax (Checkout / Billing usage) | **This integration needs Basic.** It uses Checkout `automatic_tax` and Stripe-hosted invoices only. |
| Stripe Tax Complete | from **€80/month**, 1-year contract | Not needed: filing / multi-jurisdiction services are out of scope. |

At the current €99/month price, Basic costs about €0.50 per paid invoice in a
registered jurisdiction. Stripe's normal payment fees are separate.

**The €99 Organization price is VAT-EXCLUSIVE.** VAT is added on top only
once the switch is on and the Stripe price carries `tax_behavior=exclusive`
(an owner action below). A Lithuanian customer then pays €99 + 21% = €119.79. A
foreign B2B customer whose reverse charge applies pays €99.

## 2. What the code does

The switch is `BILLING_STRIPE_TAX_ENABLED` (`"true"` / `"false"`, default
`"false"`). It is validated in `lib/env.ts`, read by
`billingStripeTaxEnabled()` in `lib/billing/config.ts`, and set with
`ops/vps/lm-env-set.sh`.

| Path | Switch OFF (default) | Switch ON |
|---|---|---|
| €99 subscription Checkout | Unchanged. Since the 2026-09-05 launch-pricing decision it already sends `automatic_tax`, `billing_address_collection: required`, `tax_id_collection` and `customer_update: auto` (pinned in `checkout-tax-pins.test.ts`). | Unchanged |
| €1 pilot-pass Checkout | Byte-for-byte what it was before this switch (pinned in `stripe-tax-core.test.ts`) | Adds the same four parameters, and the inline price gets `tax_behavior: "exclusive"` |
| Webhook `checkout.session.completed`, `invoice.paid`, `invoice.payment_succeeded` | No tax evidence is written | One `billing_tax_evidence` row per Stripe object, plus the review flags |
| Webhook `customer.tax_id.updated` | Records the verification result on rows that already exist (no rows means nothing to do) | Same |
| Admin billing page | The review list shows "Stripe Tax is OFF" | Lists the rows that need review, with a "Mark reviewed" button |
| Account billing section | Nothing new | Shows the VAT of the last payment and the VAT number check status |

Evidence parsing reads the signed webhook payload and makes two **read-only**
calls to Stripe. The first re-reads the Checkout Session with
`expand: ["total_details.breakdown", "invoice"]`, because a webhook payload
never carries the breakdown. The second calls `customers.listTaxIds`, which
returns the VAT number's current verification status. If a read fails, the row
is recorded with status `unknown` or with no breakdown, and the review rules
flag it. A read failure never blocks a payment.

### Review rules (`evaluateTaxReview`, `lib/billing/stripe-tax-core.ts`)

A row gets `review_required = true` with a stable reason code when any of the
following holds:

| Code | When |
|---|---|
| `automatic_tax_not_requested` | The object was captured while the switch was on, but automatic tax was not enabled on it |
| `automatic_tax_<status>` | `automatic_tax.status` is not `complete` (`failed`, `requires_location_inputs`, or `missing`) |
| `amount_missing`, `billing_country_missing`, `tax_amount_missing` | A paid sale is missing one of these basics |
| `no_tax_breakdown` | A paid sale has no tax breakdown from Stripe at all |
| `lt_zero_tax` | The billing country is LT, the sale is paid and the tax is 0. 21% is expected, so this goes to review even when Stripe gives an explicit reason |
| `foreign_b2b_zero_tax_vat_id_<status>` | A foreign customer with a VAT number pays 0 tax and the verification is not `verified`. `pending` stays flagged until `verified` arrives. `unverified`, `unavailable` and `unknown` stay flagged |
| `foreign_zero_tax_without_vat_id` | A foreign customer pays 0 tax without any VAT number |

A zero-amount session, such as a trial start, is checked against the automatic
tax status only.

A flag is cleared only in two ways:

- automatically, by a `customer.tax_id.updated` event with status `verified`,
  when no other reason remains;
- by a platform admin's **Mark reviewed**, which records `reviewed_at` and
  `reviewed_by`.

Once an admin has reviewed a row, later events do not reopen it. Nothing in
the code changes an amount, and nothing grants an exemption.

## 3. TEST plan (Stripe sandbox)

Sandbox setup (2026-10-23, done by the coordinator with owner approval):
Stripe Tax is active in the **sandbox only**. The head office is in Lithuania.
There is one **Lithuania domestic registration** (type "Small Seller (EU)",
21% for preset code *SaaS – business use*), collecting from 2026-10-23 07:17
UTC. **Nothing in LIVE was touched.**

Steps:

1. Apply migration `20261023120000_billing_tax_evidence_v1` to the **test**
   environment only, after the human gate approves it.
2. Subscribe the TEST webhook endpoint to `customer.tax_id.updated`, in
   addition to its current events (`checkout.session.completed`,
   `invoice.paid`, `invoice.payment_succeeded`, …).
3. Set `BILLING_STRIPE_TAX_ENABLED=true` in the TEST environment.
4. Set `tax_behavior=exclusive` on the TEST €99 price, or create a new
   exclusive TEST price.

Scenarios and expected results:

| # | Scenario | Customer / VAT number | Expected Stripe result | Expected evidence row |
|---|---|---|---|---|
| 1 | LT B2B | LT address, `LT000000000000`-style test VAT number | 21% VAT, `standard_rated` | `amount_tax` = 21% of subtotal, `review_required = false` |
| 2 | LT company without a VAT number | LT address, no VAT number | 21% VAT | `review_required = false` |
| 3 | EU B2B reverse charge, verification pending | DE address, test VAT number in a valid format | 0, `reverse_charge` | `reverse_charge = true`, flag `foreign_b2b_zero_tax_vat_id_pending` |
| 4 | Same customer after verification | Stripe test VAT numbers that verify (see Stripe's "testing tax ID verification" values) | `customer.tax_id.updated` with `verified` | Flag cleared automatically, `tax_id_verification_status = verified` |
| 5 | Verification fails | Stripe's test VAT number that returns `unverified` | `customer.tax_id.updated` with `unverified` | Flag stays, reason `…_unverified` |
| 6 | Registry unavailable | Stripe's test value that returns `unavailable` | `unavailable` | Flag stays, reason `…_unavailable` |
| 7 | Non-EU customer | e.g. NO or US address | Depends on registrations; usually 0 / `not_collecting` | Flagged (`foreign_zero_tax_without_vat_id` or `…_vat_id_<status>`); the admin decides |
| 8 | Automatic tax cannot compute | Address Stripe cannot locate | `requires_location_inputs` / `failed` | Flag `automatic_tax_<status>` |
| 9 | Pilot pass with the switch ON | Any LT company | €1 + 21% = €1.21 | Evidence row for the session and its invoice |
| 10 | Switch OFF regression | Any | Pilot-pass session has no tax fields; €1 flat | No evidence rows |

Read each result in three places: the admin billing page (the review list), the
account page (the VAT line), and the `billing_tax_evidence` rows. Owner
evidence stays in chat, never in the repository: see the standing rule that
production evidence stays off GitHub.

## 4. Owner actions before LIVE (each one is a separate owner approval)

1. **Confirm the UAB's Lithuanian VAT registration** and add it in Stripe
   Tax **live** registrations (Lithuania, domestic). Add an EU OSS registration
   only if and when the UAB registers for OSS.
2. **Head office / origin address**: set the UAB's address in the live Stripe
   Tax settings.
3. **The UAB's own VAT number on invoices**: in the live account's invoice
   settings, add the account tax ID (the real LT VAT number), so every invoice
   shows it.
4. **Price tax behaviour**: set `tax_behavior=exclusive` on the live €99
   Organization price. Stripe allows this only once per price; if the price
   already carries a different behaviour, create a new exclusive price and
   switch `STRIPE_PRICE_COMPANY_PILOT` to it with `lm-env-set.sh`.
5. **Product tax code**: choose it in Stripe (the sandbox uses *SaaS –
   business use*, `txcd_10103001`). Set it as the account's default tax code
   or on the product.
6. **Webhook events**: subscribe the **TEST and the LIVE** webhook endpoints
   to `customer.tax_id.updated`, in addition to `checkout.session.completed`,
   `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed` and
   `customer.subscription.*`.
7. **Apply the migration** `20261023120000_billing_tax_evidence_v1` to
   production through the owner channel (Supabase MCP `apply_migration`), only
   after the human gate approves it. Never use `supabase db push`.
8. **Switch on**, as the last step: on the VPS run
   `printf 'true' | sh ops/vps/lm-env-set.sh BILLING_STRIPE_TAX_ENABLED --restart`.
   To switch off: `printf 'false' | sh ops/vps/lm-env-set.sh BILLING_STRIPE_TAX_ENABLED --restart`.
9. **Watch the first live payments** on the admin billing page review list.
10. **Public copy** may mention Stripe Tax only after step 8 is live and has
    been verified with a real payment. That copy change is a separate PR and
    must update the guard's allow-list explicitly.

## 5. Rollback

- Switch off with `BILLING_STRIPE_TAX_ENABLED=false`. Checkout returns to the
  previous parameters and no new evidence is written. Existing rows stay.
- The table rollback is
  `supabase/rollbacks/20261023120000_billing_tax_evidence_v1.down.sql`. It
  **refuses** while rows exist, because tax evidence is an accounting record:
  archive the rows first.
