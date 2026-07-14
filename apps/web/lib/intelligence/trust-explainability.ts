/**
 * Trust EXPLAINABILITY expansion (Trust Layer v1) — extends the existing
 * InsightExplanationV1 contract (./explainability.ts, unchanged) so every
 * insight can eventually answer ALL seven trust questions:
 *
 *   1. What is this?                → explanation.meaningCode        (V1)
 *   2. Why am I seeing it?          → whyVisibleCode                 (new)
 *   3. Which observations made it?  → observationRefs                (new)
 *   4. How old is it?               → freshness + freshnessLabel     (new)
 *   5. How confident is the system? → confidence (derived, unguessed)(new)
 *   6. Which source produced it?    → sourceKeys                     (new)
 *   7. What is not known?           → notKnownCodes                  (new)
 *
 * No hallucinated explanations: every field is either a validated stable
 * i18n code, a traceable reference, or a value produced by a deterministic
 * derivation (deriveConfidence / buildFreshness / detectContradiction).
 * Like buildExplanation, the builder throws on structural invalidity — an
 * insight that cannot explain itself must never render.
 *
 * Pure module: no IO, no Date.now.
 */
import {
  buildExplanation,
  type InsightExplanationV1,
} from "./explainability";
import {
  CONFIDENCE_LEVELS,
  type ConfidenceLevel,
} from "./confidence";
import {
  freshnessLabel,
  type FreshnessLabel,
  type IntelligenceFreshnessV1,
} from "./freshness";
import type { ContradictionResult } from "./contradiction";

export interface InsightTrustReportV1 {
  /** The existing V1 explanation (what / data basis / window / origin…). */
  readonly explanation: InsightExplanationV1;
  /** i18n code answering "why am I seeing this insight". */
  readonly whyVisibleCode: string;
  /** Traceable observation references (ids / content hashes). May be empty
   *  ONLY when notKnownCodes says so — absence must be admitted, not hidden. */
  readonly observationRefs: readonly string[];
  /** The four honest timestamps + derived age, or null when none exist. */
  readonly freshness: IntelligenceFreshnessV1 | null;
  /** Deterministic render label for the age ("updated today" … "unknown"). */
  readonly freshnessLabel: FreshnessLabel;
  /** Derived (never guessed) confidence level. */
  readonly confidence: ConfidenceLevel;
  /** Every source key that contributed (≥1, all non-empty). */
  readonly sourceKeys: readonly string[];
  /** i18n codes for what the system honestly does NOT know. */
  readonly notKnownCodes: readonly string[];
  /** Exposed conflict state between contributing signals — never averaged. */
  readonly conflict: ContradictionResult | null;
}

function isNonEmptyCode(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const CONFIDENCE_SET: ReadonlySet<string> = new Set(CONFIDENCE_LEVELS);

/**
 * Build (and validate) a full trust report around an existing V1
 * explanation input. Throws on structural invalidity (mirrors
 * buildExplanation — failing loudly is the honest behaviour).
 */
export function buildTrustReport(input: {
  explanation: Parameters<typeof buildExplanation>[0];
  whyVisibleCode: string;
  observationRefs?: readonly string[];
  freshness?: IntelligenceFreshnessV1 | null;
  confidence: ConfidenceLevel;
  sourceKeys: readonly string[];
  notKnownCodes?: readonly string[];
  conflict?: ContradictionResult | null;
}): InsightTrustReportV1 {
  const explanation = buildExplanation(input.explanation);
  if (!isNonEmptyCode(input.whyVisibleCode)) {
    throw new Error("InsightTrustReportV1: whyVisibleCode must be non-empty");
  }
  if (!CONFIDENCE_SET.has(input.confidence)) {
    throw new Error(
      `InsightTrustReportV1: invalid confidence "${String(input.confidence)}"`,
    );
  }
  if (
    !Array.isArray(input.sourceKeys) ||
    input.sourceKeys.length === 0 ||
    !input.sourceKeys.every(isNonEmptyCode)
  ) {
    throw new Error(
      "InsightTrustReportV1: sourceKeys must be a non-empty list of non-empty keys",
    );
  }
  const observationRefs = input.observationRefs ?? [];
  if (!observationRefs.every(isNonEmptyCode)) {
    throw new Error(
      "InsightTrustReportV1: observationRefs must all be non-empty",
    );
  }
  const notKnownCodes = input.notKnownCodes ?? [];
  if (!notKnownCodes.every(isNonEmptyCode)) {
    throw new Error(
      "InsightTrustReportV1: notKnownCodes must all be non-empty",
    );
  }
  // No observation refs and no admission of the gap → refuse: an insight
  // may not silently hide that it cannot point at its observations.
  if (observationRefs.length === 0 && notKnownCodes.length === 0) {
    throw new Error(
      "InsightTrustReportV1: empty observationRefs requires a notKnownCode admitting it",
    );
  }
  const freshness = input.freshness ?? null;
  return {
    explanation,
    whyVisibleCode: input.whyVisibleCode,
    observationRefs: [...observationRefs],
    freshness,
    freshnessLabel: freshnessLabel(freshness?.ageDays ?? null),
    confidence: input.confidence,
    sourceKeys: [...input.sourceKeys],
    notKnownCodes: [...notKnownCodes],
    conflict: input.conflict ?? null,
  };
}
