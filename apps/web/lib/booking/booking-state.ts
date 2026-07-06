/**
 * Booking request — INERT typed state machine (Step 4B decision prep).
 *
 * This is the typed contract the future booking feature will implement. It is
 * PURE and INERT: no IO, no DB, no network, and NOT wired into any page/route
 * yet. Persistence (a `booking_requests` table + RLS) is an owner-gated
 * decision — see docs/audits/communication-booking/STEP_4B_BOOKING_DECISION.md.
 * Shipping this now lets the state model be reviewed and unit-tested without
 * touching production.
 *
 * Honesty: a booking is only ever "accepted" by a real WORKER action — never
 * auto-confirmed by the company or the system. No contact data lives here.
 */

export type BookingStatus =
  | "proposed" // company proposed a booking to a shortlisted, contactable worker
  | "accepted" // the WORKER accepted (real action only)
  | "declined" // the worker declined
  | "withdrawn" // the company withdrew the proposal
  | "expired"; // the proposal lapsed (system)

export type BookingActor = "company" | "worker" | "system";

export const BOOKING_TERMINAL: readonly BookingStatus[] = [
  "accepted",
  "declined",
  "withdrawn",
  "expired",
];

/** Allowed transitions: from → { to → actor permitted to make it }. */
const TRANSITIONS: Readonly<Record<BookingStatus, ReadonlyArray<{ to: BookingStatus; by: BookingActor }>>> = {
  proposed: [
    { to: "accepted", by: "worker" }, // only the worker may accept
    { to: "declined", by: "worker" },
    { to: "withdrawn", by: "company" },
    { to: "expired", by: "system" },
  ],
  accepted: [],
  declined: [],
  withdrawn: [],
  expired: [],
};

export function isTerminalBooking(status: BookingStatus): boolean {
  return BOOKING_TERMINAL.includes(status);
}

/** Whether `actor` may move a booking from `from` to `to`. Default-closed. */
export function canTransitionBooking(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingActor,
): boolean {
  return TRANSITIONS[from].some((t) => t.to === to && t.by === actor);
}

/** The statuses `actor` may move `from` into (empty for terminal/none). */
export function nextBookingStatuses(from: BookingStatus, actor: BookingActor): BookingStatus[] {
  return TRANSITIONS[from].filter((t) => t.by === actor).map((t) => t.to);
}

/** The inert booking-request record shape (matches the proposed table). */
export interface BookingRequestRecord {
  readonly id: string;
  readonly ownerId: string; // company profile that proposed
  readonly requestId: string; // customer_requests.id (the demand)
  readonly workerId: string; // workers.id (no profile/contact stored here)
  readonly status: BookingStatus;
  readonly startDate: string | null; // ISO date — proposed engagement start
  readonly note: string | null; // company note (<= 2000 chars)
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Pure "responses since last seen" compute (no I/O — unit-testable), audit
 * PR5. Counts the caller's OWN proposals that the WORKER moved to a response
 * status (accepted/declined) after `seenAt` — the respond RPC stamps
 * updated_at on exactly that transition. The caller's own actions (propose /
 * withdraw) never count; NaN-safe timestamp comparison, never fabricated.
 */
export function countOwnerResponsesSince(
  rows: readonly { status: BookingStatus; isOwner: boolean; updatedAt: string }[],
  seenAt: string,
): number {
  const seen = Date.parse(seenAt);
  if (Number.isNaN(seen)) return 0;
  return rows.filter((r) => {
    if (!r.isOwner) return false;
    if (r.status !== "accepted" && r.status !== "declined") return false;
    const ts = Date.parse(r.updatedAt);
    return !Number.isNaN(ts) && ts > seen;
  }).length;
}
