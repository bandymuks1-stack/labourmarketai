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

export const SERVICE_OFFERING_STATUSES = ["draft", "active", "paused"] as const;
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
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ServiceOfferingListResult =
  | { kind: "ok"; rows: ServiceOfferingRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type ServiceOfferingMutateResult =
  | { kind: "ok"; id?: string }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "invalid"; field: string }
  | { kind: "error"; message: string };

export interface ServiceOfferingInput {
  title: string;
  description?: string | null;
  categorySlug?: string | null;
  locationCountry?: string | null;
  remote?: boolean;
  rateText?: string | null;
}
