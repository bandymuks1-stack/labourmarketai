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
 * Reason capture vocabularies (booking UX compat, P2-PR6) — pinned VERBATIM
 * to the owner-gated lifecycle-v2 contract (draft migration
 * 20260711290000_booking_lifecycle_v2.sql). Closed sets: the RPCs reject any
 * other kind, so the UI never offers one. A reason is always OPTIONAL — the
 * v1 flow (no reason) keeps working unchanged.
 */
export const DECLINE_REASON_KINDS = [
  "dates_unsuitable",
  "conditions_unsuitable",
  "already_booked",
  "other",
] as const;
export type DeclineReasonKind = (typeof DECLINE_REASON_KINDS)[number];

export const WITHDRAW_REASON_KINDS = [
  "position_filled",
  "need_changed",
  "dates_changed",
  "other",
] as const;
export type WithdrawReasonKind = (typeof WITHDRAW_REASON_KINDS)[number];

/** Contract bound: reason_note is CHECK-constrained to <= 500 chars. */
export const REASON_NOTE_MAX = 500;

export interface BookingReason {
  readonly kind: string;
  readonly note: string | null;
}

/**
 * Pure, default-closed reason normalizer. Returns null (= "no reason chosen",
 * take the v1 path) unless `kind` is a member of the closed vocabulary. The
 * note rides along ONLY with a valid kind, trimmed and bounded to
 * REASON_NOTE_MAX — a note alone never invents a reason.
 */
export function normalizeBookingReason(
  kind: string | null | undefined,
  note: string | null | undefined,
  allowed: readonly string[],
): BookingReason | null {
  const k = (kind ?? "").trim();
  if (k.length === 0 || !allowed.includes(k)) return null;
  const n = (note ?? "").trim().slice(0, REASON_NOTE_MAX);
  return { kind: k, note: n.length > 0 ? n : null };
}

/**
 * Reschedule affordance (P2-PR6): ONLY an open `proposed` row may have its
 * dates changed by the proposing company. Default-closed for every other
 * status — an ACCEPTED booking is never mutated in place (changing an
 * accepted engagement = withdraw + new proposal, visible in events), and a
 * closed row has nothing to reschedule.
 */
export function canRescheduleProposal(status: BookingStatus): boolean {
  return status === "proposed";
}

/**
 * Whether an owner-set response deadline (ISO date, date-only) is past-due.
 * "Respond by 2026-07-11" stays open through that whole day and is past-due
 * from the next day — the same semantics the lifecycle-v2 contract uses
 * server-side (deadline < current_date). NaN-safe: an absent or unparseable
 * deadline is never claimed past-due.
 */
export function isResponseDeadlinePast(
  deadline: string | null | undefined,
  nowIso: string,
): boolean {
  if (!deadline) return false;
  const d = Date.parse(deadline);
  const now = Date.parse(nowIso);
  if (Number.isNaN(d) || Number.isNaN(now)) return false;
  const dayMs = 24 * 60 * 60 * 1000;
  return now >= d + dayMs;
}

/**
 * Display state including the (optional, future-column) response deadline:
 * a `proposed` row whose deadline is past-due prefers the EXISTING honest
 * stale display state ("no response yet") even when younger than
 * STALE_AFTER_DAYS. Display-only, like deriveBookingDisplayState — the DB
 * status is never touched and no new display state is invented. Rows whose
 * deadline is absent (column not readable yet, or simply unset) behave
 * exactly as before.
 */
export function withDeadlineDisplayState(
  booking: {
    readonly status: BookingStatus;
    readonly createdAt: string;
    readonly responseDeadlineDate: string | null;
  },
  nowIso: string,
): BookingDisplayState {
  const base = deriveBookingDisplayState(booking, nowIso);
  if (
    base === "awaiting_response" &&
    isResponseDeadlinePast(booking.responseDeadlineDate, nowIso)
  ) {
    return "no_response_stale";
  }
  return base;
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
