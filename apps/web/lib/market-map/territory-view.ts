/**
 * TERRITORY VIEW — the owner company's own operating territory projected onto
 * the canonical `MarketMapView`, so it is one LAYER of the ONE map instead of
 * a separate list (formerly `market-map-entity-layers.tsx`).
 *
 * Pure, no IO. Source: `CompanyTerritoryEntity[]` from the owner-scoped
 * spatial read (`getOwnSpatialCollections`). Nothing is invented: an entity
 * with company-entered coordinates draws there (city precision); otherwise it
 * is folded onto its country centroid and marked country-precision (the map
 * draws that dashed — an approximation, never a city). An entity whose country
 * has no known centroid is skipped (UNKNOWN is not drawn as a made-up point).
 */

import type { CompanyTerritoryEntity } from "@/lib/market-map/spatial-entities";
import { placeWorldRow } from "@/lib/market-map/world-model";
import {
  EUROPE_CENTER,
  EUROPE_ZOOM,
  type MarketAnchor,
  type MarketMapView,
  type MarketRegion,
} from "@/components/app/market-map/market-map-model";

export function buildTerritoryView(
  territories: readonly CompanyTerritoryEntity[],
  countryName: (code: string) => string,
): MarketMapView {
  const byCountry = new Map<string, MarketAnchor[]>();
  for (const t of territories) {
    const placeText = t.city ?? t.region ?? t.label;
    let lat: number;
    let lng: number;
    let precision: "city" | "country";
    let label: string;
    if (t.center) {
      lat = t.center.latitude;
      lng = t.center.longitude;
      precision = "city";
      label = t.label ?? t.city ?? countryName(t.country);
    } else {
      const placed = placeWorldRow(t.country, placeText);
      if (!placed) continue;
      lat = placed.lat;
      lng = placed.lng;
      precision = placed.precision;
      label =
        placed.precision === "city"
          ? (t.label ?? placed.placeLabel)
          : countryName(t.country);
    }
    const anchors = byCountry.get(t.country) ?? [];
    anchors.push({
      id: t.id,
      label,
      precision,
      lat,
      lng,
      layer: "territory",
      country: t.country,
    });
    byCountry.set(t.country, anchors);
  }
  const regions: MarketRegion[] = [...byCountry.entries()].map(([code, anchors]) => ({
    code,
    label: countryName(code),
    intensity: 0,
    anchors,
  }));
  return {
    regions,
    origin: "live",
    center: EUROPE_CENTER,
    zoom: EUROPE_ZOOM,
  };
}
