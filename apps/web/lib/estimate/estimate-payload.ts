/**
 * Estimate <-> customer_requests.payload bridge.
 *
 * The estimate is stored INSIDE the existing `customer_requests.payload` jsonb
 * (key `estimate`) — no schema/migration. The server recomputes the result from
 * the user's inputs (never trusts a client-sent total) so the stored figure is
 * authoritative and deterministic. Reading is tolerant: older requests with no
 * estimate simply parse to null and the UI omits the section.
 *
 * Pure + isomorphic.
 */
import {
  ESTIMATE_VERSION,
  computeEstimate,
  estimateAssumptionKeys,
  estimateMissingInfoKeys,
  hasMeaningfulEstimate,
  validateEstimateInputs,
  type EstimateInputs,
  type EstimateResult,
} from "./estimate";

export interface StoredEstimate {
  readonly version: number;
  readonly inputs: EstimateInputs;
  readonly result: EstimateResult;
  /** Assumption keys (UI maps to localized text). */
  readonly assumptions: string[];
  /** Missing-info keys (UI maps to localized text). */
  readonly missingInfo: string[];
}

/**
 * Build the stored estimate from raw inputs, recomputing the result server-side.
 * Returns null when the user entered nothing worth saving (estimate is optional).
 * Returns null too when invalid — callers should have already validated and
 * blocked; this is the last line so a bad estimate is never persisted.
 */
export function buildEstimatePayload(inputs: EstimateInputs): StoredEstimate | null {
  if (!hasMeaningfulEstimate(inputs)) return null;
  if (validateEstimateInputs(inputs, true).length > 0) return null;
  return {
    version: ESTIMATE_VERSION,
    inputs,
    result: computeEstimate(inputs),
    assumptions: estimateAssumptionKeys(inputs),
    missingInfo: estimateMissingInfoKeys(inputs),
  };
}

/** Tolerant read of a stored estimate from a request payload. Null for older
 *  rows / malformed data — the UI must never break on a missing estimate. */
export function parseStoredEstimate(payload: unknown): StoredEstimate | null {
  if (!payload || typeof payload !== "object") return null;
  const est = (payload as Record<string, unknown>).estimate;
  if (!est || typeof est !== "object") return null;
  const e = est as Record<string, unknown>;
  const result = e.result;
  if (!result || typeof result !== "object") return null;
  const total = (result as Record<string, unknown>).estimatedTotal;
  if (typeof total !== "number" || !Number.isFinite(total)) return null;
  return {
    version: typeof e.version === "number" ? e.version : 0,
    inputs: (e.inputs ?? {}) as EstimateInputs,
    result: result as EstimateResult,
    assumptions: Array.isArray(e.assumptions) ? (e.assumptions as string[]) : [],
    missingInfo: Array.isArray(e.missingInfo) ? (e.missingInfo as string[]) : [],
  };
}
