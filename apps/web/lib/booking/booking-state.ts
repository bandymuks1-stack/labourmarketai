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
 * Derived DISPLAY states (booking clarity, PR 5) — DISPLAY-ONLY, never a
 * status write. The canonical contract (§4) reserves `expired` with NO
 * writer; this helper never fakes one. A proposal that sat unanswered for
 * STALE_AFTER_DAYS+ days stays `proposed` in the DB (that is the truth) —
 * the UI merely labels it honestly as "no response yet", NOT "expired".
 * Terminal statuses pass through unchanged.
 */
export const STALE_AFTER_DAYS = 14;

export type BookingDisplayState =
  | "awaiting_response" // proposed, younger than STALE_AFTER_DAYS
  | "no_response_stale" // proposed, unanswered for STALE_AFTER_DAYS+ days
  | Exclude<BookingStatus, "proposed">; // terminal DB truth, passed through

/**
 * Pure derived display state for one booking row (no I/O, no writes).
 * `createdAt` is the row's `created_at` (listMyBookings returns it as
 * `createdAt`); `updated_at` is stamped by respond/withdraw so it moves on
 * terminal transitions — proposal age must be measured from creation.
 * Unparseable timestamps degrade to `awaiting_response` (never claim
 * staleness without a provable age). Boundary: exactly STALE_AFTER_DAYS
 * days old is already stale (age >= threshold).
 */
export function deriveBookingDisplayState(
  booking: { readonly status: BookingStatus; readonly createdAt: string },
  nowIso: string,
): BookingDisplayState {
  if (booking.status !== "proposed") return booking.status;
  const created = Date.parse(booking.createdAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(created) || Number.isNaN(now)) return "awaiting_response";
  const staleMs = STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return now - created >= staleMs ? "no_response_stale" : "awaiting_response";
}

/**
 * Repeat action (Capability G, PR 6b): whether the PROPOSING company may
 * re-open this booking with new dates ("propose again"). Pure and
 * default-closed: ONLY the two closed-by-the-other-side-or-self terminal
 * statuses the UI actually reaches — `declined` (worker said no) and
 * `withdrawn` (company took it back). Never `proposed` (still open — withdraw
 * instead), never `accepted` (a real engagement — message/plan instead), and
 * never `expired` (unreachable, no scheduler writes it — see the lifecycle
 * guard). The applied propose RPC upserts on (owner_id, request_id,
 * worker_id) and re-opens such a row back to `proposed` with the new dates —
 * so "propose again" is the EXISTING propose flow pre-scoped to the same
 * request + worker; the worker decides again.
 */
export function canProposeAgain(status: BookingStatus): boolean {
  return status === "declined" || status === "withdrawn";
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
