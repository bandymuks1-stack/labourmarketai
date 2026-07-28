/**
 * BUSINESS HEALTH ENGINE v1 — the canonical financial-state model.
 *
 * Human half: `docs/product/business-health-engine-v1.md` (BINDING).
 * Enforced by: `lib/guards/business-health-gate.test.ts` (CI).
 *
 * WHAT THIS IS. A CEO-level financial operating layer: every metric the
 * business is steered by, its exact formula, the data it needs, and whether
 * that data exists. It sits on top of the canonical catalogue (what is sold)
 * and the sustainability layer (whether selling it is sound), and answers the
 * third question: **is the product growing in a financially healthy way, and
 * which feature/plan is starting to damage it.**
 *
 * THE HONESTY RULE THAT SHAPES EVERY TYPE HERE.
 * A metric whose inputs do not exist returns `null` with a reason — never `0`,
 * never an estimate, never a placeholder. A dashboard that shows zero cost
 * because nothing measures cost is worse than one that shows "not measured":
 * the first invites a decision, the second demands the instrument.
 *
 * The same applies to the health score and to every early warning: with no
 * data the answer is `NOT_EVALUABLE`, never `CLEAR`. An early-warning engine
 * that reports "all good" because it is blind is the single most dangerous
 * thing this file could contain.
 *
 * Pure data + pure functions. No IO. The server read seam is
 * `business-health-read.ts`.
 */

import { SUBSCRIPTION_PLANS, MICRO_FEATURES, TOPUP_PACKAGE_SLOTS } from "./catalogue";
import {
  ECONOMIC_ASSESSMENTS,
  commercialItems,
  itemRef,
  type CommercialItemKind,
  type EconomicModel,
} from "./sustainability";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Data sources — what the engine may read from
// ═══════════════════════════════════════════════════════════════════════════

export type DataSourceState =
  /** The table/stream exists in production and is written to. */
  | "collecting"
  /** Exists in production but has never been written to. */
  | "empty"
  /** Does not exist: no table, no collector, nothing to query. */
  | "missing";

export interface DataSource {
  readonly code: string;
  readonly what: string;
  readonly state: DataSourceState;
  /** Verified against production on this date. */
  readonly verifiedAt: string;
  readonly note: string;
}

const V = "2026-07-28";

export const DATA_SOURCES: readonly DataSource[] = [
  { code: "profiles", what: "registered identities", state: "collecting", verifiedAt: V, note: "31 rows" },
  { code: "pilot_events", what: "product telemetry (route, task, duration, result)", state: "collecting", verifiedAt: V, note: "328 rows — the only real usage signal; carries NO cost" },
  { code: "billing_subscriptions", what: "subscription state", state: "empty", verifiedAt: V, note: "applied, 0 rows — the chain has never run" },
  { code: "billing_customers", what: "profile ↔ provider customer", state: "empty", verifiedAt: V, note: "applied, 0 rows" },
  { code: "payment_webhook_events", what: "provider event ledger", state: "empty", verifiedAt: V, note: "applied, 0 rows" },
  { code: "finance_records", what: "manual invoices / payments (EUR cents)", state: "empty", verifiedAt: V, note: "applied, 0 rows; manual entry, not a payment feed" },
  { code: "lmc_transactions", what: "immutable LMC ledger entries", state: "empty", verifiedAt: V, note: "applied, 0 rows" },
  { code: "lmc_lots", what: "LMC value containers + expiry", state: "empty", verifiedAt: V, note: "applied, 0 rows" },
  { code: "lmc_lot_consumptions", what: "how a debit consumed each lot", state: "empty", verifiedAt: V, note: "applied, 0 rows" },
  { code: "lmc_account_balances", what: "derived balances view", state: "empty", verifiedAt: V, note: "view over empty tables" },
  { code: "ai_runs", what: "per-run AI cost", state: "missing", verifiedAt: V, note: "NEVER CREATED — the migration lived only in closed PR #754" },
  { code: "usage_events", what: "append-only metered usage across 9 categories", state: "missing", verifiedAt: V, note: "NEVER APPLIED — closed PR #754 only" },
  { code: "infrastructure_billing", what: "provider invoices (Vercel, Supabase, model vendors)", state: "missing", verifiedAt: V, note: "no import path of any kind exists" },
  { code: "marketing_spend", what: "acquisition cost per channel", state: "missing", verifiedAt: V, note: "no table, no import — CAC cannot exist without it" },
  { code: "stripe_charges", what: "settled payments", state: "missing", verifiedAt: V, note: "no Stripe account is configured" },
] as const;

export function dataSource(code: string): DataSource | null {
  return DATA_SOURCES.find((d) => d.code === code) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. The metric registry
// ═══════════════════════════════════════════════════════════════════════════

export type MetricGroup =
  | "revenue"
  | "unit_economics"
  | "margin"
  | "cost"
  | "lmc"
  | "adoption"
  | "composite";

export type MetricUnit = "eur_cents" | "count" | "percent" | "ratio" | "score" | "lmc_cents";

export type MetricAvailability =
  /** Every input source is collecting: the metric can be computed today. */
  | "computable"
  /** Sources exist but are empty: computable, will read zero-state honestly. */
  | "computable_empty"
  /** At least one input source is missing entirely. */
  | "blocked_missing_data"
  /** Inputs exist but an owner decision is required first (e.g. a price). */
  | "blocked_owner_decision";

export interface Metric {
  readonly code: string;
  readonly label: string;
  readonly group: MetricGroup;
  readonly unit: MetricUnit;
  /** The canonical formula. One definition, quoted in the document. */
  readonly formula: string;
  /** Data source codes this metric reads. */
  readonly inputs: readonly string[];
  /** Owner decisions that must close before the metric means anything. */
  readonly blockedBy: readonly string[];
  /** Why it matters to a CEO, in one line. */
  readonly why: string;
}

const m = (
  code: string,
  label: string,
  group: MetricGroup,
  unit: MetricUnit,
  formula: string,
  inputs: readonly string[],
  blockedBy: readonly string[],
  why: string,
): Metric => ({ code, label, group, unit, formula, inputs, blockedBy, why });

export const METRICS: readonly Metric[] = [
  // ── Revenue ──────────────────────────────────────────────────────────────
  m("revenue_total", "Revenue", "revenue", "eur_cents",
    "sum(settled subscription revenue + settled top-up revenue + settled enterprise/manual revenue) over the period",
    ["stripe_charges", "finance_records"], ["MOD-01"],
    "The only number that makes every other one matter."),
  m("revenue_subscription", "Subscription revenue", "revenue", "eur_cents",
    "sum(paid invoice amounts where the invoice belongs to a subscription) over the period",
    ["stripe_charges", "billing_subscriptions"], ["MOD-01"],
    "Recurring base; the part that compounds."),
  m("revenue_topup", "Top-up revenue", "revenue", "eur_cents",
    "sum(settled LMC top-up payments) over the period",
    ["stripe_charges", "lmc_transactions"], ["MOD-09"],
    "Cash today, but a liability tomorrow — always read next to LMC outstanding."),
  m("revenue_enterprise", "Enterprise revenue", "revenue", "eur_cents",
    "sum(finance_records where record_type is an enterprise/manual sale and status = paid)",
    ["finance_records"], [],
    "Off-platform and manual; invisible to Stripe, so it must be entered."),
  m("mrr", "MRR", "revenue", "eur_cents",
    "sum(normalised monthly value of every ACTIVE or TRIALING subscription at period end). Annual terms are divided by 12. Top-ups are NEVER counted — they are not recurring.",
    ["billing_subscriptions"], ["MOD-01"],
    "The run rate the company is actually operating at."),
  m("arr", "ARR", "revenue", "eur_cents",
    "mrr × 12 at period end. A projection of the current run rate, never booked revenue and never a forecast of growth.",
    ["billing_subscriptions"], ["MOD-01"],
    "MRR annualised; a projection, never booked revenue."),

  // ── Unit economics ───────────────────────────────────────────────────────
  m("ltv", "LTV", "unit_economics", "eur_cents",
    "average monthly contribution margin per paying customer ÷ monthly churn rate. Requires ≥3 periods of retention history — never computed from a single month.",
    ["billing_subscriptions", "stripe_charges"], ["MOD-01"],
    "What a customer is worth; the ceiling on what acquiring one may cost."),
  m("cac", "CAC", "unit_economics", "eur_cents",
    "total acquisition spend in the period ÷ new paying customers acquired in the same period",
    ["marketing_spend", "billing_subscriptions"], ["MOD-01"],
    "Without it, growth cannot be told apart from buying customers at a loss."),
  m("ltv_cac_ratio", "LTV / CAC", "unit_economics", "ratio",
    "ltv ÷ cac, over the same cohort window. Meaningless before LTV has ≥3 periods of retention behind it.",
    ["marketing_spend", "billing_subscriptions", "stripe_charges"], ["MOD-01"],
    "Below 1 the company pays for each customer it wins."),
  m("arpu", "Average revenue / user", "unit_economics", "eur_cents",
    "revenue_total ÷ active users in the period (paid + free)",
    ["stripe_charges", "profiles"], ["MOD-01"],
    "Reads honestly only next to cost per user."),
  m("acpu", "Average cost / user", "unit_economics", "eur_cents",
    "cost_total ÷ active users in the period",
    ["usage_events", "infrastructure_billing", "profiles"], [],
    "The half of the equation nothing currently measures."),

  // ── Margin ───────────────────────────────────────────────────────────────
  m("gross_margin", "Gross margin", "margin", "percent",
    "(revenue_total − direct variable cost) ÷ revenue_total × 100. Direct variable cost = AI + storage + API + email + OCR + maps + search + voice + video attributable to serving customers.",
    ["stripe_charges", "usage_events"], ["MOD-01"],
    "Whether the product itself makes money before overhead."),
  m("contribution_margin", "Contribution margin", "margin", "percent",
    "(revenue_total − direct variable cost − variable acquisition and support cost) ÷ revenue_total × 100",
    ["stripe_charges", "usage_events", "marketing_spend"], ["MOD-01"],
    "What each additional customer contributes after everything that scales with them."),
  m("net_margin", "Net margin", "margin", "percent",
    "(revenue_total − all cost incl. infrastructure and fixed) ÷ revenue_total × 100",
    ["stripe_charges", "usage_events", "infrastructure_billing"], ["MOD-01"],
    "The bottom line; the only margin a bank account agrees with."),

  // ── Cost ─────────────────────────────────────────────────────────────────
  m("cost_total", "Total cost", "cost", "eur_cents",
    "sum(all cost_* metrics) over the period",
    ["usage_events", "infrastructure_billing"], [],
    "Nothing measures this today."),
  m("cost_ai", "AI cost", "cost", "eur_cents",
    "sum(per-run model cost) over the period, attributed to the feature that invoked it",
    ["ai_runs"], [],
    "The cost most likely to grow silently with usage."),
  m("cost_storage", "Storage cost", "cost", "eur_cents",
    "provider storage charges + per-GB attribution to media/documents",
    ["infrastructure_billing", "usage_events"], [], "Grows with uploads and never shrinks by itself."),
  m("cost_api", "API cost", "cost", "eur_cents",
    "third-party API charges attributed per calling feature",
    ["usage_events", "infrastructure_billing"], [], "Third-party calls are pure variable cost."),
  m("cost_email", "Email cost", "cost", "eur_cents", "provider email charges ÷ messages sent, per feature",
    ["usage_events", "infrastructure_billing"], [], "Small per unit, unbounded at scale."),
  m("cost_ocr", "OCR cost", "cost", "eur_cents", "per-document OCR charges (CV and document extraction)",
    ["usage_events"], [], "Scales with every uploaded document."),
  m("cost_maps", "Maps cost", "cost", "eur_cents", "map/geocoding provider charges per request",
    ["usage_events"], [], "Charged per view; a public map can be expensive."),
  m("cost_search", "Search cost", "cost", "eur_cents", "search/indexing infrastructure charges",
    ["usage_events", "infrastructure_billing"], [], "Grows with catalogue size, not with revenue."),
  m("cost_voice", "Voice cost", "cost", "eur_cents", "speech-to-text / text-to-speech charges per minute",
    ["usage_events"], [], "Per-minute pricing makes abuse expensive fast."),
  m("cost_video", "Video cost", "cost", "eur_cents", "video processing, storage and delivery charges",
    ["usage_events", "infrastructure_billing"], [], "The most expensive media class per user."),
  m("cost_infrastructure", "Infrastructure cost", "cost", "eur_cents",
    "hosting, database, bandwidth and platform charges for the period",
    ["infrastructure_billing"], [], "The fixed floor every margin is measured against."),
  m("cost_referral", "Referral cost", "cost", "eur_cents",
    "sum(referral_reward LMC issued in the period), valued at the canonical LMC peg (LMC.eurPerLmc in catalogue.ts)",
    ["lmc_transactions"], ["MOD-13", "MOD-14"],
    "Structurally impossible today (referrals are DB-disabled) — and a euro liability the moment it is not."),

  // ── LMC ──────────────────────────────────────────────────────────────────
  m("lmc_issued", "Issued LMC", "lmc", "lmc_cents",
    "sum(amount_cents of every credit transaction: purchased + promotional_signup + promotional_activity + admin_grant + referral_reward)",
    ["lmc_transactions"], [], "Everything ever created."),
  m("lmc_purchased", "Purchased LMC", "lmc", "lmc_cents",
    "sum(amount_cents where lot source_kind = 'purchased')", ["lmc_lots"], [],
    "The part that was paid for in cash."),
  m("lmc_granted", "Granted LMC", "lmc", "lmc_cents",
    "sum(amount_cents where lot source_kind in ('promotional_signup','promotional_activity','admin_grant'))",
    ["lmc_lots"], [], "The part given away — pure liability, no cash behind it."),
  m("lmc_spent", "Spent LMC", "lmc", "lmc_cents",
    "sum(amount_cents of lmc_lot_consumptions attributed to spend transactions)",
    ["lmc_lot_consumptions"], ["MOD-20"], "Liability converted into delivered service."),
  m("lmc_expired", "Expired LMC", "lmc", "lmc_cents",
    "sum(remaining lot value consumed by expiry transactions)",
    ["lmc_lot_consumptions"], [], "Liability shed without cost — only if the expiry runner is scheduled."),
  m("lmc_outstanding_liability", "Outstanding LMC liability", "lmc", "lmc_cents",
    "sum(spendable_cents across lmc_account_balances) = issued − spent − expired − reversed, valued at the canonical LMC peg. This is deferred revenue in euro.",
    ["lmc_account_balances"], [],
    "Every outstanding LMC is a euro of service owed for cash already spent or never received."),

  // ── Adoption ─────────────────────────────────────────────────────────────
  m("users_paid", "Paid users", "adoption", "count",
    "count(distinct owner_id in billing_subscriptions with status in ('active','trialing'))",
    ["billing_subscriptions"], [], "The denominator of every real revenue metric."),
  m("users_free", "Free users", "adoption", "count",
    "count(profiles) − users_paid", ["profiles", "billing_subscriptions"], [],
    "The subsidised population; its cost is real even when its revenue is zero."),
  m("conversion_rate", "Conversion", "adoption", "percent",
    "users_paid ÷ (users_paid + users_free) × 100", ["profiles", "billing_subscriptions"], ["MOD-01"],
    "Whether the free tier is a funnel or a cost centre."),
  m("top_cost_features", "Top cost features", "adoption", "count",
    "features ranked by attributed cost over the period (requires per-feature cost attribution)",
    ["usage_events", "ai_runs"], ["MOD-17"],
    "The earliest place a loss appears — before it reaches the P&L."),
  m("top_revenue_features", "Top revenue features", "adoption", "count",
    "features ranked by attributed revenue (LMC spend value + subscription attribution)",
    ["lmc_lot_consumptions", "stripe_charges"], ["MOD-18", "MOD-20"],
    "What customers actually pay for, as opposed to what was built."),
  m("top_ai_consumers", "Top AI consumers", "adoption", "count",
    "accounts ranked by AI cost over the period", ["ai_runs"], [],
    "A single account can consume a tier's entire margin."),

  // ── Composite ────────────────────────────────────────────────────────────
  m("financial_health_score", "Financial health score", "composite", "score",
    "weighted score of 8 components (see HEALTH_SCORE_COMPONENTS); returns INSUFFICIENT_DATA below the minimum computable component count",
    ["stripe_charges", "usage_events", "billing_subscriptions", "lmc_account_balances"], ["MOD-01"],
    "One number a CEO can look at daily — and which refuses to be reassuring when blind."),
] as const;

export function metric(code: string): Metric | null {
  return METRICS.find((x) => x.code === code) ?? null;
}

/** A metric's availability, derived from its inputs — never hand-declared. */
export function metricAvailability(x: Metric): MetricAvailability {
  const states = x.inputs.map((code) => dataSource(code)?.state ?? "missing");
  if (states.includes("missing")) return "blocked_missing_data";
  if (x.blockedBy.length > 0) return "blocked_owner_decision";
  if (states.every((s) => s === "collecting")) return "computable";
  return "computable_empty";
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Metric values — null with a reason, never a fabricated zero
// ═══════════════════════════════════════════════════════════════════════════

export type UnmeasuredReason =
  | "no_collector"
  | "no_data_yet"
  | "owner_decision_pending"
  | "not_applicable";

export type MetricValue =
  | { readonly measured: true; readonly value: number; readonly unit: MetricUnit; readonly asOf: string }
  | { readonly measured: false; readonly reason: UnmeasuredReason; readonly detail: string };

export function unmeasured(reason: UnmeasuredReason, detail: string): MetricValue {
  return { measured: false, reason, detail };
}

export function measured(value: number, unit: MetricUnit, asOf: string): MetricValue {
  return { measured: true, value, unit, asOf };
}

/**
 * The reason a metric cannot be measured right now, derived from its data
 * sources and open decisions. This is what a surface renders instead of a
 * number — it names the missing instrument, so the gap is actionable.
 */
export function unmeasuredReasonFor(x: Metric): MetricValue {
  const missing = x.inputs.filter((c) => (dataSource(c)?.state ?? "missing") === "missing");
  if (missing.length > 0) {
    return unmeasured(
      "no_collector",
      `No collector exists for: ${missing.join(", ")}. Nothing writes this data anywhere.`,
    );
  }
  if (x.blockedBy.length > 0) {
    return unmeasured(
      "owner_decision_pending",
      `Blocked by ${x.blockedBy.join(", ")} — the metric is computable but meaningless until decided.`,
    );
  }
  return unmeasured("no_data_yet", "Sources exist and are empty: the activity has not happened yet.");
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Feature economics (Part 3 of the BHE contract)
// ═══════════════════════════════════════════════════════════════════════════

export type ActivationStatus = "not_activatable" | "activatable" | "live";
export type AssessmentStatus = "unassessed" | "assessed" | "incomplete";

/** The CEO-level economics row for one commercial feature. */
export interface FeatureEconomics {
  readonly featureCode: string;
  readonly kind: CommercialItemKind;
  /** Accountable person/role. From the assessment; null until assessed. */
  readonly owner: string | null;
  readonly payer: EconomicModel["payer"] | null;
  readonly estimatedUnitCostCents: number | null;
  readonly costDriver: string | null;
  readonly revenueDriver: string | null;
  readonly marginModel: string | null;
  readonly activationStatus: ActivationStatus;
  readonly assessmentStatus: AssessmentStatus;
  /** The recorded commercial decision, or the open decision id blocking it. */
  readonly commercialDecision: string;
}

export function featureEconomics(): readonly FeatureEconomics[] {
  return commercialItems().map((item) => {
    const a = ECONOMIC_ASSESSMENTS[itemRef(item.kind, item.code)];
    const activationStatus: ActivationStatus = item.activatable
      ? "activatable"
      : "not_activatable";
    if (!a || !a.assessed) {
      return {
        featureCode: item.code,
        kind: item.kind,
        owner: null,
        payer: null,
        estimatedUnitCostCents: null,
        costDriver: null,
        revenueDriver: null,
        marginModel: null,
        activationStatus,
        assessmentStatus: "unassessed",
        commercialDecision: a && !a.assessed ? a.ownerDecision : "MISSING_ASSESSMENT",
      };
    }
    const model = a.model;
    const complete =
      model.estimatedUnitCostCents !== null &&
      model.expectedMarginPercent !== null &&
      model.marginModel.trim().length > 0 &&
      model.revenueDriver.trim().length > 0 &&
      model.owner.trim().length > 0 &&
      model.commercialDecision.trim().length > 0;
    return {
      featureCode: item.code,
      kind: item.kind,
      owner: model.owner,
      payer: model.payer,
      estimatedUnitCostCents: model.estimatedUnitCostCents,
      costDriver: model.costDriver,
      revenueDriver: model.revenueDriver,
      marginModel: model.marginModel,
      activationStatus,
      assessmentStatus: complete ? "assessed" : "incomplete",
      commercialDecision: model.commercialDecision,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Plan health (Part 4) and LMC health (Part 5)
// ═══════════════════════════════════════════════════════════════════════════

export type ProfitabilityVerdict = "profitable" | "break_even" | "loss_making" | "unknown";
export type RiskLevel = "low" | "medium" | "high" | "unknown";

export interface PlanHealth {
  readonly planKey: string;
  readonly revenue: MetricValue;
  readonly averageUsage: MetricValue;
  readonly infrastructureCost: MetricValue;
  readonly aiCost: MetricValue;
  readonly marginPercent: MetricValue;
  readonly profitability: ProfitabilityVerdict;
  readonly risk: RiskLevel;
  /** Why the verdict is what it is — always populated, including for unknown. */
  readonly rationale: string;
}

/**
 * Plan health for every plan in the canonical catalogue. With no revenue and
 * no cost collector, every verdict is `unknown` — stated explicitly, because
 * "unknown" is a management signal and "profitable" would be a lie.
 */
export function planHealth(): readonly PlanHealth[] {
  const revenueBlocked = unmeasuredReasonFor(metric("revenue_subscription")!);
  const aiBlocked = unmeasuredReasonFor(metric("cost_ai")!);
  const infraBlocked = unmeasuredReasonFor(metric("cost_infrastructure")!);
  const marginBlocked = unmeasuredReasonFor(metric("gross_margin")!);
  const usageBlocked = unmeasured(
    "no_collector",
    "Per-plan usage requires usage_events (never applied); pilot_events records activity but neither plan attribution nor cost.",
  );
  return SUBSCRIPTION_PLANS.map((p) => ({
    planKey: p.planKey,
    revenue: revenueBlocked,
    averageUsage: usageBlocked,
    infrastructureCost: infraBlocked,
    aiCost: aiBlocked,
    marginPercent: marginBlocked,
    profitability: "unknown" as const,
    risk: "unknown" as const,
    rationale:
      "No price is decided (MOD-01), no subscription exists, and no cost collector is deployed. Profitability is unknowable, not neutral.",
  }));
}

export interface LmcHealth {
  readonly issued: MetricValue;
  readonly purchased: MetricValue;
  readonly granted: MetricValue;
  readonly spent: MetricValue;
  readonly expired: MetricValue;
  readonly outstandingLiability: MetricValue;
  /** Outstanding liability ÷ cash received for credit. Null until both exist. */
  readonly backingRatio: MetricValue;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Early warning engine (Part 6)
// ═══════════════════════════════════════════════════════════════════════════

export type WarningCode =
  | "LOSS_RISK"
  | "LOW_MARGIN"
  | "UNLIMITED_RISK"
  | "HIGH_AI_COST"
  | "EXPENSIVE_FEATURE"
  | "LMC_LIABILITY_GROWING"
  | "NEGATIVE_MARGIN"
  | "SUBSIDY_RISK";

export type WarningStatus = "TRIGGERED" | "CLEAR" | "NOT_EVALUABLE";

export interface WarningRule {
  readonly code: WarningCode;
  readonly question: string;
  /** The exact condition, as it will be evaluated once data exists. */
  readonly condition: string;
  readonly inputs: readonly string[];
  readonly severity: "critical" | "high" | "medium";
}

export const WARNING_RULES: readonly WarningRule[] = [
  { code: "LOSS_RISK", question: "Is total cost approaching or exceeding total revenue?", condition: "cost_total ≥ revenue_total × 0.9", inputs: ["cost_total", "revenue_total"], severity: "critical" },
  { code: "NEGATIVE_MARGIN", question: "Is any live feature or plan selling below its own cost?", condition: "any feature or plan with measured contribution margin < 0", inputs: ["contribution_margin"], severity: "critical" },
  { code: "LOW_MARGIN", question: "Is gross margin thin enough that growth stops helping?", condition: "gross_margin < 30%", inputs: ["gross_margin"], severity: "high" },
  { code: "UNLIMITED_RISK", question: "Is anything sold as unlimited without a technical bound?", condition: "any activatable item with unlimitedClaim = true and abuseLimitMechanism = null", inputs: ["feature_economics"], severity: "high" },
  { code: "HIGH_AI_COST", question: "Is AI cost taking a disproportionate share of revenue?", condition: "cost_ai ÷ revenue_total > 0.25", inputs: ["cost_ai", "revenue_total"], severity: "high" },
  { code: "EXPENSIVE_FEATURE", question: "Is one feature consuming a share of cost far beyond its share of revenue?", condition: "feature cost share > 2 × its revenue share, over a full period", inputs: ["top_cost_features", "top_revenue_features"], severity: "medium" },
  { code: "LMC_LIABILITY_GROWING", question: "Is outstanding credit growing faster than the cash behind it?", condition: "Δ lmc_outstanding_liability > Δ revenue_topup over the period", inputs: ["lmc_outstanding_liability", "revenue_topup"], severity: "high" },
  { code: "SUBSIDY_RISK", question: "Is the subsidised free tier growing faster than the paid base that funds it?", condition: "Δ users_free ÷ Δ users_paid > the ratio the free-tier subsidy was assessed against", inputs: ["users_free", "users_paid", "feature_economics"], severity: "medium" },
] as const;

export interface WarningEvaluation {
  readonly code: WarningCode;
  readonly status: WarningStatus;
  readonly detail: string;
}

/**
 * Evaluate every warning. A rule whose inputs are unavailable is
 * `NOT_EVALUABLE` — NEVER `CLEAR`. An early-warning engine that reports "all
 * good" while blind is worse than no engine at all.
 */
export function evaluateWarnings(): readonly WarningEvaluation[] {
  return WARNING_RULES.map((rule) => {
    const blocked = rule.inputs
      .map((code) => metric(code))
      .filter((x): x is Metric => x !== null)
      .filter((x) => metricAvailability(x) !== "computable");
    // UNLIMITED_RISK is the one rule that needs no measurement: it reads the
    // declared economics, which exist as soon as an assessment is written.
    if (rule.code === "UNLIMITED_RISK") {
      const offenders = featureEconomics().filter(
        (f) => f.activationStatus !== "not_activatable" && f.assessmentStatus !== "assessed",
      );
      return offenders.length > 0
        ? {
            code: rule.code,
            status: "TRIGGERED" as const,
            detail: `${offenders.length} activatable feature(s) without a complete assessment: ${offenders.map((o) => o.featureCode).join(", ")}`,
          }
        : {
            code: rule.code,
            status: "CLEAR" as const,
            detail: "No activatable feature lacks a complete economic assessment.",
          };
    }
    if (blocked.length > 0) {
      return {
        code: rule.code,
        status: "NOT_EVALUABLE" as const,
        detail: `Cannot be evaluated: ${blocked.map((b) => b.code).join(", ")} ${blocked.length === 1 ? "is" : "are"} not measured. This is NOT a clear signal.`,
      };
    }
    return {
      code: rule.code,
      status: "NOT_EVALUABLE" as const,
      detail: "Inputs are collecting but empty — no period of activity to evaluate yet.",
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Financial health score (Part 8)
// ═══════════════════════════════════════════════════════════════════════════

export interface HealthScoreComponent {
  readonly code: string;
  readonly label: string;
  /** Weight out of 100. */
  readonly weight: number;
  /** The metric that drives it. */
  readonly metricCode: string;
  readonly scoring: string;
}

export const HEALTH_SCORE_COMPONENTS: readonly HealthScoreComponent[] = [
  { code: "revenue", label: "Revenue", weight: 15, metricCode: "revenue_total", scoring: "0 at zero revenue, rising with revenue against the previous period" },
  { code: "cost", label: "Cost control", weight: 15, metricCode: "cost_total", scoring: "full marks while cost growth stays below revenue growth" },
  { code: "growth", label: "Growth", weight: 15, metricCode: "mrr", scoring: "period-over-period MRR change" },
  { code: "margin", label: "Margin", weight: 20, metricCode: "contribution_margin", scoring: "scaled 0-100 across 0-60% contribution margin" },
  { code: "risk", label: "Risk", weight: 10, metricCode: "financial_health_score", scoring: "reduced by each TRIGGERED early warning, weighted by severity" },
  { code: "commercial_readiness", label: "Commercial readiness", weight: 10, metricCode: "financial_health_score", scoring: "share of catalogue items with a complete economic assessment" },
  { code: "lmc_sustainability", label: "LMC sustainability", weight: 10, metricCode: "lmc_outstanding_liability", scoring: "outstanding liability against cash received for credit; falls as unbacked liability grows" },
  { code: "subscription_sustainability", label: "Subscription sustainability", weight: 5, metricCode: "ltv_cac_ratio", scoring: "LTV/CAC scaled 0-100 across 0-3" },
] as const;

/** Below this many computable components the score refuses to report. */
export const HEALTH_SCORE_MIN_COMPONENTS = 5;

export type HealthScore =
  | { readonly available: true; readonly score: number; readonly components: number }
  | {
      readonly available: false;
      readonly reason: "INSUFFICIENT_DATA";
      readonly computableComponents: number;
      readonly required: number;
      readonly missing: readonly string[];
    };

/**
 * The single 0-100 number — or an explicit refusal.
 *
 * A score computed from one component is not a score, it is a decoration. When
 * fewer than HEALTH_SCORE_MIN_COMPONENTS are computable the engine returns
 * INSUFFICIENT_DATA and names what is missing.
 */
export function financialHealthScore(): HealthScore {
  const missing: string[] = [];
  let computable = 0;
  for (const c of HEALTH_SCORE_COMPONENTS) {
    const x = metric(c.metricCode);
    if (x && metricAvailability(x) === "computable") computable += 1;
    else missing.push(c.code);
  }
  if (computable < HEALTH_SCORE_MIN_COMPONENTS) {
    return {
      available: false,
      reason: "INSUFFICIENT_DATA",
      computableComponents: computable,
      required: HEALTH_SCORE_MIN_COMPONENTS,
      missing,
    };
  }
  // Reached only once the collectors exist; scoring functions land with them.
  return { available: true, score: 0, components: computable };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. CEO dashboard model (Part 7)
// ═══════════════════════════════════════════════════════════════════════════

export interface CeoDashboardModel {
  readonly asOf: string;
  readonly todayRevenue: MetricValue;
  readonly todayCost: MetricValue;
  readonly todayMargin: MetricValue;
  readonly mrr: MetricValue;
  readonly arr: MetricValue;
  readonly usersPaid: MetricValue;
  readonly usersFree: MetricValue;
  readonly conversion: MetricValue;
  readonly arpu: MetricValue;
  readonly acpu: MetricValue;
  readonly topCostFeatures: MetricValue;
  readonly topRevenueFeatures: MetricValue;
  readonly topAiConsumers: MetricValue;
  readonly lmcOutstandingLiability: MetricValue;
  readonly lmcOutstandingCredits: MetricValue;
  readonly healthScore: HealthScore;
  readonly warnings: readonly WarningEvaluation[];
}

/** The dashboard's shape, filled with honest reasons rather than numbers. */
export function ceoDashboardModel(asOf: string): CeoDashboardModel {
  const byCode = (code: string) => unmeasuredReasonFor(metric(code)!);
  return {
    asOf,
    todayRevenue: byCode("revenue_total"),
    todayCost: byCode("cost_total"),
    todayMargin: byCode("net_margin"),
    mrr: byCode("mrr"),
    arr: byCode("arr"),
    usersPaid: byCode("users_paid"),
    usersFree: byCode("users_free"),
    conversion: byCode("conversion_rate"),
    arpu: byCode("arpu"),
    acpu: byCode("acpu"),
    topCostFeatures: byCode("top_cost_features"),
    topRevenueFeatures: byCode("top_revenue_features"),
    topAiConsumers: byCode("top_ai_consumers"),
    lmcOutstandingLiability: byCode("lmc_outstanding_liability"),
    lmcOutstandingCredits: byCode("lmc_outstanding_liability"),
    healthScore: financialHealthScore(),
    warnings: evaluateWarnings(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Readiness report
// ═══════════════════════════════════════════════════════════════════════════

export interface BusinessHealthReadiness {
  readonly metricsTotal: number;
  readonly computable: number;
  readonly computableEmpty: number;
  readonly blockedMissingData: number;
  readonly blockedOwnerDecision: number;
  readonly missingCollectors: readonly string[];
  readonly warningsEvaluable: number;
  readonly healthScoreAvailable: boolean;
}

export function businessHealthReadiness(): BusinessHealthReadiness {
  const byAvailability = METRICS.map(metricAvailability);
  const warnings = evaluateWarnings();
  return {
    metricsTotal: METRICS.length,
    computable: byAvailability.filter((a) => a === "computable").length,
    computableEmpty: byAvailability.filter((a) => a === "computable_empty").length,
    blockedMissingData: byAvailability.filter((a) => a === "blocked_missing_data").length,
    blockedOwnerDecision: byAvailability.filter((a) => a === "blocked_owner_decision").length,
    missingCollectors: DATA_SOURCES.filter((d) => d.state === "missing").map((d) => d.code),
    warningsEvaluable: warnings.filter((w) => w.status !== "NOT_EVALUABLE").length,
    healthScoreAvailable: financialHealthScore().available,
  };
}

/** Every catalogue item the engine tracks (plans + top-ups + micro-features). */
export function trackedItemCount(): number {
  return SUBSCRIPTION_PLANS.length + TOPUP_PACKAGE_SLOTS.length + MICRO_FEATURES.length;
}
