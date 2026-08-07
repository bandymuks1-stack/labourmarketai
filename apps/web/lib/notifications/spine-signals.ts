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
import type { FeatureKey } from "@/lib/config/feature-availability";

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
  /** Open work tasks needing attention (overdue or blocked) for the caller
   *  (assignee or creator). State-derived like pending bookings — resolving
   *  or rescheduling the task IS what clears it.
   *
   *  W13-0b CORRECTION (2026-08-07): this comment used to say the count is
   *  "0 while the work_tasks migration is unapplied (control room PR D)".
   *  That is stale — `20260711210000_work_tasks_v1` was APPLIED on 2026-07-11
   *  (prod ledger version `20260711204521`), and `work_tasks` was verified
   *  present in production read-only. So this is a LIVE count, not a dead one.
   *  It reads 0 today because the table holds 0 rows, which is a different
   *  fact and a truthful signal. The reader still degrades to 0 on
   *  42P01/42703, so an unapplied environment stays honest. */
  readonly openTaskAttention: number;
  /** UNSEEN job recommendations for the signed-in worker — eligible /
   *  near-miss matches from the ONE recommendation read model
   *  (lib/opportunities/recommendations.ts) with no worker_opportunity_seen
   *  marker yet. Rendering a recommendation (dashboard card, board, journal
   *  block) marks it seen, so visiting IS the read event. 0 for non-worker
   *  accounts and 0 while the owner-gated seen store is unapplied — a count
   *  that could never clear would be permanent noise, not a signal. */
  readonly newJobMatches: number;
}

export interface SpineSignalDef {
  /** Stable row id (also the notification-panel testid suffix). */
  readonly id: string;
  /** i18n leaf under auth.notifications.types.* — required in lt/en/ru. */
  readonly type: string;
  /** The real route that clears or resolves the signal. */
  readonly href: string;
  /** Optional feature this signal badges (control room PR B). Set ONLY when
   *  the feature's primary surface is the signal's own clearing surface —
   *  the nav tab and the module card then carry the same real count the
   *  bell shows. A signal without a featureKey badges no tab. */
  readonly featureKey?: FeatureKey;
  readonly count: (c: SpineCounts) => number;
}

/**
 * Order = display order in the bell panel. Mirrors the top-slot priority
 * ladder (lib/dashboard/top-slot.ts): a person waiting on you outranks
 * passive news (new-job-matches therefore sits last). Deferred (no honest
 * backing yet, see PR notes): contacted-conversation / interest-response
 * signals — no seen-model exists for interest signals, so a count could
 * never clear by visiting. (New matching JOBS gained their seen model in
 * the worker_opportunity_seen migration and joined the catalogue.)
 */
export const SPINE_SIGNALS: readonly SpineSignalDef[] = [
  {
    id: "pending-invitations",
    type: "pending_invitations",
    // The invitations card (accept/decline) lives on the dashboard overview —
    // accepting or declining there IS what clears the signal, so the overview
    // tab may carry this count as a badge.
    href: "/dashboard",
    featureKey: "overview",
    count: (c) => c.pendingInvitations,
  },
  {
    id: "unread-messages",
    type: "unread_messages",
    href: "/dashboard/communication",
    featureKey: "communication",
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
  {
    id: "open-task-attention",
    type: "open_task_attention",
    // Resolving / unblocking / rescheduling the task on the tasks page IS
    // what clears this signal — the count is derived from current task state
    // (like pending-bookings), never from a fake read marker. No featureKey:
    // tasks is a module card, not a primary-nav tab (badge stays card-level).
    href: "/dashboard/tasks",
    count: (c) => c.openTaskAttention,
  },
  {
    id: "new-job-matches",
    type: "new_job_matches",
    // ONE aggregate row for ALL unseen matching jobs (never a row per job —
    // anti-spam is part of the owner mandate). The opportunities board
    // renders every open recommendation and marks it seen on render
    // (worker_opportunity_seen), so visiting the board IS the read event.
    // Passive news ranks below people waiting on you → last in the ladder.
    // No featureKey: opportunities is a module card, not a primary-nav tab
    // (the badge stays card-level via the module registry).
    href: "/dashboard/opportunities",
    count: (c) => c.newJobMatches,
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
