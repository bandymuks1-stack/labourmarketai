"use server";

/**
 * Thin server-action wrapper around the demand-request submit (the client
 * `DemandRequestButton` imports THIS so Next.js wires the action correctly).
 * The raw helper lives in `./demand-request.ts`.
 */
import "server-only";
import {
  submitDemandRequest as _submitDemandRequest,
  type DemandIntent,
  type DemandFields,
  type DemandRequestResult,
} from "./demand-request";

export async function submitDemandRequestAction(
  intent: DemandIntent,
  fields: DemandFields,
): Promise<DemandRequestResult> {
  return _submitDemandRequest(intent, fields);
}
