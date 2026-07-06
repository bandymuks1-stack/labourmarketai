/**
 * State-driven dashboard top slot (audit PR6 — mobile dashboard hierarchy).
 *
 * Pure priority decision: from the worker overview's REAL loaded counts,
 * exactly ONE thing may claim the above-the-fold slot. The order encodes the
 * audit's per-user-state priority (§11): a pending invitation is the
 * strongest possible state (someone real is waiting on this person), then an
 * accepted request (the other party said yes — act now), then things waiting
 * on the user's response, then passive news, then the new-user next action.
 *
 * No DB, no IO — the page loads all counts server-side already; this module
 * only orders them. Every kind maps to a card that links to a route which
 * really exists (the same count-gated cards the dashboard already renders —
 * PR4/PR5 verified targets). `null` means nothing urgent: the work card
 * leads and no slot is rendered — never a fake "all good" banner.
 */

export type TopSlotKind =
  | "invitation"
  | "accepted_request"
  | "incoming_service_request"
  | "incoming_booking"
  | "booking_response"
  | "new_user";

export interface TopSlotSignals {
  /** Pending company/agency invitations addressed to this user's email. */
  readonly pendingInvitations: number;
  /** The caller's own outgoing service requests the provider ACCEPTED. */
  readonly acceptedOutgoing: number;
  /** Open ('sent') incoming service requests waiting for this provider. */
  readonly pendingIncomingServiceRequests: number;
  /** Pending incoming booking proposals waiting for this worker. */
  readonly pendingIncomingBookings: number;
  /** Accept/decline responses to the caller's own proposals since last seen. */
  readonly bookingResponsesNew: number;
  /** First-use window: no profession or no journal entries yet. */
  readonly isFirstUse: boolean;
}

/** Highest-priority state first; `null` = no slot (work card leads). */
export function decideTopSlot(s: TopSlotSignals): TopSlotKind | null {
  if (s.pendingInvitations > 0) return "invitation";
  if (s.acceptedOutgoing > 0) return "accepted_request";
  if (s.pendingIncomingServiceRequests > 0) return "incoming_service_request";
  if (s.pendingIncomingBookings > 0) return "incoming_booking";
  if (s.bookingResponsesNew > 0) return "booking_response";
  if (s.isFirstUse) return "new_user";
  return null;
}
