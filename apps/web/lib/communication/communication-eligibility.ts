/**
 * Communication request eligibility (Step 4A) — PURE decision logic.
 *
 * Gates whether a company may open an in-app conversation with a worker it
 * scouted. Three facts, all verified server-side before this runs:
 *   - ownsDemand   — the request belongs to the caller (customer_requests).
 *   - shortlisted  — the worker is on the caller's shortlist for that demand
 *                    (a deliberate company action; not a random worker).
 *   - canContact   — the worker is contactable per the Step 3A rule
 *                    (canStartCommunicationOrBooking: free schedule OR a
 *                    concrete available-from date).
 *
 * Default-closed: any missing fact denies. No contact data is involved — this
 * only decides whether an IN-APP conversation may be opened (no phone/email).
 * Pure, no IO, deterministic — unit-tested.
 */
export type CommunicationRequestDecision =
  | "allowed"
  | "not_owner"
  | "not_shortlisted"
  | "not_contactable";

export interface CommunicationRequestFacts {
  readonly ownsDemand: boolean;
  readonly shortlisted: boolean;
  readonly canContact: boolean;
}

export function evaluateCommunicationRequest(
  facts: CommunicationRequestFacts,
): CommunicationRequestDecision {
  if (!facts.ownsDemand) return "not_owner";
  if (!facts.shortlisted) return "not_shortlisted";
  if (!facts.canContact) return "not_contactable";
  return "allowed";
}

/**
 * A shortlist status counts as "shortlisted" for communication when it exists
 * and is not an explicit rejection. `not_fit` (or no row) means the company has
 * not chosen to engage this worker, so communication stays closed.
 */
export function isShortlistedForContact(status: string | null | undefined): boolean {
  return !!status && status !== "not_fit";
}
