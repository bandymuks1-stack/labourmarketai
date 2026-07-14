/**
 * Salary intelligence model — PURE benchmark construction + comparison.
 *
 * Honesty rules (§18 no-fake-data, no invented numbers):
 *   - NO benchmark object can exist without source + date + geography +
 *     basis + a sample indication. The single exception: the admin-curated
 *     market_rate_averages source carries a source_note instead of a sample
 *     size — modelled as sampleSize null allowed ONLY for that sourceKey,
 *     with uncertaintyCode "curated_no_sample_size" carried on the object.
 *   - NEVER convert gross↔net — there is no tax model here. A basis
 *     mismatch (or unknown basis) is an honest "not comparable", never a
 *     silent conversion.
 *   - External and internal benchmarks are NEVER merged/blended: the view
 *     type keeps them in separate fields by design.
 *   - Deterministic: no Date.now() — callers pass nowMs.
 *
 * Pure module: no IO, no DB. The server read layer (./intelligence-read.ts)
 * feeds it real rows.
 */
import type { ObservationGeo } from "./observation-contract";
import {
  applyCohortPolicy,
  INTELLIGENCE_MIN_COHORT_N,
} from "./privacy";
import {
  buildExplanation,
  type InsightExplanationV1,
} from "./explainability";

export type SalaryBasis = "gross" | "net" | "unknown";

/** The only source allowed to carry a null sample size (admin-curated —
 *  it carries source_note provenance instead of a sample). */
export const CURATED_NO_SAMPLE_SOURCE_KEY = "admin_market_rate_averages";

export const INTERNAL_AGGREGATE_SOURCE_KEY = "internal_platform_aggregates";

/** Uncertainty code carried when the curated source has no sample size. */
export const CURATED_NO_SAMPLE_UNCERTAINTY_CODE =
  "intelligence.uncertainty.curatedNoSampleSize";

export const SMALL_SAMPLE_UNCERTAINTY_CODE =
  "intelligence.uncertainty.smallSample";

export interface SalaryBenchmarkV1 {
  readonly valueEur: number;
  readonly basis: SalaryBasis;
  readonly period: "month";
  readonly statMethod: "mean" | "median";
  readonly geo: ObservationGeo;
  readonly sampleSize: number | null;
  readonly sourceKey: string;
  readonly sourceKind: string;
  readonly observedAtIso: string;
  readonly originKind: "external" | "internal";
  /** Honest uncertainty codes carried WITH the benchmark. */
  readonly uncertaintyCodes: readonly string[];
}

export type SalaryBenchmarkBuild =
  | { readonly ok: true; readonly benchmark: SalaryBenchmarkV1 }
  | { readonly ok: false; readonly missing: readonly string[] };

const SALARY_BASES: ReadonlySet<string> = new Set(["gross", "net", "unknown"]);
const STAT_METHODS: ReadonlySet<string> = new Set(["mean", "median"]);
const ORIGIN_KINDS: ReadonlySet<string> = new Set(["external", "internal"]);

/**
 * Constructor/validator: REFUSES (listing the missing fields) when source,
 * date, basis, geography or the sample/curated indication is absent. This is
 * the only way to obtain a SalaryBenchmarkV1.
 */
export function toSalaryBenchmark(input: {
  valueEur?: number | null;
  basis?: string | null;
  statMethod?: string | null;
  geo?: { country: string | null; region: string | null; city: string | null } | null;
  sampleSize?: number | null;
  sourceKey?: string | null;
  sourceKind?: string | null;
  observedAtIso?: string | null;
  originKind?: string | null;
}): SalaryBenchmarkBuild {
  const missing: string[] = [];

  const valueEur = input.valueEur;
  if (typeof valueEur !== "number" || !Number.isFinite(valueEur) || valueEur <= 0) {
    missing.push("valueEur");
  }
  const basis = input.basis;
  if (typeof basis !== "string" || !SALARY_BASES.has(basis)) {
    missing.push("basis");
  }
  const statMethod = input.statMethod;
  if (typeof statMethod !== "string" || !STAT_METHODS.has(statMethod)) {
    missing.push("statMethod");
  }
  const geo = input.geo;
  if (!geo || typeof geo.country !== "string" || !/^[A-Z]{2}$/.test(geo.country)) {
    missing.push("geo");
  }
  const sourceKey = input.sourceKey;
  const sourceKind = input.sourceKind;
  if (typeof sourceKey !== "string" || sourceKey.length === 0) {
    missing.push("sourceKey");
  }
  if (typeof sourceKind !== "string" || sourceKind.length === 0) {
    missing.push("sourceKind");
  }
  const observedAtIso = input.observedAtIso;
  if (
    typeof observedAtIso !== "string" ||
    !Number.isFinite(Date.parse(observedAtIso))
  ) {
    missing.push("observedAtIso");
  }
  const originKind = input.originKind;
  if (typeof originKind !== "string" || !ORIGIN_KINDS.has(originKind)) {
    missing.push("originKind");
  }

  // Sample indication: an integer >= 1, OR null ONLY for the curated source.
  const sampleSize = input.sampleSize ?? null;
  const uncertaintyCodes: string[] = [];
  if (sampleSize === null) {
    if (sourceKey === CURATED_NO_SAMPLE_SOURCE_KEY) {
      uncertaintyCodes.push(CURATED_NO_SAMPLE_UNCERTAINTY_CODE);
    } else {
      missing.push("sampleSize");
    }
  } else if (!Number.isInteger(sampleSize) || sampleSize < 1) {
    missing.push("sampleSize");
  } else if (sampleSize < INTELLIGENCE_MIN_COHORT_N) {
    uncertaintyCodes.push(SMALL_SAMPLE_UNCERTAINTY_CODE);
  }

  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    benchmark: {
      valueEur: valueEur as number,
      basis: basis as SalaryBasis,
      period: "month",
      statMethod: statMethod as "mean" | "median",
      geo: {
        country: (geo as ObservationGeo).country,
        region: (geo as ObservationGeo).region ?? null,
        city: (geo as ObservationGeo).city ?? null,
      },
      sampleSize,
      sourceKey: sourceKey as string,
      sourceKind: sourceKind as string,
      observedAtIso: observedAtIso as string,
      originKind: originKind as "external" | "internal",
      uncertaintyCodes,
    },
  };
}

// ── Comparison ───────────────────────────────────────────────────────────────

/** ±band (percent) inside which a subject counts as "within" the benchmark. */
export const WITHIN_BAND_PCT = 10;

export type SalaryComparisonResult =
  | {
      readonly kind: "insufficient_data";
      readonly missingCodes: readonly string[];
    }
  | {
      readonly kind: "not_comparable";
      readonly reasonCode: "basis_mismatch" | "basis_unknown";
    }
  | {
      readonly kind: "compared";
      /** Subject vs benchmark in percent — e.g. -12 means 12% below. */
      readonly positionPct: number;
      readonly band: "below" | "within" | "above";
      readonly explanation: InsightExplanationV1;
    };

function geoLabel(geo: ObservationGeo): string | null {
  if (!geo.country) return null;
  const parts = [geo.country];
  if (geo.region) parts.push(geo.region);
  if (geo.city) parts.push(geo.city);
  return parts.join(" · ");
}

/**
 * Compare a subject salary to a benchmark. NEVER converts gross↔net (no tax
 * model exists here): unknown basis on either side → honest "basis_unknown";
 * differing known bases → "basis_mismatch".
 */
export function compareSalaryToBenchmark(
  subjectEur: number,
  subjectBasis: SalaryBasis,
  benchmark: SalaryBenchmarkV1,
): SalaryComparisonResult {
  if (
    typeof subjectEur !== "number" ||
    !Number.isFinite(subjectEur) ||
    subjectEur <= 0
  ) {
    return {
      kind: "insufficient_data",
      missingCodes: ["intelligence.missing.subjectSalary"],
    };
  }
  if (subjectBasis === "unknown" || benchmark.basis === "unknown") {
    return { kind: "not_comparable", reasonCode: "basis_unknown" };
  }
  if (subjectBasis !== benchmark.basis) {
    return { kind: "not_comparable", reasonCode: "basis_mismatch" };
  }

  const positionPct =
    Math.round(((subjectEur - benchmark.valueEur) / benchmark.valueEur) * 1000) /
    10;
  const band: "below" | "within" | "above" =
    positionPct < -WITHIN_BAND_PCT
      ? "below"
      : positionPct > WITHIN_BAND_PCT
        ? "above"
        : "within";

  return {
    kind: "compared",
    positionPct,
    band,
    explanation: buildExplanation({
      meaningCode: "intelligence.salary.comparedToBenchmark",
      dataBasisCodes: [`intelligence.sources.key.${benchmark.sourceKey}`],
      window: { start: null, end: null },
      geoLabel: geoLabel(benchmark.geo),
      sampleSize: benchmark.sampleSize,
      originKind: benchmark.originKind,
      nextActionCode: null,
      uncertaintyCodes: benchmark.uncertaintyCodes,
    }),
  };
}

// ── Internal aggregate builder ───────────────────────────────────────────────

export type InternalSalaryAggregate =
  | {
      readonly kind: "ok";
      /** Median benchmark (preferred headline statistic). */
      readonly median: SalaryBenchmarkV1;
      readonly mean: SalaryBenchmarkV1;
      readonly sampleSize: number;
    }
  | {
      readonly kind: "insufficient_data";
      readonly reasonCode: "cohort_below_minimum";
    };

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Aggregate REAL declared values into an internal benchmark. Cohort policy
 * applies FIRST: below INTELLIGENCE_MIN_COHORT_N (small_sample or
 * suppressed) → insufficient_data — an internal benchmark from a small
 * cohort could de-anonymise a person, so it never exists.
 * Deterministic: `nowMs` is a parameter, never Date.now().
 */
export function buildInternalSalaryAggregate(
  values: readonly number[],
  opts: {
    basis: SalaryBasis;
    geo: ObservationGeo;
    nowMs: number;
  },
): InternalSalaryAggregate {
  const clean = values
    .filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0)
    .slice()
    .sort((a, b) => a - b);

  const cohort = applyCohortPolicy(clean.length);
  if (cohort.kind !== "exact") {
    return { kind: "insufficient_data", reasonCode: "cohort_below_minimum" };
  }

  const observedAtIso = new Date(opts.nowMs).toISOString();
  const meanValue =
    Math.round((clean.reduce((s, v) => s + v, 0) / clean.length) * 100) / 100;
  const medianValue = Math.round(median(clean) * 100) / 100;

  const shared = {
    basis: opts.basis,
    geo: opts.geo,
    sampleSize: clean.length,
    sourceKey: INTERNAL_AGGREGATE_SOURCE_KEY,
    sourceKind: "internal_aggregated",
    observedAtIso,
    originKind: "internal",
  };
  const medianBuild = toSalaryBenchmark({
    ...shared,
    valueEur: medianValue,
    statMethod: "median",
  });
  const meanBuild = toSalaryBenchmark({
    ...shared,
    valueEur: meanValue,
    statMethod: "mean",
  });
  // Structurally complete by construction — but never bypass the validator.
  if (!medianBuild.ok || !meanBuild.ok) {
    return { kind: "insufficient_data", reasonCode: "cohort_below_minimum" };
  }
  return {
    kind: "ok",
    median: medianBuild.benchmark,
    mean: meanBuild.benchmark,
    sampleSize: clean.length,
  };
}

// ── Separation by design ─────────────────────────────────────────────────────

/**
 * External and internal benchmarks are NEVER merged into one figure — the
 * view keeps them in separate fields, each with its own comparison result
 * and source badge. There is deliberately no "combined" field.
 */
export interface SalaryIntelligenceView {
  readonly internal: SalaryComparisonResult | null;
  readonly external: SalaryComparisonResult | null;
}

export function buildSalaryIntelligenceView(
  internal: SalaryComparisonResult | null,
  external: SalaryComparisonResult | null,
): SalaryIntelligenceView {
  return { internal, external };
}
