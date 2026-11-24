/**
 * Intelligence PRIVACY policy — cohort thresholds, anti-reconstruction
 * bounds, exportability, and the insight query-log record.
 *
 * The thresholds are DERIVED from the two existing repo constants so the
 * whole platform enforces ONE §20 privacy base (asserted in privacy.test.ts):
 *   - PERSON_PRESENCE_MIN_N (5)  — lib/market-map/spatial-entities.ts
 *     (mirrors SMALL_SAMPLE_N in lib/admin/market-analysis.ts and
 *     lib/market/thermometer-data.ts);
 *   - DEFAULT_MIN_BUCKET (3)     — lib/market-map/signal-model.ts.
 *
 * Pure module: no IO, no Date.now.
 */
import { PERSON_PRESENCE_MIN_N } from "@/lib/market-map/spatial-entities";
import { DEFAULT_MIN_BUCKET } from "@/lib/market-map/signal-model";

/** n >= this → an exact count may be shown (§20 "n<5 šablonas"). */
export const INTELLIGENCE_MIN_COHORT_N: number = PERSON_PRESENCE_MIN_N;

/** n < this → the bucket is suppressed entirely (individual protection). */
export const INTELLIGENCE_SUPPRESS_BELOW_N: number = DEFAULT_MIN_BUCKET;

export type CohortBand =
  /** n >= INTELLIGENCE_MIN_COHORT_N — the exact count may be shown. */
  | { readonly kind: "exact"; readonly count: number }
  /** INTELLIGENCE_SUPPRESS_BELOW_N <= n < INTELLIGENCE_MIN_COHORT_N — shown
   *  only as a small-sample band; the exact count is NOT carried. */
  | { readonly kind: "small_sample" }
  /** n < INTELLIGENCE_SUPPRESS_BELOW_N — never shown at all. */
  | { readonly kind: "suppressed" };

export function applyCohortPolicy(count: number): CohortBand {
  if (!Number.isFinite(count) || count < INTELLIGENCE_SUPPRESS_BELOW_N) {
    return { kind: "suppressed" };
  }
  if (count < INTELLIGENCE_MIN_COHORT_N) {
    return { kind: "small_sample" };
  }
  return { kind: "exact", count };
}

// ── Anti-reconstruction filter bound ─────────────────────────────────────────

export const INTELLIGENCE_MAX_FILTER_DIMENSIONS = 3;

export type FilterBoundResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonCode: "too_many_filter_dimensions" };

/**
 * Refuse over-narrow slicing: combining many filter dimensions can single an
 * individual out of an aggregate even when every cell passes the cohort
 * floor. Only dimensions actually constrained (non-null, non-undefined)
 * count against the bound.
 */
export function boundFilterDimensions(
  filters: Record<string, unknown>,
  maxDimensions: number = INTELLIGENCE_MAX_FILTER_DIMENSIONS,
): FilterBoundResult {
  const active = Object.values(filters).filter(
    (v) => v !== undefined && v !== null,
  ).length;
  if (active > maxDimensions) {
    return { ok: false, reasonCode: "too_many_filter_dimensions" };
  }
  return { ok: true };
}

// ── Exportability ────────────────────────────────────────────────────────────

/** Only fully public aggregates may ever leave the platform. */
export function isExportablePrivacyClass(privacyClass: string): boolean {
  return privacyClass === "public_aggregate";
}

// ── Insight query log record ─────────────────────────────────────────────────

/** Scalar-only params summary — structurally PII-hostile (no nested data). */
export type QueryLogParamsSummary = Record<string, string | number | boolean>;

export interface InsightQueryLogRecord {
  readonly insightKey: string;
  readonly observationIds: readonly string[];
  readonly computationVersion: string;
  readonly viewerRole: string;
  readonly profileId: string | null;
  readonly paramsSummary: QueryLogParamsSummary;
}

export type InsightQueryLogBuild =
  | { readonly ok: true; readonly record: InsightQueryLogRecord }
  | {
      readonly ok: false;
      readonly reasonCode: "non_scalar_params_summary_value";
    };

/**
 * Pure builder for a market_intelligence_insight_queries row. REFUSES any
 * paramsSummary value that is not a plain string/number/boolean — objects,
 * arrays, functions etc. could smuggle PII or free text into the log.
 */
export function buildInsightQueryLogRecord(input: {
  insightKey: string;
  observationIds: readonly string[];
  computationVersion: string;
  viewerRole: string;
  profileId: string | null;
  paramsSummary: Record<string, unknown>;
}): InsightQueryLogBuild {
  const summary: QueryLogParamsSummary = {};
  for (const [key, value] of Object.entries(input.paramsSummary)) {
    const t = typeof value;
    if (t !== "string" && t !== "number" && t !== "boolean") {
      return { ok: false, reasonCode: "non_scalar_params_summary_value" };
    }
    summary[key] = value as string | number | boolean;
  }
  return {
    ok: true,
    record: {
      insightKey: input.insightKey,
      observationIds: [...input.observationIds],
      computationVersion: input.computationVersion,
      viewerRole: input.viewerRole,
      profileId: input.profileId,
      paramsSummary: summary,
    },
  };
}
