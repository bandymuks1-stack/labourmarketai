/**
 * Public business profile (Wagon 13 slice 2) — shared client-safe types.
 *
 * A read-composition over canonical entities: identity from `organizations`,
 * services from `service_offerings`, listings from `marketplace_listings`.
 * Every field here is part of the allowlisted PUBLIC projection returned by the
 * SECURITY DEFINER read functions — nothing private is represented. No payment,
 * no fake rows.
 */

export interface PublicBusinessProfile {
  readonly id: string;
  readonly displayName: string;
  readonly tagline: string | null;
  readonly description: string | null;
  readonly country: string | null;
  readonly website: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
}

export interface PublicBusinessService {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly categorySlug: string | null;
  readonly locationCountry: string | null;
  readonly remote: boolean;
  readonly rateText: string | null;
}

export interface PublicBusinessListing {
  readonly id: string;
  readonly listingKind: "sale" | "rental" | "wanted";
  readonly category: string;
  readonly title: string;
  readonly description: string | null;
  readonly locationCountry: string | null;
  readonly locationLabel: string | null;
  readonly priceText: string | null;
}

export interface PublicBusinessProfileView {
  readonly profile: PublicBusinessProfile;
  readonly services: PublicBusinessService[];
  readonly listings: PublicBusinessListing[];
}

/** Owner/manager view of their own publication settings (management UI). */
export interface BusinessPublicSettings {
  readonly enabled: boolean;
  readonly slug: string | null;
  readonly tagline: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  /** organizations.description — the public page's main content block. W4:
   *  it RENDERED publicly but had no write path anywhere in the product;
   *  the panel now edits it (via the owner's legacy companies row + the
   *  mirror trigger — the only non-admin write path into organizations). */
  readonly description: string | null;
}

export interface BusinessPublishInput {
  orgId: string;
  enabled: boolean;
  slug?: string | null;
  tagline?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export type BusinessPublishResult =
  | { kind: "ok" }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "invalid"; field: string }
  | { kind: "slug-taken" }
  | { kind: "not-authorized" }
  | { kind: "error"; message: string };

/** A public business URL — normal, shareable, discoverable. */
export function publicBusinessPath(slug: string): string {
  return `/business/${slug}`;
}

/** Slug format shared by the client validator and the DB CHECK/RPC. */
export const BUSINESS_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export function isValidBusinessSlug(v: string): boolean {
  return BUSINESS_SLUG_RE.test(v);
}
