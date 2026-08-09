import "server-only";

import { cache } from "react";

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
import { getPendingAbsenceReviewCount } from "@/lib/leave/absences";
import { getTaskAttentionCounts } from "@/lib/tasks/tasks";
import { getNewMarketplaceMatchCount } from "@/lib/marketplace/worker-opportunities";
import type { FeatureKey } from "@/lib/config/feature-availability";
import {
  SPINE_SIGNALS,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";

/**
 * Notification spine v1 — IO half. Loads every spine count in one parallel
 * pass from the SAME per-surface helpers the dashboard cards and the top
 * slot use, so the bell, the badges and the pages can never disagree about
 * what needs attention. Every helper is defensive (returns 0 / empty on any
 * missing-data state), so the auth shell never breaks on a signal read.
 *
 * Request-cached (React `cache`): the dashboard layout (bell + nav badges)
 * and the overview page (status strip + module-card badges, control room
 * PR B) share ONE read per request instead of issuing the count queries
 * twice.
 */
export const getSpineCounts = cache(async (): Promise<SpineCounts> => {
  const [
    unreadConversations,
    pendingIncomingServiceRequests,
    requestNewCounts,
    pendingIncomingBookings,
    bookingResponsesNew,
    invitations,
    taskAttention,
    newJobMatches,
    pendingAbsenceReviews,
  ] = await Promise.all([
    getUnreadConversationCount(),
    getPendingIncomingRequestCount(),
    getServiceRequestsNewCounts(),
    getPendingIncomingBookingCount(),
    getBookingResponsesNewCount(),
    listMyPendingWorkerInvitations(),
    getTaskAttentionCounts(),
    // Request-cached with the recommendation surfaces (ONE read model);
    // 0 for non-workers and while the gated seen store is unapplied.
    getNewMarketplaceMatchCount(),
    // Role-gated inside the reader (0 for worker / client), self-excluded,
    // and 0 while the leave migration is unapplied.
    getPendingAbsenceReviewCount(),
  ]);
  return {
    unreadConversations,
    pendingIncomingServiceRequests,
    serviceRequestResponsesNew: requestNewCounts.buyerNew,
    pendingIncomingBookings,
    bookingResponsesNew,
    pendingInvitations: invitations.length,
    openTaskAttention: taskAttention.total,
    newJobMatches,
    pendingAbsenceReviews,
  };
});

/** Nav badges from the same spine counts, derived from the signal catalogue:
 *  a tab is badged ONLY when a spine signal declares that tab's featureKey,
 *  and only signals whose own clearing surface is that tab may do so
 *  (Messages: unread clears by reading the thread; Overview: a pending
 *  invitation clears via the accept/decline card on the overview). A badge
 *  that cannot clear is permanent noise, not a signal — adding a featureKey
 *  to a signal is a conscious catalogue change, guard-pinned. */
export function buildNavBadges(
  counts: SpineCounts,
): Partial<Record<FeatureKey, number>> {
  const badges: Partial<Record<FeatureKey, number>> = {};
  for (const s of SPINE_SIGNALS) {
    if (!s.featureKey) continue;
    const count = s.count(counts);
    if (count <= 0) continue;
    badges[s.featureKey] = (badges[s.featureKey] ?? 0) + count;
  }
  return badges;
}
