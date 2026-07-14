/**
 * Observation INSPECTOR view model (Trust Layer v1) — the pure, read-only
 * projection behind the developer-only observation inspector.
 *
 * Takes raw market_intelligence_observations rows (snake_case, exactly as
 * the gated migration defines them) and produces display rows with honest
 * nulls — a missing or malformed field renders as "unknown", never as an
 * invented value. Confidence is DERIVED via ./confidence.ts from the row's
 * structured facts + the source registry — never guessed from the raw
 * numeric score alone.
 *
 * Read-only by construction: this module exposes no mutation of any kind.
 * Pure module: no IO, no Date.now. The feature gate value is passed IN
 * (the page reads the env; pure modules never touch process.env).
 */
import {
  OBSERVATION_FRESHNESS_STATUSES,
  type ObservationFreshnessStatus,
} from "./observation-contract";
import { deriveConfidence, type ConfidenceLevel } from "./confidence";
import { getSourceProfile } from "./source-governance";

export const INSPECTOR_MAX_ROWS = 50;

/** The inspector renders only when the flag value is exactly "1" or "true"
 *  — absent, empty or anything else stays OFF (fail-closed). */
export function isInspectorEnabled(
  flagValue: string | undefined | null,
): boolean {
  return flagValue === "1" || flagValue === "true";
}

export interface ObservationInspectorRowV1 {
  readonly id: string | null;
  readonly contentHash: string | null;
  readonly sourceKey: string | null;
  readonly sourceKind: string | null;
  readonly capturedAtIso: string | null;
  /** Derived level (deterministic rules), never the raw score re-labelled. */
  readonly confidence: ConfidenceLevel;
  /** The raw stored 0..1 score, shown verbatim next to the derived level. */
  readonly confidenceRaw: number | null;
  readonly privacyClass: string | null;
  readonly freshnessStatus: string | null;
  readonly subjectKind: string | null;
  readonly subjectId: string | null;
  readonly metricKey: string | null;
  readonly sampleSize: number | null;
  readonly transformVersion: string | null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const FRESHNESS_SET: ReadonlySet<string> = new Set(
  OBSERVATION_FRESHNESS_STATUSES,
);

function asFreshness(v: unknown): ObservationFreshnessStatus | null {
  const s = asString(v);
  return s !== null && FRESHNESS_SET.has(s)
    ? (s as ObservationFreshnessStatus)
    : null;
}

/**
 * Project one raw row into a read-only inspector row. Never throws: any
 * malformed field becomes an honest null (rendered as "unknown").
 */
export function toInspectorRow(
  row: Record<string, unknown>,
): ObservationInspectorRowV1 {
  const sourceKey = asString(row["source_key"]);
  const profile = sourceKey !== null ? getSourceProfile(sourceKey) : null;
  const provenance = row["provenance"];
  return {
    id: asString(row["id"]),
    contentHash: asString(row["content_hash"]),
    sourceKey,
    sourceKind: asString(row["source_kind"]),
    capturedAtIso: asString(row["captured_at"]),
    confidence: deriveConfidence({
      sampleSize: asNumber(row["sample_size"]),
      freshness: asFreshness(row["freshness_status"]),
      sourceLegalStatus: profile?.legalStatus ?? null,
      provenanceStepCount: Array.isArray(provenance)
        ? provenance.length
        : null,
    }),
    confidenceRaw: asNumber(row["confidence"]),
    privacyClass: asString(row["privacy_class"]),
    freshnessStatus: asString(row["freshness_status"]),
    subjectKind: asString(row["subject_kind"]),
    subjectId: asString(row["subject_id"]),
    metricKey: asString(row["metric_key"]),
    sampleSize: asNumber(row["sample_size"]),
    transformVersion: asString(row["transform_version"]),
  };
}

export function toInspectorRows(
  rows: readonly Record<string, unknown>[],
): readonly ObservationInspectorRowV1[] {
  return rows.slice(0, INSPECTOR_MAX_ROWS).map(toInspectorRow);
}
