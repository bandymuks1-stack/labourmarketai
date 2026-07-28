# COMMERCIAL SUSTAINABILITY & FINANCIAL SAFETY V1

| Field | Value |
|---|---|
| Status | **BINDING.** Applies to every future commercial decision, without exception |
| Scope | An **architectural layer**, not a catalogue. It changes no price, no LMC amount, no Stripe object and no entitlement |
| Machine half | `apps/web/lib/commercial/sustainability.ts` |
| Enforced by | `apps/web/lib/guards/commercial-gate.test.ts` (runs in the `quality` CI job) |
| Owner report | `pnpm -C apps/web check:commercial-gate` |
| Companion | `docs/product/commercial-system-v1.md` — *what* is sold. This document — *whether selling it is economically sound* |
| Created | 2026-07-28 · branch `feat/commercial-sustainability-v1` |

## Why this layer exists

The canonical catalogue made the commercial system *coherent*. It did not make
it *survivable*: nothing stopped a future session from adding a feature with an
unknown cost, an "unlimited" promise with no bound, or a plan whose economics
nobody had thought about. This layer makes that structurally impossible —
the build fails before such a feature can be sold.

---

## PART 1 — COMMERCIAL SUSTAINABILITY PRINCIPLES

### CSP-001

> The project may never be deliberately designed to operate at a long-term loss.

**Enforcement: machine.** A non-positive expected margin is a violation unless
the item is explicitly declared a subsidy **with a named funding source**
(`negative_margin_without_subsidy`).

### CSP-002

> Every new plan, LMC product, micro-feature, AI feature, API feature and
> advertising feature must have a clearly assessed economic model before it
> becomes a public feature.

**Enforcement: machine.** Two rules. An **activatable** item without an
assessment is RED. A **new** item — any code outside the closed 2026-07-28
baseline — must ship its economic model in the same PR that introduces it, even
before it is sellable (`new_item_without_assessment`).

### CSP-003

> The free plan must be genuinely useful (roughly 60–70 % of base value) so a
> user really understands the product's value, while its long-term cost is
> funded by the overall commercial model.

**Enforcement: review + machine (partial).** The 60–70 % ratio cannot be
computed while no plan has a decided value (MOD-01), so the ratio itself is a
**design judgement recorded at assessment time**. The *funding* half is
machine-checked: a free tier must carry `subsidised: true` with a named,
present-tense funding source.

### CSP-004

> The commercial model must naturally encourage progression Free → Plus → Pro,
> without artificial feature blocking.

**Enforcement: review.** A machine cannot tell a fair boundary from an
artificial one. The judgement is recorded per plan in the assessment, and the
gate refuses to pretend otherwise — see Part 5.

### CSP-005

> LMC is not a discount system. LMC is an internal economy, used for
> micro-features, additional AI actions, additional limits, advertising and
> additional services.

**Enforcement: machine.** An LMC-denominated item whose assessment describes a
**price reduction** rather than a delivered capability is a violation
(`lmc_used_as_discount`).

> **Recorded boundary case.** The plan axis `lmcTopupDiscountPercent` (MOD-08)
> is a discount on *buying* credit — a plan perk priced in EUR. That is not LMC
> acting as a discount, and it does not breach CSP-005. LMC being *spent* to
> reduce a price would.

---

## PART 2 — FINANCIAL SAFETY RULES

### FSR-001

> No new feature may be launched if its approximate unit cost is unknown.

**Machine.** An assessed model with `estimatedUnitCostCents === null` is RED
(`missing_unit_cost`).

### FSR-002

> No feature may be declared "Unlimited" without a technical mechanism limiting
> abuse or guaranteeing a positive economic result.

**Machine.** `unlimitedClaim: true` with no `abuseLimitMechanism` is RED
(`unlimited_without_abuse_limit`). A mechanism must be a real technical bound
(a server-enforced fair-use cap, a rate limit, a per-period ceiling) — not a
sentence in marketing copy.

### FSR-003

> The commercial system must be designed so that product growth does not
> automatically increase losses.

**Machine.** Cost that scales with usage while revenue does not, with nothing
bounding usage, is RED (`growth_scales_losses`). Any two of the three are fine;
all three together is a loss engine.

### FSR-004

> The goal is long-term positive cash flow. The project may not be designed on
> the assumption that losses will be covered by future investment.

**Machine.** A subsidy whose funding source names investment, a funding round,
or future revenue is RED (`subsidy_funded_by_future_investment`). A subsidy must
be funded by **present** commercial income.

### FSR-005

> Before activating a new paid feature it must be clear: who pays; what they pay
> for; the approximate unit cost; the expected margin.

**Machine.** Each of the four is a required field. Any one missing is RED.

---

## PART 3 — THE ECONOMIC MODEL

Every commercial item carries an assessment. Until assessed, it may not be
sellable — the gate proves the two never drift apart.

| Field | Answers | Required |
|---|---|---|
| `payer` | **who pays** — worker / company / agency / platform (`platform` = deliberate subsidy) | FSR-005 |
| `paidFor` | **what they pay for**, in one concrete sentence | FSR-005 |
| `deliveredCapability` | what the buyer actually **receives** (a capability, never a discount) | CSP-005 |
| `costDriver` | what consumes money when it is used | FSR-001 |
| `estimatedUnitCostCents` + `costUnit` | **approximate unit cost** | FSR-001 |
| `costScalesWithUsage` | does cost grow with use | FSR-003 |
| `revenueScalesWithUsage` | does revenue grow with the same use | FSR-003 |
| `expectedMarginPercent` | **expected margin** | FSR-005, CSP-001 |
| `unlimitedClaim` | is it presented as unlimited | FSR-002 |
| `abuseLimitMechanism` | the technical bound (required if unlimited) | FSR-002 |
| `subsidised` + `subsidyFundedBy` | deliberate subsidy and what funds it | CSP-001, CSP-003, FSR-004 |
| `assessedAt` | when the owner assessed it | audit |

**No cost, margin or subsidy figure is written by this PR.** The structure is
defined; the numbers are the owner's, at assessment time.

---

## PART 4 — THE COMMERCIAL GATE

### When CI turns RED

| Condition | Code | Principle |
|---|---|---|
| A plan gets a price, a top-up gets an amount, or a micro-feature gets an LMC price, with no assessment | `activatable_without_assessment` | FSR-005 |
| A new commercial item appears with no assessment entry at all | `new_item_without_assessment` | CSP-002 |
| A new item is added unassessed, even while not yet sellable | `new_item_without_assessment` | CSP-002 |
| Assessed, but the unit cost is unknown | `missing_unit_cost` | FSR-001 |
| Assessed, but no expected margin | `missing_margin` | FSR-005 |
| What is paid for / what is delivered is not stated | `missing_payer_or_subject` | FSR-005 |
| "Unlimited" with no technical bound | `unlimited_without_abuse_limit` | FSR-002 |
| Cost scales with usage, revenue does not, nothing bounds usage | `growth_scales_losses` | FSR-003 |
| Non-positive margin that is not a declared, funded subsidy | `negative_margin_without_subsidy` | CSP-001 |
| A subsidy justified by future investment or future revenue | `subsidy_funded_by_future_investment` | FSR-004 |
| An LMC item that delivers a discount instead of a capability | `lmc_used_as_discount` | CSP-005 |

Every one of these is proven by a **negative control** in the guard: the test
builds the offending shape and asserts the gate rejects it. A gate that has
never been shown to fail is not a gate.

### The ratchet

`GRANDFATHERED_ITEMS` holds the 20 items that existed on 2026-07-28 — 5 plans,
7 top-up slots, 8 micro-features. Every one is unpriced and unsellable, so each
is legitimately unassessed and names the open decision (MOD-01 / MOD-09 /
MOD-18) that will produce its model.

**The baseline is closed.** Its length is pinned in the guard, so growing it
requires editing the guard — a reviewable act, not a silent catalogue edit.
Any item outside it must be assessed.

### How to add a new commercial feature

1. Add it to the canonical catalogue (`lib/commercial/catalogue.ts`).
2. Add its `ECONOMIC_ASSESSMENTS` entry **in the same PR**:
   - assessed → a complete `EconomicModel`;
   - not ready → `{ assessed: false, ownerDecision: "MOD-xx", activatable: false }`
     **and it must not be given a price**.
3. For a plan, record the CSP-003 / CSP-004 judgement in the PR description:
   is the free tier still genuinely useful, and is the boundary real rather
   than artificial?
4. `pnpm -C apps/web check:commercial-gate` must print `GREEN`.

---

## PART 5 — WHAT IS PROVEN vs WHAT IS JUDGED

Being precise about this is the difference between a real gate and theatre.

| Principle | Held by | Why |
|---|---|---|
| CSP-001, CSP-002, CSP-005 | **machine** | expressible as a property of the assessment |
| FSR-001 … FSR-005 | **machine** | each is a required field or a forbidden combination |
| **CSP-003** | **review** (+ machine on the funding half) | the 60–70 % ratio needs plan values that do not exist yet (MOD-01) |
| **CSP-004** | **review** | no check can distinguish a fair tier boundary from artificial blocking |

The two review-only principles are enumerated by
`reviewOnlyPrinciples()` and asserted by the guard, so they can never be
silently reclassified as "enforced".

---

## PART 6 — WHAT THIS LAYER DID NOT CHANGE

Explicitly, and verifiably in the diff:

- **no price changed** — nothing had one, and nothing gained one;
- **no LMC amount changed** — grants, caps, expiry and the unit are untouched;
- **no Stripe object** was created, renamed or configured;
- **no entitlement** was added, removed or re-sourced;
- **no kill-switch** was flipped;
- **no migration** was written.

The only functional change is that a future PR can now fail for a financial
reason.

---

## PART 7 — CURRENT STATE

| Metric | Value |
|---|---|
| Principles declared | **10** (5 CSP + 5 FSR) |
| Machine-enforced | **8** |
| Review-only | **2** (CSP-003, CSP-004) |
| Commercial items under the gate | **20** (5 plans + 7 top-up slots + 8 micro-features) |
| Items sellable today | **0** |
| Items assessed today | **0** |
| Gate status | **GREEN** — because nothing is sellable, not because anything is proven profitable |
| RED conditions implemented | **11**, each with a negative control |

**Read the green honestly.** It means "no unassessed feature is being sold".
It does **not** mean the business model is validated — that starts the moment
the owner sets the first price, which is exactly when this gate begins to bite.

---

*Binding. Amend by editing this document and `lib/commercial/sustainability.ts`
in the same PR; the guard fails if a principle is missing from either half.*
