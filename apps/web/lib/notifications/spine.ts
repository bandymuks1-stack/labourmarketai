import "server-only";

import { getUnreadConversationCount } from "@/lib/communication/unread";
import {
  getBookingResponsesNewCount,
  getPendingIncomingBookingCount,
} from "@/lib/booking/booking-actions";
import {
  getPendingIncomingRequestCount,
  getServiceRequestsNewCounts,
} from "@/lib/marketplace/service-requests";
import { listMyPendingWorkerInvitations } from "@/lib/worker/invitations";
import type { FeatureKey } from "@/lib/config/feature-availability";
import type { SpineCounts } from "@/lib/notifications/spine-signals";

/**
 * Notification spine v1 — IO half. Loads every spine count in one parallel
 * pass from the SAME per-surface helpers the dashboard cards and the top
 * slot use, so the bell, the badges and the pages can never disagree about
 * what needs attention. Every helper is defensive (returns 0 / empty on any
 * missing-data state), so the auth shell never breaks on a signal read.
 */
export async function getSpineCounts(): Promise<SpineCounts> {
  const [
    unreadConversations,
    pendingIncomingServiceRequests,
    requestNewCounts,
    pendingIncomingBookings,
    bookingResponsesNew,
    invitations,
  ] = await Promise.all([
    getUnreadConversationCount(),
    getPendingIncomingRequestCount(),
    getServiceRequestsNewCounts(),
    getPendingIncomingBookingCount(),
    getBookingResponsesNewCount(),
    listMyPendingWorkerInvitations(),
  ]);
  return {
    unreadConversations,
    pendingIncomingServiceRequests,
    serviceRequestResponsesNew: requestNewCounts.buyerNew,
    pendingIncomingBookings,
    bookingResponsesNew,
    pendingInvitations: invitations.length,
  };
}

/** Nav badges from the same spine counts. Only the Messages tab carries a
 *  badge today: its unread model clears by reading the thread. Other tabs
 *  stay badge-free until their surface has a seen-model that clears on
 *  visit — a badge that cannot clear is permanent noise, not a signal. */
export function buildNavBadges(
  counts: SpineCounts,
): Partial<Record<FeatureKey, number>> {
  return { communication: counts.unreadConversations };
}
