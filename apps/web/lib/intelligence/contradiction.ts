/**
 * Intelligence CONTRADICTION detection (Trust Layer v1).
 *
 * When two signals describe the SAME thing (same subject, metric, unit,
 * stat method, geography, overlapping window) but disagree beyond a fixed
 * tolerance, that is a CONFLICT — and the honest response is to EXPOSE the
 * conflict with both values, never to average them into a number nobody
 * measured (§18 no-fake-data). This module deliberately exports no blending
 * or averaging function.
 *
 * Signals that describe different things are "not_comparable" (with the
 * exact mismatch reason) — a mismatch is not a conflict.
 *
 * Deterministic, pure module: no IO, no Date.now. i18n codes only.
 */
import type {
  ObservationGeo,
  ObservationStatMethod,
  ObservationSubjectKind,
  ObservationWindow,
} from "./observation-contract";

/** Divergence (percent of the larger magnitude) tolerated as agreement. */
export const DEFAULT_CONFLICT_TOLERANCE_PCT = 10;

export interface ComparableSignalV1 {
  readonly subjectKind: ObservationSubjectKind;
  readonly subjectId: string;
  readonly metricKey: string;
  readonly unit: string;
  readonly statMethod: ObservationStatMethod;
  readonly geo: ObservationGeo;
  readonly window: ObservationWindow;
  readonly valueNumeric: number;
  readonly sourceKey: string;
  readonly originKind: "external" | "internal" | "blended";
}

export type NotComparableReasonCode =
  | "subject_mismatch"
  | "metric_mismatch"
  | "unit_mismatch"
  | "stat_method_mismatch"
  | "geo_mismatch"
  | "window_disjoint"
  | "non_finite_value";

export type ContradictionResult =
  | {
      readonly kind: "not_comparable";
      readonly reasonCode: NotComparableReasonCode;
    }
  | { readonly kind: "agreement"; readonly divergencePct: number }
  | {
      /** Conflict state carries BOTH signals verbatim — never an average. */
      readonly kind: "conflict";
      readonly divergencePct: number;
      readonly a: ComparableSignalV1;
      readonly b: ComparableSignalV1;
    };

function sameGeo(a: ObservationGeo, b: ObservationGeo): boolean {
  return a.country === b.country && a.region === b.region && a.city === b.city;
}

function windowsOverlap(a: ObservationWindow, b: ObservationWindow): boolean {
  return (
    Date.parse(a.start) <= Date.parse(b.end) &&
    Date.parse(b.start) <= Date.parse(a.end)
  );
}

/** |a−b| as a percentage of the larger magnitude, rounded to 1 decimal.
 *  Both values zero → 0 (identical). */
export function divergencePct(a: number, b: number): number {
  const denominator = Math.max(Math.abs(a), Math.abs(b));
  if (denominator === 0) return 0;
  return Math.round((Math.abs(a - b) / denominator) * 1000) / 10;
}

/**
 * Compare two signals. Returns the exact non-comparability reason, an
 * agreement (divergence within tolerance), or a conflict exposing both
 * signals. No branch ever produces a blended value.
 */
export function detectContradiction(
  a: ComparableSignalV1,
  b: ComparableSignalV1,
  tolerancePct: number = DEFAULT_CONFLICT_TOLERANCE_PCT,
): ContradictionResult {
  if (a.subjectKind !== b.subjectKind || a.subjectId !== b.subjectId) {
    return { kind: "not_comparable", reasonCode: "subject_mismatch" };
  }
  if (a.metricKey !== b.metricKey) {
    return { kind: "not_comparable", reasonCode: "metric_mismatch" };
  }
  if (a.unit !== b.unit) {
    return { kind: "not_comparable", reasonCode: "unit_mismatch" };
  }
  if (a.statMethod !== b.statMethod) {
    return { kind: "not_comparable", reasonCode: "stat_method_mismatch" };
  }
  if (!sameGeo(a.geo, b.geo)) {
    return { kind: "not_comparable", reasonCode: "geo_mismatch" };
  }
  if (!windowsOverlap(a.window, b.window)) {
    return { kind: "not_comparable", reasonCode: "window_disjoint" };
  }
  if (!Number.isFinite(a.valueNumeric) || !Number.isFinite(b.valueNumeric)) {
    return { kind: "not_comparable", reasonCode: "non_finite_value" };
  }
  const divergence = divergencePct(a.valueNumeric, b.valueNumeric);
  if (divergence <= tolerancePct) {
    return { kind: "agreement", divergencePct: divergence };
  }
  return { kind: "conflict", divergencePct: divergence, a, b };
}

/** Stable i18n code for a contradiction outcome (`intelligence.conflict.*`). */
export function contradictionLabelCode(
  result: ContradictionResult,
): string {
  return `intelligence.conflict.${
    result.kind === "not_comparable" ? "notComparable" : result.kind
  }`;
}
