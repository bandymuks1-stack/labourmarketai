import "server-only";

import {
  getDeclaredSkillSlugs,
  getPrimaryProfessionSlug,
} from "@/lib/data/worker-core";
import { bestEvidencedProfession } from "@/lib/opportunities/adjacent-directions";
import { getPublicMarketFacts } from "@/lib/market/public-market-facts-read";
import { resolveCity, COUNTRY_CENTROID } from "@/lib/location/city-coordinates";
import {
  EUROPE_CENTER,
  EUROPE_ZOOM,
  intensityOf,
  type MarketAnchor,
  type MarketMapView,
  type MarketRegion,
} from "@/components/app/market-map/market-map-model";

/**
 * PUBLIC VACANCY VOLUME as a map layer — a geographic projection of the
 * EXISTING `getPublicMarketFacts` read, nothing more.
 *
 * WHAT THIS IS. `public_vacancies` holds imported, externally published job
 * advertisements. `getPublicMarketFacts` already reduces them — authenticated,
 * under RLS, per profession, over a DEFINED ranking window — to counts, place
 * names and country codes. This module turns those same counts into
 * `MarketAnchor`s so the market-map page can show WHERE the advertised volume
 * sits, next to (never mixed into) the platform's own live demand layer.
 *
 * WHICH PROFESSION. The facts read requires a profession slug (its documented
 * contract), so this layer is about the CALLER's occupation: the declared
 * primary profession, or — exactly as the opportunities board's market panel
 * resolves it — the profession their recorded work evidences
 * (`bestEvidencedProfession`). A derived reading is reported as `derived` so
 * the surface can say so. No profession at all → `unavailable`, never a guess.
 *
 * GEOGRAPHY, HONESTLY. The facts carry city NAMES and country CODES tallied
 * independently, so a city is attributed to a country only when EXACTLY ONE of
 * the countries present in the data recognises it in the canonical city table.
 * Everything that cannot be placed at city precision — unknown cities, rows
 * with no city, ambiguous names — stays in a per-country APPROXIMATE aggregate
 * (`precision: "country"`), the same honest degradation `market-result.ts`
 * uses. No invented coordinates, no wrong-city fallback, and NOTHING here
 * hardcodes any country: the covered countries are read from the data, so new
 * source countries appear the day their rows do.
 *
 * SCOPE STAYS AUTHENTICATED. This inherits `getPublicMarketFacts`'s constraint
 * verbatim: `authenticated` holds the grant on `public_vacancies`, `anon` does
 * not, and this module must never be reachable from an anonymous surface.
 */

export interface VacancyVolumeData {
  readonly view: MarketMapView;
  readonly professionSlug: string;
  /** True when the profession was evidenced from recorded work, not declared. */
  readonly derived: boolean;
  /** Exact count of browsable advertisements for this profession. */
  readonly activeAds: number;
  /** How many newest ads the city/country volumes were tallied over. */
  readonly rankingWindowAds: number;
  /** True when that window was the whole browsable population. */
  readonly rankingWindowCoversAll: boolean;
  /** ISO-3166-1 alpha-2 codes present in the data — the TRUE current scope
   *  of the imported sources, derived, never asserted. */
  readonly countries: readonly string[];
}

export type VacancyVolumeResult =
  | { readonly kind: "ok"; readonly data: VacancyVolumeData }
  /** The market genuinely advertises nothing for this profession right now —
   *  a real answer, rendered as words, never as an empty-looking map. */
  | {
      readonly kind: "empty";
      readonly professionSlug: string;
      readonly derived: boolean;
    }
  /** No profession to ask about, store not provisioned, caller not
   *  authenticated, or the read failed. The section renders nothing. */
  | { readonly kind: "unavailable" };

export async function loadVacancyVolume(): Promise<VacancyVolumeResult> {
  // Never throws — this feeds an ADDITIVE section on a page that already
  // works; an outage here must cost the page one section, not the page.
  try {
    return await readVacancyVolume();
  } catch {
    return { kind: "unavailable" };
  }
}

async function readVacancyVolume(): Promise<VacancyVolumeResult> {
  const declared = await getPrimaryProfessionSlug();
  const slug =
    declared ??
    bestEvidencedProfession({
      workerSkillSlugs: await getDeclaredSkillSlugs(),
      declaredProfessionSlug: null,
    });
  if (!slug) return { kind: "unavailable" };
  const derived = !declared;

  const read = await getPublicMarketFacts(slug);
  if (read.kind !== "ok") return { kind: "unavailable" };
  const facts = read.facts;
  if (facts.activeAds === 0) return { kind: "empty", professionSlug: slug, derived };

  // Countries actually present in the ranking window — the derived scope.
  const countries = facts.countries
    .map((c) => c.key.toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code));

  // City anchors: attributable only when exactly ONE present country
  // recognises the name (the tallies are independent, so a name two present
  // countries both know cannot be split truthfully — it stays approximate).
  const cityAnchors = new Map<string, MarketAnchor[]>();
  const attributed = new Map<string, number>();
  for (const city of facts.topCities) {
    const hits = countries.filter((code) => resolveCity(code, city.key) !== null);
    if (hits.length !== 1) continue;
    const country = hits[0];
    const coord = resolveCity(country, city.key)!;
    const anchors = cityAnchors.get(country) ?? [];
    anchors.push({
      id: `vacancies-${country}-${city.key}`,
      label: city.key,
      precision: "city",
      lat: coord.lat,
      lng: coord.lng,
      weight: city.ads,
      layer: "jobs",
      country,
    });
    cityAnchors.set(country, anchors);
    attributed.set(country, (attributed.get(country) ?? 0) + city.ads);
  }

  const regions: MarketRegion[] = [];
  for (const c of facts.countries) {
    const code = c.key.toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    const anchors = [...(cityAnchors.get(code) ?? [])];
    // Volume not placeable at city precision (rows with no/unknown city, and
    // cities beyond the top-N tally) — ONE explicitly approximate aggregate
    // on the country centroid, never city-looking pins.
    const residual = c.ads - (attributed.get(code) ?? 0);
    if (residual > 0) {
      const centroid = COUNTRY_CENTROID[code];
      // No centroid → omitted. A wrong pin is worse than a missing one.
      if (centroid) {
        anchors.push({
          id: `vacancies-${code}-approx`,
          // Country code only — deliberately NOT a city name.
          label: code,
          precision: "country",
          lat: centroid.lat,
          lng: centroid.lng,
          weight: residual,
          layer: "jobs",
          country: code,
        });
      }
    }
    if (anchors.length === 0) continue;
    regions.push({
      code,
      label: code,
      intensity: intensityOf(c.ads),
      anchors,
    });
  }

  if (regions.length === 0) return { kind: "unavailable" };

  return {
    kind: "ok",
    data: {
      view: {
        origin: "live",
        center: EUROPE_CENTER,
        zoom: EUROPE_ZOOM,
        regions,
      },
      professionSlug: slug,
      derived,
      activeAds: facts.activeAds,
      rankingWindowAds: facts.rankingWindowAds,
      rankingWindowCoversAll: facts.rankingWindowCoversAll,
      countries,
    },
  };
}
