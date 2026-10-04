/**
 * Marketplace listings — shared constants and types.
 *
 * These live OUTSIDE the `"use server"` action module (a server-action file may
 * only export async functions) so both the server actions and the client UI can
 * import the runtime vocabularies and row/result shapes.
 *
 * Scope (owner contract, universal marketplace): work resources, goods, free-
 * standing SERVICE NEEDS, personal and project/contract listings — one shared
 * discovery (`market_index_v1`) and the existing enquiry -> conversation path.
 * NO payment, NO held funds, NO fulfilment. The domain/subject registry and the
 * direction rule live in `market-model.ts`; the publish policy in
 * `publish-policy.ts`. Plain shape definitions only — no fake rows.
 */

/** Direction is DERIVED from the kind (wanted -> need, sale/rental -> offer);
 *  the kinds are intentionally NOT widened. */
export const LISTING_KINDS = ["sale", "rental", "wanted"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

/**
 * The ORIGINAL work-bounded categories (domain `work_resource`). Kept as-is:
 * the registry of ALL subjects (goods, service needs, personal, project work)
 * lives in `market-model.ts`; a listing's `category` is a registered SUBJECT.
 */
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

/** `paused` was added by the universal-marketplace migration (20261003150300). */
export const LISTING_STATUSES = ["draft", "active", "paused", "closed"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export interface MarketplaceListingRow {
  readonly id: string;
  readonly ownerId: string;
  readonly organizationId: string | null;
  readonly projectId: string | null;
  readonly listingKind: ListingKind;
  /** A registered SUBJECT (see `market-model.ts`); open FORMAT, registry-validated. */
  readonly category: string;
  readonly title: string;
  readonly description: string | null;
  readonly locationCountry: string | null;
  readonly locationLabel: string | null;
  readonly priceText: string | null;
  /** Descriptive amount (no payment is taken). Null before the migration. */
  readonly priceAmount: number | null;
  readonly currency: string | null;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly expiresAt: string | null;
  readonly status: ListingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Discovery row — one row of `market_index_v1` (or, before the migration, an
 *  ACTIVE listing). Never exposes the owner's raw identity beyond the id needed
 *  server-side to open an enquiry; the client card shows listing facts only. */
/** Who the CANONICAL SOURCE lets read the row (an adapter never widens it). */
export type MarketVisibility =
  | "public" // anon-boundary public projection (vacancies)
  | "signed_in" // any signed-in member (listings, service offerings)
  | "organizations" // callers who manage an organization (workforce supply)
  | "workers" // callers the worker gate admits (verified-company demand)
  | "own"; // the caller's own row

/** Where the fact came from. */
export type MarketProvenance = "platform" | "external_vacancy";

export interface MarketplaceDiscoveryRow {
  /** ORIGIN: the canonical source table (never a copy). With `id` it is the
   *  provenance key of the row. `public_vacancies` / `customer_requests` rows
   *  arrive through the federation adapters (`federation-model.ts`). */
  readonly sourceTable:
    | "marketplace_listings"
    | "service_offerings"
    | "public_vacancies"
    | "customer_requests";
  readonly id: string;
  /** Null when the source discloses no poster (vacancies, supply, demand). */
  readonly ownerId: string | null;
  readonly organizationId: string | null;
  readonly domain: string;
  readonly subject: string | null;
  readonly direction: "offer" | "need" | "other";
  readonly title: string;
  readonly description: string | null;
  readonly locationCountry: string | null;
  readonly locationLabel: string | null;
  readonly priceText: string | null;
  readonly priceAmount: number | null;
  readonly currency: string | null;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Canonical destination (existing routes only), derived in the view. */
  readonly destinationPath: string;
  /** What the person can do: enquire (listings) | request_service (offerings)
   *  | open_source (federated rows: the source surface owns the gate and the
   *  contact path). */
  readonly contactAction: "enquire" | "request_service" | "open_source";
  /** True when the caller owns this row (so the UI hides "enquire"). */
  readonly isMine: boolean;
  readonly visibility: MarketVisibility;
  readonly provenance: MarketProvenance;
  /** Only a name the gated source reader already disclosed (verified company). */
  readonly publisherName: string | null;
}

/** `extended` = the universal-marketplace migration is applied (new columns /
 *  index view readable). False = honest legacy mode (work resources only). */
export type MarketplaceListingListResult =
  | { kind: "ok"; rows: MarketplaceListingRow[]; extended: boolean }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type MarketplaceDiscoveryResult =
  | {
      kind: "ok";
      rows: MarketplaceDiscoveryRow[];
      extended: boolean;
      /** Federated sources that could not be read — a failed read is never an empty source. */
      unavailable?: readonly ("vacancies" | "workforce" | "demand")[];
    }
  | { kind: "needs-migration" }
  | { kind: "not-authed" };

export type MarketplaceListingMutateResult =
  | { kind: "ok"; id?: string }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "invalid"; field: string }
  /** Policy verdict LEGAL_CHECK_REQUIRED: the check the person must confirm
   *  before PUBLISHING (a draft is never blocked). */
  | { kind: "legal-check-required"; legalCheckKey: string }
  /** Policy verdict CHANNEL_RESTRICTED. */
  | { kind: "restricted"; reasonKey: string }
  | { kind: "error"; message: string };

export interface MarketplaceListingInput {
  listingKind: ListingKind;
  /** A registered subject (see `market-model.ts`). */
  category: string;
  title: string;
  description?: string | null;
  locationCountry?: string | null;
  locationLabel?: string | null;
  priceText?: string | null;
  priceAmount?: number | null;
  currency?: string | null;
  quantity?: number | null;
  unit?: string | null;
  /** ISO timestamp, optional. */
  expiresAt?: string | null;
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
