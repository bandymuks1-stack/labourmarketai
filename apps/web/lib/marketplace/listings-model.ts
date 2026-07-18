/**
 * Marketplace listings (Wagon 13 — European Work & Business Ecosystem
 * Marketplace, slice 1) — shared constants and types.
 *
 * These live OUTSIDE the `"use server"` action module (a server-action file may
 * only export async functions) so both the server actions and the client UI can
 * import the runtime vocabularies and row/result shapes.
 *
 * Scope: WORK-RELATED physical resources offered for sale / rent / wanted —
 * never generic consumer classifieds. The professional-SERVICES half of the
 * marketplace stays the canonical `service_offerings` (reused, not duplicated).
 * No payment, no fake rows — plain shape definitions only.
 */

export const LISTING_KINDS = ["sale", "rental", "wanted"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

/** Work-bounded categories only. No generic consumer goods. */
export const LISTING_CATEGORIES = [
  "accommodation", // worker housing / rooms
  "premises", // commercial / work premises
  "vehicle", // vehicles / transport
  "tools",
  "equipment",
  "machinery",
  "safety_equipment",
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const LISTING_STATUSES = ["draft", "active", "closed"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export interface MarketplaceListingRow {
  readonly id: string;
  readonly ownerId: string;
  readonly organizationId: string | null;
  readonly projectId: string | null;
  readonly listingKind: ListingKind;
  readonly category: ListingCategory;
  readonly title: string;
  readonly description: string | null;
  readonly locationCountry: string | null;
  readonly locationLabel: string | null;
  readonly priceText: string | null;
  readonly status: ListingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Discovery row — an ACTIVE listing owned by someone else. Never exposes the
 *  owner's raw identity beyond the id needed server-side to open an enquiry;
 *  the client card shows listing facts only. */
export interface MarketplaceDiscoveryRow extends MarketplaceListingRow {
  /** True when the caller owns this row (so the UI hides "enquire"). */
  readonly isMine: boolean;
}

export type MarketplaceListingListResult =
  | { kind: "ok"; rows: MarketplaceListingRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type MarketplaceDiscoveryResult =
  | { kind: "ok"; rows: MarketplaceDiscoveryRow[] }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type MarketplaceListingMutateResult =
  | { kind: "ok"; id?: string }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "invalid"; field: string }
  | { kind: "error"; message: string };

export interface MarketplaceListingInput {
  listingKind: ListingKind;
  category: ListingCategory;
  title: string;
  description?: string | null;
  locationCountry?: string | null;
  locationLabel?: string | null;
  priceText?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
}

export function isListingKind(v: unknown): v is ListingKind {
  return typeof v === "string" && (LISTING_KINDS as readonly string[]).includes(v);
}

export function isListingCategory(v: unknown): v is ListingCategory {
  return (
    typeof v === "string" && (LISTING_CATEGORIES as readonly string[]).includes(v)
  );
}

export function isListingStatus(v: unknown): v is ListingStatus {
  return typeof v === "string" && (LISTING_STATUSES as readonly string[]).includes(v);
}
