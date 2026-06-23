/**
 * Provider-free location model (pure, no DB, no network, no map provider).
 *
 * PR #484 originally depended on Google Maps. Owner decision: the location
 * feature must work with NO paid/free external map or geocoding provider. This
 * module is the deterministic core: a structured selected location (browser
 * coordinates OR a manually chosen country/region) plus a search radius. It is
 * usable for job search with or without coordinates — no provider key, ever.
 */

export const RADIUS_OPTIONS = [10, 25, 50, 100] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS)[number];
export const DEFAULT_RADIUS_KM: RadiusKm = 25;

export type LocationSource = "auto" | "manual";

export interface SelectedLocation {
  readonly source: LocationSource;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly country: string | null;
  readonly region: string | null;
  readonly address: string | null;
  readonly radiusKm: RadiusKm;
  readonly savedAt: number;
}

export function hasCoords(
  loc: SelectedLocation,
): loc is SelectedLocation & { lat: number; lng: number } {
  return typeof loc.lat === "number" && typeof loc.lng === "number";
}

export function isUsableForSearch(loc: SelectedLocation): boolean {
  return hasCoords(loc) || !!(loc.country && loc.country.trim().length > 0);
}

export function normalizeRadius(n: number): RadiusKm {
  let best: RadiusKm = DEFAULT_RADIUS_KM;
  let bestDiff = Infinity;
  for (const r of RADIUS_OPTIONS) {
    const d = Math.abs(r - n);
    if (d < bestDiff) {
      bestDiff = d;
      best = r;
    }
  }
  return best;
}

export function summarizeLocation(loc: SelectedLocation): {
  source: LocationSource;
  radiusKm: RadiusKm;
  hasCoords: boolean;
  usable: boolean;
  where: string;
} {
  const where = hasCoords(loc)
    ? `${loc.lat?.toFixed(4)}, ${loc.lng?.toFixed(4)}`
    : [loc.region, loc.country].filter(Boolean).join(", ") || "(unset)";
  return {
    source: loc.source,
    radiusKm: loc.radiusKm,
    hasCoords: hasCoords(loc),
    usable: isUsableForSearch(loc),
    where,
  };
}

export function validateSelectedLocation(v: unknown): v is SelectedLocation {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const coordsOk =
    (o.lat === null && o.lng === null) ||
    (typeof o.lat === "number" &&
      Number.isFinite(o.lat) &&
      typeof o.lng === "number" &&
      Number.isFinite(o.lng));
  const radiusOk =
    typeof o.radiusKm === "number" &&
    (RADIUS_OPTIONS as readonly number[]).includes(o.radiusKm);
  return (
    (o.source === "auto" || o.source === "manual") &&
    coordsOk &&
    radiusOk &&
    (o.country === null || typeof o.country === "string") &&
    (o.region === null || typeof o.region === "string") &&
    (o.address === null || typeof o.address === "string") &&
    (typeof o.lat === "number" || (typeof o.country === "string" && o.country.length > 0))
  );
}