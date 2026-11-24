/**
 * Project location status (systemic-ux-project-v1).
 *
 * Makes a project a real work object with an honest LOCATION block, reusing
 * the SAME no-fake-marker rule as the signal-only market map
 * (`lib/market-map/demand-locations.ts`): a map point is shown ONLY for
 * verified/manual coordinates. Projects today carry text `city` + `country`
 * but NO coordinate columns, so the honest state is always "text only" until a
 * future, owner-gated geocoder migration adds verified coordinates. No fake
 * lat/lng, no secret geocoding.
 *
 * Pure + deterministic. No DB change (reads existing `projects.city/country`).
 */

export type ProjectLocationStatus =
  /** No city and no country — the project has no location at all. */
  | "missing"
  /** A city/country is written, but there is no verified map point yet. */
  | "text_only"
  /** Coordinates exist but are not verified — never drawn as a marker. */
  | "unverified"
  /** Verified/manual coordinates — safe to draw a real marker. */
  | "verified";

export type ProjectLocationInput = {
  city?: string | null;
  country?: string | null;
  /** Future geocoder fields — absent today. Mirrors the market-map model. */
  latitude?: number | null;
  longitude?: number | null;
  geocodeStatus?: string | null;
};

export type ProjectLocation = {
  status: ProjectLocationStatus;
  city: string | null;
  country: string | null;
  /** True only when a real marker may be drawn (verified/manual coords). */
  mappable: boolean;
  /** True when at least a city or country is written. */
  hasText: boolean;
};

function clean(v?: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

/** Same mappability rule as the signal-only market map: lat+lng present AND
 *  geocode status verified/manual. */
function isMappable(loc: ProjectLocationInput): boolean {
  return (
    loc.latitude != null &&
    loc.longitude != null &&
    (loc.geocodeStatus === "verified" || loc.geocodeStatus === "manual")
  );
}

export function deriveProjectLocation(loc: ProjectLocationInput): ProjectLocation {
  const city = clean(loc.city);
  const country = clean(loc.country);
  const hasText = Boolean(city || country);
  const mappable = isMappable(loc);

  let status: ProjectLocationStatus;
  if (mappable) status = "verified";
  else if (loc.latitude != null && loc.longitude != null) status = "unverified";
  else if (hasText) status = "text_only";
  else status = "missing";

  return { status, city, country, mappable, hasText };
}

/** A single readable line "Miestas, Šalis" (or just one when only one is set). */
export function formatProjectPlace(loc: ProjectLocation): string | null {
  return [loc.city, loc.country].filter(Boolean).join(", ") || null;
}
