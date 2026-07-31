import "server-only";

import { createClient } from "@/lib/supabase/server";
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
 * THE MARKET RESULT — real rows, geographic.
 *
 * Answers the market goal ("where is demand, and why there?") from the SAME
 * canonical tables the authenticated product already uses: projects carry the
 * geography, `job_demands` carry the headcount behind it. No new table, no
 * migration, no second source of truth.
 *
 * HONEST BY CONSTRUCTION:
 *  - `origin` is `live` — these are real rows for this environment. The landing's
 *    scripted scenario is a SEPARATE module tagged `demo`, and neither can reach
 *    the other. There is deliberately no demo fallback here: when there are no
 *    rows the result is empty and says so, because an authenticated user seeing
 *    invented demand is worse than seeing none.
 *  - PRIVACY: this reads DEMAND (projects and their open needs), never people.
 *    Individual worker coordinates are never resolved — `spatial-entities.ts`
 *    keeps the person type structurally coordinate-free and a guard enforces it.
 *  - Geography degrades honestly AND VISIBLY. A project with a known city gets
 *    that city's coordinate (`precision: "city"`). One whose city cannot be
 *    resolved is NOT given a city-looking pin: its demand is folded into a
 *    single country-level aggregate marked `precision: "country"` and labelled
 *    as approximate. A country centroid carrying a city name would be a
 *    fabricated location, which is worse than a coarser honest one.
 *
 * RLS does the authorization. This runs as the signed-in user, so it can only
 * aggregate rows that user may already read.
 */
export interface MarketResultData {
  readonly view: MarketMapView;
  /** True when the query succeeded and simply found nothing. */
  readonly empty: boolean;
}

type DemandRow = {
  headcount_needed: number | null;
  projects: { country: string | null; city: string | null; title: string | null } | null;
};

export async function loadMarketResult(): Promise<MarketResultData> {
  const supabase = await createClient();

  // One join: open needs and the project that carries their geography.
  const { data, error } = await supabase
    .from("job_demands")
    .select("headcount_needed, projects(country, city, title)")
    .eq("status", "open")
    .limit(500);

  if (error || !data) return emptyResult();

  // Group by country → city, summing headcount. The map shows WHERE work is,
  // so the unit is people needed, not rows returned.
  const byCountry = new Map<string, Map<string, number>>();
  for (const row of data as unknown as DemandRow[]) {
    const country = row.projects?.country?.toUpperCase();
    if (!country) continue;
    const city = row.projects?.city ?? "";
    const cities = byCountry.get(country) ?? new Map<string, number>();
    cities.set(city, (cities.get(city) ?? 0) + (row.headcount_needed ?? 1));
    byCountry.set(country, cities);
  }

  const regions: MarketRegion[] = [];
  for (const [country, cities] of byCountry) {
    const anchors: MarketAnchor[] = [];
    let total = 0;

    // Demand whose city could not be resolved is accumulated here and emitted
    // ONCE as an explicitly approximate country aggregate — never as N pins
    // stacked on the centroid pretending to be distinct places.
    let unresolved = 0;

    for (const [city, weight] of cities) {
      total += weight;
      const coord = city ? resolveCity(country, city) : null;
      if (!coord) {
        unresolved += weight;
        continue;
      }
      anchors.push({
        id: `${country}-${city}`,
        label: city,
        precision: "city",
        lat: coord.lat,
        lng: coord.lng,
        weight,
        layer: "demand",
        country,
      });
    }

    if (unresolved > 0) {
      const centroid = COUNTRY_CENTROID[country];
      // No centroid either → omitted entirely. A wrong pin is worse than a
      // missing one.
      if (centroid) {
        anchors.push({
          id: `${country}-approx`,
          // Country code only. Deliberately NOT a city name.
          label: country,
          precision: "country",
          lat: centroid.lat,
          lng: centroid.lng,
          weight: unresolved,
          layer: "demand",
          country,
        });
      }
    }

    if (anchors.length === 0) continue;
    regions.push({
      code: country,
      label: country,
      intensity: intensityOf(total),
      anchors,
    });
  }

  if (regions.length === 0) return emptyResult();

  return {
    empty: false,
    view: {
      origin: "live",
      center: EUROPE_CENTER,
      zoom: EUROPE_ZOOM,
      regions,
    },
  };
}

function emptyResult(): MarketResultData {
  return {
    empty: true,
    view: {
      origin: "live",
      center: EUROPE_CENTER,
      zoom: EUROPE_ZOOM,
      regions: [],
    },
  };
}
