/**
 * Service offerings (W8 — services real model, Phase 1) — shared constants and
 * types.
 *
 * These live OUTSIDE the `"use server"` action module because a server-action
 * file may only export async functions; a runtime value like
 * `SERVICE_OFFERING_STATUSES` and the row/result types belong here so both the
 * server actions and the client UI can import them.
 *
 * No payment, no fake rows — these are plain shape definitions only.
 */

/** A published "we are looking for partners" offering is an ordinary service
 *  offering in this category — the EXISTING request/accept model carries it
 *  (partner asks, owner accepts, the canonical conversation opens). No new
 *  table, grant or consent. */
export const PARTNERSHIP_CATEGORY = "partnership";

/** `closed` exists once the lifecycle migration (20261024090000) is applied;
 *  until then the contract never offers it (`lib/market-lifecycle/adapters.ts`). */
export const SERVICE_OFFERING_STATUSES = ["draft", "active", "paused", "closed"] as const;
export type ServiceOfferingStatus = (typeof SERVICE_OFFERING_STATUSES)[number];

export interface ServiceOfferingRow {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly categorySlug: string | null;
  readonly locationCountry: string | null;
  readonly remote: boolean;
  readonly rateText: string | null;
  readonly status: ServiceOfferingStatus;
  /** Why a closed offering is closed (lifecycle contract); null otherwise. */
  readonly closedOutcome?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ServiceOfferingListResult =
  | {
      kind: "ok";
      rows: ServiceOfferingRow[];
      /** The closed state is stored (lifecycle migration applied). */
      closedSupported?: boolean;
    }
  | { kind: "needs-migration" }
  /** The read failed — never shown as "no offerings" (SEP-7, audit 2026-10-16). */
  | { kind: "unavailable" }
  | { kind: "not-authed" };

export type ServiceOfferingMutateResult =
  | { kind: "ok"; id?: string }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "invalid"; field: string }
  /** The caller has no such offering (not theirs, or already removed). Nothing changed. */
  | { kind: "not-found" }
  /** The offering has requests (history a buyer relies on): it is never
   *  deleted — pause it instead. Nothing changed. */
  | { kind: "has-requests" }
  | { kind: "error"; message: string };

export interface ServiceOfferingInput {
  title: string;
  description?: string | null;
  categorySlug?: string | null;
  locationCountry?: string | null;
  remote?: boolean;
  rateText?: string | null;
}
