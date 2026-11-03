# 0029 — Commercial sustainability and business health (one financial architecture record)

| Field | Value |
|---|---|
| Status | **ACTIVE — canonical.** The ONE record of LabourMarket.ai's financial principles, financial safety rules, economic-model fields, commercial-gate conditions, business-health metrics, early warnings and health score |
| Decided | Owner, 2026-11-03: *"PR #896 IR #897 – PERKELTI IR UŽDARYTI. Visus unikalius finansinius principus, apskaitos, mokėjimų, audito ir saugumo reikalavimus perkelti į vieną kanoninį finansinės architektūros sprendimų dokumentą su nuorodomis į istorinius PR. Tik patikrinus perkėlimo pilnumą uždaryti abu PR, išsaugant jų istoriją. Neaktyvuoti mokėjimų ir nekeisti kainodaros."* |
| Origin | PR #896 (`feat/commercial-sustainability-v1`, head `ee2717e1`, 2026-07-28) · PR #897 (`feat/business-health-engine-v1`, head `caedf851`, 2026-07-28) · PR #895 (`feat/canonical-commercial-system-v1`, head `155f20d2`, closed earlier) — branches kept, history kept |
| Changes nothing at runtime | **No price, no plan, no LMC amount, no Stripe object, no payment flag, no entitlement, no migration.** Payments stay unarmed; pricing stays as the owner set it (`docs/human-gates/payments-price-table-gate.md`) |
| Axioms | A-10, A-11, A-12 (`docs/PRODUCT_CONSTITUTION.md` §12) cite this file. All three remain **review** — no machine gate exists on main (§9) |
| Architecture | `docs/OWNER_TARGET_ARCHITECTURE_V1.md` §10, row MKT-7 points here; the open economic questions are the owner row **FIN-1** there (§8 of this file) |

## 0. Why this file exists, and how to read it

Main's gates G-7 (one price table) and G-8 (live keys plus owner approval) decide **when** selling is
allowed. Neither asks **whether** what is sold pays for itself. That second question existed only in
three unmerged PRs whose code imports a catalogue (`lib/commercial/catalogue.ts`) that main never
received: main took a different, owner-ratified catalogue instead (`apps/web/lib/commercial/plan-catalogue.ts`,
2026-10-03). Their code therefore cannot be rebased faithfully. The owner decided to carry the content
here and close the PRs.

Every item below carries:

- **origin**: the PR and the file it came from;
- **on main**: `yes`, `partly` or `absent`, with the file and line it rests on, as verified 2026-11-03.

The principles and rules are quoted **verbatim** from #896. They are binding as principles now. They are
held by **review**, not by a machine, until a gate is built (§9). Claiming machine enforcement before
then would be a dormant check (axiom honesty rule, `apps/web/lib/guards/product-gate.test.ts`).

Nothing here sets a number. Every cost, margin, ratio or subsidy figure is the owner's, at assessment time.

---

## 1. Commercial sustainability principles (CSP) — origin #896 `docs/product/commercial-sustainability-v1.md` Part 1

### CSP-001

> The project may never be deliberately designed to operate at a long-term loss.

Origin enforcement: machine. A non-positive expected margin is a violation unless the item is
explicitly declared a subsidy **with a named funding source** (`negative_margin_without_subsidy`).

**On main: absent.** No margin is recorded for any plan.

### CSP-002

> Every new plan, LMC product, micro-feature, AI feature, API feature and
> advertising feature must have a clearly assessed economic model before it
> becomes a public feature.

Origin enforcement: machine. Two rules. An **activatable** item without an assessment is RED. A
**new** item, meaning anything outside the closed 2026-07-28 baseline, must ship its economic model
in the same PR that introduces it, even before it is sellable (`new_item_without_assessment`).

**On main: partly.** Activation is gated: `docs/human-gates/payments-price-table-gate.md:3` (G-7
closed, G-8 open), and live keys are blocked at `apps/web/lib/billing/config-core.ts:8`. No economic
model is recorded for the live Organization plan (§8).

### CSP-003

> The free plan must be genuinely useful (roughly 60–70 % of base value) so a
> user really understands the product's value, while its long-term cost is
> funded by the overall commercial model.

Origin enforcement: review, plus a partial machine check. The 60–70 % ratio is a **design judgement
recorded at assessment time**. The *funding* half is machine-checked: a free tier must carry
`subsidised: true` with a named, present-tense funding source.

**On main: partly.** The free tiers are generous and recorded at
`docs/human-gates/payments-price-table-gate.md:10-11` (PERSON €0 with the whole identity loop;
ORGANIZATION FREE €0). The funding half (what pays for them) is recorded nowhere.

### CSP-004

> The commercial model must naturally encourage progression Free → Plus → Pro,
> without artificial feature blocking.

Origin enforcement: **review**. A machine cannot tell a fair boundary from an artificial one.

**On main: partly.** In spirit, by the launch pricing (FREE vs ORGANIZATION at operating scale,
`payments-price-table-gate.md:11-12`). The tier names "Plus / Pro" are those of 2026-07-28; the live
tiers are PERSON / ORGANIZATION FREE / ORGANIZATION. The principle applies to whatever tiers exist.

### CSP-005

> LMC is not a discount system. LMC is an internal economy, used for
> micro-features, additional AI actions, additional limits, advertising and
> additional services.

Origin enforcement: machine. An LMC-denominated item whose assessment describes a **price reduction**
rather than a delivered capability is a violation (`lmc_used_as_discount`).

> **Recorded boundary case (origin, verbatim).** The plan axis `lmcTopupDiscountPercent` (MOD-08)
> is a discount on *buying* credit — a plan perk priced in EUR. That is not LMC
> acting as a discount, and it does not breach CSP-005. LMC being *spent* to
> reduce a price would.

**On main: partly.** The LMC ledger exists (`supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql`),
1 LMC = 1 EUR is an invariant (`apps/web/lib/billing/lmc-flags.ts:5`), and every user-economy flag is
off (`lmc-flags.ts`; `docs/product/lmc-commercial-system-train-v1.md` §11, line 411). No LMC product
is sold, so the rule has had nothing to bite on yet.

---

## 2. Financial safety rules (FSR) — origin #896 Part 2

### FSR-001

> No new feature may be launched if its approximate unit cost is unknown.

Origin: an assessed model with `estimatedUnitCostCents === null` is RED (`missing_unit_cost`).

**On main: partly.** Only AI cost is metered: `apps/web/lib/ai/runtime/audit-store.ts:97`
(`estimated_cost_usd` per run), summed for 7 days at `apps/web/lib/ops/product-metrics.ts:203`
(`ai_cost_usd_7d`). Storage, mail, hosting and per-feature cost are not measured.

### FSR-002

> No feature may be declared "Unlimited" without a technical mechanism limiting
> abuse or guaranteeing a positive economic result.

Origin: `unlimitedClaim: true` with no `abuseLimitMechanism` is RED (`unlimited_without_abuse_limit`).
A mechanism must be a real technical bound (a server-enforced fair-use cap, a rate limit, a per-period
ceiling), not a sentence in marketing copy.

**On main: partly.**
- AI is bounded per organization: `apps/web/lib/ai/runtime/org-run-cap.ts:23`
  (`DEFAULT_ORG_DAILY_RUN_CAP = 100`) under the global `AI_DAILY_RUN_BUDGET` (`org-run-cap.ts:4`).
- The live paid Organization plan has **no numeric ceiling on concurrent open positions** by owner
  decision 2026-10-06: `apps/web/lib/commercial/plan-catalogue.ts:293`, `apps/web/lib/billing/open-needs-gate.ts:20`,
  `payments-price-table-gate.md:12`.
- The catalogue comment names the separate abuse protections ("request rate limits, intake throttles",
  `plan-catalogue.ts:281-283`), but whether those count as the FSR-002 bound has not been decided.
  That is an owner question (FIN-1 (c), §8).

### FSR-003

> The commercial system must be designed so that product growth does not
> automatically increase losses.

Origin: cost that scales with usage while revenue does not, with nothing bounding usage, is RED
(`growth_scales_losses`). Any two of the three are fine; all three together is a loss engine.

**On main: partly.** Only AI cost is bounded (the per-organization cap above). A flat-price plan with
unmetered positions makes revenue independent of usage. Whether any cost grows with positions is not
measured.

### FSR-004

> The goal is long-term positive cash flow. The project may not be designed on
> the assumption that losses will be covered by future investment.

Origin: a subsidy whose funding source names investment, a funding round or future revenue is RED
(`subsidy_funded_by_future_investment`). A subsidy must be funded by **present** commercial income.

**On main: absent.** No subsidy (free tier, trial, pilot pass, the VIP grant of #2474) names its
funding source.

### FSR-005

> Before activating a new paid feature it must be clear: who pays; what they pay
> for; the approximate unit cost; the expected margin.

Origin: each of the four is a required field. Any one missing is RED.

**On main: partly.**
- **Who pays and what they pay for:** recorded for the Organization plan, which the organization pays
  for (`payments-price-table-gate.md:12`).
- **Unit cost and margin:** not recorded.

---

## 3. The economic model — origin #896 Part 3, extended by #897 Part 3

Every sellable item carries an assessment. Until it is assessed it may not be sellable.

| Field | Answers | Required by | Origin |
|---|---|---|---|
| `owner` | the accountable role for this item's economics | business health | #897 |
| `payer` | **who pays**: worker / company / agency / platform (`platform` = deliberate subsidy) | FSR-005 | #896 |
| `paidFor` | **what they pay for**, in one concrete sentence | FSR-005 | #896 |
| `deliveredCapability` | what the buyer actually **receives** (a capability, never a discount) | CSP-005 | #896 |
| `costDriver` | what consumes money when it is used | FSR-001 | #896 |
| `revenueDriver` | the billable event or recurring term that produces revenue | business health | #897 |
| `estimatedUnitCostCents` + `costUnit` | **approximate unit cost**, with the unit named | FSR-001 | #896 |
| `costScalesWithUsage` | does cost grow with use | FSR-003 | #896 |
| `revenueScalesWithUsage` | does revenue grow with the same use | FSR-003 | #896 |
| `expectedMarginPercent` | **expected margin** | FSR-005, CSP-001 | #896 |
| `marginModel` | one auditable sentence on how the margin is made | business health | #897 |
| `unlimitedClaim` | is it presented as unlimited | FSR-002 | #896 |
| `abuseLimitMechanism` | the technical bound (required if unlimited) | FSR-002 | #896 |
| `subsidised` + `subsidyFundedBy` | deliberate subsidy and what funds it | CSP-001, CSP-003, FSR-004 | #896 |
| `commercialDecision` | the recorded decision authorising it, or the open decision id blocking it | business health | #897 |
| `assessedAt` | when the owner assessed it | audit | #896 |

Feature-economics status fields (#897 Part 3): `activation_status` is one of `not_activatable` ·
`activatable` · `live`. `assessment_status` is one of `unassessed` · `incomplete` · `assessed`.

**On main: absent.** `plan-catalogue.ts` carries a `commercial` block per plan (price source, open
markers with decision ids, `plan-catalogue.ts:1-36`), but none of the fields above.

---

## 4. The commercial gate — origin #896 Part 4, #897 Part 9

### 4.1 Conditions that turn a commercial change RED

| # | Condition | Code | Principle | Origin |
|---|---|---|---|---|
| 1 | A plan gets a price, a top-up gets an amount, or a micro-feature gets an LMC price, with no assessment | `activatable_without_assessment` | FSR-005 | #896 |
| 2 | A new commercial item appears with no assessment entry at all | `new_item_without_assessment` | CSP-002 | #896 |
| 3 | A new item is added unassessed, even while not yet sellable | `new_item_without_assessment` | CSP-002 | #896 |
| 4 | Assessed, but the unit cost is unknown | `missing_unit_cost` | FSR-001 | #896 |
| 5 | Assessed, but no expected margin | `missing_margin` | FSR-005 | #896 |
| 6 | What is paid for / what is delivered is not stated | `missing_payer_or_subject` | FSR-005 | #896 |
| 7 | "Unlimited" with no technical bound | `unlimited_without_abuse_limit` | FSR-002 | #896 |
| 8 | Cost scales with usage, revenue does not, nothing bounds usage | `growth_scales_losses` | FSR-003 | #896 |
| 9 | Non-positive margin that is not a declared, funded subsidy | `negative_margin_without_subsidy` | CSP-001 | #896 |
| 10 | A subsidy justified by future investment or future revenue | `subsidy_funded_by_future_investment` | FSR-004 | #896 |
| 11 | An LMC item that delivers a discount instead of a capability | `lmc_used_as_discount` | CSP-005 | #896 |

Two further codes existed only in the code, not in the document's table. They are carried here:

| Code | Condition | Origin |
|---|---|---|
| `unassessed_item_marked_activatable` | an item whose entry says `assessed: false` is still flagged `activatable: true` | #896 `apps/web/lib/commercial/sustainability.ts:316` |
| `missing_business_health_fields` | an assessment with an empty `owner`, `revenueDriver`, `marginModel` or `commercialDecision` | #897 Part 9 + `sustainability.ts` (four negative controls) |

The origin rule for the guard is carried as a requirement for any future gate: *every* condition is
proven by a **negative control**, a test that builds the offending shape and asserts the gate rejects
it. "A gate that has never been shown to fail is not a gate."

**On main: absent.** No commercial gate exists.

### 4.2 The ratchet — carried as an idea, its list is stale

Origin (#896): `GRANDFATHERED_ITEMS` holds the 20 items that existed on 2026-07-28: 5 plans, 7 top-up
slots and 8 micro-features, each unpriced and named by the open decision that will produce its model.
The baseline is closed, and its length is pinned in the guard, so growing it is a reviewable act.

**Stale against main.** The list names `free_worker`, `worker_plus`, `company_pilot`, `agency_pilot`,
`admin_internal`, `topup_t1…t7` and eight ad micro-features. Main's catalogue is different: PERSON /
ORGANIZATION FREE / ORGANIZATION, with deferred `ai_plus`, `vip_media` and agency tiers
(`apps/web/lib/billing/plans.ts:28`). Since 2026-09-05 one of them, the Organization plan, **is priced
and sellable**. A faithful ratchet built today would be RED on that plan until the owner records its
economic model or a dated exception (§8). The idea is carried; the list must be rebuilt from main's
catalogue when the gate is built.

### 4.3 How a new commercial item is added (origin #896 Part 4, adapted to main)

1. Add it to the ONE catalogue (`apps/web/lib/commercial/plan-catalogue.ts`; LMC products when they
   exist, in the LMC train's catalogue).
2. Record its economic model (§3) **in the same PR**. If it is not ready, mark it not activatable and
   give it no price.
3. For a plan, record the CSP-003 / CSP-004 judgement in the PR description: is the free tier still
   genuinely useful, and is the boundary real rather than artificial?
4. Once a gate exists (§9), it must report GREEN.

### 4.4 What is proven vs judged (origin #896 Part 5)

| Principle | Held by (origin design) | Why |
|---|---|---|
| CSP-001, CSP-002, CSP-005 | machine | expressible as a property of the assessment |
| FSR-001 … FSR-005 | machine | each is a required field or a forbidden combination |
| CSP-003 | review (+ machine on the funding half) | the 60–70 % ratio needs plan values |
| CSP-004 | review | no check can distinguish a fair tier boundary from artificial blocking |

Today, with no gate on main, **all ten are held by review**.

---

## 5. Business health — origin #897 `docs/product/business-health-engine-v1.md`

### 5.1 The rule that shapes every metric (verbatim)

> **A metric whose inputs do not exist returns `null` with a reason — never
> `0`, never an estimate.** A dashboard showing `0 €` of cost because nothing
> measures cost is worse than one showing "not measured": the first invites a
> decision, the second demands the instrument.

Warnings and the score follow the same rule: with no data the answer is `NOT_EVALUABLE`, never
`CLEAR`. This is axiom **A-12**.

**On main: partly.** The principle is binding as A-12, and SEP-7 (unknown ≠ zero) is enforced in the
product graph. No financial metric exists to apply it to.

### 5.2 Data sources

#897 recorded their state against production on 2026-07-28. Re-verified against main's migrations,
2026-11-03:

| Source | Holds | On main |
|---|---|---|
| `profiles` | identities | yes |
| `pilot_events` | route / task / duration / result telemetry, no cost | yes (`supabase/migrations/0020_pilot_events.sql`) |
| `billing_subscriptions` · `billing_customers` · `payment_webhook_events` | subscription state, customer link, provider event ledger | yes (`supabase/migrations/20260613200000_billing_test_mode_records.sql` and later) |
| `finance_records` | manual invoices / payments (EUR cents) | yes (`supabase/migrations/20260711230000_finance_records_v1.sql`) |
| `lmc_transactions` · `lmc_lots` · `lmc_lot_consumptions` · `lmc_account_balances` | the LMC ledger | yes (`supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql`) |
| `ai_runs` | per-run AI cost | **yes since #897 was written** (`supabase/migrations/20260714150000_ai_runs_audit_v1.sql`; cost at `audit-store.ts:97`) |
| `usage_events` | metered usage per feature | absent |
| `infrastructure_billing` | provider invoices (hosting, database, model vendors) | absent |
| `marketing_spend` | acquisition cost per channel | absent; CAC cannot exist without it |
| `stripe_charges` | settled payments | absent as a table; the signed webhook ledger and the revenue funnel (`apps/web/lib/billing/billing-funnel.ts:57`) carry subscription and paid-invoice events instead |

### 5.3 The 39 metric definitions (one definition each; origin #897 Part 2 and `business-health.ts` `METRICS`)

**Revenue (6)**

| Metric | Code | Formula |
|---|---|---|
| Revenue | `revenue_total` | settled subscription + top-up + enterprise/manual revenue over the period |
| Subscription revenue | `revenue_subscription` | paid invoice amounts belonging to a subscription |
| Top-up revenue | `revenue_topup` | settled LMC top-up payments — **always read next to `lmc_outstanding_liability`**, because the cash arrives before the obligation is served |
| Enterprise revenue | `revenue_enterprise` | `finance_records` enterprise/manual sales with status = paid |
| MRR | `mrr` | normalised monthly value of every ACTIVE/TRIALING subscription at period end; annual ÷ 12; **top-ups are never counted** |
| ARR | `arr` | `mrr × 12` — a run-rate projection, never booked revenue |

**Unit economics (5)**

| Metric | Code | Formula |
|---|---|---|
| LTV | `ltv` | avg monthly contribution margin per paying customer ÷ monthly churn; **requires ≥3 periods of retention** |
| CAC | `cac` | acquisition spend ÷ new paying customers, same period |
| LTV/CAC | `ltv_cac_ratio` | `ltv ÷ cac` — below 1 the company pays for every customer it wins |
| Average revenue / user | `arpu` | `revenue_total ÷ active users` |
| Average cost / user | `acpu` | `cost_total ÷ active users` |

**Margin (3)**

| Metric | Code | Formula |
|---|---|---|
| Gross margin | `gross_margin` | (revenue − direct variable cost) ÷ revenue × 100 |
| Contribution margin | `contribution_margin` | (revenue − direct variable − variable acquisition/support) ÷ revenue × 100 |
| Net margin | `net_margin` | (revenue − all cost incl. infrastructure and fixed) ÷ revenue × 100 |

**Cost (12)**, each defined per period and **attributed to the feature that caused it**:
`cost_total` · `cost_ai` · `cost_storage` · `cost_api` · `cost_email` · `cost_ocr` · `cost_maps` ·
`cost_search` · `cost_voice` · `cost_video` · `cost_infrastructure` · `cost_referral`
(`cost_referral` = referral LMC issued × 1 EUR; referrals are disabled, and a euro liability the moment they are not).

**LMC (6)**

| Metric | Code | Formula |
|---|---|---|
| Issued | `lmc_issued` | every credit transaction: purchased + promotional_signup + promotional_activity + admin_grant + referral_reward |
| Purchased | `lmc_purchased` | lots with `source_kind = 'purchased'` — the part paid for in cash |
| Granted | `lmc_granted` | promotional + admin lots — pure liability, no cash behind it |
| Spent | `lmc_spent` | lot consumptions attributed to spend transactions |
| Expired | `lmc_expired` | remaining value consumed by expiry transactions |
| Outstanding liability | `lmc_outstanding_liability` | `sum(spendable_cents)` = issued − spent − expired − reversed. **At 1 LMC = 1 EUR this is deferred revenue in euro** |

**Adoption (6)**: `users_paid` · `users_free` · `conversion_rate` · `top_cost_features` ·
`top_revenue_features` · `top_ai_consumers`.

**Composite (1)**: `financial_health_score` (§5.7).

**On main: raw data only.** `apps/web/lib/ops/product-metrics.ts` reports operational and AI-cost
signals (`ai_cost_usd_7d`, line 203). None of the 39 financial definitions exists as code, and MRR is
defined nowhere else. This file is the ONE definition of each.

### 5.4 Plan health (origin #897 Part 4)

Per plan: Revenue · Average Usage · Infrastructure Cost · AI Cost · Margin · Profitability · Risk.
Profitability is one of `profitable` · `break_even` · `loss_making` · `unknown`. Risk is one of `low` ·
`medium` · `high` · `unknown`. With no recorded price, subscription or cost collector, a plan reports
`unknown` with its reason, never "profitable".

**On main: absent.**

### 5.5 LMC health (origin #897 Part 5)

Issued · Purchased · Granted · Spent · Expired · Outstanding Liability, plus a **backing ratio**
(outstanding liability ÷ cash received for credit): how much of the promise is funded.

**On main: absent** as a report. The ledger that feeds it exists (§5.2).

### 5.6 Early warnings (origin #897 Part 6 and `WARNING_RULES`)

| Code | Question | Condition | Severity |
|---|---|---|---|
| `LOSS_RISK` | Is cost approaching revenue? | `cost_total ≥ revenue_total × 0.9` | critical |
| `NEGATIVE_MARGIN` | Is anything selling below its own cost? | any feature/plan with contribution margin < 0 | critical |
| `LOW_MARGIN` | Is margin thin enough that growth stops helping? | `gross_margin < 30%` | high |
| `UNLIMITED_RISK` | Is anything sold as unlimited without a bound? | activatable item with `unlimitedClaim` and no abuse mechanism | high |
| `HIGH_AI_COST` | Is AI eating the margin? | `cost_ai ÷ revenue_total > 0.25` | high |
| `EXPENSIVE_FEATURE` | Is one feature's cost share far beyond its revenue share? | cost share > 2 × revenue share over a full period | medium |
| `LMC_LIABILITY_GROWING` | Is credit growing faster than the cash behind it? | `Δ liability > Δ topup revenue` | high |
| `SUBSIDY_RISK` | Is the free tier outgrowing the base that funds it? | `Δ free ÷ Δ paid` above the assessed ratio | medium |

Each warning is `TRIGGERED`, `CLEAR` or `NOT_EVALUABLE`. A warning may **never** report `CLEAR` while
its inputs are unmeasured.

**On main: absent.** Of the eight, only `UNLIMITED_RISK` reads declared economics rather than
measurements. Built today, it would turn TRIGGERED on the Organization plan's unmetered positions,
unless the owner records the FSR-002 bound (§8).

### 5.7 Financial health score, 0–100 (origin #897 Part 8 and `HEALTH_SCORE_COMPONENTS`)

| Component | Weight | Driven by | Scoring |
|---|---|---|---|
| Revenue | 15 | `revenue_total` | 0 at zero revenue, rising against the previous period |
| Cost control | 15 | `cost_total` | full marks while cost growth stays below revenue growth |
| Growth | 15 | `mrr` | period-over-period MRR change |
| Margin | 20 | `contribution_margin` | scaled 0–100 across 0–60 % |
| Risk | 10 | warnings | reduced by each TRIGGERED warning, weighted by severity |
| Commercial readiness | 10 | assessments | share of catalogue items with a complete economic assessment |
| LMC sustainability | 10 | `lmc_outstanding_liability` | falls as unbacked liability grows |
| Subscription sustainability | 5 | `ltv_cac_ratio` | scaled 0–100 across 0–3 |

The weights total **100**. **The score refuses to report below 5 computable components**
(`HEALTH_SCORE_MIN_COMPONENTS = 5`): below that it answers `INSUFFICIENT_DATA` and names what is
missing. An unmeasured component is never scored as 0.

**On main: absent.**

### 5.8 CEO view (origin #897 Part 7)

Today's Revenue · Today's Cost · Today's Margin · MRR · ARR · Paid Users · Free Users · Conversion ·
Average Revenue/User · Average Cost/User · Top Cost Features · Top Revenue Features · Top AI Consumers ·
LMC Liability · Outstanding Credits · Health Score. Every cell carries a reason instead of a number
until its input is measured.

**On main: absent.** It would extend the existing owner and admin read surfaces, never become a
second dashboard (A-08).

### 5.9 Instrument first: the order to build in (origin #897 Part 10)

1. **A cost collector.** Per-call AI cost now exists (`ai_runs`); provider-invoice import does not.
   Without it the 12 cost metrics, all three margins, ACPU and five of the eight warnings cannot exist.
2. **Revenue events.** The subscription and paid-invoice chain is built; it is unproven with live
   money (G-8 open).
3. **Marketing spend.** Absent, so CAC and LTV/CAC are impossible.
4. **Per-feature attribution.** `pilot_events` records activity, but not plan, feature or cost.
5. **The spend → entitlement mapping** (MOD-20 / MDD-20) for LMC revenue per feature.
6. **Retention history.** LTV needs ≥3 periods, and the clock starts with the first paying customer.

What to start collecting the day real users arrive, in order: (1) per-call AI cost (model, tokens, EUR,
calling feature, account); (2) provider invoices per month; (3) usage events per feature per account;
(4) acquisition spend per channel; (5) subscription lifecycle events; (6) storage / media volume per
account. **Rule for all six: record the cost at the moment it is incurred, attributed to the feature
and the account. Cost reconstructed later is always wrong, and always wrong in the flattering direction.**

### 5.10 The honesty vocabulary (origin #897 `business-health.ts` types)

The labels any implementation must use, so that "not measured" can never collapse into "zero":

| Concept | Values |
|---|---|
| Data source state | `collecting` (exists and is written to) · `empty` (exists, never written to) · `missing` (no table, no collector) |
| Metric availability | `computable` · `computable_empty` (reads zero-state honestly) · `blocked_missing_data` · `blocked_owner_decision` |
| Why a value is unmeasured | `no_collector` · `no_data_yet` · `owner_decision_pending` · `not_applicable` |
| Metric unit | `eur_cents` · `lmc_cents` · `count` · `percent` · `ratio` · `score` |
| Metric group | `revenue` · `unit_economics` · `margin` · `cost` · `lmc` · `adoption` · `composite` |
| Warning status | `TRIGGERED` · `CLEAR` · `NOT_EVALUABLE` |
| Health score | a number, or `INSUFFICIENT_DATA` naming the missing components |

Money is held in integer cents (EUR or LMC), never floating point.

---

## 6. Accounting, payment and audit requirements — origin #895 `docs/product/commercial-system-v1.md`

#895 was closed earlier. Its catalogue is superseded by main's owner-ratified `plan-catalogue.ts`
(2026-10-03) and the launch pricing (G-7, 2026-09-05). Its prior-art prices from #754 and its slot
tables are superseded by those decisions. These are its rules on accounting, payment and audit, and
where each one stands:

| Requirement (#895) | On main |
|---|---|
| A price exists in exactly one place; anything undecided is an open marker with a decision id, never null-as-unlimited, never a guess | **yes**: `plan-catalogue.ts:19-27`; the figure lives only in `public.plans.price_eur_monthly` (`payments-price-table-gate.md`, "Where the truth lives") |
| LMC: 1 LMC = 1 EUR internal credit, integer cents, balance derived from the ledger, not money / not withdrawable / not an investment, no MLM (one direct referral only) | **yes**: `docs/product/lmc-commercial-system-train-v1.md:88-98`, ledger migration `20260720190000` |
| Spend order (expiring promotional lots first, then purchased, oldest first); purchased LMC never expires by promotional rules | **yes**: `lmc-commercial-system-train-v1.md:230-234` |
| Reversal: exactly one reversal per original; only remaining unspent value reversible; clawback of spent value is an open decision | **yes**: train §10 (`lmc-commercial-system-train-v1.md:394`), `:403-404` |
| Six kill switches, all off; `stripe_lmc_topups_enabled` and `live_payments_enabled` owner-only | **yes**: `apps/web/lib/billing/lmc-flags.ts:58` |
| Stripe sells **only** subscriptions and LMC top-ups, never a tool; a top-up needs no subscription | **yes** as a rule: `lmc-commercial-system-train-v1.md:356-363`. **Open:** the live 1 € pilot pass (`apps/web/lib/billing/pilot-pass-core.ts:10`) is a one-time Stripe payment, neither a subscription nor a top-up. FIN-1 (e), §8 |
| A right comes from exactly three sources (`plan`, `lmc`, `admin`); no fourth path | **partly**: main's resolver admits an active/trialing subscription, the pilot pass, an admin, or an explicit admin **manual override** (`apps/web/lib/billing/entitlements-v1.ts:7`, `:28`); the override is admin-gated, so it sits inside the `admin` source |
| VAT treatment, revenue recognition for LMC-settled months, refund of unspent purchased LMC: owner + accountant decision before any credit is sold (MOD-11) | **partly**: open as OG-9 (`docs/audits/labourmarketai-commercial-billing-audit-v1.md:969`); Stripe Tax setup is a G-8 step (`payments-price-table-gate.md`, G-8 step 2) |
| Minimum / maximum per top-up transaction (abuse bound, MOD-10) | **absent**; top-ups are deferred, so not yet needed |
| The Stripe product generator refuses to emit a product for a price nobody has set | **yes** in substance: a Stripe price is never inferred from the database figure (`plan-catalogue.ts:22-24`) |
| Concierge / AI-automation fees are not part of the platform catalogue until decided (MOD-23) | **absent** as a recorded rule; carried here as an open positioning question, not decided |

No #895 security requirement is unique. The live-key block, signature-verified webhooks and
owner-armed activation are on main: `config-core.ts:8` and `payments-price-table-gate.md`, "What exists".

---

## 7. What this record does NOT change

- no price, plan, tier, trial or pass changed; pricing stays as `payments-price-table-gate.md` records it;
- no payment armed: G-8 stays open and `live_payments_enabled` stays off;
- no LMC amount, grant, cap, expiry or flag changed;
- no Stripe object, entitlement or migration;
- axioms A-10, A-11 and A-12 stay **review**.

---

## 8. Open owner questions (recorded, NOT decided) — the FIN-1 row

The owner rules these (`docs/OWNER_TARGET_ARCHITECTURE_V1.md` §10, FIN-1). No agent may settle them:

| | Question | Why it is open |
|---|---|---|
| a | The **economic model of the live Organization plan** (€99/month): owner, unit cost and its unit, expected margin, what grows with usage | it is priced and sellable (G-7), and CSP-002 / FSR-005 ask for the model before paid activation (G-8) |
| b | The model of the **14-day trial** (`apps/web/lib/billing/trial-core.ts:2`, switch `apps/web/lib/billing/config.ts:66`), the **1 € / 30-day pilot pass** (`pilot-pass-core.ts:29-36`), and the **VIP grant** of #2474 (RED, open): each is a subsidy. What funds it (CSP-001, FSR-004)? | no subsidy names its funding source |
| c | The **FSR-002 bound for unlimited open positions** on the Organization plan (`plan-catalogue.ts:293`): do the existing request rate limits and intake throttles count as the technical abuse bound, or is a fair-use ceiling needed? | owner decision 2026-10-06 removed the ceiling; FSR-002 asks what bounds it instead |
| d | The free-tier funding statement (CSP-003): what present income funds PERSON and ORGANIZATION FREE | the ratio is a judgement; the funding half is a required field |
| e | Whether the one-time pilot-pass payment is an accepted exception to "Stripe sells only subscriptions and LMC top-ups" (§6) | it is live code, and the rule pre-dates it |

---

## 9. Enforcement status, and what a gate needs

**Held by review today.** Every principle and rule above binds reviewers of any commercial PR. Its
description must answer §3 for each new or changed sellable item, and §4.3 step 3 for plans.

A future machine gate (GREEN code, no migration) would follow the origin design, rebuilt on main's
catalogue:
1. assessments keyed to `plan-catalogue.ts` slugs;
2. the ratchet rebuilt from main's items (§4.2);
3. every condition of §4.1 with a negative control;
4. `reviewOnlyPrinciples()` = CSP-003, CSP-004, asserted so neither can be silently reclassified.

When it lands, A-10 and A-11 may move to `machine` in the same PR. A-12 moves when the business-health
definitions of §5 exist as code with their guard. Until then the honest state is `review`.

## 10. Historical PRs (closed after this record merged; branches kept)

| PR | Branch @ head | Carried in |
|---|---|---|
| #896 financial safety layer v1 | `feat/commercial-sustainability-v1` @ `ee2717e1` | §1, §2, §3, §4 |
| #897 Business Health Engine v1 | `feat/business-health-engine-v1` @ `caedf851` | §3 (four fields), §4.1 (`missing_business_health_fields`), §5 |
| #895 canonical commercial system v1 (closed earlier) | `feat/canonical-commercial-system-v1` @ `155f20d2` | §6 |

Amend this file by PR. A new financial direction **extends** it, never forks a second financial architecture.
