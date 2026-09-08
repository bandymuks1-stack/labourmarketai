# EU Consumer/Business Boundary — Prepared Decision Package v1

> **Status: PREPARED DECISION PACKAGE — nothing here is decided.** This
> document enumerates the exact decisions the owner must make before any live
> EU payment is possible, with a recommended default per decision. It sets no
> price, writes no terms, and enables nothing. Prices and legal wording remain
> owner-gated business text (doctrine: an agent may never invent either).
>
> Grounding: `docs/audits/labourmarketai-commercial-billing-audit-v1.md`
> **OG-6** ("Commission and word the Terms addendum: price/VAT, payment,
> renewal, cancellation, consumer withdrawal, refunds, success/coordination
> fee definition") and `docs/product/plan-boundary-and-stripe-blockers.md`
> blocker **7** (Tax / invoicing — VAT handling per country) and blocker
> **10** (Legal — terms/refund/billing policy reviewed by counsel).
>
> Scope note: this package covers the **subscription plans** (Worker Plus /
> Company Pilot / Agency Pilot). The LMC internal-credit system has its own
> owner gates (`docs/product/lmc-commercial-system-train-v1.md` §14) and is
> deliberately out of scope here — mixing the two boundaries is how a credit
> becomes accidentally regulated as e-money.

## Why this exists now

The billing chain is technically prepared (test-mode checkout, verified
webhooks, subscription lifecycle, refund/dispute ingestion) while
`PAYMENTS_ENABLED` stays `false`. The remaining distance to a lawful EU launch
is not code — it is a set of **classification decisions** that only the owner
(with counsel) can make, because each one changes the legal text, the Stripe
configuration, and the tax treatment. Recording the decision space now means
the eventual legal review starts from a complete list instead of a discovery
exercise.

## The structural fork: who is the buyer?

Every decision below branches on one classification:

| Buyer | Plans affected | Regime |
|---|---|---|
| **Consumer (B2C)** — a natural person acting outside trade/profession | **Worker Plus** (a worker buying for themselves) | EU Consumer Rights Directive 2011/83/EU (as amended by (EU) 2019/2161): 14-day withdrawal right, pre-contract information duties, consumer-facing price display (VAT-inclusive) |
| **Business (B2B)** — a company/agency buying for its organisation | **Company Pilot**, **Agency Pilot** (checkout is already server-bound to a canonical organisation — M-P0-7) | Withdrawal right does not apply; reverse-charge VAT possible with a validated VAT ID; B2B terms may allocate risk differently |

The platform's own architecture already enforces the org-binding half:
company/agency test checkout requires a verified owner/manager membership in a
canonical organisation (`lib/billing/checkout-core.ts`,
`planRequiresOrganization`). The worker plan has no org binding and must be
presumed B2C unless the owner decides otherwise.

## Decisions the owner must make

### D1 — B2C 14-day withdrawal right & the digital-services exception

**The decision space.** For a consumer buying a digital service, Article 9 of
2011/83/EU grants a 14-day withdrawal right. For contracts for **digital
content/services supplied immediately**, Article 16(m) allows the right to be
extinguished only when the consumer (a) gives **prior express consent** to
immediate performance AND (b) **acknowledges** losing the withdrawal right —
both captured before the charge. Options:

1. Honour the full 14 days: any Worker Plus purchase is refundable on request
   for 14 days, no consent flow needed.
2. Immediate access + Article 16(m) consent/acknowledgement checkbox wording in
   the checkout flow (loses the withdrawal right lawfully).
3. Hybrid: immediate access AND a voluntary 14-day money-back promise (simplest
   wording, most consumer-friendly, small refund exposure).

**Recommended default: option 3 (hybrid).** At the platform's price scale the
refund exposure is minor; the wording is one sentence; it avoids the
consent-capture UI entirely and reads as confidence, not caution. Counsel
confirms final wording (OG-6).

**What it changes when decided:** checkout copy + terms addendum wording; the
refund-handling path (the `charge.refunded` webhook ingestion added in
commercial safe-prep v1 already records refunds conservatively — no code
change needed to honour manual refunds).

### D2 — B2B VAT-ID collection & reverse charge

**The decision space.** For Company/Agency plans sold cross-border inside the
EU to VAT-registered businesses, the reverse-charge mechanism applies when a
validated VAT ID is collected. Options:

1. Collect and validate VAT IDs at checkout (Stripe Checkout
   `tax_id_collection: {enabled: true}` — Stripe validates format; VIES-level
   validation is the merchant's diligence).
2. Do not collect; charge home-country VAT to every buyer (simpler, wrong for
   most cross-border B2B, and makes the product ~20% more expensive to exactly
   the buyers the platform wants).
3. Defer: launch in Lithuania only, domestic VAT for everyone, revisit at the
   first cross-border sale.

**Recommended default: option 1** — the flag is a one-line Stripe Checkout
parameter, the org-binding checkout already knows the buyer is a business, and
retrofitting tax IDs onto existing subscriptions is the painful direction.

**What it changes when decided:** the checkout-session creation call
(`lib/billing/providers/stripe-test.ts`) gains `tax_id_collection`; invoices
must show the reverse-charge mention (Stripe Invoicing does this when
configured); the terms addendum's VAT clause (OG-6).

### D3 — Automatic tax calculation

**The decision space.** Stripe Checkout `automatic_tax: {enabled: true}`
computes VAT per buyer country (needs origin address + registrations
configured in Stripe Tax; it is a paid Stripe feature). Options:

1. Enable Stripe Tax from day one.
2. Manual: single-country VAT until volume justifies the fee.
3. OSS (One-Stop-Shop) registration + Stripe Tax once B2C cross-border sales
   begin (B2C digital services are taxed at the **consumer's** country —
   this is what makes manual handling untenable for B2C at any scale).

**Recommended default: option 3 staged as 2→1** — start manual/domestic while
sales are Lithuanian; the moment a B2C sale crosses a border, OSS + Stripe Tax.
The decision the owner must actually take now is only: *which country is the
tax home*, so the terms and the first invoices are right.

### D4 — Price display convention

**The decision space (display only — the price VALUES stay owner-gated and are
NOT part of this document).** B2C price display must be VAT-inclusive
(Directive 98/6/EC + consumer-information duties); B2B convention is
VAT-exclusive. With both audiences on one /pricing page, options:

1. Show VAT-inclusive prices everywhere with "incl. VAT" markers.
2. Show plan-appropriate convention per card (worker card incl., company/agency
   cards excl. + "excl. VAT").
3. Keep the current no-price readiness state until D1–D3 are decided, then
   apply option 2.

**Recommended default: option 3** — it is also the current guarded state
(`PRICING_READINESS_STATE = "draft_pricing"`; `pricing-page-beta-honesty`
forbids any price figure), so no change ships before the owner's price
decision anyway.

### D5 — Withdrawal/refund wording home

**The decision space.** Where the D1 wording lives: a Terms addendum section, a
standalone refund-policy page, or checkout-inline copy (Stripe Checkout
`consent_collection` / custom text). Options are not exclusive; the CRD
requires the information to be given in a durable medium before the contract.

**Recommended default:** Terms addendum section (owner/counsel wording, OG-6)
+ one checkout-inline sentence linking to it. The existing legal-pages shell
(`/legal/*`) is the natural render target; no new page structure is needed.

## What is explicitly NOT decided here

- **No price values.** `plans.price_eur_monthly` stays null; the only
  owner-confirmed prices live in the LMC catalogue record (closed #754 /
  `docs/product/commercial-system-v1.md`), which this document does not touch.
- **No terms text.** OG-6 wording is owner/counsel work; this package is its
  input checklist.
- **No payment enablement.** Every flag stays as it is:
  `PAYMENTS_ENABLED=false`, live mode hard-blocked, LMC switches off.

## Sequence once the owner decides

1. Owner answers D1–D5 (a one-line answer each is enough).
2. Counsel drafts the OG-6 addendum from those answers.
3. The Stripe TEST config gains `tax_id_collection` / `automatic_tax` /
   `consent_collection` flags per the answers — still test mode, verifiable
   end-to-end with the existing signed-webhook chain.
4. Only then does the live-activation gate (OG-10, owner-only) become
   meaningfully reviewable.
