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
import { ALL_ISO_COUNTRIES, getCountryMeta } from "@/lib/location/country-model";

export type LocationPrecision = "device" | "city" | "country" | "unset";

export interface CityCoord {
  readonly lat: number;
  readonly lng: number;
}

/** Country centroids (approximate) for EVERY ISO-3166-1 alpha-2 country —
 *  derived from the canonical country model (PR-G: no Europe-only subset).
 *  Used ONLY for an explicit country-only selection, always labelled
 *  approximate. */
export const COUNTRY_CENTROID: Readonly<Record<string, CityCoord>> =
  Object.freeze(
    Object.fromEntries(
      ALL_ISO_COUNTRIES.map((code) => {
        const c = getCountryMeta(code)!.centroid;
        return [code, { lat: c.lat, lng: c.lng }];
      }),
    ),
  );

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
    { names: ["linkoping", "linköping"], coord: { lat: 58.4109, lng: 15.6216 } },
    { names: ["jonkoping", "jönköping"], coord: { lat: 57.7826, lng: 14.1618 } },
    { names: ["orebro", "örebro"], coord: { lat: 59.2753, lng: 15.2134 } },
    { names: ["umea", "umeå"], coord: { lat: 63.8258, lng: 20.263 } },
    { names: ["vasteras", "västerås"], coord: { lat: 59.6099, lng: 16.5448 } },
    { names: ["lulea", "luleå"], coord: { lat: 65.5848, lng: 22.1567 } },
    { names: ["lund"], coord: { lat: 55.7047, lng: 13.191 } },
  ],
  PL: [
    { names: ["warsaw", "warszawa"], coord: { lat: 52.2297, lng: 21.0122 } },
    { names: ["krakow", "kraków"], coord: { lat: 50.0647, lng: 19.945 } },
    { names: ["gdansk", "gdańsk"], coord: { lat: 54.352, lng: 18.6466 } },
    { names: ["wroclaw", "wrocław"], coord: { lat: 51.1079, lng: 17.0385 } },
    { names: ["poznan", "poznań"], coord: { lat: 52.4064, lng: 16.9252 } },
  ],
  // Georgia — first-class market (PR-G global location model).
  GE: [
    { names: ["tbilisi", "tbilisis"], coord: { lat: 41.7151, lng: 44.8271 } },
    { names: ["batumi"], coord: { lat: 41.6168, lng: 41.6367 } },
    { names: ["kutaisi"], coord: { lat: 42.2679, lng: 42.6946 } },
    { names: ["rustavi"], coord: { lat: 41.5495, lng: 44.993 } },
  ],
  // USA — first-class market (PR-G global location model). Major metros.
  US: [
    { names: ["new york", "new york city", "nyc"], coord: { lat: 40.7128, lng: -74.006 } },
    { names: ["los angeles"], coord: { lat: 34.0522, lng: -118.2437 } },
    { names: ["chicago"], coord: { lat: 41.8781, lng: -87.6298 } },
    { names: ["houston"], coord: { lat: 29.7604, lng: -95.3698 } },
    { names: ["miami"], coord: { lat: 25.7617, lng: -80.1918 } },
    { names: ["dallas"], coord: { lat: 32.7767, lng: -96.797 } },
    { names: ["phoenix"], coord: { lat: 33.4484, lng: -112.074 } },
    { names: ["philadelphia"], coord: { lat: 39.9526, lng: -75.1652 } },
    { names: ["atlanta"], coord: { lat: 33.749, lng: -84.388 } },
    { names: ["seattle"], coord: { lat: 47.6062, lng: -122.3321 } },
    { names: ["boston"], coord: { lat: 42.3601, lng: -71.0589 } },
    { names: ["denver"], coord: { lat: 39.7392, lng: -104.9903 } },
    { names: ["washington", "washington dc", "washington d.c."], coord: { lat: 38.9072, lng: -77.0369 } },
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

/**
 * Every city the controlled table can place, with its country and coordinate.
 *
 * Read-only projection for viewport-bounded reads (P8 World): a map viewport
 * is translated into the set of countries that own at least one PLACEABLE
 * point inside it (a known city here, or the country centroid), so a bounded
 * read filters on the existing `country` column instead of scanning. Adding a
 * city row above makes it discoverable here with no other change.
 */
export interface KnownCity {
  readonly country: string;
  readonly label: string;
  readonly coord: CityCoord;
}

export function listKnownCities(): readonly KnownCity[] {
  const out: KnownCity[] = [];
  for (const [country, rows] of Object.entries(CITY_TABLE)) {
    for (const row of rows) {
      out.push({ country, label: row.names[0], coord: row.coord });
    }
  }
  return out;
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
