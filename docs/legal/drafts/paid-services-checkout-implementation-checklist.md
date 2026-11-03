# Lawful public checkout: implementation checklist (NOT BUILT)

> **Planning document only.** Nothing here is built, switched on or priced.
> It lists the code a lawful **public** checkout needs once the owner and a
> lawyer have settled the [SPRENDIMAS] list in
> `paid-services-terms-draft-v1.lt.md`.
>
> Today, live charging is limited to the pilot organization list, and no new
> payment is activated without a separate owner approval (register row J-14).
> Each item names the terms section it serves and what main has as of
> 2026-11-03.
>
> **Classification.** Billing, checkout and entitlement code is **RED**:
> draft PR, `needs-human-gate`, owner approval, no auto-merge. Copy-only items
> are GREEN, but are published only together with the approved terms.

## A. Before payment (checkout page)

| # | Item | Terms | On main 2026-11-03 |
|---|---|---|---|
| A1 | Show plan name, price, **whether VAT is included**, billing period, automatic renewal and first charge date next to the pay button | 4.3, 5.1–5.2 | partly: the pricing page shows the plan and price; renewal and first-charge wording not verified |
| A2 | Trial: show the date and amount of the first charge **before** the trial starts | 3.3 | absent (trial switched off) |
| A3 | Required checkbox: accept the Paid Services Terms (links to the dated version), stored with the version id | 14.4 | absent: the Stripe Checkout session sets no terms-consent field |
| A4 | **Consumers only** (if 6.1 says sold to consumers): show the withdrawal-right notice, and a **separate unticked** checkbox: "I ask you to start the service immediately and understand that if I withdraw I pay for the part already provided" | 8.4–8.5 | absent |
| A5 | Buyer type: "buying for an organization" confirmation; collect the organization name and, optionally, an EU VAT number for reverse charge | 6.1, 4.1 | partly: billing is per organization; no buyer-type confirmation and no VAT-number collection |
| A6 | VAT calculation (Stripe Tax) and the VAT line on the summary | 4.1–4.2 | **RED #2685** (switch `BILLING_STRIPE_TAX_ENABLED` off) + #2701; owner Stripe-dashboard acts pending |
| A7 | Consumer price shown **including** VAT where 4.2 applies | 4.2 | absent |

## B. After payment

| # | Item | Terms | On main 2026-11-03 |
|---|---|---|---|
| B1 | **Confirmation e-mail** (durable medium) holding: seller identity, plan, price + VAT, period, renewal, how to cancel, the terms version as PDF/HTML, and for consumers the withdrawal information, the model form (8.6) and the record of the A4 consent | 8.2, 8.6, 14.4 | **absent**: no purchase mail is sent from the billing code (needs working SMTP) |
| B2 | Invoice per payment, by e-mail and in the billing section; seller VAT code and buyer VAT number; reverse-charge note where it applies | 4.4 | partly: Stripe invoice events are read for subscription state; issuing/sending invoices is not set up (decision 9) |
| B3 | Store per purchase: terms version id, buyer type, the A4 consent with timestamp | 8.5, 14.4 | absent |
| B4 | Trial conversion reminder e-mail N days before the first charge | 3.3 | absent (decision 6) |

## C. Cancellation and changes

| # | Item | Terms | On main 2026-11-03 |
|---|---|---|---|
| C1 | "Manage subscription" in the billing section (Stripe customer portal): cancel at period end | 7.1–7.2 | **exists**: `app/api/billing/portal/route.ts` |
| C2 | Billing section shows "cancelled, paid features end on <date>" | 7.4 | partly: `cancel_at_period_end` and `current_period_end` are read in the entitlement path; the shown wording is not verified |
| C3 | Cancellation confirmation e-mail | 7.4 | absent |
| C4 | Withdrawal by e-mail (8.2): an operator runbook to cancel, refund through Stripe (full or pro rata, per 8.3–8.4) and confirm in writing within 14 days | 8.2–8.4 | absent (runbook) |
| C5 | Price or terms change: e-mail all subscribers ≥ 30 days ahead (decision 21), apply from the next period only, link to cancel | 13.1–13.3 | absent |
| C6 | Plan change (upgrade / downgrade) behaviour per decision 12 | 5.4 | not built (one paid plan) |
| C7 | After cancellation or expiry: data kept, open needs not auto-closed, new or reopened needs gated to the free limit | 7.5 | **exists**: `lib/billing/open-needs-gate.ts` gates create and reopen; nothing auto-closes |

## D. Failed payment, disputes, suspension

| # | Item | Terms | On main 2026-11-03 |
|---|---|---|---|
| D1 | Failed payment: Stripe retries; e-mail the buyer; after the grace period the paid features stop and the organization falls to free | 5.3 | partly: `app/api/cron/billing-recovery/route.ts` and webhook status handling exist; buyer e-mail absent; grace period = decision 11 |
| D2 | Chargeback (`charge.dispute.*`): suspend paid features only, never data or free features; restore on a won dispute; e-mail the reason | 10.2–10.4 | partly: `charge.dispute.created/closed` are read as financial events by reconciliation (`lib/billing/reconcile-core.ts`); no suspension of paid features and no buyer e-mail on a dispute |
| D3 | Refund of a mistaken or double charge: operator runbook through the Stripe dashboard | 9.3 | absent (runbook) |

## E. Complaints

| # | Item | Terms | On main 2026-11-03 |
|---|---|---|---|
| E1 | One complaints address (decision 1); acknowledgement and 14-day consumer reply tracked by an operator | 11.1–11.2 | absent (operator process) |
| E2 | VVTAT text in the terms; no ODR link | 11.3–11.4 | text only (this draft) |

## F. Publication (last, separate PR)

| # | Item |
|---|---|
| F1 | Lawyer-approved LT text into `messages/*.json` (`legal.paidTerms` or a section of `legal.terms`), translated into every active locale; dated version id |
| F2 | Remove the "being prepared" / "legal review pending" wording (QA 7.28) |
| F3 | Link the Paid Services Terms from the pricing page, checkout (A3), the billing section and the confirmation e-mail |
| F4 | Opening checkout to all organizations (`ALL_ORGANIZATIONS`) remains a separate owner act, after A–E |
| F5 | Production billing walk (J-14) with a test organization: buy, see the e-mail, cancel, see the end date |

## Order

1. Owner and lawyer decide the [SPRENDIMAS] list.
2. RED: A6 (#2685 / #2701) and B2.
3. RED: A1–A5, A7, B1, B3, C3, D1–D2. B1 needs working SMTP.
4. Runbooks: C4, D3 and E1.
5. Publication: F1–F3.
6. Billing walk: F5.
7. Owner act: F4.
