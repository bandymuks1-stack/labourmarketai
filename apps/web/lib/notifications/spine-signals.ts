/**
 * Notification spine v1 — the ONE catalogue of derived attention signals.
 *
 * Every surface that claims the user's attention (bell panel, Messages nav
 * badge, dashboard pending-state cards, top slot) must trace back to a row
 * here or to the per-surface helper a row points at. A signal only exists
 * when its count is REAL (loaded from an RLS-scoped per-surface model) and
 * when a route exists that clears or resolves it — visiting the surface IS
 * the read event, so the spine never needs a fake "mark read".
 *
 * Pure data + pure builder: no DB, no IO — `spine.ts` owns the fetching.
 * Guard: lib/guards/notification-spine.test.ts pins that every href is a
 * real page, every type has LT/EN/RU copy, and the seen-model wiring holds.
 */

import type { Role } from "@/lib/auth/actions";
import type { Notification } from "@/lib/auth/context";

/** Counts the spine consumes — each one loaded by a per-surface helper that
 *  returns 0 on any missing-data state (rollout-safe, never fabricates). */
export interface SpineCounts {
  /** Threads where the OTHER party wrote after our last_read_at. */
  readonly unreadConversations: number;
  /** Open ('sent') incoming service requests waiting on this provider. */
  readonly pendingIncomingServiceRequests: number;
  /** Provider accept/decline responses to own requests since last seen
   *  (service_offering_requests_seen). Covers "accepted outgoing" honestly:
   *  the persistent accepted total lives on the requests page itself — a
   *  bell row that could never clear would just be permanent noise. */
  readonly serviceRequestResponsesNew: number;
  /** Pending incoming booking proposals waiting on this worker. */
  readonly pendingIncomingBookings: number;
  /** Responses to own booking proposals since seen (booking_requests_seen). */
  readonly bookingResponsesNew: number;
  /** Pending company/agency invitations addressed to this user's email. */
  readonly pendingInvitations: number;
}

export interface SpineSignalDef {
  /** Stable row id (also the notification-panel testid suffix). */
  readonly id: string;
  /** i18n leaf under auth.notifications.types.* — required in lt/en/ru. */
  readonly type: string;
  /** The real route that clears or resolves the signal. */
  readonly href: string;
  readonly count: (c: SpineCounts) => number;
}

/**
 * Order = display order in the bell panel. Mirrors the top-slot priority
 * ladder (lib/dashboard/top-slot.ts): a person waiting on you outranks
 * passive news. Deferred (no honest backing yet, see PR notes):
 * opportunity/contacted conversation signals — no seen-model exists for
 * interest signals, so a count could never clear by visiting.
 */
export const SPINE_SIGNALS: readonly SpineSignalDef[] = [
  {
    id: "pending-invitations",
    type: "pending_invitations",
    // The invitations card (accept/decline) lives on the dashboard overview.
    href: "/dashboard",
    count: (c) => c.pendingInvitations,
  },
  {
    id: "unread-messages",
    type: "unread_messages",
    href: "/dashboard/communication",
    count: (c) => c.unreadConversations,
  },
  {
    id: "incoming-service-requests",
    type: "incoming_service_requests",
    href: "/dashboard/service-requests",
    count: (c) => c.pendingIncomingServiceRequests,
  },
  {
    id: "service-request-responses",
    type: "service_request_responses",
    href: "/dashboard/service-requests",
    count: (c) => c.serviceRequestResponsesNew,
  },
  {
    id: "pending-bookings",
    type: "pending_bookings",
    href: "/dashboard/bookings",
    count: (c) => c.pendingIncomingBookings,
  },
  {
    id: "booking-responses",
    type: "booking_responses",
    href: "/dashboard/bookings",
    count: (c) => c.bookingResponsesNew,
  },
];

/** Count-gated assembly: a signal renders ONLY while its count is > 0, so
 *  the bell states exactly what is true right now and nothing else. */
export function buildSpineNotifications(
  counts: SpineCounts,
  role: Role,
): Notification[] {
  return SPINE_SIGNALS.flatMap((s) => {
    const count = s.count(counts);
    if (count <= 0) return [];
    return [
      {
        id: s.id,
        role,
        type: s.type,
        payload: {},
        read_at: null,
        created_at: "",
        count,
        href: s.href,
      },
    ];
  });
}
