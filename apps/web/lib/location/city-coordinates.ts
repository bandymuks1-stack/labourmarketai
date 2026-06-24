/**
 * Provider-free, no-key city geocoding for the served markets (MVP).
 *
 * Owner bug: a manually-entered city (e.g. "Hilversum, NL") placed the marker on
 * the COUNTRY centroid, noticeably off. This module resolves a city name to
 * city-level coordinates from a controlled static table (no network, no key, no
 * silent wrong-city fallback) and reports an honest PRECISION level so the UI
 * never shows a precise-looking marker for an only-approximate location.
 *
 * Extend the table row-by-row; an unknown city resolves to `null` (UI shows
 * "vieta nepatikslinta"), never a guessed nearby point.
 */
import { foldText } from "@/lib/structuring/normalize";

export type LocationPrecision = "device" | "city" | "country" | "unset";

export interface CityCoord {
  readonly lat: number;
  readonly lng: number;
}

/** Country centroids (approximate) — used ONLY for an explicit country-only
 *  selection, always labelled approximate. */
export const COUNTRY_CENTROID: Readonly<Record<string, CityCoord>> = {
  LT: { lat: 55.2, lng: 23.9 },
  LV: { lat: 56.9, lng: 24.9 },
  EE: { lat: 58.9, lng: 25.6 },
  PL: { lat: 52.07, lng: 19.48 },
  DE: { lat: 51.16, lng: 10.45 },
  NL: { lat: 52.13, lng: 5.29 },
  DK: { lat: 56.0, lng: 9.5 },
  NO: { lat: 60.8, lng: 9.0 },
  SE: { lat: 62.0, lng: 15.5 },
  FI: { lat: 63.0, lng: 26.0 },
};

/** City coordinates for major cities in active markets. Keyed by country. */
const CITY_TABLE: Readonly<Record<string, ReadonlyArray<{ names: string[]; coord: CityCoord }>>> = {
  LT: [
    { names: ["vilnius"], coord: { lat: 54.6872, lng: 25.2797 } },
    { names: ["kaunas"], coord: { lat: 54.8985, lng: 23.9036 } },
    { names: ["klaipeda", "klaipėda"], coord: { lat: 55.7033, lng: 21.1443 } },
    { names: ["siauliai", "šiauliai"], coord: { lat: 55.9333, lng: 23.3167 } },
    { names: ["panevezys", "panevėžys"], coord: { lat: 55.7333, lng: 24.35 } },
  ],
  NL: [
    { names: ["amsterdam"], coord: { lat: 52.374, lng: 4.8897 } },
    { names: ["rotterdam"], coord: { lat: 51.9244, lng: 4.4777 } },
    { names: ["the hague", "den haag", "s-gravenhage", "'s-gravenhage"], coord: { lat: 52.0705, lng: 4.3007 } },
    { names: ["utrecht"], coord: { lat: 52.0907, lng: 5.1214 } },
    { names: ["eindhoven"], coord: { lat: 51.4416, lng: 5.4697 } },
    { names: ["hilversum"], coord: { lat: 52.2236, lng: 5.1761 } },
  ],
  DE: [
    { names: ["berlin"], coord: { lat: 52.52, lng: 13.405 } },
    { names: ["hamburg"], coord: { lat: 53.5511, lng: 9.9937 } },
    { names: ["munich", "munchen", "münchen"], coord: { lat: 48.1351, lng: 11.582 } },
    { names: ["cologne", "koln", "köln"], coord: { lat: 50.9375, lng: 6.9603 } },
    { names: ["frankfurt"], coord: { lat: 50.1109, lng: 8.6821 } },
    { names: ["dusseldorf", "düsseldorf"], coord: { lat: 51.2277, lng: 6.7735 } },
  ],
  DK: [
    { names: ["copenhagen", "kobenhavn", "københavn"], coord: { lat: 55.6761, lng: 12.5683 } },
    { names: ["aarhus", "århus"], coord: { lat: 56.1629, lng: 10.2039 } },
    { names: ["odense"], coord: { lat: 55.4038, lng: 10.4024 } },
    { names: ["aalborg", "ålborg"], coord: { lat: 57.0488, lng: 9.9217 } },
  ],
  NO: [
    { names: ["oslo"], coord: { lat: 59.9139, lng: 10.7522 } },
    { names: ["bergen"], coord: { lat: 60.3913, lng: 5.3221 } },
    { names: ["trondheim"], coord: { lat: 63.4305, lng: 10.3951 } },
    { names: ["stavanger"], coord: { lat: 58.97, lng: 5.7331 } },
  ],
  SE: [
    { names: ["stockholm"], coord: { lat: 59.3293, lng: 18.0686 } },
    { names: ["gothenburg", "goteborg", "göteborg"], coord: { lat: 57.7089, lng: 11.9746 } },
    { names: ["malmo", "malmö"], coord: { lat: 55.605, lng: 13.0038 } },
    { names: ["uppsala"], coord: { lat: 59.8586, lng: 17.6389 } },
  ],
  PL: [
    { names: ["warsaw", "warszawa"], coord: { lat: 52.2297, lng: 21.0122 } },
    { names: ["krakow", "kraków"], coord: { lat: 50.0647, lng: 19.945 } },
    { names: ["gdansk", "gdańsk"], coord: { lat: 54.352, lng: 18.6466 } },
    { names: ["wroclaw", "wrocław"], coord: { lat: 51.1079, lng: 17.0385 } },
    { names: ["poznan", "poznań"], coord: { lat: 52.4064, lng: 16.9252 } },
  ],
};

/** Resolve a free-text city within a country to city-level coordinates, or null
 *  if the city is not in the controlled table (NO wrong-city fallback). Matches
 *  on folded (diacritic-free, lowercased) names; the input may contain extra
 *  words (e.g. "Hilversum, Noord-Holland") — any known city name appearing as a
 *  token-ish substring wins. */
export function resolveCity(
  country: string | null | undefined,
  cityText: string | null | undefined,
): CityCoord | null {
  if (!country || !cityText) return null;
  const rows = CITY_TABLE[country.toUpperCase()];
  if (!rows) return null;
  const folded = foldText(cityText);
  if (!folded.trim()) return null;
  for (const row of rows) {
    for (const name of row.names) {
      const f = foldText(name);
      // Word-bounded-ish: the city name appears delimited by non-letters/edges,
      // so "utrecht" doesn't match inside an unrelated longer word.
      const re = new RegExp(`(^|[^a-z])${escapeRe(f)}([^a-z]|$)`);
      if (re.test(folded)) return row.coord;
    }
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ResolvedLocation {
  readonly coord: CityCoord | null;
  readonly precision: LocationPrecision;
}

/**
 * Resolve a stored location to a marker coordinate + honest precision.
 *  - device coords (browser geolocation) → exact "device".
 *  - manual city that resolves → "city" (precise).
 *  - manual country-only → country centroid, "country" (approximate).
 *  - manual city given but NOT resolvable → no marker, "unset".
 */
export function resolveLocation(loc: {
  source?: string | null;
  lat?: number | null;
  lng?: number | null;
  country?: string | null;
  region?: string | null;
  address?: string | null;
} | null | undefined): ResolvedLocation {
  if (!loc) return { coord: null, precision: "unset" };
  if (typeof loc.lat === "number" && typeof loc.lng === "number") {
    return { coord: { lat: loc.lat, lng: loc.lng }, precision: "device" };
  }
  const cityText = [loc.region, loc.address].filter(Boolean).join(" ").trim();
  if (cityText) {
    const city = resolveCity(loc.country, cityText);
    if (city) return { coord: city, precision: "city" };
    // A city was typed but not recognised — do NOT guess a nearby point.
    return { coord: null, precision: "unset" };
  }
  if (loc.country && COUNTRY_CENTROID[loc.country.toUpperCase()]) {
    return { coord: COUNTRY_CENTROID[loc.country.toUpperCase()], precision: "country" };
  }
  return { coord: null, precision: "unset" };
}
