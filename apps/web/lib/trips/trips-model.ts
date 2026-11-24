/**
 * Pure business-trip model (functional completion train V2, audit OPERATIONS
 * section — the MISSING "business trips" row) — shared by the server read
 * service, the server actions, the guard test and the finance-page trips
 * section. No server-only imports, no IO.
 *
 * The model codes against the `public.business_trips` contract the SEPARATE,
 * human-gated migration 20260817222000_business_trips_v1 proposes. Until the
 * lead applies it the read/action layers degrade honestly — nothing here
 * fakes a trip.
 *
 * HONEST scope: trip REQUESTS with an approval trail. approved/rejected are
 * a MIRROR of the Workflow & Approval Engine outcome (context_entity_type =
 * 'business_trip') — nothing re-implemented here. advance_amount_cents is
 * manually entered metadata (a per-diem number may be typed in); NO payment
 * machinery, NO travel booking, NO statutory per-diem tables. Trip expense
 * totals are DERIVED by summing linked finance_records rows at read time.
 */

export const TRIP_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "completed",
  "cancelled",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_EVENT_ACTIONS = [
  "created",
  "updated",
  "submitted",
  "approved",
  "rejected",
  "completed",
  "cancelled",
  "reopened",
] as const;

/** Bounds — mirrored by the gated RPC validation (single contract). */
export const TRIP_DESTINATION_MIN = 2;
export const TRIP_DESTINATION_MAX = 160;
export const TRIP_PURPOSE_MIN = 3;
export const TRIP_PURPOSE_MAX = 1000;
export const TRIP_MAX_SPAN_DAYS = 365;

/** Bounded reads everywhere — never an unbounded stream. */
export const TRIP_READ_LIMIT = 50;

export const TRIP_MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isTripMigrationMissingCode(code: string | undefined): boolean {
  return (TRIP_MIGRATION_MISSING_ERROR_CODES as readonly string[]).includes(
    code ?? "",
  );
}

export function isValidTripStatus(v: string): v is TripStatus {
  return (TRIP_STATUSES as readonly string[]).includes(v);
}

/** Statuses the traveler can still edit/submit from. */
export function isTripEditable(status: TripStatus): boolean {
  return status === "draft";
}

/** Statuses a trip can still be cancelled from. */
export function isTripCancellable(status: TripStatus): boolean {
  return status === "draft" || status === "submitted" || status === "approved";
}

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Inclusive day span of a trip, or null when the shape/order is invalid or
 * the span exceeds the bound — the SAME rule the RPC and the table CHECK
 * enforce, so the form can refuse before a round trip.
 */
export function tripSpanDays(
  dateFrom: string,
  dateTo: string,
): number | null {
  if (!DAY_RX.test(dateFrom) || !DAY_RX.test(dateTo)) return null;
  const a = Date.parse(`${dateFrom}T00:00:00Z`);
  const b = Date.parse(`${dateTo}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const days = Math.round((b - a) / 86_400_000) + 1;
  return days <= TRIP_MAX_SPAN_DAYS + 1 ? days : null;
}

export type TripRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly profileId: string;
  readonly destination: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly purpose: string;
  readonly projectId: string | null;
  readonly status: TripStatus;
  /** Integer cents or null — manually entered metadata, never a payment. */
  readonly advanceAmountCents: number | null;
  readonly submittedAt: string | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
};

export type TripNotice =
  | "created"
  | "updated"
  | "submitted"
  | "approved"
  | "rejected"
  | "reopened"
  | "completed"
  | "cancelled"
  | "linked"
  | "unlinked"
  | "invalid"
  | "invalid_dates"
  | "needs_migration"
  | "not_authorized"
  | "not_found"
  | "not_editable"
  | "limit_reached"
  | "still_pending"
  | "no_instance"
  | "no_template"
  | "no_approvers"
  | "template_created"
  | "error";

/** Map RPC outcome strings to notices (single mapping, guard-pinned). */
export function tripNoticeForOutcome(outcome: string): TripNotice {
  switch (outcome) {
    case "updated":
    case "submitted":
    case "approved":
    case "rejected":
    case "reopened":
    case "completed":
    case "cancelled":
    case "linked":
    case "unlinked":
    case "still_pending":
    case "no_instance":
      return outcome;
    case "already_submitted":
      return "submitted";
    case "invalid_dates":
      return "invalid_dates";
    case "not_editable":
    case "not_submitted":
    case "not_approved":
      return "not_editable";
    case "not_found":
      return "not_found";
    case "not_allowed":
      return "not_authorized";
    case "limit_reached":
      return "limit_reached";
    case "invalid":
      return "invalid";
    default:
      return "error";
  }
}
