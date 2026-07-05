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

/**
 * Contact permission states (§8.1 — product-tree branch 20).
 *
 * EVERY direct (1:1) conversation open must map to exactly one of these
 * states. Each `allowed_*` state names the REAL relationship that grants the
 * permission — there is no generic "allowed", so the source of a permission
 * is always traceable:
 *
 *   - allowed_existing_conversation — the two profiles already share an
 *     unrevoked direct conversation (opened through a gated path earlier);
 *     reopening it is always permitted.
 *   - allowed_engagement — a real employment/engagement link exists
 *     (company_workers row, or the worker's own accepted invitation
 *     resolving this company owner as their employer).
 *   - allowed_scouting_shortlist — the Step 4A scouting gate held: the
 *     caller owns the demand, the worker is shortlisted (not `not_fit`),
 *     and the worker is contactable (evaluateCommunicationRequest above).
 *   - allowed_admin — the caller carries the real admin signal (support /
 *     matching workbench paths; admin participation is already RLS-visible).
 *   - no_permission — the default. No relationship → no contact.
 *
 * Default-closed and pure: unknown/missing facts always resolve to
 * `no_permission`. No contact channel (phone/email) is EVER involved — a
 * permission only ever opens an IN-APP conversation.
 */
export type ContactPermissionState =
  | "allowed_existing_conversation"
  | "allowed_engagement"
  | "allowed_scouting_shortlist"
  | "allowed_admin"
  | "no_permission";

/** The full enumeration — guard-pinned so no state appears or vanishes silently. */
export const CONTACT_PERMISSION_STATES: readonly ContactPermissionState[] = [
  "allowed_existing_conversation",
  "allowed_engagement",
  "allowed_scouting_shortlist",
  "allowed_admin",
  "no_permission",
];

export interface ContactPermissionFacts {
  /** The two profiles already share an unrevoked direct conversation. */
  readonly sharesConversation: boolean;
  /** A real employment/engagement link exists between the two profiles. */
  readonly hasEngagement: boolean;
  /** The Step 4A scouting gate (owner + shortlisted + contactable) held. */
  readonly scoutingAllowed: boolean;
  /** The caller carries the real admin signal (deriveIsAdmin). */
  readonly isAdmin: boolean;
}

/**
 * Resolve the single contact-permission state from verified facts.
 * Precedence is most-established-relationship first; any all-false input
 * lands on `no_permission` (default-closed).
 */
export function evaluateContactPermission(
  facts: ContactPermissionFacts,
): ContactPermissionState {
  if (facts.sharesConversation) return "allowed_existing_conversation";
  if (facts.hasEngagement) return "allowed_engagement";
  if (facts.scoutingAllowed) return "allowed_scouting_shortlist";
  if (facts.isAdmin) return "allowed_admin";
  return "no_permission";
}

/** True only for the explicit allowed_* states — never for anything else. */
export function isContactPermitted(
  state: ContactPermissionState | null | undefined,
): boolean {
  return !!state && state !== "no_permission";
}
