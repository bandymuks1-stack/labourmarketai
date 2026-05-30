"use server";

/**
 * Thin server-action wrapper around the pilot-request submit (the client
 * `PilotRequestButton` imports THIS so Next.js wires the action correctly).
 * The raw helper lives in `./pilot-request.ts`.
 */
import "server-only";
import {
  submitPilotRequest as _submitPilotRequest,
  type PilotIntent,
  type PilotRequestResult,
} from "./pilot-request";

export async function submitPilotRequestAction(
  intent: PilotIntent,
): Promise<PilotRequestResult> {
  return _submitPilotRequest(intent);
}
