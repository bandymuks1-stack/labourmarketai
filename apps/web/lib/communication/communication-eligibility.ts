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
 *   - allowed_accepted_service_request — the marketplace loop's one real
 *     mutual commitment: the caller is buyer or provider of a
 *     service_offering_request whose status is `accepted` (verified
 *     server-side by the marketplace action, passed as a grant — audit PR4:
 *     accepted rows must open the next step).
 *   - allowed_demand_interest — an ACTIVE (not withdrawn) interest signal
 *     links the two parties over a real demand. The grant is bidirectional
 *     because the underlying relationship is the same fact seen from either
 *     end: (a) company → worker: the worker signalled interest on the
 *     caller's demand (ownership verified server-side by the
 *     contact-interested-worker action — audit PR5: "contacted" must open a
 *     real thread, never claim contact that no surface mediated);
 *     (b) worker → demand owner: the caller's OWN interest signal on an open
 *     demand of a verified company (facts verified server-side by the
 *     contact-employer action — canonical-journey P1: the worker journey must
 *     not dead-end in a waiting room after "interested").
 *   - allowed_accepted_booking — the booking loop's real mutual commitment:
 *     the caller is the proposing company or the booked worker of a
 *     booking_request whose status is `accepted` (verified server-side by
 *     the booking action, passed as a grant — booking lifecycle v1:
 *     an accepted booking must open the conversation, never dead-end).
 *   - allowed_agency_connection — the agency ↔ client bridge's one mutual
 *     consent (2026-09-24): the caller's ACTIVE workspace company and the
 *     counterpart's share an `agency_client_connections` row whose status
 *     is `active` — the agency invited, the client accepted under its own
 *     e-mail. Verified server-side by the bridge action
 *     (lib/agency/bridge-conversation.ts: the row read under RLS, the
 *     status re-checked, the caller's side resolved through the
 *     membership-validated employer context, the counterpart being the
 *     other side's consenting person) and passed as a grant exactly like
 *     allowed_accepted_booking. Never resolved from generic facts here —
 *     see evaluateAgencyConnectionContact below for the pure decision.
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
  | "allowed_accepted_service_request"
  | "allowed_demand_interest"
  | "allowed_accepted_booking"
  | "allowed_marketplace_enquiry"
  | "allowed_agency_connection"
  | "allowed_admin"
  | "no_permission";

/** The full enumeration — guard-pinned so no state appears or vanishes silently. */
export const CONTACT_PERMISSION_STATES: readonly ContactPermissionState[] = [
  "allowed_existing_conversation",
  "allowed_engagement",
  "allowed_scouting_shortlist",
  "allowed_accepted_service_request",
  "allowed_demand_interest",
  "allowed_accepted_booking",
  "allowed_marketplace_enquiry",
  "allowed_agency_connection",
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

/**
 * Worker → demand owner contact eligibility (canonical-journey P1) — PURE
 * decision logic, the worker-side mirror of `evaluateCommunicationRequest`.
 *
 * Gates whether a worker may open the in-app conversation with the owner of
 * a demand. Three facts, all verified server-side before this runs:
 *   - hasOwnActiveSignal — the CALLER's own interest signal on this demand
 *     exists and is not withdrawn (the worker's deliberate action; RLS-read
 *     under the caller's own session).
 *   - demandOpen        — the demand is still open to workers
 *                         (customer_requests.status = 'submitted', the same
 *                         gate list_open_demand_for_workers applies).
 *   - companyVerified   — the demand owner is a verified company (same join
 *                         the worker board RPC enforces; an unverified owner
 *                         was never visible to the worker in the first place).
 *
 * Default-closed: any missing fact denies. No contact data is involved — this
 * only decides whether an IN-APP conversation may be opened (no phone/email).
 */
export type WorkerContactDecision =
  | "allowed"
  | "no_interest"
  | "demand_closed"
  | "company_unverified";

export interface WorkerContactFacts {
  readonly hasOwnActiveSignal: boolean;
  readonly demandOpen: boolean;
  readonly companyVerified: boolean;
}

export function evaluateWorkerContactRequest(
  facts: WorkerContactFacts,
): WorkerContactDecision {
  if (!facts.hasOwnActiveSignal) return "no_interest";
  if (!facts.demandOpen) return "demand_closed";
  if (!facts.companyVerified) return "company_unverified";
  return "allowed";
}

/**
 * Agency ↔ client contact eligibility (2026-09-24) — PURE decision logic
 * behind the `allowed_agency_connection` grant.
 *
 * Gates whether one side of an agency ↔ client connection may open the
 * in-app conversation with the other. Two facts, both verified server-side
 * by the bridge action before this runs:
 *   - connectionStatus — the `agency_client_connections` row's status; only
 *                        `active` (invited AND accepted) counts. A pending,
 *                        declined or revoked row grants nothing — and so
 *                        does a row that could not be read (null).
 *   - callerCompanyId  — the caller's ACTIVE workspace company, resolved by
 *                        the membership-validated employer context, never a
 *                        form field. It must be exactly one of the two
 *                        companies on the row; any other organization —
 *                        including one that owns a DIFFERENT active
 *                        connection with the same agency — is not a party.
 *
 * Default-closed: any missing fact denies. No contact data is involved —
 * this only decides whether an IN-APP conversation may be opened.
 */
export type AgencyConnectionContactDecision =
  | "allowed"
  | "connection_not_active"
  | "not_a_party";

export interface AgencyConnectionContactFacts {
  readonly connectionStatus: string | null | undefined;
  readonly callerCompanyId: string | null | undefined;
  readonly agencyCompanyId: string | null | undefined;
  readonly clientCompanyId: string | null | undefined;
}

/** Which side of the connection the caller's company is, or null when it
 *  is neither. Pure; does not look at the status. */
export function agencyConnectionSide(
  facts: AgencyConnectionContactFacts,
): "agency" | "client" | null {
  const caller = (facts.callerCompanyId ?? "").trim();
  if (!caller) return null;
  if (facts.agencyCompanyId && caller === facts.agencyCompanyId) return "agency";
  if (facts.clientCompanyId && caller === facts.clientCompanyId) return "client";
  return null;
}

export function evaluateAgencyConnectionContact(
  facts: AgencyConnectionContactFacts,
): AgencyConnectionContactDecision {
  if (facts.connectionStatus !== "active") return "connection_not_active";
  if (agencyConnectionSide(facts) === null) return "not_a_party";
  return "allowed";
}
