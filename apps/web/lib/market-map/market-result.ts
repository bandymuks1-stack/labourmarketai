import "server-only";

import { loadCanonicalDemand } from "@/lib/demand/canonical-demand";
import {
  dedupeCanonicalDemand,
  placeableDemand,
} from "@/lib/demand/canonical-demand-model";
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
 * Answers the market goal ("where is demand, and why there?") from the ONE
 * canonical demand read (`@/lib/demand/canonical-demand`). No new table and no
 * migration — but, since W10 slice 4, no second source of truth either.
 *
 * WHAT CHANGED AND WHY. This module used to read `job_demands` directly. That
 * was the platform's SECOND demand truth: the employer workflow, the worker
 * board, scouting and booking all run on `customer_requests`, so an employer
 * could submit a real need and this map — reading the other table — would show
 * no demand at all. The map and the marketplace described different markets.
 * The canonical read composes both stores through paths the caller is ALREADY
 * authorized to use, so the two surfaces now answer from one list.
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
  /**
   * True when the READ ITSELF failed.
   *
   * Previously a failed query returned the empty result, so a broken read
   * rendered "there are no open needs with a location right now" — a claim
   * about the market made on the strength of a claim about us. They are
   * different answers and the panel now says which one it is.
   */
  readonly failed: boolean;
}

export async function loadMarketResult(): Promise<MarketResultData> {
  const canonical = await loadCanonicalDemand();
  if (canonical.state === "error") return emptyResult({ failed: true });

  // Dedup FIRST: one canonical demand must produce one unit of weight, even
  // when two authorized branches returned it. Then keep only rows that carry a
  // real country — a demand with no country is real but not placeable, and it
  // is withheld rather than given a centroid it never had.
  const rows = placeableDemand(dedupeCanonicalDemand(canonical.rows));

  // Group by country → city.
  //
  // THE UNIT IS DEMAND INTENSITY, NOT A HEADCOUNT CLAIM. A need whose team size
  // is unknown contributes 1 — the floor of "at least one need exists here",
  // which is true — and a need for 12 contributes 12. This drives marker
  // intensity only. It is never rendered as a number of people: the drilldown
  // reads `openHeadcount` with an explicit `missing: ["headcount"]` and shows
  // "not stated" for exactly these rows. Excluding unknown-quantity needs
  // instead would hide most real demand from the map, which is a worse lie
  // than a coarse intensity.
  const byCountry = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const country = row.country;
    if (!country) continue;
    const city = row.cityLabel ?? "";
    const cities = byCountry.get(country) ?? new Map<string, number>();
    cities.set(city, (cities.get(city) ?? 0) + (row.quantity ?? 1));
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
    failed: false,
    view: {
      origin: "live",
      center: EUROPE_CENTER,
      zoom: EUROPE_ZOOM,
      regions,
    },
  };
}

function emptyResult({ failed = false }: { failed?: boolean } = {}): MarketResultData {
  return {
    empty: true,
    failed,
    view: {
      origin: "live",
      center: EUROPE_CENTER,
      zoom: EUROPE_ZOOM,
      regions: [],
    },
  };
}
