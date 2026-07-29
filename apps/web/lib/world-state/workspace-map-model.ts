/**
 * WORKSPACE MAP — pure model (W6).
 *
 * The lock (`WORLD_STATE_UX_ARCHITECTURE_V1`) says the map is not a separate
 * screen: it is one of the three parts of the ONE workspace, and it REACTS to
 * World State. This module gives that a testable shape: real entities with
 * real (city-precision) coordinates, grouped per city so a busy market renders
 * as counted clusters — never as a hundred overlapping pins.
 *
 * HONESTY:
 *  - only entities whose location actually RESOLVES appear; an unmappable row
 *    is counted in `unmapped`, never invented onto the map;
 *  - precision is carried (`city` vs `country` centroid) so the UI can say
 *    "apytikslė vieta" instead of implying an address;
 *  - a cluster's count is the number of REAL entities behind it.
 *
 * Pure: no IO, no leaflet, no React.
 */

import type { EntityRef } from "./world-state";

export interface WorkspaceMapEntity {
  readonly ref: EntityRef;
  /** Short human label (company / project title) — already localized. */
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
  /** `city` = named city resolved; `country` = country centroid (approximate). */
  readonly precision: "city" | "country";
  /** The place name shown in the cluster popup. */
  readonly placeLabel: string;
}

/** One rendered marker: a place with 1..n real entities. */
export interface WorkspaceMapCluster {
  readonly key: string;
  readonly lat: number;
  readonly lng: number;
  readonly placeLabel: string;
  readonly precision: "city" | "country";
  readonly entities: readonly WorkspaceMapEntity[];
}

export interface WorkspaceMapView {
  readonly clusters: readonly WorkspaceMapCluster[];
  /** Real rows that could not be placed — reported, never faked. */
  readonly unmapped: number;
}

/**
 * Group entities by their resolved coordinate (rounded to ~1km) — the honest
 * "cluster by place": three demands in Amsterdam become ONE marker with a
 * count of three, and clicking it lists the three real entities.
 */
export function clusterWorkspaceEntities(
  entities: readonly WorkspaceMapEntity[],
  unmapped: number,
): WorkspaceMapView {
  const byPlace = new Map<string, WorkspaceMapEntity[]>();
  for (const e of entities) {
    const key = `${e.lat.toFixed(2)}|${e.lng.toFixed(2)}`;
    const list = byPlace.get(key) ?? [];
    list.push(e);
    byPlace.set(key, list);
  }
  const clusters: WorkspaceMapCluster[] = [...byPlace.entries()].map(([key, list]) => ({
    key,
    lat: list[0].lat,
    lng: list[0].lng,
    placeLabel: list[0].placeLabel,
    // A cluster is only city-precise when EVERY member is: one country-level
    // centroid in the group makes the pin approximate, and the UI must say so.
    precision: list.every((e) => e.precision === "city") ? "city" : "country",
    entities: list,
  }));
  // Deterministic order: biggest place first, then north→south for stability.
  clusters.sort((a, b) => b.entities.length - a.entities.length || b.lat - a.lat);
  return { clusters, unmapped };
}

/** Bounds that fit every cluster, or null when there is nothing to fit. */
export function boundsFor(
  clusters: readonly WorkspaceMapCluster[],
): [[number, number], [number, number]] | null {
  if (clusters.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const c of clusters) {
    minLat = Math.min(minLat, c.lat);
    maxLat = Math.max(maxLat, c.lat);
    minLng = Math.min(minLng, c.lng);
    maxLng = Math.max(maxLng, c.lng);
  }
  // A single point still deserves breathing room around it.
  const pad = 0.35;
  return [
    [minLat - pad, minLng - pad],
    [maxLat + pad, maxLng + pad],
  ];
}
