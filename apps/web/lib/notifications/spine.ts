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
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  notificationEventHref,
  readMyNotificationEvents,
} from "@/lib/notifications/events";

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

/**
 * DURABLE notification events, shaped for the same bell the derived spine
 * feeds. Distinct from the spine by construction:
 *   - each row is a stored FACT ("your absence was approved"), not a derived
 *     count — so it carries its real created_at and its real read state;
 *   - no `href`: durable rows clear by MARKING READ (the panel's existing
 *     rule — "has an href" means "derived, clears by visiting"; rows without
 *     one are exactly what re-enables the persisted mark-all-read control);
 *   - type is namespaced `event_<event_type>` so the panel's localized
 *     type-label map can carry copy per event without colliding with the
 *     derived signal vocabulary.
 *
 * While the owner-gated notification_events store is unapplied this returns
 * [] and the product renders exactly what it rendered before.
 *
 * `limit` (default: the bell's FEED_LIMIT of 20) lets the activity page
 * show the longer history the bell truncates — the reader clamps it.
 */
export async function getDurableNotifications(limit?: number): Promise<
  readonly {
    id: string;
    type: string;
    created_at: string;
    read_at: string | null;
    /** Canonical surface for the entity this event is about. */
    href?: string;
  }[]
> {
  const supabase = await createServerClient();
  // `undefined` falls through to the reader's own FEED_LIMIT default.
  const feed = await readMyNotificationEvents(supabase, limit);
  if (feed.kind !== "ready") return [];
  return feed.events.map((e) => ({
    id: e.id,
    type: `event_${e.eventType}`,
    created_at: e.createdAt,
    read_at: e.readAt,
    // The stored row already knows which entity it is about; this turns that
    // into somewhere the reader can actually go. Clearing still happens by
    // marking read, not by visiting — see NOTIFICATION_ENTITY_HREF.
    href: notificationEventHref(e.entityType),
  }));
}
