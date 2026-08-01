"use client";

import type * as LeafletTypes from "leaflet";

/**
 * THE ONE LEAFLET ENGINE (W3 row 28).
 *
 * Every geographic surface in the product boots its map HERE: one dynamic
 * import, one tile source, one attribution, one cleanup contract. The
 * presentations differ (market anchors, the own-location picker, the
 * workspace map) — the ENGINE does not. Before this file the product carried
 * three separate Leaflet bootstraps whose tile URLs and options had already
 * started to drift (maxZoom 12 vs 18 vs 19); the guard
 * `w3-row28-one-leaflet-engine.test.ts` pins that a fourth can never appear.
 *
 * REAL ENGINE, REAL COORDINATES: Leaflet + OpenStreetMap raster tiles, WGS84,
 * no API key, no paid/proprietary provider. `tile.openstreetmap.org` is the
 * OSM community tile server — fine for owner review / low traffic; the
 * long-term key-free migration target is documented in
 * docs/audits/market-map-long-term-map-strategy.md.
 */

/** The ONE tile source. This string may exist nowhere else in the product. */
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export type LeafletHandles = {
  L: typeof LeafletTypes;
  map: LeafletTypes.Map;
};

/**
 * Dynamically import Leaflet (it touches `window`, so client-only) and mount
 * a map on `host` with the caller's options + the canonical OSM tile layer.
 * The caller owns the returned map's lifecycle (`map.remove()` on cleanup) —
 * exactly the contract the three presentations already had.
 */
export async function mountLeafletMap(
  host: HTMLElement,
  options: {
    mapOptions?: LeafletTypes.MapOptions;
    /** Tile-layer zoom bounds; attribution is always the OSM credit. */
    maxZoom?: number;
    minZoom?: number;
  } = {},
): Promise<LeafletHandles> {
  const L = (await import("leaflet")).default as unknown as typeof LeafletTypes;
  const map = L.map(host, options.mapOptions);
  L.tileLayer(OSM_TILE_URL, {
    maxZoom: options.maxZoom ?? 19,
    minZoom: options.minZoom ?? 0,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return { L, map };
}
