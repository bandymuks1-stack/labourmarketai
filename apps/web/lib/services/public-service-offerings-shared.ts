import { normalizeDiscoveryCategory, normalizeDiscoveryCountry } from "@/lib/marketplace/service-requests-shared";

/** Public personal offerings extend the existing service store, never an organization directory. */
export const PUBLIC_SERVICE_PAGE_SIZE = 6;
export const PUBLIC_SERVICE_MAX_PAGE = 100;

export interface PublicServiceOffering {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly categorySlug: string | null;
  readonly locationCountry: string | null;
  readonly remote: boolean;
  readonly rateText: string | null;
  readonly createdAt: string;
}

export interface PublicServiceSearchInput {
  readonly query?: string | null;
  readonly country?: string | null;
  readonly category?: string | null;
  readonly page?: string | number | null;
}

export type PublicServiceSearchResult =
  | { readonly kind: "ok"; readonly rows: readonly PublicServiceOffering[]; readonly hasMore: boolean; readonly page: number; readonly pageSize: number }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "unavailable" };

export type PublicServiceDetailResult =
  | { readonly kind: "ok"; readonly offering: PublicServiceOffering }
  | { readonly kind: "not-found" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "unavailable" };

export function normalizePublicServiceSearch(input: PublicServiceSearchInput = {}) {
  const rawPage = typeof input.page === "number" ? input.page : Number(input.page ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0
    ? Math.min(rawPage, PUBLIC_SERVICE_MAX_PAGE) : 1;
  return {
    query: typeof input.query === "string" ? input.query.trim().slice(0, 120) || null : null,
    country: normalizeDiscoveryCountry(input.country),
    category: normalizeDiscoveryCategory(input.category),
    page,
  };
}
