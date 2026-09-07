import {
  EUROPE_CENTER,
  EUROPE_ZOOM,
  type MarketAnchor,
  type MarketMapView,
  type MarketRegion,
} from "@/components/app/market-map/market-map-model";
import { COUNTRY_CENTROID } from "@/lib/location/city-coordinates";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";

/**
 * THE PUBLIC MARKET MAP'S DATA — real places, zero activity claims.
 *
 * ── WHY THIS IS COVERAGE AND NOT THE MARKET (owner window 11 §17) ──────────
 *
 * The owner asked for the market map back on the landing, and asked that it
 * not be faked and not be decorative. Both constraints bind at once, because
 * an anonymous visitor cannot be shown WHERE the market is. Measured against
 * production on 2026-09-07, not assumed:
 *
 *   · `public_vacancies` has NO grant to `anon` at all (42501 on a direct
 *     read — proven 2026-08-18 and recorded in `public-vacancy-preview.ts`).
 *   · The three anon RPCs that do exist return, by their own RETURNS TABLE
 *     clauses, no country, no region, no city and no coordinates. Migration
 *     `20260824120000_public_vacancy_anon_boundary_v2` REMOVED the last two
 *     fields that leaked a location, deliberately.
 *   · `count_public_vacancies_v1` returns three scalars: active vacancies,
 *     distinct employers, last refreshed. No geography.
 *   · `get_public_business_profile_v1` does return a country — but it takes
 *     ONE slug, so it cannot enumerate anything.
 *
 * So there is exactly one geographic fact this product may state publicly
 * today: **which markets it operates in**. That is `MARKET_COUNTRIES`, drawn
 * at the real centroids the location module already holds. It is true, it is
 * not activity, and it answers the first question a visitor actually has —
 * *"does this work where I am?"*
 *
 * ── WHY THE ANCHORS CARRY NO NUMBER ────────────────────────────────────────
 *
 * `MarketAnchor.weight` is optional for this reader alone. A coverage anchor
 * has no honest quantity, and `0` is not a stand-in for one: "Lietuva · 0"
 * asserts that nothing is happening in Lithuania, which is SEP-7 (UNKNOWN
 * rendered as ZERO) and is also false. The map draws the place and names it.
 *
 * ── WHAT WOULD MAKE IT THE REAL MARKET ─────────────────────────────────────
 *
 * One owner decision, costed in `docs/human-gates/HG-2026-09-07-public-market-map.md`:
 * a `SECURITY DEFINER` aggregate over `public_vacancies` returning
 * `(country, city_or_null, count)` with k-anonymity applied inside the
 * function, granted to `anon`. This module is shaped so that landing it means
 * adding a second reader beside `publicCoverageView()` and switching the
 * section's `origin` — not rebuilding the section.
 *
 * PURE: no IO, no server-only import, no database. Deterministic.
 */

/** ISO-2 codes the product actually operates in, in a stable order. */
export const COVERAGE_COUNTRIES: readonly string[] = [...MARKET_COUNTRIES];

/**
 * The coverage view. `origin: "coverage"` is what the map's own badge reads to
 * label itself honestly — never "live", which would claim these places hold
 * today's market, and never "preview", which would imply the countries are
 * invented.
 *
 * @param countryName resolves an ISO-2 to the viewer's language. The caller
 *        supplies it from the `labourMarket.countryNames` catalogue every
 *        other surface already uses, so this module carries no copy.
 */
export function publicCoverageView(
  countryName: (code: string) => string,
): MarketMapView {
  const regions: MarketRegion[] = [];
  for (const code of COVERAGE_COUNTRIES) {
    const centroid = COUNTRY_CENTROID[code];
    // A country with no centroid is skipped rather than placed at 0,0 — the
    // Gulf of Guinea is not a labour market.
    if (!centroid) continue;
    const label = countryName(code);
    const anchor: MarketAnchor = {
      id: `coverage:${code}`,
      label,
      // The whole country IS the unit here, so the map's dashed "approximate"
      // treatment is exactly right: this is not a city pin and must not look
      // like one.
      precision: "country",
      lat: centroid.lat,
      lng: centroid.lng,
      // No `weight` — see the note above.
      layer: "demand",
      country: code,
    };
    regions.push({
      code,
      label,
      // Coverage is not a quantity, so every market shades identically. A
      // varying intensity here would be a ranking nobody measured.
      intensity: 0,
      anchors: [anchor],
    });
  }
  return {
    regions,
    origin: "coverage",
    center: EUROPE_CENTER,
    zoom: EUROPE_ZOOM,
  };
}

/** How many markets the coverage view will actually draw. */
export function coverageCountryCount(): number {
  return COVERAGE_COUNTRIES.filter((c) => Boolean(COUNTRY_CENTROID[c])).length;
}
