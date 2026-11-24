/**
 * Intelligence CONFIDENCE model (Trust Layer v1).
 *
 * Confidence is a DERIVED, deterministic fact — never a guess and never an
 * LLM opinion. The level is computed from four structured inputs (sample
 * size, freshness status, source legal status, provenance depth) by fixed
 * rules; when a required input is missing the honest answer is "unknown",
 * NOT an optimistic default (§18 no-fake-data).
 *
 * Rule table (evaluated top-down, first match wins):
 *   1. any required input null            → unknown
 *   2. freshness "unverified"             → unknown
 *   3. legalStatus "refused"              → low   (source is blocked)
 *   4. freshness "expired"                → low
 *   5. fresh + confirmed + sample ≥ 30
 *      + provenance ≥ 1 step              → high
 *   6. (fresh|stale) + confirmed
 *      + sample ≥ cohort floor (5)        → medium
 *   7. everything else                    → low
 *
 * i18n: this layer emits stable codes only. Pure module: no IO, no Date.now.
 */
import type { ObservationFreshnessStatus } from "./observation-contract";
import type { SourceLegalStatus } from "./source-governance";
import { INTELLIGENCE_MIN_COHORT_N } from "./privacy";

export const CONFIDENCE_LEVELS = ["low", "medium", "high", "unknown"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Sample floor for "high" — one order above the §20 cohort floor. */
export const CONFIDENCE_HIGH_MIN_SAMPLE = 30;

/** Sample floor for "medium" — the platform-wide cohort floor (§20). */
export const CONFIDENCE_MEDIUM_MIN_SAMPLE: number = INTELLIGENCE_MIN_COHORT_N;

export interface ConfidenceInputsV1 {
  /** Honest sample size, or null when the source carries none. */
  readonly sampleSize: number | null;
  /** Freshness status of the underlying observation, or null if unknown. */
  readonly freshness: ObservationFreshnessStatus | null;
  /** Legal status of the producing source, or null if the source is unknown. */
  readonly sourceLegalStatus: SourceLegalStatus | null;
  /** Number of provenance steps carried by the observation, or null. */
  readonly provenanceStepCount: number | null;
}

/**
 * Deterministic confidence derivation — see the rule table above. The same
 * inputs always yield the same level; missing inputs yield "unknown".
 */
export function deriveConfidence(input: ConfidenceInputsV1): ConfidenceLevel {
  const { sampleSize, freshness, sourceLegalStatus, provenanceStepCount } =
    input;
  if (
    sampleSize === null ||
    freshness === null ||
    sourceLegalStatus === null ||
    provenanceStepCount === null
  ) {
    return "unknown";
  }
  if (freshness === "unverified") return "unknown";
  if (sourceLegalStatus === "refused") return "low";
  if (freshness === "expired") return "low";
  if (
    freshness === "fresh" &&
    sourceLegalStatus === "confirmed" &&
    sampleSize >= CONFIDENCE_HIGH_MIN_SAMPLE &&
    provenanceStepCount >= 1
  ) {
    return "high";
  }
  if (
    sourceLegalStatus === "confirmed" &&
    sampleSize >= CONFIDENCE_MEDIUM_MIN_SAMPLE
  ) {
    return "medium";
  }
  return "low";
}

/** Stable i18n code for a confidence level (`intelligence.confidence.*`). */
export function confidenceLabelCode(level: ConfidenceLevel): string {
  return `intelligence.confidence.${level}`;
}

/** Ordering for display/sorting: unknown < low < medium < high. */
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function confidenceRank(level: ConfidenceLevel): number {
  return CONFIDENCE_RANK[level];
}

/**
 * The weakest level of a set — a blended insight is never more confident
 * than its least confident input (no averaging of trust).
 */
export function weakestConfidence(
  levels: readonly ConfidenceLevel[],
): ConfidenceLevel {
  if (levels.length === 0) return "unknown";
  return levels.reduce((weakest, level) =>
    confidenceRank(level) < confidenceRank(weakest) ? level : weakest,
  );
}
