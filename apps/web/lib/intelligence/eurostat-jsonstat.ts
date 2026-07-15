/**
 * EUROSTAT JSON-stat 2.0 PARSER — pure, deterministic decoding of official
 * Eurostat Statistics-API responses into canonical observation candidates.
 *
 * This module performs NO IO: it receives an already-parsed JSON body plus
 * the exact request URL and clock from the import layer, and returns one
 * accounted outcome per scanned cell. Fail-closed everywhere:
 *
 *   - a response that is not a JSON-stat 2.0 dataset rejects as a whole;
 *   - a response whose pinned dimensions drifted from the allowlisted query
 *     rejects as a whole (the value would not mean what the metric means);
 *   - a missing `updated` timestamp rejects as a whole — capturedAt is the
 *     official publication time and the idempotency anchor, never invented;
 *   - a missing value is REJECTED, never converted to zero;
 *   - confidential/suppressed flags reject the cell; disclosed flags
 *     (provisional, estimated, break…) ride along in provenance — a flag is
 *     never silently discarded;
 *   - an unparseable period or non-allowlisted geography rejects the cell.
 *
 * Every accepted candidate carries: the Eurostat geo code AND resolved
 * label, the pinned dimension identity, the official publication timestamp,
 * the response hash, the exact request URL and a locally computed content
 * hash. Pure module: no IO, no Date.now.
 */
import type { IntelligenceObservationV1 } from "./observation-contract";
import { computeFreshness } from "./observation-contract";
import { computeObservationContentHash } from "./observation-hash";
import {
  EUROSTAT_DISCLOSED_FLAGS,
  EUROSTAT_REJECT_FLAGS,
  EUROSTAT_SOURCE_KEY,
  EUROSTAT_TRANSFORM_VERSION,
  eurostatPeriodToWindow,
  isAllowedEurostatGeo,
  toObservationGeoCountry,
  type EurostatDatasetV1,
} from "./eurostat-source-v1";

// ── Outcome model (exact-sum accounting feeds import-session.ts) ────────────

export type EurostatCellRejectReason =
  | "value_missing"
  | "value_not_finite"
  | "value_suppressed"
  | "period_unparseable"
  | "geo_not_allowlisted";

export interface EurostatParsedCellV1 {
  readonly geoCode: string;
  readonly geoLabel: string;
  readonly period: string;
  readonly outcome:
    | { readonly kind: "candidate"; readonly observation: IntelligenceObservationV1 }
    | { readonly kind: "rejected"; readonly reason: EurostatCellRejectReason };
}

export type EurostatDatasetRejectReason =
  | "not_jsonstat_dataset"
  | "missing_dimension"
  | "dimension_drift"
  | "source_update_timestamp_missing"
  | "source_update_timestamp_invalid";

export type EurostatParseResult =
  | {
      readonly ok: true;
      readonly updatedIso: string;
      readonly datasetLabel: string;
      readonly cells: readonly EurostatParsedCellV1[];
    }
  | { readonly ok: false; readonly reason: EurostatDatasetRejectReason };

export interface EurostatParseInputV1 {
  /** Already-parsed JSON body of the official API response. */
  readonly body: unknown;
  readonly dataset: EurostatDatasetV1;
  /** The exact official request URL (provenance + sourceUrl). */
  readonly requestUrl: string;
  /** sha256 hex of the raw response body (computed by the import layer). */
  readonly responseSha256: string;
  /** Clock supplied by the caller — freshness derivation only. */
  readonly nowMs: number;
}

// ── JSON-stat helpers ────────────────────────────────────────────────────────

interface JsonStatDimension {
  readonly label?: string;
  readonly category: {
    readonly index?: Record<string, number> | readonly string[];
    readonly label?: Record<string, string>;
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** category.index can be an object (code → position) or an array. */
function categoryCodesInOrder(dim: JsonStatDimension): string[] {
  const index = dim.category.index;
  if (Array.isArray(index)) return [...index];
  if (isRecord(index)) {
    return Object.entries(index)
      .sort((a, b) => (a[1] as number) - (b[1] as number))
      .map(([code]) => code);
  }
  // Single-category dimensions may omit index entirely — the label object
  // then carries exactly one code.
  const label = dim.category.label;
  if (isRecord(label)) return Object.keys(label);
  return [];
}

function categoryLabel(dim: JsonStatDimension, code: string): string {
  const label = dim.category.label;
  if (isRecord(label) && typeof label[code] === "string") {
    return label[code] as string;
  }
  return code;
}

function readCell(
  container: unknown,
  flatIndex: number,
): number | string | null {
  if (Array.isArray(container)) {
    const v = container[flatIndex];
    return v === undefined ? null : (v as number | string | null);
  }
  if (isRecord(container)) {
    const v = container[String(flatIndex)];
    return v === undefined ? null : (v as number | string | null);
  }
  return null;
}

// ── The parser ───────────────────────────────────────────────────────────────

export function parseEurostatJsonStat(
  input: EurostatParseInputV1,
): EurostatParseResult {
  const { body, dataset } = input;
  if (!isRecord(body) || body.class !== "dataset" || !isRecord(body.dimension)) {
    return { ok: false, reason: "not_jsonstat_dataset" };
  }
  const dimIds = Array.isArray(body.id) ? (body.id as string[]) : null;
  const sizes = Array.isArray(body.size) ? (body.size as number[]) : null;
  if (!dimIds || !sizes || dimIds.length !== sizes.length) {
    return { ok: false, reason: "not_jsonstat_dataset" };
  }

  // The official publication timestamp is mandatory: it is capturedAt, the
  // hash identity anchor and the idempotency guarantee.
  const updatedRaw = body.updated;
  if (typeof updatedRaw !== "string" || updatedRaw.trim() === "") {
    return { ok: false, reason: "source_update_timestamp_missing" };
  }
  const updatedMs = Date.parse(updatedRaw);
  if (!Number.isFinite(updatedMs)) {
    return { ok: false, reason: "source_update_timestamp_invalid" };
  }
  const updatedIso = new Date(updatedMs).toISOString();

  const dimensions = body.dimension as Record<string, unknown>;
  const dims: Record<string, JsonStatDimension> = {};
  for (const id of dimIds) {
    const d = dimensions[id];
    if (!isRecord(d) || !isRecord(d.category)) {
      return { ok: false, reason: "missing_dimension" };
    }
    dims[id] = d as unknown as JsonStatDimension;
  }
  if (!dimIds.includes("geo") || !dimIds.includes("time")) {
    return { ok: false, reason: "missing_dimension" };
  }

  // Pinned-dimension drift check: every pinned dimension must resolve to
  // EXACTLY the pinned code (freq is implied by the dataset's cadence and
  // checked when present).
  for (const [dimId, pinnedCode] of Object.entries(dataset.pinnedDimensions)) {
    const dim = dims[dimId];
    if (!dim) return { ok: false, reason: "missing_dimension" };
    const codes = categoryCodesInOrder(dim);
    if (codes.length !== 1 || codes[0] !== pinnedCode) {
      return { ok: false, reason: "dimension_drift" };
    }
  }

  const geoCodes = categoryCodesInOrder(dims.geo);
  const timeCodes = categoryCodesInOrder(dims.time);

  // Flat-index math: position multipliers per JSON-stat 2.0 row-major order.
  const multipliers: number[] = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i -= 1) {
    multipliers[i] = multipliers[i + 1] * sizes[i + 1];
  }
  const positionOf = (dimId: string, code: string): number =>
    categoryCodesInOrder(dims[dimId]).indexOf(code);

  const pinnedIdentity = Object.entries(dataset.pinnedDimensions)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  const datasetLabel =
    typeof body.label === "string" ? body.label : dataset.officialTitle;

  const cells: EurostatParsedCellV1[] = [];

  for (const geoCode of geoCodes) {
    const geoLabel = categoryLabel(dims.geo, geoCode);
    for (const period of timeCodes) {
      const reject = (
        reason: EurostatCellRejectReason,
      ): EurostatParsedCellV1 => ({
        geoCode,
        geoLabel,
        period,
        outcome: { kind: "rejected", reason },
      });

      if (!isAllowedEurostatGeo(geoCode)) {
        cells.push(reject("geo_not_allowlisted"));
        continue;
      }
      const window = eurostatPeriodToWindow(period);
      if (window === null) {
        cells.push(reject("period_unparseable"));
        continue;
      }

      let flatIndex = 0;
      let indexOk = true;
      for (let i = 0; i < dimIds.length; i += 1) {
        const dimId = dimIds[i];
        const code =
          dimId === "geo"
            ? geoCode
            : dimId === "time"
              ? period
              : categoryCodesInOrder(dims[dimId])[0];
        const pos = positionOf(dimId, code);
        if (pos < 0) {
          indexOk = false;
          break;
        }
        flatIndex += pos * multipliers[i];
      }
      if (!indexOk) {
        cells.push(reject("value_missing"));
        continue;
      }

      const statusRaw = readCell(body.status, flatIndex);
      const statusFlag =
        typeof statusRaw === "string" && statusRaw.trim() !== ""
          ? statusRaw.trim()
          : null;
      if (statusFlag !== null && EUROSTAT_REJECT_FLAGS.has(statusFlag)) {
        cells.push(reject("value_suppressed"));
        continue;
      }

      const valueRaw = readCell(body.value, flatIndex);
      if (valueRaw === null) {
        // A missing value stays missing — NEVER zero.
        cells.push(reject("value_missing"));
        continue;
      }
      const value = typeof valueRaw === "number" ? valueRaw : Number.NaN;
      if (!Number.isFinite(value)) {
        cells.push(reject("value_not_finite"));
        continue;
      }

      const provenance: { step: string; ref: string }[] = [
        { step: "official_api_request", ref: input.requestUrl.slice(0, 400) },
        {
          step: "dataset",
          ref: `${dataset.code} — ${datasetLabel}`.slice(0, 400),
        },
        {
          step: "dimensions",
          ref: `${pinnedIdentity},geo=${geoCode},time=${period}`.slice(0, 400),
        },
        { step: "geo_label", ref: `${geoCode} — ${geoLabel}`.slice(0, 400) },
        { step: "source_updated", ref: updatedIso },
        { step: "response_sha256", ref: input.responseSha256 },
        { step: "parser", ref: `${EUROSTAT_TRANSFORM_VERSION}/jsonstat2` },
      ];
      if (statusFlag !== null) {
        const meaning = EUROSTAT_DISCLOSED_FLAGS[statusFlag] ?? "unknown_flag";
        provenance.push({
          step: "status_flag",
          ref: `${statusFlag}=${meaning}`,
        });
      }

      const identity = {
        subjectKind: "geo_market" as const,
        subjectId: geoCode,
        metricKey: dataset.metricKey,
        geo: {
          country: toObservationGeoCountry(geoCode),
          region: null,
          city: null,
        },
        window,
        valueNumeric: value,
        unit: dataset.unit,
        statMethod: dataset.statMethod,
        sourceKind: "public_official" as const,
        sourceKey: EUROSTAT_SOURCE_KEY,
        capturedAt: updatedIso,
        transformVersion: EUROSTAT_TRANSFORM_VERSION,
      };

      const observation: IntelligenceObservationV1 = {
        ...identity,
        sourceUrl: input.requestUrl.slice(0, 2000),
        derivationIds: [],
        validFrom: updatedIso,
        validTo: null,
        sampleSize: null,
        confidence: null,
        privacyClass: "public_aggregate",
        freshnessStatus: computeFreshness(
          updatedIso,
          input.nowMs,
          dataset.freshnessSlaDays,
        ),
        provenance,
        contentHash: computeObservationContentHash(identity),
      };

      cells.push({
        geoCode,
        geoLabel,
        period,
        outcome: { kind: "candidate", observation },
      });
    }
  }

  return { ok: true, updatedIso, datasetLabel, cells };
}
