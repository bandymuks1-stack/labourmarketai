/**
 * COMMERCIAL SUSTAINABILITY & FINANCIAL SAFETY v1 — the architectural layer.
 *
 * Human half: `docs/product/commercial-sustainability-v1.md` (BINDING).
 * Enforced by: `lib/guards/commercial-gate.test.ts` (CI).
 *
 * WHAT THIS IS. The canonical catalogue (`lib/commercial/catalogue.ts`) answers
 * *what* is sold. This module answers *whether selling it is economically
 * sound* — and refuses to let anything become sellable before that question
 * has an answer.
 *
 * WHAT THIS IS NOT. It changes no price, no LMC amount, no Stripe object and
 * no entitlement. It adds a required economic assessment ALONGSIDE the
 * catalogue and fails the build when the two are out of step.
 *
 * HOW IT STAYS GREEN TODAY. Nothing in the catalogue is activatable — no plan
 * has a price, no top-up has an amount, no micro-feature has an LMC price. So
 * every item is legitimately "not assessed yet, and not sellable yet", which is
 * a consistent state. The gate turns RED the moment those two drift apart:
 * a priced item without an assessment, or a new item added without one.
 *
 * Pure data + pure functions. No IO.
 */

import {
  SUBSCRIPTION_PLANS,
  TOPUP_PACKAGE_SLOTS,
  MICRO_FEATURES,
  isDecided,
} from "./catalogue";

// ═══════════════════════════════════════════════════════════════════════════
// 1. The binding principles
// ═══════════════════════════════════════════════════════════════════════════

export type PrincipleId =
  | "CSP-001" | "CSP-002" | "CSP-003" | "CSP-004" | "CSP-005"
  | "FSR-001" | "FSR-002" | "FSR-003" | "FSR-004" | "FSR-005";

/**
 * How a principle is held.
 *  - `machine`: this module + the gate test can prove a violation.
 *  - `review`:  the principle is a design judgement; the gate records that it
 *               was consciously reviewed, and cannot compute it. Saying so is
 *               the honest alternative to a check that only looks strict.
 */
export type EnforcementKind = "machine" | "review";

export interface Principle {
  readonly id: PrincipleId;
  readonly statement: string;
  readonly enforcement: EnforcementKind;
  /** For `machine`: the check that fails. For `review`: where the judgement is recorded. */
  readonly enforcedBy: string;
}

export const COMMERCIAL_PRINCIPLES: readonly Principle[] = [
  {
    id: "CSP-001",
    statement:
      "The project may never be deliberately designed to operate at a long-term loss.",
    enforcement: "machine",
    enforcedBy:
      "violationsFor(): a non-positive expected margin is a violation unless the item is explicitly marked subsidised WITH a named funding source.",
  },
  {
    id: "CSP-002",
    statement:
      "Every new plan, LMC product, micro-feature, AI feature, API feature and advertising feature must have an assessed economic model BEFORE it becomes a public feature.",
    enforcement: "machine",
    enforcedBy:
      "commercialGateReport(): an activatable item without an assessment is RED; a new item outside the grandfather baseline must ship its assessment in the same PR.",
  },
  {
    id: "CSP-003",
    statement:
      "The free plan must be genuinely useful (roughly 60-70% of base value) so a user can understand the product, while its long-term cost is funded by the overall commercial model.",
    enforcement: "review",
    enforcedBy:
      "Design judgement — the ratio cannot be computed while no plan has a value. The free tier must carry subsidised=true with a named funding source (that part IS machine-checked).",
  },
  {
    id: "CSP-004",
    statement:
      "The commercial model must encourage natural progression Free → Plus → Pro without artificial feature blocking.",
    enforcement: "review",
    enforcedBy:
      "Design judgement recorded per plan in docs/product/commercial-sustainability-v1.md §4; the gate cannot distinguish a fair boundary from an artificial one.",
  },
  {
    id: "CSP-005",
    statement:
      "LMC is not a discount system. It is an internal economy used for micro-features, additional AI actions, additional limits, advertising and additional services.",
    enforcement: "machine",
    enforcedBy:
      "violationsFor(): an LMC-denominated item whose economic model describes a price reduction rather than a delivered capability is a violation.",
  },
  {
    id: "FSR-001",
    statement:
      "No feature may be launched without a known approximate unit cost.",
    enforcement: "machine",
    enforcedBy: "violationsFor(): assessed model with estimatedUnitCostCents === null is a violation.",
  },
  {
    id: "FSR-002",
    statement:
      "No feature may be advertised as Unlimited without a technical mechanism that limits abuse or guarantees a positive economic result.",
    enforcement: "machine",
    enforcedBy: "violationsFor(): unlimitedClaim === true with no abuseLimitMechanism is a violation.",
  },
  {
    id: "FSR-003",
    statement:
      "The commercial system must be designed so that product growth does not automatically increase losses.",
    enforcement: "machine",
    enforcedBy:
      "violationsFor(): cost that scales with usage while revenue does not, and no abuse limit, is a violation.",
  },
  {
    id: "FSR-004",
    statement:
      "The goal is long-term positive cash flow. The project may not be designed on the assumption that losses will be covered by future investment.",
    enforcement: "machine",
    enforcedBy:
      "violationsFor(): a subsidy may not name future investment/funding as its funding source.",
  },
  {
    id: "FSR-005",
    statement:
      "Before activating a new paid feature it must be clear: who pays, what they pay for, the approximate unit cost, and the expected margin.",
    enforcement: "machine",
    enforcedBy: "violationsFor(): any of payer / paidFor / unit cost / expected margin missing is a violation.",
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 2. The economic model
// ═══════════════════════════════════════════════════════════════════════════

export type CommercialItemKind =
  | "plan"
  | "topup"
  | "micro_feature"
  | "ai_feature"
  | "api_feature"
  | "ad_feature";

export type Payer = "worker" | "company" | "agency" | "platform";

/**
 * The four FSR-005 answers, plus what CSP-001/FSR-002/FSR-003 need, plus the
 * four fields the Business Health Engine requires to place a feature in the
 * CEO economics table (`owner`, `revenueDriver`, `marginModel`,
 * `commercialDecision` — see docs/product/business-health-engine-v1.md §3).
 */
export interface EconomicModel {
  /** WHO is accountable for this feature's economics (a role, not a guess). */
  readonly owner: string;
  /** WHO pays. `platform` = deliberately subsidised, and must say so below. */
  readonly payer: Payer;
  /** WHAT they pay for, in one concrete sentence. */
  readonly paidFor: string;
  /** WHAT consumes money when this is used (the real cost driver). */
  readonly costDriver: string;
  /** WHAT produces revenue from it (the billable event or recurring term). */
  readonly revenueDriver: string;
  /** HOW the margin is made: one sentence a CEO can audit. */
  readonly marginModel: string;
  /** The recorded commercial decision authorising it (MOD id or decision ref). */
  readonly commercialDecision: string;
  /** APPROXIMATE unit cost. FSR-001: may not be null once assessed. */
  readonly estimatedUnitCostCents: number | null;
  /** The unit the cost is expressed in ("per AI run", "per ad-month"). */
  readonly costUnit: string;
  /** Does cost grow with usage? */
  readonly costScalesWithUsage: boolean;
  /** Does revenue grow with the same usage? (FSR-003) */
  readonly revenueScalesWithUsage: boolean;
  /** EXPECTED margin. FSR-005: may not be null once assessed. */
  readonly expectedMarginPercent: number | null;
  /** Is this presented as "unlimited" anywhere? */
  readonly unlimitedClaim: boolean;
  /** FSR-002: the technical mechanism bounding abuse. Required if unlimited. */
  readonly abuseLimitMechanism: string | null;
  /** CSP-003: deliberately subsidised (e.g. the free tier). */
  readonly subsidised: boolean;
  /** CSP-001 + FSR-004: what funds the subsidy. Never future investment. */
  readonly subsidyFundedBy: string | null;
  /** CSP-005: what the buyer RECEIVES. A price reduction is not a capability. */
  readonly deliveredCapability: string;
  /** ISO date the owner assessed it. */
  readonly assessedAt: string;
}

export type EconomicAssessment =
  | { readonly assessed: true; readonly model: EconomicModel }
  | {
      readonly assessed: false;
      /** The open decision that will produce the model. */
      readonly ownerDecision: string;
      /** Not assessed ⇒ must not be sellable. The gate proves this. */
      readonly activatable: false;
    };

export interface CommercialItem {
  readonly kind: CommercialItemKind;
  readonly code: string;
  /** Can a customer obtain it for money/credit right now? */
  readonly activatable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. The assessment registry
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Items that existed when this gate was created (2026-07-28). Every one is
 * unpriced and unsellable, so each is legitimately unassessed and carries the
 * open decision that will produce its model.
 *
 * THE RATCHET: a code that is NOT in this baseline must ship a complete
 * economic model in the same PR that introduces it. Adding a code here is not
 * a way around the gate — the guard asserts the baseline never grows.
 */
export const GRANDFATHERED_ITEMS: readonly string[] = [
  // plans (no price decided — MOD-01)
  "plan:free_worker",
  "plan:worker_plus",
  "plan:company_pilot",
  "plan:agency_pilot",
  "plan:admin_internal",
  // top-up slots (no denomination decided — MOD-09)
  "topup:topup_t1",
  "topup:topup_t2",
  "topup:topup_t3",
  "topup:topup_t4",
  "topup:topup_t5",
  "topup:topup_t6",
  "topup:topup_t7",
  // micro-features (no LMC price decided — MOD-18)
  "micro_feature:single_ad",
  "micro_feature:ai_promoted_ad",
  "micro_feature:premium_promoted_ad",
  "micro_feature:international_ad",
  "micro_feature:package_5",
  "micro_feature:package_20",
  "micro_feature:agency_package",
  "micro_feature:extra_promotion",
] as const;

export function itemRef(kind: CommercialItemKind, code: string): string {
  return `${kind}:${code}`;
}

const unassessed = (ownerDecision: string): EconomicAssessment => ({
  assessed: false,
  ownerDecision,
  activatable: false,
});

/**
 * The live assessment registry. Filling one in is how a feature becomes
 * launchable — and the ONLY way, because the gate reads this map.
 */
export const ECONOMIC_ASSESSMENTS: Readonly<Record<string, EconomicAssessment>> = {
  "plan:free_worker": unassessed("MOD-01"),
  "plan:worker_plus": unassessed("MOD-01"),
  "plan:company_pilot": unassessed("MOD-01"),
  "plan:agency_pilot": unassessed("MOD-01"),
  "plan:admin_internal": unassessed("MOD-01"),

  "topup:topup_t1": unassessed("MOD-09"),
  "topup:topup_t2": unassessed("MOD-09"),
  "topup:topup_t3": unassessed("MOD-09"),
  "topup:topup_t4": unassessed("MOD-09"),
  "topup:topup_t5": unassessed("MOD-09"),
  "topup:topup_t6": unassessed("MOD-09"),
  "topup:topup_t7": unassessed("MOD-09"),

  "micro_feature:single_ad": unassessed("MOD-18"),
  "micro_feature:ai_promoted_ad": unassessed("MOD-18"),
  "micro_feature:premium_promoted_ad": unassessed("MOD-18"),
  "micro_feature:international_ad": unassessed("MOD-18"),
  "micro_feature:package_5": unassessed("MOD-18"),
  "micro_feature:package_20": unassessed("MOD-18"),
  "micro_feature:agency_package": unassessed("MOD-18"),
  "micro_feature:extra_promotion": unassessed("MOD-18"),
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. Deriving what is actually sellable, from the catalogue
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every commercial item the catalogue currently defines, with the ONE fact the
 * gate cares about: can a customer obtain it for money or credit today.
 */
export function commercialItems(): readonly CommercialItem[] {
  const items: CommercialItem[] = [];
  for (const p of SUBSCRIPTION_PLANS) {
    // A plan is sellable when it has a Stripe price slot AND a decided price.
    const sellable = p.stripePriceEnvVar !== null && isDecided(p.monthlyPrice);
    items.push({ kind: "plan", code: p.planKey, activatable: sellable });
  }
  for (const t of TOPUP_PACKAGE_SLOTS) {
    items.push({
      kind: "topup",
      code: t.code,
      activatable: t.lmc !== null && isDecided(t.price),
    });
  }
  for (const f of MICRO_FEATURES) {
    items.push({
      kind: "micro_feature",
      code: f.code,
      activatable: f.lmcPrice !== null,
    });
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Violations
// ═══════════════════════════════════════════════════════════════════════════

export type ViolationCode =
  | "activatable_without_assessment"
  | "unassessed_item_marked_activatable"
  | "new_item_without_assessment"
  | "missing_unit_cost"
  | "missing_margin"
  | "missing_payer_or_subject"
  | "missing_business_health_fields"
  | "unlimited_without_abuse_limit"
  | "growth_scales_losses"
  | "negative_margin_without_subsidy"
  | "subsidy_funded_by_future_investment"
  | "lmc_used_as_discount";

export interface Violation {
  readonly item: string;
  readonly code: ViolationCode;
  readonly principle: PrincipleId;
  readonly detail: string;
}

/** Funding sources that FSR-004 forbids naming as the reason a loss is acceptable. */
const FUTURE_MONEY = /invest|funding round|raise|vc\b|grant money|future revenue|later revenue/i;

/** CSP-005: an LMC item must deliver a capability, not a price reduction. */
const DISCOUNT_SHAPED = /discount|% off|price reduction|cheaper subscription|rabat|nuolaid/i;

export function violationsFor(
  item: CommercialItem,
  assessment: EconomicAssessment | undefined,
): readonly Violation[] {
  const out: Violation[] = [];
  const ref = itemRef(item.kind, item.code);
  const isNew = !GRANDFATHERED_ITEMS.includes(ref);

  if (!assessment) {
    out.push({
      item: ref,
      code: "new_item_without_assessment",
      principle: "CSP-002",
      detail:
        "This commercial item has no entry in ECONOMIC_ASSESSMENTS. Every plan, top-up, micro-feature, AI, API or advertising feature must ship its economic model in the same PR that introduces it.",
    });
    return out;
  }

  if (!assessment.assessed) {
    if (item.activatable) {
      out.push({
        item: ref,
        code: "activatable_without_assessment",
        principle: "FSR-005",
        detail:
          "The catalogue makes this obtainable for money or credit, but no economic model exists: who pays, for what, at what cost and at what margin are all unanswered. Assess it or remove the price.",
      });
    }
    if (isNew) {
      out.push({
        item: ref,
        code: "new_item_without_assessment",
        principle: "CSP-002",
        detail:
          "New commercial item outside the 2026-07-28 grandfather baseline. A new item may not be added unassessed — the baseline is closed.",
      });
    }
    return out;
  }

  const m = assessment.model;

  if (m.estimatedUnitCostCents === null) {
    out.push({
      item: ref,
      code: "missing_unit_cost",
      principle: "FSR-001",
      detail: "Assessed, but the approximate unit cost is still unknown.",
    });
  }
  if (m.expectedMarginPercent === null) {
    out.push({
      item: ref,
      code: "missing_margin",
      principle: "FSR-005",
      detail: "Assessed, but no expected margin is stated.",
    });
  }
  if (m.paidFor.trim().length < 3 || m.deliveredCapability.trim().length < 3) {
    out.push({
      item: ref,
      code: "missing_payer_or_subject",
      principle: "FSR-005",
      detail: "What is paid for, or what the buyer receives, is not stated.",
    });
  }
  // Business Health Engine §3: a feature with no accountable owner, no revenue
  // driver, no margin model or no recorded commercial decision cannot be placed
  // in the CEO economics table, so it may not go live either.
  if (
    m.owner.trim().length < 2 ||
    m.revenueDriver.trim().length < 3 ||
    m.marginModel.trim().length < 3 ||
    m.commercialDecision.trim().length < 2
  ) {
    out.push({
      item: ref,
      code: "missing_business_health_fields",
      principle: "CSP-002",
      detail:
        "Missing one of: owner, revenueDriver, marginModel, commercialDecision. The Business Health Engine cannot report on a feature whose economics have no accountable owner or stated margin model.",
    });
  }
  if (m.unlimitedClaim && !m.abuseLimitMechanism) {
    out.push({
      item: ref,
      code: "unlimited_without_abuse_limit",
      principle: "FSR-002",
      detail:
        'Presented as "unlimited" with no technical mechanism bounding abuse or guaranteeing a positive result.',
    });
  }
  if (m.costScalesWithUsage && !m.revenueScalesWithUsage && !m.abuseLimitMechanism) {
    out.push({
      item: ref,
      code: "growth_scales_losses",
      principle: "FSR-003",
      detail:
        "Cost grows with usage while revenue does not, and nothing bounds usage — growth would automatically increase losses.",
    });
  }
  if (
    m.expectedMarginPercent !== null &&
    m.expectedMarginPercent <= 0 &&
    !m.subsidised
  ) {
    out.push({
      item: ref,
      code: "negative_margin_without_subsidy",
      principle: "CSP-001",
      detail:
        "Non-positive margin without being declared a deliberate subsidy with a named funding source.",
    });
  }
  if (m.subsidised && (!m.subsidyFundedBy || m.subsidyFundedBy.trim().length < 3)) {
    out.push({
      item: ref,
      code: "negative_margin_without_subsidy",
      principle: "CSP-001",
      detail: "Declared subsidised, but nothing names what funds the subsidy.",
    });
  }
  if (m.subsidyFundedBy && FUTURE_MONEY.test(m.subsidyFundedBy)) {
    out.push({
      item: ref,
      code: "subsidy_funded_by_future_investment",
      principle: "FSR-004",
      detail:
        "The subsidy is justified by future investment or future revenue. The model must stand on present commercial income.",
    });
  }
  if (
    (item.kind === "topup" || item.kind === "micro_feature") &&
    DISCOUNT_SHAPED.test(m.deliveredCapability)
  ) {
    out.push({
      item: ref,
      code: "lmc_used_as_discount",
      principle: "CSP-005",
      detail:
        "The LMC-denominated item delivers a price reduction rather than a capability. LMC is an internal economy, not a discount system.",
    });
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. The Commercial Gate
// ═══════════════════════════════════════════════════════════════════════════

export interface CommercialGateReport {
  readonly status: "GREEN" | "RED";
  readonly itemsTotal: number;
  readonly itemsActivatable: number;
  readonly itemsAssessed: number;
  readonly itemsGrandfathered: number;
  readonly violations: readonly Violation[];
}

/**
 * The single entry point CI and the owner report both call. RED means a
 * commercial item is (or is about to be) sellable without an economic model,
 * or an assessed model breaks a financial-safety rule.
 */
export function commercialGateReport(): CommercialGateReport {
  const items = commercialItems();
  const violations: Violation[] = [];
  let assessed = 0;

  for (const item of items) {
    const ref = itemRef(item.kind, item.code);
    const a = ECONOMIC_ASSESSMENTS[ref];
    if (a?.assessed) assessed += 1;
    violations.push(...violationsFor(item, a));
  }

  return {
    status: violations.length === 0 ? "GREEN" : "RED",
    itemsTotal: items.length,
    itemsActivatable: items.filter((i) => i.activatable).length,
    itemsAssessed: assessed,
    itemsGrandfathered: GRANDFATHERED_ITEMS.length,
    violations,
  };
}

/** Principles that a machine check can actually prove. */
export function machineEnforcedPrinciples(): readonly PrincipleId[] {
  return COMMERCIAL_PRINCIPLES.filter((p) => p.enforcement === "machine").map((p) => p.id);
}

/** Principles held by design review, honestly labelled as such. */
export function reviewOnlyPrinciples(): readonly PrincipleId[] {
  return COMMERCIAL_PRINCIPLES.filter((p) => p.enforcement === "review").map((p) => p.id);
}
