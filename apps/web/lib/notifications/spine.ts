import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { getUnreadConversationCount } from "@/lib/communication/unread";
import {
  getBookingResponsesNewCount,
  getPendingIncomingBookingCount,
} from "@/lib/booking/booking-actions";
import {
  getPendingIncomingRequestCount,
  getServiceRequestsNewCounts,
} from "@/lib/marketplace/service-requests";
import { listInvitationsAddressedToMe } from "@/lib/invitations/attention";
import { listMyMembershipInvitations } from "@/lib/company/memberships";
import { getPendingAbsenceReviewCount } from "@/lib/leave/absences";
import { getTaskAttentionCounts } from "@/lib/tasks/tasks";
import { getNewMarketplaceMatchCount } from "@/lib/marketplace/worker-opportunities";
import { getBridgeSpineCounts } from "@/lib/agency/bridge-read";
import { listCompanyDemands } from "@/lib/scouting/scouting";
import { countOpenTeamOffersByDemand } from "@/lib/company/team-offer";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/company/active-organization";
import { rememberBadge } from "@/lib/perf/badge-ttl-cache";

/** Who is looking, in which workspace — the key the slow badges are remembered under. */
async function badgeViewerKey(): Promise<string | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser(); // request-memoised: no extra round trip
    if (!user) return null;
    const jar = await cookies();
    return `${user.id}|${jar.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? "-"}`;
  } catch {
    return null;
  }
}

/** 2026-10-19 perf: these three were most of the bell's ~30 reads per page view. */
const JOB_MATCHES_TTL_MS = 10 * 60_000;
const SLOW_BADGE_TTL_MS = 2 * 60_000;

/** Team / brigade offers waiting on the active company's own OPEN needs —
 *  the same receiver RPC the scouting section renders. 0 without a company
 *  context and on any failure (the spine is defensive). */
async function getOpenTeamOfferCount(): Promise<number> {
  try {
    const open = (await listCompanyDemands()).filter((d) => d.status !== "closed");
    if (open.length === 0) return 0;
    const byDemand = await countOpenTeamOffersByDemand(open.map((d) => d.id));
    return [...byDemand.values()].reduce((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}
import type { FeatureKey } from "@/lib/config/feature-availability";
import {
  SPINE_SIGNALS,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  notificationEventHref,
  notificationRenderedType,
  readMyNotificationEvents,
  type NotificationEventMetadata,
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
  const viewerKey = await badgeViewerKey();
  const [
    unreadConversations,
    pendingIncomingServiceRequests,
    requestNewCounts,
    pendingIncomingBookings,
    bookingResponsesNew,
    invitations,
    membershipInvitations,
    taskAttention,
    newJobMatches,
    pendingAbsenceReviews,
    bridge,
    openTeamOffers,
  ] = await Promise.all([
    getUnreadConversationCount(),
    getPendingIncomingRequestCount(),
    getServiceRequestsNewCounts(),
    getPendingIncomingBookingCount(),
    getBookingResponsesNewCount(),
    // ONE canonical definition of "an invitation is waiting on me": the
    // canonical `invitations` table PLUS the company/agency roster invitations
    // (`listInvitationsAddressedToMe` - the read behind Today, the opening
    // brief and the chat). The bell used to count the roster half only, so a
    // person invited through the canonical system saw a number on Today that
    // the bell did not carry. `total` is the real count behind the display cap.
    // A failed or unapplied read counts 0 here (the spine is defensive).
    listInvitationsAddressedToMe(),
    // Governance invitations addressed to me — the SAME caller-scoped read
    // the Activity Setup Hub renders its panel from, so the bell and the
    // panel cannot disagree. A failed or unapplied read counts 0.
    listMyMembershipInvitations(),
    getTaskAttentionCounts(),
    // Request-cached with the recommendation surfaces (ONE read model);
    // 0 for non-workers and while the gated seen store is unapplied.
    rememberBadge("jobMatches", viewerKey, JOB_MATCHES_TTL_MS, () => getNewMarketplaceMatchCount()),
    // Role-gated inside the reader (0 for worker / client), self-excluded,
    // and 0 while the leave migration is unapplied.
    getPendingAbsenceReviewCount(),
    // The agency ↔ client bridge (2026-09-24): side-gated inside the reader
    // by the ACTIVE workspace company (agency: shares awaiting an offer;
    // client: pending connection invites + offers awaiting a decision), all
    // from the SAME bridge reads the partners / scouting doors render, zeros
    // for everyone else and on any failure.
    rememberBadge("bridge", viewerKey, SLOW_BADGE_TTL_MS, () => getBridgeSpineCounts()),
    rememberBadge("teamOffers", viewerKey, SLOW_BADGE_TTL_MS, () => getOpenTeamOfferCount()),
  ]);
  return {
    unreadConversations,
    pendingIncomingServiceRequests,
    serviceRequestResponsesNew: requestNewCounts.buyerNew,
    pendingIncomingBookings,
    bookingResponsesNew,
    pendingInvitations: invitations.status === "ok" ? invitations.total : 0,
    pendingMembershipInvitations:
      membershipInvitations.kind === "ok" ? membershipInvitations.invitations.length : 0,
    openTaskAttention: taskAttention.total,
    newJobMatches,
    pendingAbsenceReviews,
    pendingConnectionInvites: bridge.pendingConnectionInvites,
    sharedRequestsAwaitingOffer: bridge.sharedRequestsAwaitingOffer,
    openCandidateOffers: bridge.openCandidateOffers,
    openTeamOffers,
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
    /**
     * The stored row's own safe render hints (`SAFE_METADATA_KEYS`: country,
     * roleSlug, startDate). Carried through so the bell can say WHICH market
     * an event belongs to (owner window 11 §28) — production showed two
     * "Darbuotojas pareiškė susidomėjimą jūsų poreikiu" rows that were
     * indistinguishable, because everything the row knew beyond its type was
     * dropped here. Never free text; the write side gates the keys.
     */
    metadata: NotificationEventMetadata;
  }[]
> {
  const supabase = await createServerClient();
  // `undefined` falls through to the reader's own FEED_LIMIT default.
  const feed = await readMyNotificationEvents(supabase, limit);
  if (feed.kind !== "ready") return [];
  return feed.events.map((e) => ({
    id: e.id,
    // A focused weekly digest renders as its own type key (see
    // `notificationRenderedType`), so the label never promises more than the
    // writer could know.
    type: notificationRenderedType(e.eventType, e.metadata),
    created_at: e.createdAt,
    read_at: e.readAt,
    // The stored row already knows which entity it is about; this turns that
    // into somewhere the reader can actually go. Clearing still happens by
    // marking read, not by visiting — see NOTIFICATION_ENTITY_HREF.
    href: notificationEventHref(e.entityType, e.metadata),
    metadata: e.metadata,
  }));
}
