import "server-only";

import { cache } from "react";

import { loadVacancyVolume } from "./vacancy-volume";
import { getOwnSpatialCollections } from "./spatial-read";
import { loadWorldView } from "./world-read";
import { DEFAULT_WORLD_BOUNDS, DEFAULT_WORLD_ZOOM, type WorldLayer, type WorldViewResult } from "./world-model";
import { deriveMarketBrief, type MarketBrief } from "./market-brief-model";

/**
 * THE MARKET BRIEF LOADER — composes the readers the canonical Market Map
 * already runs (world demand + projects over the default Europe viewport,
 * profession-scoped vacancy volume, the caller's own company territory) into
 * ONE `MarketBrief` for the home and the map's signals rail.
 *
 * No new table, no new RPC, no privilege: every leg runs as the signed-in
 * caller through the same readers and the same RLS as the map itself. A leg
 * that throws is `null` → the model renders it UNKNOWN, never empty (SEP-7).
 * Request-cached, so the home and the map can both ask without a second read.
 */

/**
 * The default-viewport read of one world layer, request-cached so the map page
 * (its first render) and the brief (the home and the signals rail) share ONE
 * read per layer instead of each running their own.
 */
export const loadDefaultWorldView = cache(async (layer: WorldLayer): Promise<WorldViewResult | null> => {
  try {
    return await loadWorldView({ bounds: DEFAULT_WORLD_BOUNDS, zoom: DEFAULT_WORLD_ZOOM, layer });
  } catch {
    return null;
  }
});

/** Request-cached beside the world reads, for the same reason. */
export const loadVacancyVolumeOnce = cache(() => loadVacancyVolume());
export const loadOwnSpatialOnce = cache(async () => {
  try {
    return await getOwnSpatialCollections();
  } catch {
    return null;
  }
});

async function territoryCount(): Promise<number | null> {
  const spatial = await loadOwnSpatialOnce();
  return spatial?.collections.companyTerritories.length ?? null;
}

export const loadMarketBrief = cache(async (): Promise<MarketBrief> => {
  const [needs, projects, vacancies, territory] = await Promise.all([
    loadDefaultWorldView("demand"),
    loadDefaultWorldView("projects"),
    loadVacancyVolumeOnce(),
    territoryCount(),
  ]);
  return deriveMarketBrief({ needs, projects, vacancies, territoryCount: territory });
});
