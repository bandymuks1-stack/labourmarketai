# BUSINESS HEALTH ENGINE V1 — CEO FINANCIAL OPERATING SYSTEM

| Field | Value |
|---|---|
| Status | **BINDING.** Part of the Commercial System |
| Machine half | `apps/web/lib/commercial/business-health.ts` |
| Enforced by | `apps/web/lib/guards/business-health-gate.test.ts` (CI) |
| Sits on | `commercial-system-v1.md` (*what* is sold) → `commercial-sustainability-v1.md` (*is selling it sound*) → **this** (*is the business getting healthier, and what is starting to damage it*) |
| Created | 2026-07-28 · branch `feat/business-health-engine-v1` |
| Changed | **no** Stripe, **no** LMC, **no** price, **no** entitlement, **no** plan |

## What this is, and what it refuses to be

This is not BI and not a dashboard. It is the canonical definition of *how
financial health is measured* — every metric, its exact formula, the data it
needs, and whether that data exists.

Its purpose is not to display statistics. It is to show, **as early as
possible, that a feature, plan or service has begun to damage the economics of
the whole product**, while a decision is still cheap.

### The rule that shapes every type in it

> **A metric whose inputs do not exist returns `null` with a reason — never
> `0`, never an estimate.** A dashboard showing `0 €` of cost because nothing
> measures cost is worse than one showing "not measured": the first invites a
> decision, the second demands the instrument.

The same applies to warnings and to the score: with no data the answer is
`NOT_EVALUABLE`, never `CLEAR`. **An early-warning engine that reports "all
good" while blind is the most dangerous thing this system could contain**, and
the guard makes it structurally impossible.

---

## PART 1 — DATA SOURCES (verified against production, 2026-07-28)

| Source | What it holds | State | Note |
|---|---|---|---|
| `profiles` | registered identities | **collecting** | 31 rows |
| `pilot_events` | telemetry: route, task, duration, result | **collecting** | 328 rows — the only real usage signal, and it carries **no cost** |
| `billing_subscriptions` | subscription state | empty | applied, 0 rows |
| `billing_customers` | profile ↔ provider customer | empty | applied, 0 rows |
| `payment_webhook_events` | provider event ledger | empty | applied, 0 rows |
| `finance_records` | manual invoices/payments (EUR cents) | empty | applied, 0 rows; manual entry, not a feed |
| `lmc_transactions` · `lmc_lots` · `lmc_lot_consumptions` · `lmc_account_balances` | the LMC ledger | empty | applied, 0 rows |
| `ai_runs` | per-run AI cost | **MISSING** | never created — lived only in closed PR #754 |
| `usage_events` | metered usage across 9 categories | **MISSING** | never applied — closed PR #754 only |
| `infrastructure_billing` | provider invoices (Vercel, Supabase, model vendors) | **MISSING** | no import path of any kind |
| `marketing_spend` | acquisition cost per channel | **MISSING** | no table, no import — CAC cannot exist without it |
| `stripe_charges` | settled payments | **MISSING** | no Stripe account configured |

**The single most important line in this document:** *nothing in production
measures cost.* Not AI, not storage, not infrastructure. Every cost metric
below is a definition waiting for an instrument.

---

## PART 2 — THE BUSINESS HEALTH MODEL

Every metric carries a canonical formula. There is exactly one definition of
MRR in this system, and it is here.

### Revenue

| Metric | `code` | Formula |
|---|---|---|
| Revenue | `revenue_total` | settled subscription + top-up + enterprise/manual revenue over the period |
| Subscription revenue | `revenue_subscription` | paid invoice amounts belonging to a subscription |
| Top-up revenue | `revenue_topup` | settled LMC top-up payments — **always read next to `lmc_outstanding_liability`**, because the cash arrives before the obligation is served |
| Enterprise revenue | `revenue_enterprise` | `finance_records` enterprise/manual sales with status = paid |
| MRR | `mrr` | normalised monthly value of every ACTIVE/TRIALING subscription at period end; annual ÷ 12; **top-ups are never counted** |
| ARR | `arr` | `mrr × 12` — a run-rate projection, never booked revenue |

### Unit economics

| Metric | `code` | Formula |
|---|---|---|
| LTV | `ltv` | avg monthly contribution margin per paying customer ÷ monthly churn; **requires ≥3 periods of retention** |
| CAC | `cac` | acquisition spend ÷ new paying customers, same period |
| LTV/CAC | `ltv_cac_ratio` | `ltv ÷ cac` — below 1 the company pays for every customer it wins |
| Average revenue / user | `arpu` | `revenue_total ÷ active users` |
| Average cost / user | `acpu` | `cost_total ÷ active users` — the half nothing measures |

### Margin

| Metric | `code` | Formula |
|---|---|---|
| Gross margin | `gross_margin` | (revenue − direct variable cost) ÷ revenue × 100 |
| Contribution margin | `contribution_margin` | (revenue − direct variable − variable acquisition/support) ÷ revenue × 100 |
| Net margin | `net_margin` | (revenue − all cost incl. infrastructure and fixed) ÷ revenue × 100 |

### Cost

`cost_total` · `cost_ai` · `cost_storage` · `cost_api` · `cost_email` ·
`cost_ocr` · `cost_maps` · `cost_search` · `cost_voice` · `cost_video` ·
`cost_infrastructure` · `cost_referral`

Each is defined per period and **attributed to the feature that caused it** —
attribution is what makes `top_cost_features` possible, and it is the earliest
place a loss becomes visible. `cost_referral` = referral LMC issued × 1 EUR;
structurally impossible today (referrals are DB-disabled), and a euro liability
the moment they are not.

### LMC

| Metric | `code` | Formula |
|---|---|---|
| Issued | `lmc_issued` | every credit transaction: purchased + promotional_signup + promotional_activity + admin_grant + referral_reward |
| Purchased | `lmc_purchased` | lots with `source_kind = 'purchased'` — the part paid for in cash |
| Granted | `lmc_granted` | promotional + admin lots — pure liability, no cash behind it |
| Spent | `lmc_spent` | lot consumptions attributed to spend transactions |
| Expired | `lmc_expired` | remaining value consumed by expiry transactions |
| **Outstanding liability** | `lmc_outstanding_liability` | `sum(spendable_cents)` = issued − spent − expired − reversed. **At 1 LMC = 1 EUR this is deferred revenue in euro.** |

### Adoption

`users_paid` · `users_free` · `conversion_rate` · `top_cost_features` ·
`top_revenue_features` · `top_ai_consumers`

### Composite

`financial_health_score` — Part 6.

---

## PART 3 — FEATURE ECONOMICS

Every paid feature carries these fields. They are not documentation: the
Commercial Gate refuses to let a feature go live without them.

| Field | Meaning |
|---|---|
| `feature_code` | the catalogue code (`single_ad`, `worker_plus`, `topup_t1` …) |
| `owner` | the accountable role for this feature's economics |
| `payer` | worker / company / agency / platform (`platform` = deliberate subsidy) |
| `estimated_unit_cost` | approximate cost per unit, with the unit named |
| `cost_driver` | what consumes money when it is used |
| `revenue_driver` | the billable event or recurring term that produces revenue |
| `margin_model` | one auditable sentence on how the margin is made |
| `activation_status` | `not_activatable` · `activatable` · `live` |
| `assessment_status` | `unassessed` · `incomplete` · `assessed` |
| `commercial_decision` | the recorded decision authorising it, or the open MOD id blocking it |

`owner`, `revenue_driver`, `margin_model` and `commercial_decision` were added
to the economic model by this engine — a feature the CEO table cannot report on
may not go live.

**Today: 20 tracked features, 0 assessed, 0 activatable.**

---

## PART 4 — PLAN HEALTH

Per plan: Revenue · Average Usage · Infrastructure Cost · AI Cost · Margin ·
Profitability · Risk.

**Today every plan reports `profitability: unknown`, `risk: unknown`** — with
the rationale stated on each row: no price is decided (MOD-01), no subscription
exists, and no cost collector is deployed. "Unknown" is a management signal;
"profitable" would be a lie.

---

## PART 5 — LMC HEALTH

Issued · Purchased · Granted · Spent · Expired · Outstanding Liability, plus a
**backing ratio** (outstanding liability ÷ cash received for credit) — the
number that says how much of the promise is funded.

All are computable the moment the ledger has rows; the ledger is applied and
empty, so they read zero-state honestly rather than being blocked.

---

## PART 6 — EARLY WARNING ENGINE

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

**Today: 7 of 8 are `NOT_EVALUABLE`** (their inputs are not measured) and
`UNLIMITED_RISK` is `CLEAR` — it is the one rule that reads declared economics
rather than measurements, and no activatable feature exists to violate it.

`NOT_EVALUABLE` is deliberately not green. The guard asserts that no rule can
report `CLEAR` while its inputs are unmeasured.

---

## PART 7 — CEO DASHBOARD MODEL

Today's Revenue · Today's Cost · Today's Margin · MRR · ARR · Paid Users ·
Free Users · Conversion · Average Revenue/User · Average Cost/User ·
Top Cost Features · Top Revenue Features · Top AI Consumers ·
LMC Liability · Outstanding Credits · Health Score.

`ceoDashboardModel(asOf)` returns exactly these fields. **Every cell today
carries a reason instead of a number**, and the guard asserts it.

---

## PART 8 — FINANCIAL HEALTH SCORE (0–100)

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

Weights total **100**, asserted in CI.

**The score refuses to report below `HEALTH_SCORE_MIN_COMPONENTS = 5`
computable components.** A score built from one component is not a score, it is
a decoration. Today it returns `INSUFFICIENT_DATA` and names what is missing.

---

## PART 9 — COMMERCIAL GATE (extension)

The Business Health Gate extends the Commercial Gate: a feature is RED without
an **assessment**, a **unit cost**, a **margin model**, a **payer** and a
**recorded commercial decision** — `missing_business_health_fields`, proven by
four negative controls (empty owner / revenue driver / margin model / decision).

---

## PART 10 — WHAT IS MISSING FOR FULL OPERATION

Ordered by what unblocks the most:

1. **A cost collector.** Nothing measures cost. Until `ai_runs` (or an
   equivalent) and provider-invoice import exist, **12 cost metrics, all three
   margins, ACPU and 5 of 8 warnings cannot exist.** This is the single
   highest-leverage instrument in the whole system.
2. **Revenue events.** No Stripe account (MOD-01…03 and the owner gates in
   `commercial-readiness-audit-v1.md`). Without them: revenue, MRR, ARR, ARPU,
   conversion, LTV.
3. **Marketing spend.** No table, no import → CAC and LTV/CAC are impossible.
4. **Per-feature attribution.** `pilot_events` records activity but neither
   plan nor feature nor cost attribution → `top_cost_features`,
   `top_revenue_features`, `top_ai_consumers`.
5. **The spend→entitlement mapping (MOD-20).** Without a product code on a
   spend, LMC revenue cannot be attributed to a feature.
6. **Retention history.** LTV needs ≥3 periods; the clock starts with the first
   paying customer.

### What to start collecting the day real users arrive

| Priority | Signal | Why |
|---|---|---|
| 1 | **per-call AI cost** (model, tokens, EUR, calling feature, account) | the fastest-growing variable cost, and the one that hides inside a "free" tier |
| 2 | **provider invoices** (hosting, DB, storage, bandwidth, per month) | the fixed floor every margin is measured against |
| 3 | **usage events per feature per account** | makes attribution — and therefore early warning — possible |
| 4 | **acquisition spend per channel** | CAC; without it growth cannot be told from buying customers at a loss |
| 5 | **subscription lifecycle events** | already captured by the billing chain once Stripe is live |
| 6 | **storage/media volume per account** | the cost that never shrinks by itself |

Rule for all six: **record the cost at the moment it is incurred, attributed to
the feature and the account.** Cost reconstructed later is always wrong, and
always wrong in the flattering direction.

---

## PART 11 — CURRENT STATE

| Metric | Value |
|---|---|
| Metrics defined | **39** (6 revenue · 5 unit-economics · 3 margin · 12 cost · 6 LMC · 6 adoption · 1 composite) |
| Computable today | **0** |
| Blocked by a missing collector | **26** — all cost, all margin, most unit-economics |
| Blocked by an owner decision only | **5** |
| Computable once activity exists (sources applied, empty) | **8** — the LMC and adoption metrics |
| Missing collectors | `ai_runs` · `usage_events` · `infrastructure_billing` · `marketing_spend` · `stripe_charges` |
| Early warnings defined | **8** — 7 `NOT_EVALUABLE`, 1 `CLEAR` |
| Health score | **INSUFFICIENT_DATA** (0 of 5 required components) |
| Features tracked | **20** — 0 assessed, 0 activatable |
| Data changed by this PR | **none** |

**Read this honestly.** The engine is *designed*, not yet *instrumented*. Its
value today is that it names, precisely and in one place, every instrument the
business is missing — and refuses to let a future dashboard invent a number in
their place.

---

*Binding. Amend by editing this document and `lib/commercial/business-health.ts`
in the same PR; the guard fails if a metric, warning or score component is
missing from either half.*
