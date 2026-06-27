/**
 * P0 Marketplace — service-offering request loop (Phase 1) — shared constants
 * and types.
 *
 * These live OUTSIDE the `"use server"` action module because a server-action
 * file may only export async functions. A request is a real buyer→provider
 * intent with a structured status — never fake demand, never payment.
 */

export const REQUEST_STATUSES = ["sent", "accepted", "declined", "withdrawn"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Decisions a provider may set on an incoming request. */
export const RESPOND_DECISIONS = ["accepted", "declined"] as const;
export type RespondDecision = (typeof RESPOND_DECISIONS)[number];

/** A discoverable (active) offering — only the fields the provider published. */
export interface DiscoverableOfferingRow {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly categorySlug: string | null;
  readonly locationCountry: string | null;
  readonly remote: boolean;
  readonly rateText: string | null;
  readonly providerId: string;
  readonly createdAt: string;
}

/** A buyer's own outgoing request (status view). */
export interface OutgoingRequestRow {
  readonly id: string;
  readonly offeringId: string;
  readonly offeringTitle: string | null;
  readonly status: RequestStatus;
  readonly message: string | null;
  readonly responseNote: string | null;
  readonly respondedAt: string | null;
  readonly createdAt: string;
}

/** A provider's incoming request (inbox view). */
export interface IncomingRequestRow {
  readonly id: string;
  readonly offeringId: string;
  readonly offeringTitle: string | null;
  readonly status: RequestStatus;
  readonly message: string | null;
  readonly responseNote: string | null;
  readonly respondedAt: string | null;
  readonly createdAt: string;
  /**
   * Minimum-safe requester identity — the buyer's display name ONLY, supplied by
   * the `requester_identities_for_provider` SECURITY DEFINER RPC and only for
   * requests addressed to this provider. Null when the RPC is absent/errors
   * (rollout-safe: the inbox still renders) or the buyer set no name. Never
   * carries email/phone/contact/location/avatar or any other profile field.
   */
  readonly requesterDisplayName: string | null;
}

/** Real status counts for a buyer's own outgoing requests (dashboard summary). */
export interface OutgoingRequestSummary {
  readonly sent: number;
  readonly accepted: number;
  readonly declined: number;
}

/**
 * "New since last seen" counts for the request loop — a real other-party update
 * after the user last opened /dashboard/service-requests.
 *   providerNew = incoming requests a buyer sent after my last visit.
 *   buyerNew    = outgoing requests a provider responded to after my last visit.
 * Both 0 when the user has never opened the loop (seen_at null) — never fabricated.
 */
export interface ServiceRequestsNewCounts {
  readonly providerNew: number;
  readonly buyerNew: number;
}

/**
 * Pure "new since last seen" compute (no I/O — unit-testable).
 *   providerNew = incoming requests a BUYER sent (status 'sent') AFTER seenAt —
 *                 a real other-party action; never my own respond/withdraw
 *                 (those are accepted/declined/withdrawn, not 'sent').
 *   buyerNew    = outgoing requests a PROVIDER responded to (accepted/declined)
 *                 AFTER seenAt — never my own request (that is 'sent').
 * seenAt null (never opened the loop) → { 0, 0 }. Comparison is timestamp-based
 * (NaN-safe), never fabricated.
 */
export function computeNewCounts(
  seenAt: string | null,
  incoming: ReadonlyArray<{ status: RequestStatus; createdAt: string }>,
  outgoing: ReadonlyArray<{ status: RequestStatus; respondedAt: string | null }>,
): ServiceRequestsNewCounts {
  if (!seenAt) return { providerNew: 0, buyerNew: 0 };
  const seen = Date.parse(seenAt);
  const after = (ts: string | null): boolean => {
    if (!ts) return false;
    const t = Date.parse(ts);
    return Number.isFinite(t) && Number.isFinite(seen) && t > seen;
  };
  return {
    providerNew: incoming.filter((r) => r.status === "sent" && after(r.createdAt)).length,
    buyerNew: outgoing.filter(
      (r) => (r.status === "accepted" || r.status === "declined") && after(r.respondedAt),
    ).length,
  };
}

export type DiscoveryListResult =
  | { kind: "ok"; rows: DiscoverableOfferingRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type OutgoingListResult =
  | { kind: "ok"; rows: OutgoingRequestRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type IncomingListResult =
  | { kind: "ok"; rows: IncomingRequestRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type RequestMutateResult =
  | { kind: "ok"; id?: string; detail?: string }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "invalid"; field: string }
  | { kind: "duplicate" }
  | { kind: "error"; message: string };
