import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isSyntheticFixtureLabel } from "@/lib/qa/synthetic-fixture";
import {
  normalizePublicServiceSearch,
  PUBLIC_SERVICE_PAGE_SIZE,
  type PublicServiceDetailResult,
  type PublicServiceOffering,
  type PublicServiceSearchInput,
  type PublicServiceSearchResult,
} from "./public-service-offerings-shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABSENT = new Set(["42883", "PGRST202", "42P01", "42703", "PGRST204", "PGRST205"]);

function failure(error: { code?: string } | null | undefined) {
  return { kind: error?.code && ABSENT.has(error.code) ? "needs-migration" : "unavailable" } as const;
}

/** Copy only the public projection. A malformed response is not an empty market. */
function offering(raw: unknown): PublicServiceOffering | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !UUID.test(r.id) ||
      typeof r.title !== "string" || !r.title.trim() || r.title.length > 120 ||
      typeof r.remote !== "boolean" ||
      typeof r.created_at !== "string" || !Number.isFinite(Date.parse(r.created_at))) return null;
  for (const key of ["description", "category_slug", "location_country", "rate_text"]) {
    if (r[key] !== null && typeof r[key] !== "string") return null;
  }
  if (isSyntheticFixtureLabel(r.title, r.description as string | null,
      r.category_slug as string | null, r.rate_text as string | null)) return null;
  return {
    id: r.id, title: r.title, description: r.description as string | null,
    categorySlug: r.category_slug as string | null,
    locationCountry: r.location_country as string | null,
    remote: r.remote, rateText: r.rate_text as string | null, createdAt: r.created_at,
  };
}

/** No auth lookup: the RPC always returns the same explicit-public projection, even to a member. */
export async function searchPublicServiceOfferings(
  input: PublicServiceSearchInput = {},
): Promise<PublicServiceSearchResult> {
  const filter = normalizePublicServiceSearch(input);
  try {
    const client = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any).rpc("search_public_service_offerings_v1", {
      p_query: filter.query, p_country: filter.country, p_category: filter.category,
      p_limit: PUBLIC_SERVICE_PAGE_SIZE + 1,
      p_offset: (filter.page - 1) * PUBLIC_SERVICE_PAGE_SIZE,
      p_offering_id: null,
    });
    if (error) return failure(error);
    if (!Array.isArray(data) || data.length > PUBLIC_SERVICE_PAGE_SIZE + 1) return { kind: "unavailable" };
    const rows = data.map(offering);
    if (rows.some((row) => row === null)) return { kind: "unavailable" };
    return {
      kind: "ok", rows: (rows as PublicServiceOffering[]).slice(0, PUBLIC_SERVICE_PAGE_SIZE),
      hasMore: rows.length > PUBLIC_SERVICE_PAGE_SIZE, page: filter.page, pageSize: PUBLIC_SERVICE_PAGE_SIZE,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

// Metadata and page share a single read within one React server request.
// No persistent cache: the next request rechecks publication and expiry.
export const getPublicServiceOffering = cache(readPublicServiceOffering);

async function readPublicServiceOffering(id: string): Promise<PublicServiceDetailResult> {
  if (!UUID.test(id)) return { kind: "not-found" };
  try {
    const client = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any).rpc("get_public_service_offering_v1", { p_id: id });
    if (error) return failure(error);
    if (!Array.isArray(data) || data.length > 1) return { kind: "unavailable" };
    if (data.length === 0) return { kind: "not-found" };
    const row = offering(data[0]);
    if (!row || row.id.toLowerCase() !== id.toLowerCase()) return { kind: "unavailable" };
    return { kind: "ok", offering: row };
  } catch {
    return { kind: "unavailable" };
  }
}
