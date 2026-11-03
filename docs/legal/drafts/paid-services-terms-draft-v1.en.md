# Paid Services Terms — DRAFT v2 (English translation)

> **DRAFT FOR OWNER AND LAWYER REVIEW. DO NOT PUBLISH.**
> Not served on the site, not in `messages/*.json`, changes no code.
> Translation of `paid-services-terms-draft-v1.lt.md`; the **Lithuanian text
> is primary**, and the numbering is identical.
> v1: 2026-10-27 (QA matrix 7.28, 7.19). v2: 2026-11-03, after the owner
> instruction to continue preparing pricing and legal terms without changing
> real prices unless separately approved.
>
> - Every owner or lawyer decision is marked **[DECISION: …]**. The full list
>   is at the end.
> - Legal references are indicative; a lawyer must verify the articles.
> - No price in this text changes any price in the product. The price in force
>   is the one the owner set (`docs/human-gates/payments-price-table-gate.md`).
> - What the product needs before public selling:
>   `paid-services-checkout-implementation-checklist.md`.

These terms supplement the platform's Terms of Service and apply only to paid
services. The seller and the governing law are set by the Terms of Service
and are not changed here.

## 1. Seller

1.1. Paid services are sold, invoiced and collected by UAB “Nonstop Group”,
company code 302676973, VAT LT100010790613, registered office Mūšos g. 2C,
Aukštikalnių k., LT-39103 Pasvalio r. sav., Lithuania (the **Seller**).

1.2. Contact for payments, withdrawal and complaints: info@labourmarket.ai.
**[DECISION: use this address or a separate one, e.g. billing@ / complaints@; whether to give a phone number]**

1.3. Payments are processed by Stripe. The platform does not store card
details.

## 2. What is free

2.1. Registration and use of the platform are free for workers and other
individuals (the **PERSON** plan). The Work Journal, Living CV, skills,
documents, job board, bookings and work card stay free.

2.2. An organization can, free of charge, create its space, search for and
contact workers, create projects and confirm work (the **ORGANIZATION FREE**
plan). An organization may have **1 open work need** at a time.
**[DECISION: if RED #2474 is approved, add "3 unique worker-profile opens per organization; re-opens are free"]**

2.3. Free features are never switched off because a paid service was not
bought, has ended or was suspended.

## 3. Paid plans

3.1. **ORGANIZATION**: **EUR 99 per month excluding VAT**. Includes
everything in 2.2 at operating scale: no fixed limit on open work needs,
project operations, readiness, reports, CSV export and journal review.
Technical limits that protect against abuse apply (for example the number of
AI actions per organization per day). Copy says "no fixed limit", never
"unlimited".
**[DECISION: whether the existing request limits and the daily AI cap count as the fair-use bound (FIN-1 c), or a numeric fair-use limit must be stated]**

3.2. **ORGANIZATION SCALE**: **[DECISION: price P2, EUR per month excl. VAT]**.
Includes everything in ORGANIZATION plus higher allowances: AI actions per
day **[DECISION: P2-AI]**, vacancy translations per month **[DECISION:
P2-TR]** and plan-included LMC credits **[DECISION: P2-LMC]**. Nothing is
taken away from ORGANIZATION because of this plan. This plan is not built and
not on sale.
**[DECISION: offer this second paid plan (proposal option A), a paid person plan (B), or defer (C)]**

3.3. **Trial**: **14 days** free, once per organization. If the subscription
is not cancelled before the trial ends, it becomes paid and the first payment
is charged when the trial ends. Before the trial starts, the product shows
when and how much will be charged.
**[DECISION: whether the trial is switched on publicly; whether to e-mail a reminder N days before it converts (recommended, although not directly required for B2B)]**

3.4. **Pilot pass**: a one-off payment for **30 days** of the ORGANIZATION
plan. It does not renew and nothing more is charged. When it ends, the
organization returns to ORGANIZATION FREE unless it subscribes.
**[DECISION: keep the pilot pass for individually invited organizations only, or put it in the public terms with a price (incl. / excl. VAT)]**

## 4. Prices and VAT

4.1. For **organizations** (B2B), prices are shown **excluding VAT**. VAT is
calculated and added at payment by the buyer's country and status:
Lithuanian VAT for a Lithuanian buyer; reverse charge for a VAT-registered
buyer in another EU member state who gives a valid VAT number; otherwise
under the applicable rules.
**[DECISION: lawyer and accountant to confirm VAT treatment; related to RED #2685 (Stripe Tax) and #2701 (removing the unproven VAT promise)]**

4.2. For **consumers** (if sold to them, see 6.1), the price is shown
**including all taxes**, VAT included.

4.3. Before payment the product always shows: plan name, price, whether VAT
is included, billing period, whether payment renews, and the date of the
first payment.

4.4. An invoice is issued for every payment and delivered electronically (by
e-mail and in the account's billing section).
**[DECISION: invoices issued by Stripe (Stripe Invoicing) or the Seller's accounting system; i.SAF reporting]**

## 5. Billing period and automatic renewal

5.1. A subscription is paid **monthly in advance**. A period starts on the
day of payment (or the day the trial ends).

5.2. The subscription **renews automatically** at the end of each period and
the same plan's price is charged to the same payment method until it is
cancelled (section 7).
**[DECISION: whether to offer annual billing (deferred today)]**

5.3. **Failed payment.** If a payment fails, Stripe retries it and the Seller
informs the buyer by e-mail. If payment still fails after **[DECISION: grace
period of N days]**, paid features are suspended and the organization returns
to ORGANIZATION FREE (section 10).

5.4. **Changing plan.** Moving to a more expensive plan charges the prorated
difference for the rest of the period immediately. Moving to a cheaper plan
takes effect from the next period.
**[DECISION: confirm proration (Stripe proration), or "next period" in both directions]**

## 6. Who the buyer is

6.1. Paid plans are intended for **organizations**: legal persons, and
individuals buying for their trade, business, craft or profession. By buying,
the person confirms they buy on behalf of an organization.
**[DECISION: whether services are also sold to consumers (individuals buying outside their business). If not, section 8 applies only to those who are still consumers under mandatory law; if yes, all of section 8 and VAT-inclusive prices (4.2) are required]**

6.2. A buyer who is a consumer under mandatory law always keeps consumer
rights, whatever these terms say.

## 7. How to cancel and when it takes effect

7.1. A subscription can be cancelled **at any time** in the account's billing
section ("Manage subscription", the Stripe customer portal) or by writing to
the address in 1.2. No reason is needed.

7.2. Cancellation takes effect **at the end of the paid period**. Paid
features work until then; nothing is charged afterwards.

7.3. Cancelling during the trial means nothing is charged.

7.4. Cancellation is confirmed by e-mail and shown in the billing section
with the date the paid features end.

7.5. What remains after cancellation: the organization's data, projects,
work records and confirmations are **not deleted**. Work needs already
published are not closed automatically, but a new need cannot be created, or
a closed one reopened, while there are more open needs than the free plan
allows.

7.6. The Seller may end a paid service if the buyer materially breaches the
terms (for example abuse or unlawful use), after notifying the buyer by
e-mail with the reason. For the unused paid period, **[DECISION: refunded
pro rata / not refunded]**.

## 8. Consumer right to withdraw within 14 days

> Applies to **consumers only**. Organizations (B2B) have no such statutory
> right unless the Seller grants one voluntarily (9.2).

8.1. A consumer may withdraw from a services contract concluded at a
distance within **14 days** of its conclusion, without giving a reason
(Directive 2011/83/EU art. 9; the Lithuanian Civil Code provisions on
distance consumer contracts).
**[DECISION: lawyer to give the exact Civil Code articles (6.228¹⁰–6.228¹¹ or others); whether the service is a "digital service" under Directive (EU) 2019/770 and the corresponding Civil Code provisions]**

8.2. **How to withdraw.** Send a clear statement to the address in 1.2 before
the period ends, or use the model withdrawal form (8.6). The Seller confirms
receipt by e-mail.

8.3. **Refund.** All payments received are refunded within **14 days** of
receiving the notice, to the same payment method, without extra fees, except
the amount in 8.4.

8.4. **Service started immediately.** If the consumer expressly asked for
the service to start before the 14 days ended and then withdraws, they pay a
**proportionate amount** for the time up to the withdrawal notice
(Directive 2011/83/EU art. 14(3)).

8.5. **When the right is lost.** If the service has been fully performed
within the 14 days, the consumer loses the right only if, before performance
began, they expressly consented and acknowledged that they would lose the
right once the service was fully performed (Directive 2011/83/EU art. 16(a)).
For a monthly subscription this usually does not apply, because the service
runs for the whole period.

8.6. **Model withdrawal form** (complete and send only if you wish to
withdraw):

> To: UAB “Nonstop Group”, Mūšos g. 2C, Aukštikalnių k., LT-39103 Pasvalio r.
> sav., Lithuania, info@labourmarket.ai.
> I hereby give notice that I withdraw from the contract for the following
> service: [plan name]. Ordered on: [date]. Consumer's name: [...]. Account
> e-mail: [...]. Date: [...]. Signature (only if on paper).

8.7. What the product must show and send: see
`paid-services-checkout-implementation-checklist.md` (part A).

## 9. Refunds

9.1. Consumers: under section 8 and mandatory law.

9.2. Organizations: **[DECISION: choose one]**
- **(a)** a voluntary 14-day guarantee: within 14 days of the **first**
  payment for a plan, the full amount is refunded on request to the address in
  1.2; later payments are not refunded, and cancellation works under section 7;
- **(b)** payments are not refunded; cancellation works under section 7;
- **(c)** pro rata refund for the unused part of the period.

9.3. An amount charged by mistake, twice or after cancellation is **always
refunded**, to the same payment method.

9.4. Refunds are made within **14 days** of the decision to refund; when the
money arrives depends on the bank or card issuer.

## 10. Payment disputes (chargebacks) and suspension

10.1. Before opening a payment dispute with your bank, please contact the
address in 1.2; most issues are resolved faster that way.

10.2. When a payment dispute is opened, the Seller responds through Stripe
with the payment and usage evidence it holds. **Paid features may be
suspended** until the dispute is resolved.

10.3. Suspension never deletes data or switches off free features. If the
dispute is resolved in the buyer's favour, paid features are restored.

10.4. Paid features may also be suspended after a failed payment (5.3) or on
reasonable suspicion of fraud; the buyer is told by e-mail, with the reason.

## 11. Complaints

11.1. Complaints can be made in writing to the address in 1.2. Give the
organization's name, the account e-mail, what happened and what you ask for.

11.2. Receipt is acknowledged within **[DECISION: 2 working days]**. A
consumer's complaint is examined and answered **within 14 days** of receipt
(Lithuanian Law on Consumer Protection); an organization's within
**[DECISION: 14 / 30 days]**.

11.3. If a consumer is not satisfied with the answer, or gets none, they may,
within **one year** of contacting the Seller, apply to the **State Consumer
Rights Protection Authority** (VVTAT, Vilniaus g. 25, LT-01402 Vilnius,
www.vvtat.lt) for out-of-court resolution, or go to court.
**[DECISION: lawyer to check the VVTAT details and the time limit on the publication date]**

11.4. The **EU Online Dispute Resolution (ODR) platform** operated until
20 July 2025 and no longer exists (Regulation (EU) 2024/3228), so no link to
it is given.
**[DECISION: lawyer to confirm the link is no longer required]**

## 12. Liability

12.1. The platform helps find, present and coordinate labour-market
opportunities. It **does not guarantee** that workers or work will be found,
that a contract will be concluded, or any specific business result.

12.2. The Seller is responsible for providing paid services properly. For
organizations, the Seller's total liability under a paid service is limited
to the amount the organization paid for that service in the **12 months**
before the damage arose, and indirect losses (lost profit, lost contracts)
are not compensated.
**[DECISION: confirm the cap (12 months of payments) and the indirect-loss exclusion]**

12.3. Liability is **not limited** for damage caused intentionally or by
gross negligence, for harm to life or health, or wherever the law forbids
limiting it (Civil Code art. 6.252). Consumer rights that cannot be waived
remain.

12.4. The Seller is not liable for outages of third parties (e.g. Stripe,
e-mail or internet providers) it could not control, but acts to reduce their
effect and informs buyers about them.

12.5. Information entered by workers, companies and other users, and the
contracts between them, are the responsibility of those who entered or
concluded them. The platform shows who recorded the information and whether
it was confirmed.

## 13. Changes to terms and prices

13.1. The Seller gives notice of a **price increase** or a material change to
a paid service's terms by e-mail and in the account at least **30 days**
before it takes effect.
**[DECISION: 30 days or longer]**

13.2. A new price applies only from the **next billing period** starting
after the change takes effect. A period already paid for is not changed.

13.3. A buyer who does not agree may **cancel the subscription** before the
change takes effect, at no extra cost (section 7). A buyer who does not
cancel is taken to accept from the next period.

13.4. A price reduction or a new option for the buyer may apply immediately.

13.5. Changes required by law may take effect sooner; notice is given as
early as possible.

## 14. Final provisions

14.1. The Seller, governing law and jurisdiction are set in the Terms of
Service. A consumer always keeps the mandatory rights of their country of
residence.

14.2. Personal data is processed under the Privacy Policy.

14.3. The terms are published in all active platform languages; in case of
inconsistency the Lithuanian text prevails.
**[DECISION: Lithuanian text prevails, or for a consumer the text in their language]**

14.4. Every version of the terms is dated; the buyer is e-mailed the version
in force at the time of purchase.

## Removed from public pages on publication

- The phrase that legal information is "being prepared", and the "legal
  review pending" banners, once a paid plan is sold (QA 7.28).

---

## All open decisions [DECISION]

The numbering matches the Lithuanian list.

| # | Where | Decision | Who |
|---|---|---|---|
| 1 | 1.2 | Contact address for payments, withdrawal, complaints; phone | owner |
| 2 | 2.2 | Add 3 free profile opens if RED #2474 is approved | owner |
| 3 | 3.1 | Do existing limits count as the fair-use bound (FIN-1 c) | owner |
| 4 | 3.2 | Second paid plan: A (ORGANIZATION SCALE) / B (person plan) / C (defer) | owner |
| 5 | 3.2 | P2 price, P2-AI, P2-TR, P2-LMC | owner |
| 6 | 3.3 | Trial switched on publicly; reminder before conversion | owner |
| 7 | 3.4 | Pilot pass individually only, or public with a price | owner |
| 8 | 4.1 | VAT treatment (LT, EU reverse charge, non-EU); #2685, #2701 | lawyer + accountant |
| 9 | 4.4 | Who issues invoices; i.SAF | owner + accountant |
| 10 | 5.2 | Annual billing | owner |
| 11 | 5.3 | Grace period after a failed payment (days) | owner |
| 12 | 5.4 | Plan change: prorated or next period | owner |
| 13 | 6.1 | Sold to consumers or not | owner + lawyer |
| 14 | 7.6 | Refund when the Seller ends the service for breach | owner |
| 15 | 8.1 | Exact Civil Code articles; digital service (Dir. 2019/770) | lawyer |
| 16 | 9.2 | Refunds for organizations: (a) / (b) / (c) | owner |
| 17 | 11.2 | Acknowledgement time; organization complaint deadline | owner |
| 18 | 11.3 | VVTAT details on the publication date | lawyer |
| 19 | 11.4 | ODR link no longer required | lawyer |
| 20 | 12.2 | Liability cap and indirect-loss exclusion | owner + lawyer |
| 21 | 13.1 | Notice period for changes (30 days or longer) | owner |
| 22 | 14.3 | Which language prevails | lawyer |

After the decisions: lawyer approval → translation into all active languages
→ publication in a separate PR together with the code from the checklist.
