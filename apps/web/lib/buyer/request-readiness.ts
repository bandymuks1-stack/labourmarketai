/**
 * Buyer Request Understanding Center v1 — deterministic manual-review
 * readiness helper.
 *
 * This is NOT AI, NOT OCR, NOT verification, NOT matching. It is pure,
 * transparent product logic computed only from real request +
 * attachment metadata the buyer already provided:
 *   - whether the request carries a useful description, and
 *   - how many attachments exist.
 *
 * It produces ONE visible readiness status and ONE clear next action
 * so the buyer dashboard can show an honest workflow:
 *
 *   buyer request → attached files → manual-review readiness → next action
 *
 * Determinism: same inputs → same output, with no clock, no network,
 * no randomness. Safe to unit-test and (later) move into a background
 * job without behaviour change.
 */

/** The four manual-review readiness states (sprint §4). */
export type RequestReadinessStatus =
  | "no_files"
  | "files_added"
  | "enough_for_manual_review"
  | "needs_more_info";

/** The single buyer-facing next action (sprint §5). */
export type RequestNextAction =
  | "add_first_file"
  | "add_more_project_details"
  | "administrator_will_review";

export interface RequestReadinessInput {
  /**
   * The request's useful free text (need summary / description). Title
   * alone is intentionally NOT counted as a description — a one-word
   * title does not give a human reviewer enough to act on.
   */
  readonly description: string | null | undefined;
  /** Number of attachments currently persisted for this request. */
  readonly attachmentCount: number;
}

export interface RequestReadiness {
  readonly status: RequestReadinessStatus;
  readonly nextAction: RequestNextAction;
  readonly hasFiles: boolean;
  readonly hasUsefulDescription: boolean;
}

/**
 * Minimum trimmed length for a description to count as "useful" for a
 * human reviewer. Kept deliberately low so a genuine one-sentence brief
 * qualifies, but an empty/near-empty field does not.
 */
export const MIN_USEFUL_DESCRIPTION_LENGTH = 20;

/** Pure predicate: does this free text give a reviewer something to act on? */
export function hasUsefulDescription(
  text: string | null | undefined,
  minLength: number = MIN_USEFUL_DESCRIPTION_LENGTH,
): boolean {
  if (typeof text !== "string") return false;
  return text.trim().length >= minLength;
}

/**
 * Compute the deterministic manual-review readiness for one request.
 *
 * Truth table (the two real signals are independent booleans, so all
 * four states are reachable and mutually exclusive):
 *
 *   hasFiles | hasUsefulDescription | status                   | nextAction
 *   ---------+----------------------+--------------------------+--------------------------
 *   false    | false                | no_files                 | add_first_file
 *   false    | true                 | needs_more_info          | add_first_file
 *   true     | false                | files_added              | add_more_project_details
 *   true     | true                 | enough_for_manual_review | administrator_will_review
 */
export function computeRequestReadiness(
  input: RequestReadinessInput,
): RequestReadiness {
  const hasFiles = Number.isFinite(input.attachmentCount)
    ? input.attachmentCount > 0
    : false;
  const usefulDescription = hasUsefulDescription(input.description);

  let status: RequestReadinessStatus;
  let nextAction: RequestNextAction;

  if (hasFiles && usefulDescription) {
    status = "enough_for_manual_review";
    nextAction = "administrator_will_review";
  } else if (hasFiles && !usefulDescription) {
    status = "files_added";
    nextAction = "add_more_project_details";
  } else if (!hasFiles && usefulDescription) {
    status = "needs_more_info";
    nextAction = "add_first_file";
  } else {
    status = "no_files";
    nextAction = "add_first_file";
  }

  return {
    status,
    nextAction,
    hasFiles,
    hasUsefulDescription: usefulDescription,
  };
}
