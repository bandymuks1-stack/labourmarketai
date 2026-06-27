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
