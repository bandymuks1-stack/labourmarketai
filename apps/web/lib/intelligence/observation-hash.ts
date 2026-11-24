/**
 * Observation content hash — deterministic sha256 over the IDENTITY fields
 * of an intelligence observation (see ./observation-contract.ts).
 *
 * The hash makes an observation content-addressable: the same source figure
 * captured twice hashes identically (idempotent ingest / dedupe), and any
 * change to the value, window, geography or method yields a new hash.
 *
 * Pure logic over node:crypto — imported only from server/test code, never
 * from client components.
 */
import { createHash } from "node:crypto";

import type {
  ObservationGeo,
  ObservationSourceKind,
  ObservationStatMethod,
  ObservationSubjectKind,
  ObservationWindow,
} from "./observation-contract";

/** The identity fields that define WHAT was observed (not how fresh it is). */
export interface ObservationIdentityFields {
  readonly subjectKind: ObservationSubjectKind;
  readonly subjectId: string;
  readonly metricKey: string;
  readonly geo: ObservationGeo;
  readonly window: ObservationWindow;
  readonly valueNumeric: number;
  readonly unit: string;
  readonly statMethod: ObservationStatMethod;
  readonly sourceKind: ObservationSourceKind;
  readonly sourceKey: string;
  readonly capturedAt: string;
  readonly transformVersion: string;
}

/** JSON stringify with recursively sorted object keys — key order can never
 *  change the hash. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 hex over the stable serialization of the identity fields. */
export function computeObservationContentHash(
  obs: ObservationIdentityFields,
): string {
  // Explicit field pick — extra properties on a wider object never leak in.
  const identity = {
    subjectKind: obs.subjectKind,
    subjectId: obs.subjectId,
    metricKey: obs.metricKey,
    geo: { country: obs.geo.country, region: obs.geo.region, city: obs.geo.city },
    window: { start: obs.window.start, end: obs.window.end },
    valueNumeric: obs.valueNumeric,
    unit: obs.unit,
    statMethod: obs.statMethod,
    sourceKind: obs.sourceKind,
    sourceKey: obs.sourceKey,
    capturedAt: obs.capturedAt,
    transformVersion: obs.transformVersion,
  };
  return createHash("sha256").update(stableStringify(identity)).digest("hex");
}
