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

/** Deterministic-rules calculation version exposed on every match result.
 *  "2.1" = P2-PR4 eight mirrored dimensions (languages incl. CEFR levels,
 *  licence categories, own vehicle, own tools, pay basis, night/weekend
 *  shifts, overtime).
 *  "2.2" = Explainable Matching v1 (Wagon 4): author-selectable
 *  mandatory/preferred requirement tiers (structured_v2.requirement_priorities)
 *  + the min_experience criterion (evaluated ONLY when the author set a tier
 *  for it). With NO requirement_priorities present, "2.2" results are
 *  identical to "2.1" results (guard-tested). */
export const MATCH_CALC_VERSION = "2.2" as const;
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
  | "licence_categories"
  | "own_vehicle"
  | "own_tools"
  | "pay_basis"
  | "night_shifts"
  | "weekend_shifts"
  | "overtime"
  | "min_experience";

export interface MatchCriterionResult {
  readonly criterion: MatchCriterionId;
  readonly class: MatchCriterionClass;
  readonly outcome: MatchCriterionOutcome;
  /** Table/field the deciding fact came from (e.g. "workers.preferred_countries",
   *  "customer_requests.payload.structured_v2.compensation"). */
  readonly source: string;
  /** Tier provenance (Wagon 4): true when the demand AUTHOR set the
   *  mandatory/preferred tier for this criterion via
   *  structured_v2.requirement_priorities — so a blocking reason can honestly
   *  say "the author marked this mandatory". Absent = engine default tier. */
  readonly authorMarked?: boolean;
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

// ── Languages with CEFR levels (structured_v2.requirements.languages) ────────
//
// Worker facts come from the HUMAN-GATED worker_languages store (MP-1, PR
// #720): rows { lang, level } with level in A1..C2 | native. Until the store
// is applied every subject reads back with no language facts → the criterion
// is a worker-side missing fact, never a fabricated outcome.

/** Closed worker-side level set (worker_languages.level check constraint). */
export const WORKER_LANGUAGE_LEVELS = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
  "native",
] as const;

/** One self-declared worker language fact (worker_languages row). */
export interface WorkerLanguageFact {
  readonly lang: string;
  /** CEFR level or "native" — the DB check constraint enforces the closed
   *  set; an out-of-set value ranks null (unknown, never guessed). */
  readonly level: string;
}

/** Deterministic level ordering: A1 < A2 < B1 < B2 < C1 < C2 ≤ native.
 *  Unknown level strings rank null — never coerced up or down. */
const LANGUAGE_LEVEL_RANK: Readonly<Record<string, number>> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
  native: 7,
};

export function languageLevelRank(level: string): number | null {
  return LANGUAGE_LEVEL_RANK[level.trim()] ?? null;
}

/** true = the worker's level satisfies the required level; false = below;
 *  null = either level string is outside the closed set (unknown). */
export function languageLevelSatisfies(
  workerLevel: string,
  requiredLevel: string,
): boolean | null {
  const w = languageLevelRank(workerLevel);
  const r = languageLevelRank(requiredLevel);
  if (w == null || r == null) return null;
  return w >= r;
}

export type LanguagesComparisonV2 =
  /** Every required language is held at (or above) the required level.
   *  `extraCount` = worker languages beyond the required set (a weighted
   *  strength, never a gate). */
  | { readonly kind: "met"; readonly extraCount: number }
  /** At least one required language fails AND cannot be team-demoted →
   *  both-sides-stated hard conflict. */
  | { readonly kind: "hard_not_met"; readonly failedLangs: readonly string[] }
  /** Every failed requirement is one_per_team_sufficient on a team-target
   *  demand → a staffing conversation, not a block. */
  | { readonly kind: "negotiable_team_gap"; readonly failedLangs: readonly string[] }
  /** Every failed requirement was demoted by the AUTHOR-SET preferred tier
   *  for secondary languages (Wagon 4) — a discussion point, not a block. */
  | { readonly kind: "negotiable_preferred_gap"; readonly failedLangs: readonly string[] }
  /** The worker has no stated language facts (store unapplied or empty). */
  | { readonly kind: "worker_unstated" };

/**
 * Compare structured_v2 requirements.languages (lang + CEFR level +
 * one_per_team_sufficient) against the worker's worker_languages facts.
 * Returns null when the demand states no language requirements (absence =
 * no requirement, nothing recorded).
 *
 * one_per_team_sufficient demotes a FAILED language to negotiable ONLY for
 * team-target demands (target_supply team | multiple_workers) — one team
 * member covering the language is a plausible arrangement there. For an
 * individual target the requirement stays hard.
 *
 * Wagon 4: requirement_priorities.secondary_languages === "preferred"
 * additionally demotes a FAILED language BEYOND THE FIRST stated requirement
 * to negotiable (the first stated language always keeps its default tier).
 * "mandatory" (or absence) keeps today's behaviour exactly.
 */
export function compareLanguagesV2(
  v2: StructuredDemandV2 | null | undefined,
  workerLanguages: readonly WorkerLanguageFact[] | null | undefined,
): LanguagesComparisonV2 | null {
  const required = v2?.requirements?.languages ?? [];
  if (required.length === 0) return null;
  const secondaryPreferred =
    v2?.requirement_priorities?.secondary_languages === "preferred";
  if (workerLanguages == null || workerLanguages.length === 0) {
    return { kind: "worker_unstated" };
  }
  // Best stated level per language (defensive: keep the highest known rank).
  const levelByLang = new Map<string, string>();
  for (const w of workerLanguages) {
    const lang = w.lang.trim().toLowerCase();
    if (lang === "") continue;
    const prev = levelByLang.get(lang);
    if (
      prev == null ||
      (languageLevelRank(w.level) ?? 0) > (languageLevelRank(prev) ?? 0)
    ) {
      levelByLang.set(lang, w.level);
    }
  }
  const teamTarget =
    v2?.target_supply === "team" || v2?.target_supply === "multiple_workers";
  const hardFailed: string[] = [];
  const teamDemoted: string[] = [];
  const preferredDemoted: string[] = [];
  required.forEach((req, index) => {
    const held = levelByLang.get(req.lang.trim().toLowerCase());
    // Not held at all, level below required, or level unknowable → failed.
    // (An unknowable stated level cannot PROVE the requirement — the
    // requirement is unmet on the stated facts; nothing is guessed.)
    const ok = held != null && languageLevelSatisfies(held, req.level) === true;
    if (ok) return;
    if (req.one_per_team_sufficient === true && teamTarget) teamDemoted.push(req.lang);
    // Author-preferred tier applies ONLY to languages beyond the first
    // stated requirement — the first keeps its default (hard) tier.
    else if (secondaryPreferred && index > 0) preferredDemoted.push(req.lang);
    else hardFailed.push(req.lang);
  });
  if (hardFailed.length > 0) return { kind: "hard_not_met", failedLangs: hardFailed };
  // Author-set demotion is reported with its own kind so the explanation can
  // carry tier provenance; mixed team+preferred demotions surface as the
  // author-set kind (both are negotiable — the class never differs).
  if (preferredDemoted.length > 0) {
    return {
      kind: "negotiable_preferred_gap",
      failedLangs: [...preferredDemoted, ...teamDemoted],
    };
  }
  if (teamDemoted.length > 0) {
    return { kind: "negotiable_team_gap", failedLangs: teamDemoted };
  }
  const requiredLangs = new Set(required.map((r) => r.lang.trim().toLowerCase()));
  const extraCount = [...levelByLang.keys()].filter((l) => !requiredLangs.has(l)).length;
  return { kind: "met", extraCount };
}

// ── Pay basis (gross/net) — structured_v2.compensation.basis vs
//    workers.pay_basis_preference (MP-2, PR #721) ─────────────────────────────

export type PayBasisComparisonV2 =
  /** Both stated and equal (or the worker accepts either). */
  | { readonly kind: "met" }
  /** Both stated, different basis — a conversion CONVERSATION, never a block. */
  | { readonly kind: "negotiable_mismatch" }
  /** The worker stated a basis preference; the demand's basis is absent or
   *  "unspecified". */
  | { readonly kind: "demand_unstated" }
  /** The demand states a basis; the worker has no stated preference (or the
   *  stored value is outside the closed gross|net set — unknown, never
   *  guessed). */
  | { readonly kind: "worker_unstated" };

/** Normalize a stored basis value to the closed set, else null (unknown). */
function normalizeBasis(value: string | null | undefined): "gross" | "net" | null {
  const v = (value ?? "").trim().toLowerCase();
  return v === "gross" || v === "net" ? v : null;
}

/**
 * Compare the demand's stated pay basis against the worker's preference.
 * Returns null when NEITHER side has stated a basis (nothing to mirror).
 * "unspecified" on the demand side counts as unstated (the publish-honesty
 * flags already surface it to the owner).
 */
export function comparePayBasisV2(
  v2: StructuredDemandV2 | null | undefined,
  workerPayBasisPreference: string | null | undefined,
): PayBasisComparisonV2 | null {
  const demandBasis = normalizeBasis(
    v2?.compensation?.basis === "unspecified" ? null : v2?.compensation?.basis,
  );
  const workerBasis = normalizeBasis(workerPayBasisPreference);
  if (demandBasis == null && workerBasis == null) return null;
  if (demandBasis == null) return { kind: "demand_unstated" };
  if (workerBasis == null) return { kind: "worker_unstated" };
  return demandBasis === workerBasis
    ? { kind: "met" }
    : { kind: "negotiable_mismatch" };
}
