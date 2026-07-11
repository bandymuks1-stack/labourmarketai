"use server";

/**
 * Thin server-action wrapper around the demand-request submit (the client
 * `DemandRequestButton` imports THIS so Next.js wires the action correctly).
 * The raw helper lives in `./demand-request.ts`.
 */
import "server-only";
import {
  submitDemandRequest as _submitDemandRequest,
  getOwnLastDemandPrefill as _getOwnLastDemandPrefill,
  type DemandIntent,
  type DemandFields,
  type DemandPrefill,
  type DemandRequestResult,
} from "./demand-request";

export async function submitDemandRequestAction(
  intent: DemandIntent,
  fields: DemandFields,
): Promise<DemandRequestResult> {
  return _submitDemandRequest(intent, fields);
}

/** Duplicate-and-edit: fetch the owner's own last request as prefill values. */
export async function getOwnLastDemandPrefillAction(
  intent: DemandIntent,
): Promise<DemandPrefill> {
  return _getOwnLastDemandPrefill(intent);
}
