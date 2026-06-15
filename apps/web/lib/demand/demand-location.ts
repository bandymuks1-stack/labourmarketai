import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isMarketCountry } from "@/lib/taxonomy/work-categories";
import {
  summarizeDemandLocations,
  buildDemandSignalBoard,
  type DemandLocation,
  type DemandLocationSummary,
  type DemandSignalBoard,
  type DemandGeoPrecision,
} from "@/lib/market-map/demand-locations";

/**
 * Company demand location capture (v1) — the FIRST real data path into
 * public.company_demand_locations (applied via #423).
 *
 * A demand location is WHERE a company actually needs workers / a brigade / a
 * service / a project executed — a labour-market signal, never the registration
 * address and never a map marker until coordinates are confirmed.
 *
 * This v1 captures SIGNAL-ONLY locations:
 *   * latitude / longitude are ALWAYS written null (no coordinates here);
 *   * geocode_status is ALWAYS 'pending' — owners can NEVER set 'verified'
 *     (verification is reserved for a future geocoder/admin path);
 *   * geo_precision is derived from the granularity the owner typed
 *     (address → city → country → unknown) and is NEVER 'coordinates'.
 *
 * Writes go through the caller's own authenticated Supabase client, so the
 * owner-scoped RLS on company_demand_locations (owner_id = auth.uid() AND the
 * referenced customer_requests row belongs to the caller) is what authorises
 * the insert. No SECURITY DEFINER, no RLS change, no schema change, no
 * geocoding API. Honest tagged results, never throws.
 */

const RELATION_NOT_FOUND = "42P01";
const UNIQUE_VIOLATION = "23505";
const MAX_LABEL = 200;
const MAX_REGION = 160;
const MAX_ADDRESS = 400;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function clamp(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function orNull(s: string): string | null {
  return s.length > 0 ? s : null;
}

export interface AddDemandLocationInput {
  readonly requestId: string;
  readonly countryCode: string;
  readonly city?: string;
  readonly region?: string;
  readonly locality?: string;
  readonly addressText?: string;
  readonly locationLabel?: string;
}

export type AddDemandLocationResult =
  | { kind: "ok"; id: string }
  | { kind: "duplicate" }
  | { kind: "invalid"; message: string }
  | { kind: "unauthenticated" }
  | { kind: "not-owner" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/**
 * Derive a non-coordinate precision from the granularity the owner provided.
 * Returns 'coordinates' for NOTHING — this path never carries lat/lng.
 */
function derivePrecision(parts: {
  address: string | null;
  city: string | null;
  locality: string | null;
  country: string;
}): DemandGeoPrecision {
  if (parts.address) return "address";
  if (parts.city || parts.locality) return "city";
  if (parts.country) return "country";
  return "unknown";
}

/**
 * Insert a SIGNAL-ONLY demand location for one of the caller's own demands.
 * Never writes coordinates, never 'verified', never 'coordinates' precision.
 */
export async function addDemandLocation(
  input: AddDemandLocationInput,
): Promise<AddDemandLocationResult> {
  const requestId = clamp(input.requestId, 64);
  if (!requestId) return { kind: "invalid", message: "missing_request" };

  const countryCode = clamp(input.countryCode, 2).toUpperCase();
  if (!isMarketCountry(countryCode)) {
    return { kind: "invalid", message: "invalid_country" };
  }

  const city = orNull(clamp(input.city, MAX_REGION));
  const region = orNull(clamp(input.region, MAX_REGION));
  const locality = orNull(clamp(input.locality, MAX_REGION));
  const addressText = orNull(clamp(input.addressText, MAX_ADDRESS));
  // A human label is required by the table; fall back to the most specific
  // free-text the owner gave, else the country code itself.
  const locationLabel =
    orNull(clamp(input.locationLabel, MAX_LABEL)) ??
    addressText ??
    city ??
    locality ??
    countryCode;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  // Verify the demand is the caller's own — RLS would also block, but we want a
  // clean not-owner signal instead of a silent RLS/FK rejection.
  const { data: req } = await asAny(supabase)
    .from("customer_requests")
    .select("id")
    .eq("id", requestId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!req) return { kind: "not-owner" };

  const precision = derivePrecision({
    address: addressText,
    city,
    locality,
    country: countryCode,
  });

  // The honest write: SIGNAL-ONLY. latitude/longitude hard-pinned to null,
  // geocode_status hard-pinned to 'pending' (never 'verified'), precision never
  // 'coordinates'. These are constants here, not caller-controlled.
  const { data: inserted, error } = await asAny(supabase)
    .from("company_demand_locations")
    .insert({
      request_id: requestId,
      owner_id: user.id,
      country_code: countryCode,
      region,
      city,
      locality,
      address_text: addressText,
      location_label: locationLabel,
      latitude: null,
      longitude: null,
      geo_precision: precision,
      geocode_status: "pending",
      source: "demand_form",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === RELATION_NOT_FOUND) return { kind: "needs-migration" };
    // Exact-duplicate signal for this demand (the partial unique index from the
    // signal-only-write hardening migration) — surfaced as a clean duplicate,
    // not an error. Multi-site demands stay allowed (different city/label).
    if (error.code === UNIQUE_VIOLATION) return { kind: "duplicate" };
    console.error("[demand-location] insert failed:", error.message);
    return { kind: "error", message: "save_failed" };
  }

  return { kind: "ok", id: (inserted?.id as string) ?? "" };
}

/**
 * RLS-scoped read of the caller's own demand locations, summarized into honest
 * counts (never a synthesized point). Used by the market map to show a
 * signal-only status/count from the REAL table. Returns null on any
 * needs-migration/error so callers can fall back to the static "schema
 * prepared" state.
 */
async function fetchOwnDemandRows(): Promise<DemandLocation[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await asAny(supabase)
    .from("company_demand_locations")
    .select(
      "id, request_id, owner_id, country_code, region, city, locality, address_text, location_label, latitude, longitude, geo_precision, geocode_status, source",
    )
    .eq("owner_id", user.id);

  if (error || !Array.isArray(data)) return null;

  return data.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    requestId: String(r.request_id),
    ownerId: String(r.owner_id),
    countryCode: String(r.country_code),
    region: (r.region as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    locality: (r.locality as string | null) ?? null,
    addressText: (r.address_text as string | null) ?? null,
    locationLabel: String(r.location_label ?? ""),
    latitude: (r.latitude as number | null) ?? null,
    longitude: (r.longitude as number | null) ?? null,
    geoPrecision: r.geo_precision as DemandLocation["geoPrecision"],
    geocodeStatus: r.geocode_status as DemandLocation["geocodeStatus"],
    source: r.source as DemandLocation["source"],
  }));
}

export async function getOwnDemandLocationSummary(): Promise<DemandLocationSummary | null> {
  const rows = await fetchOwnDemandRows();
  return rows ? summarizeDemandLocations(rows) : null;
}

/**
 * The market-map SIGNAL-ONLY read layer: the caller's own demand locations
 * grouped by country, coordinate-free. Returns null when unauthenticated or on
 * any read error so the shell falls back to the empty/foundation state.
 */
export async function getOwnDemandSignalBoard(): Promise<DemandSignalBoard | null> {
  const rows = await fetchOwnDemandRows();
  return rows ? buildDemandSignalBoard(rows) : null;
}
