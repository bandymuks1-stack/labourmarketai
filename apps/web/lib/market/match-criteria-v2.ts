/**
 * Matching contract v2 — criterion vocabulary + pure helpers (Marketplace
 * Precision programme PR 4; docs/launch/marketplace-precision-booking-canonical-contract-v1.md §3).
 *
 * This is NOT a second engine. `lib/market/match-v1.ts` remains the ONE
 * deterministic engine; this sibling module only carries the typed
 * per-criterion result contract (hard / weighted / negotiable), the
 * engagement-form acceptance map, and the structured_v2 compensation /
 * start-date comparators the engine composes. match-v1 re-exports everything
 * here, so callers keep a single import surface.
 *
 * Doctrine compliance:
 *   • §19: no global score; per-criterion outcomes only, always with their
 *     source (table/field the fact came from).
 *   • §7 / §7.1: deterministic, pure, no AI, nothing fabricated. A missing
 *     fact is `unknown` / a missing-fact record — NEVER an assumed outcome.
 *   • Hard failure can never be compensated by any weighted signal — the
 *     engine caps status BEFORE ordering (structurally enforced + tested).
 */

import type { StructuredDemandV2 } from "@/lib/demand/structured-demand-v2";
import { ENGAGEMENT_FORMS } from "@/lib/demand/structured-demand-v2";

/** Deterministic-rules calculation version exposed on every match result. */
export const MATCH_CALC_VERSION = "2" as const;
export type MatchCalcVersion = typeof MATCH_CALC_VERSION;

export type MatchCriterionClass = "hard" | "weighted" | "negotiable";

export type MatchCriterionOutcome = "met" | "not_met" | "negotiable" | "unknown";

/** Closed criterion vocabulary (UI localizes via slug → JSON, §2/§10). */
export type MatchCriterionId =
  | "skills_coverage"
  | "evidence_tiers"
  | "profession"
  | "language"
  | "country_location"
  | "availability"
  | "pay_ceiling"
  | "accommodation"
  | "compensation"
  | "start_date"
  | "shifts_hours"
  | "engagement_form"
  | "licence_categories";

export interface MatchCriterionResult {
  readonly criterion: MatchCriterionId;
  readonly class: MatchCriterionClass;
  readonly outcome: MatchCriterionOutcome;
  /** Table/field the deciding fact came from (e.g. "workers.preferred_countries",
   *  "customer_requests.payload.structured_v2.compensation"). */
  readonly source: string;
}

/** An honest "we don't know" — the criterion could not be evaluated because a
 *  side has not provided the fact. Never converted into an outcome. */
export interface MatchMissingFact {
  readonly criterion: MatchCriterionId;
  /** Which side must provide the fact. */
  readonly side: "worker" | "demand";
  /** Table/field that would carry the fact once provided. */
  readonly source: string;
}

// ── Engagement form ↔ worker preferred contract type (hard when BOTH stated) ──

/** workers.preferred_contract_type → which structured_v2 engagement forms it
 *  accepts. Closed map; an unknown stored value is `null` (unknown, never
 *  guessed). */
export const WORKER_CONTRACT_TYPE_ACCEPTS: Record<string, readonly string[]> = {
  employment: [
    "direct_employment",
    "agency_employment",
    "temporary_employment",
    "posted_worker",
  ],
  subcontract: ["self_employed_contractor", "company_subcontract"],
  temporary: ["temporary_employment"],
  any: [...ENGAGEMENT_FORMS],
};

/** true = accepted, false = both-sides-stated conflict (hard), null = the
 *  worker's stored value is outside the closed map (treated as unknown). */
export function engagementFormAccepted(
  preferredContractType: string,
  engagementForm: string,
): boolean | null {
  const accepts =
    WORKER_CONTRACT_TYPE_ACCEPTS[preferredContractType.trim().toLowerCase()];
  if (!accepts) return null;
  return accepts.includes(engagementForm);
}

// ── Compensation (structured_v2) vs worker salary expectation ────────────────

/** Close-gap threshold: a stated offer within 15% below the worker's stated
 *  minimum is a discussion point, not a block (canonical contract §3). */
export const NEGOTIABLE_SALARY_GAP_RATIO = 0.15;

export type CompensationComparisonV2 =
  /** Both stated, comparable, offer ceiling ≥ worker minimum. */
  | { readonly kind: "met" }
  /** Both stated, comparable, offer below minimum but within the ≤15% window. */
  | { readonly kind: "negotiable_gap"; readonly gapRatio: number }
  /** Both stated, comparable, offer below the worker's hard minimum by >15%. */
  | { readonly kind: "hard_below_minimum"; readonly gapRatio: number }
  /** Both sides state numbers but in different bases (unit/currency) — an
   *  honest discussion point; no conversion is ever fabricated. */
  | { readonly kind: "not_comparable" }
  /** The demand carries structured_v2 but no compensation numbers. */
  | { readonly kind: "demand_unstated" }
  /** The demand states numbers; the worker has no stated minimum. */
  | { readonly kind: "worker_unstated" };

/**
 * Compare structured_v2 compensation against the worker's stated minimum
 * (workers.salary_min_eur — a MONTHLY EUR figure, see scouting "from €{min}/mo").
 * Returns null when the demand carries no structured_v2 at all (the engine
 * then keeps its existing legacy pay-ceiling behaviour untouched).
 *
 * A numeric comparison happens ONLY when both sides state numbers in the same
 * base (unit "month", currency EUR or unstated). Anything else is reported
 * honestly (`not_comparable`) — deterministic rules never invent conversions.
 */
export function compareCompensationV2(
  v2: StructuredDemandV2 | null | undefined,
  workerSalaryMinEur: number | null | undefined,
): CompensationComparisonV2 | null {
  if (v2 == null) return null;
  const c = v2.compensation;
  const ceilingCents = c?.max_cents ?? c?.min_cents ?? null;
  if (ceilingCents == null) return { kind: "demand_unstated" };
  if (workerSalaryMinEur == null) return { kind: "worker_unstated" };
  const sameBase =
    (c?.unit ?? null) === "month" && (c?.currency == null || c.currency === "EUR");
  if (!sameBase) return { kind: "not_comparable" };
  const ceilingEur = ceilingCents / 100;
  if (ceilingEur <= 0) return { kind: "not_comparable" };
  if (workerSalaryMinEur <= ceilingEur) return { kind: "met" };
  const gapRatio = (workerSalaryMinEur - ceilingEur) / ceilingEur;
  return gapRatio <= NEGOTIABLE_SALARY_GAP_RATIO
    ? { kind: "negotiable_gap", gapRatio }
    : { kind: "hard_below_minimum", gapRatio };
}

// ── Start date (structured_v2.time) vs worker availability ──────────────────

export type StartDateComparisonV2 =
  | { readonly kind: "met" }
  /** Worker becomes free after the demand's start window — a discussion
   *  point (start-date flexibility), never a silent block. */
  | { readonly kind: "negotiable_window" }
  | { readonly kind: "worker_unstated" }
  | { readonly kind: "demand_unstated" };

export function compareStartDateV2(
  v2: StructuredDemandV2 | null | undefined,
  subject: {
    readonly availabilityStatus?: string | null;
    readonly availableFrom?: string | null;
  },
): StartDateComparisonV2 | null {
  if (v2 == null) return null;
  const t = v2.time;
  const latest = t?.start_latest ?? t?.start_earliest ?? null;
  if (latest == null) return { kind: "demand_unstated" };
  // Explicitly available now → any stated start window is reachable.
  if ((subject.availabilityStatus ?? "").trim().toLowerCase() === "available") {
    return { kind: "met" };
  }
  const from = subject.availableFrom ?? null;
  if (from == null) return { kind: "worker_unstated" };
  // ISO yyyy-mm-dd strings compare lexicographically.
  return from.slice(0, 10) <= latest ? { kind: "met" } : { kind: "negotiable_window" };
}
