/**
 * WORLD — the pure half of the P8 discovery subset (frozen design contract §5
 * P8, design system K + T; stage H2 "bounded, clustered, ≤60 objects").
 *
 * WHAT THIS MODULE IS. The viewport → bounded read → clusters → capped view
 * pipeline as pure functions: bounds validation, semantic scale, the country
 * set a viewport can ever touch, place resolution with honest precision and
 * provenance, clustering, the object cap with overflow ACCOUNTING (never a
 * silent drop), and the projection onto the canonical `MarketMapView` that the
 * ONE `<MarketMap>` presentation already draws. No IO, no React, no Leaflet —
 * `world-read.ts` feeds it real RLS-scoped rows; `world-model.test.ts` pins
 * every rule below without a database.
 *
 * THE 1M RULE (contract §3 / design T / owner contract §1b). A viewport is
 * translated into a bounded predicate on the EXISTING `country` column (the
 * only location column every canonical row carries), every DB leg is LIMITed,
 * and on screen there are never more than `WORLD_OBJECT_CAP` places. What the
 * cap folds away is COUNTED and said out loud — "N more places, zoom in" — so
 * the person always knows what the view is not showing them.
 *
 * FACT / DERIVED (design §1.7, M). A row placed at the city its record states
 * is a `fact`. A row whose place could not be resolved is folded onto its
 * country centroid and marked `derived` — an approximate position derived from
 * the country alone, drawn dashed/hollow AND named in text (never colour alone).
 * A cluster with one derived member is derived as a whole.
 *
 * NO SECOND WORLD. This does not add a map, a table, an RPC or a demand truth:
 * demand rows pass through `lib/demand/canonical-demand-model` (the ONE
 * normalisation), people stay the aggregate-only `person_presence` buckets of
 * `spatial-entities.ts`, projects are the caller's RLS-visible `projects` rows.
 */

import { resolveCity, COUNTRY_CENTROID, type CityCoord } from "@/lib/location/city-coordinates";
import {
  EUROPE_CENTER,
  EUROPE_ZOOM,
  intensityOf,
  type AnchorPrecision,
  type MarketAnchor,
  type MarketMapLayer,
  type MarketMapView,
  type MarketRegion,
} from "@/components/app/market-map/market-map-model";

// ── Constants (pinned by lib/guards/world-discovery-subset.test.ts) ─────────

/** Never more than this many places on screen (frozen contract §3, design K/T). */
export const WORLD_OBJECT_CAP = 60;

/**
 * Rows read per bounded DB leg. The cap above bounds what is DRAWN; this
 * bounds what is SCANNED. `limit(WORLD_ROW_LIMIT + 1)` lets the read say
 * "truncated" precisely instead of guessing from a full page.
 */
export const WORLD_ROW_LIMIT = 300;

/** Zoom at which clusters split from one-per-country to one-per-place. */
export const WORLD_PLACE_SCALE_MIN_ZOOM = 6;

/** Members carried per cluster into the list equivalent — the rest is a count. */
export const WORLD_LIST_MEMBERS_MAX = 12;

/** Leaflet's zoom range on the canonical map (min 3 / max 12) plus slack. */
const ZOOM_MIN = 0;
const ZOOM_MAX = 19;

/** Web-mercator latitude limit — a viewport can never report more. */
const LAT_LIMIT = 85.05113;

// ── Layers ──────────────────────────────────────────────────────────────────

/** The three layers of the subset, in the words the contract uses. */
export const WORLD_LAYERS = ["demand", "supply", "projects"] as const;
export type WorldLayer = (typeof WORLD_LAYERS)[number];

/** Which canonical map layer (colour family) each world layer draws with. */
export const WORLD_LAYER_TO_MAP_LAYER: Readonly<Record<WorldLayer, MarketMapLayer>> = {
  demand: "demand",
  supply: "people",
  projects: "projects",
};

export function isWorldLayer(value: unknown): value is WorldLayer {
  return typeof value === "string" && (WORLD_LAYERS as readonly string[]).includes(value);
}

// ── Viewport ────────────────────────────────────────────────────────────────

export interface WorldBounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

/** Europe at the canonical map's default zoom, for the first server render. */
export const DEFAULT_WORLD_BOUNDS: WorldBounds = Object.freeze({
  south: 35,
  west: -12,
  north: 63,
  east: 30,
});
export const DEFAULT_WORLD_ZOOM = EUROPE_ZOOM;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Wrap a longitude into [-180, 180]. */
export function wrapLongitude(lng: number): number {
  const w = ((((lng + 180) % 360) + 360) % 360) - 180;
  // -180 and 180 are the same meridian; keep the sign the caller used.
  return w === -180 && lng > 0 ? 180 : w;
}

/**
 * Validate untrusted viewport input (a server action receives it from the
 * browser). Returns `null` for anything that is not four finite numbers with
 * south < north. Latitudes are clamped to the mercator limit; a longitude span
 * of 360° or more becomes the whole world, otherwise longitudes are wrapped so
 * a viewport across the antimeridian keeps west > east and `boundsContain`
 * handles the wrap.
 */
export function parseWorldBounds(input: unknown): WorldBounds | null {
  if (!input || typeof input !== "object") return null;
  const b = input as Record<string, unknown>;
  const { south, west, north, east } = b;
  if (!finite(south) || !finite(west) || !finite(north) || !finite(east)) return null;
  if (south >= north) return null;
  const clampLat = (v: number) => Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, v));
  if (east - west >= 360) {
    return { south: clampLat(south), west: -180, north: clampLat(north), east: 180 };
  }
  return {
    south: clampLat(south),
    west: wrapLongitude(west),
    north: clampLat(north),
    east: wrapLongitude(east),
  };
}

/** Point-in-viewport, antimeridian-aware (west > east = wrapped viewport). */
export function boundsContain(bounds: WorldBounds, lat: number, lng: number): boolean {
  if (lat < bounds.south || lat > bounds.north) return false;
  const x = wrapLongitude(lng);
  if (bounds.west <= bounds.east) return x >= bounds.west && x <= bounds.east;
  return x >= bounds.west || x <= bounds.east;
}

export function parseWorldZoom(input: unknown): number | null {
  if (!finite(input)) return null;
  const z = Math.round(input);
  if (z < ZOOM_MIN || z > ZOOM_MAX) return null;
  return z;
}

export interface WorldRequest {
  readonly bounds: WorldBounds;
  readonly zoom: number;
  readonly layer: WorldLayer;
}

/** Validate a whole request; any invalid part rejects the request. */
export function parseWorldRequest(input: unknown): WorldRequest | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const bounds = parseWorldBounds(r.bounds);
  const zoom = parseWorldZoom(r.zoom);
  if (!bounds || zoom === null || !isWorldLayer(r.layer)) return null;
  return { bounds, zoom, layer: r.layer };
}

// ── Semantic scale ──────────────────────────────────────────────────────────

/** Europe: one cluster per country → region/city: one cluster per place. */
export type WorldScale = "country" | "place";

export function semanticScale(zoom: number): WorldScale {
  return zoom >= WORLD_PLACE_SCALE_MIN_ZOOM ? "place" : "country";
}

// ── Which countries can a viewport touch? ───────────────────────────────────

export interface PlaceablePoint {
  readonly country: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * The ONLY countries whose rows could ever produce a point inside `bounds`:
 * those owning a known city or a country centroid inside it. Everything a
 * bounded read filters `country in (...)` on. Sorted, unique, ISO-2 only.
 */
export function countriesForBounds(
  bounds: WorldBounds,
  points: readonly PlaceablePoint[],
): string[] {
  const out = new Set<string>();
  for (const p of points) {
    if (!/^[A-Z]{2}$/.test(p.country)) continue;
    if (boundsContain(bounds, p.lat, p.lng)) out.add(p.country);
  }
  return [...out].sort();
}

// ── Placing one row ─────────────────────────────────────────────────────────

/** How a position is known — a stated place (fact) or the country alone (derived). */
export type WorldProvenance = "fact" | "derived";

export interface PlacedRow {
  readonly lat: number;
  readonly lng: number;
  readonly precision: AnchorPrecision;
  readonly provenance: WorldProvenance;
  /** The place label shown — the stated city, or the country code alone. */
  readonly placeLabel: string;
}

/**
 * Resolve a row's (country, place text) to a coordinate, honestly:
 *  - known city inside the country → city precision, FACT;
 *  - otherwise the country centroid → country precision, DERIVED, labelled
 *    with the country code only (a centroid wearing a city name is a
 *    fabricated location);
 *  - no country / unknown country → `null` (counted as unplaced by the caller).
 */
export function placeWorldRow(
  country: string | null | undefined,
  placeText: string | null | undefined,
  centroids: Readonly<Record<string, CityCoord>> = COUNTRY_CENTROID,
): PlacedRow | null {
  const code = typeof country === "string" ? country.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const city = placeText?.trim() ? resolveCity(code, placeText) : null;
  if (city) {
    return {
      lat: city.lat,
      lng: city.lng,
      precision: "city",
      provenance: "fact",
      placeLabel: placeText!.trim(),
    };
  }
  const centroid = centroids[code];
  if (!centroid) return null;
  return {
    lat: centroid.lat,
    lng: centroid.lng,
    precision: "country",
    provenance: "derived",
    placeLabel: code,
  };
}

// ── Objects and clusters ────────────────────────────────────────────────────

/** One placed canonical object — the input to clustering. */
export interface WorldObject {
  readonly id: string;
  readonly layer: WorldLayer;
  readonly label: string;
  readonly placeLabel: string;
  readonly country: string;
  readonly lat: number;
  readonly lng: number;
  readonly precision: AnchorPrecision;
  readonly provenance: WorldProvenance;
  /** Aggregate magnitude (people needed, people present, 1 per project). */
  readonly weight: number;
}

export interface WorldClusterMember {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
}

export interface WorldCluster {
  readonly key: string;
  readonly layer: WorldLayer;
  readonly country: string;
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
  /** City only when EVERY member is city-precise. */
  readonly precision: AnchorPrecision;
  /** Fact only when EVERY member is a fact. */
  readonly provenance: WorldProvenance;
  /** Real objects behind the marker. */
  readonly count: number;
  /** Sum of member weights — what the marker's radius encodes. */
  readonly weight: number;
  readonly members: readonly WorldClusterMember[];
  /** Members beyond `WORLD_LIST_MEMBERS_MAX` — counted, not carried. */
  readonly moreMembers: number;
}

export interface WorldOverflow {
  readonly clusters: number;
  readonly objects: number;
  readonly weight: number;
}

export interface WorldClusterResult {
  readonly scale: WorldScale;
  /** At most `cap` clusters, biggest first. */
  readonly clusters: readonly WorldCluster[];
  /** Objects inside the viewport before the cap. */
  readonly inViewObjects: number;
  readonly inViewWeight: number;
  /** Objects the read returned that lie outside the viewport (never drawn). */
  readonly outOfViewObjects: number;
  /** What the cap folded away — said, never silently dropped. */
  readonly overflow: WorldOverflow;
  readonly renderedObjects: number;
}

export interface ClusterOptions {
  readonly bounds: WorldBounds;
  readonly zoom: number;
  readonly cap?: number;
  /** Country-scale cluster position; defaults to the canonical centroid table. */
  readonly countryCenter?: (code: string) => CityCoord | null;
}

function defaultCountryCenter(code: string): CityCoord | null {
  return COUNTRY_CENTROID[code] ?? null;
}

/**
 * Viewport filter → group by place (or by country at country scale) → sort
 * biggest first → cap with overflow accounting.
 *
 * DETERMINISTIC: weight desc, then count desc, then latitude desc, then key —
 * the same rows always yield the same clusters in the same order, whatever
 * order the branches returned them in.
 */
export function clusterWorldObjects(
  objects: readonly WorldObject[],
  options: ClusterOptions,
): WorldClusterResult {
  const cap = Math.max(1, Math.floor(options.cap ?? WORLD_OBJECT_CAP));
  const scale = semanticScale(options.zoom);
  const countryCenter = options.countryCenter ?? defaultCountryCenter;

  const groups = new Map<string, WorldObject[]>();
  let inViewObjects = 0;
  let inViewWeight = 0;
  let outOfViewObjects = 0;
  for (const o of objects) {
    if (!boundsContain(options.bounds, o.lat, o.lng)) {
      outOfViewObjects += 1;
      continue;
    }
    inViewObjects += 1;
    inViewWeight += o.weight;
    const key =
      scale === "country"
        ? `${o.layer}|${o.country}`
        : `${o.layer}|${o.lat.toFixed(2)}|${o.lng.toFixed(2)}`;
    const list = groups.get(key) ?? [];
    list.push(o);
    groups.set(key, list);
  }

  const all: WorldCluster[] = [];
  for (const [key, list] of groups) {
    const first = list[0];
    const weight = list.reduce((n, o) => n + o.weight, 0);
    const allCity = list.every((o) => o.precision === "city");
    const allFact = list.every((o) => o.provenance === "fact");
    let lat = first.lat;
    let lng = first.lng;
    let label = first.placeLabel;
    if (scale === "country") {
      const center = countryCenter(first.country);
      if (center) {
        lat = center.lat;
        lng = center.lng;
      }
      label = first.country;
    }
    const members = list
      .slice()
      .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    all.push({
      key,
      layer: first.layer,
      country: first.country,
      label,
      lat,
      lng,
      // At country scale the marker sits on the centroid even when every
      // member is a stated city: the POSITION is then approximate by
      // construction, and precision must say so.
      precision: scale === "country" ? "country" : allCity ? "city" : "country",
      provenance: allFact ? "fact" : "derived",
      count: list.length,
      weight,
      members: members.slice(0, WORLD_LIST_MEMBERS_MAX).map((o) => ({
        id: o.id,
        label: o.label,
        weight: o.weight,
      })),
      moreMembers: Math.max(0, members.length - WORLD_LIST_MEMBERS_MAX),
    });
  }

  all.sort(
    (a, b) =>
      b.weight - a.weight ||
      b.count - a.count ||
      b.lat - a.lat ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );

  const clusters = all.slice(0, cap);
  const folded = all.slice(cap);
  const overflow: WorldOverflow = {
    clusters: folded.length,
    objects: folded.reduce((n, c) => n + c.count, 0),
    weight: folded.reduce((n, c) => n + c.weight, 0),
  };

  return {
    scale,
    clusters,
    inViewObjects,
    inViewWeight,
    outOfViewObjects,
    overflow,
    renderedObjects: clusters.reduce((n, c) => n + c.count, 0),
  };
}

// ── Projection onto the canonical map view ──────────────────────────────────

/**
 * Clusters → the `MarketMapView` the ONE `<MarketMap>` draws. One region per
 * country, one anchor per cluster; a derived cluster is a `country`-precision
 * anchor, which the presentation already draws dashed and hollow. Origin is
 * always `live`: these are real rows for this environment.
 */
export function toMarketMapView(
  clusters: readonly WorldCluster[],
  layer: WorldLayer,
): MarketMapView {
  const mapLayer = WORLD_LAYER_TO_MAP_LAYER[layer];
  const byCountry = new Map<string, MarketAnchor[]>();
  const totals = new Map<string, number>();
  for (const c of clusters) {
    const anchors = byCountry.get(c.country) ?? [];
    anchors.push({
      id: c.key,
      label: c.label,
      precision: c.precision,
      lat: c.lat,
      lng: c.lng,
      weight: c.weight,
      layer: mapLayer,
      country: c.country,
    });
    byCountry.set(c.country, anchors);
    totals.set(c.country, (totals.get(c.country) ?? 0) + c.weight);
  }
  const regions: MarketRegion[] = [...byCountry.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([code, anchors]) => ({
      code,
      label: code,
      intensity: intensityOf(totals.get(code) ?? 0),
      anchors,
    }));
  return { origin: "live", center: EUROPE_CENTER, zoom: EUROPE_ZOOM, regions };
}

// ── Layer view (what the surface renders) ───────────────────────────────────

/**
 * Named states. `error` ≠ `empty` (a failed read is a claim about us, an empty
 * view a claim about the market); `unavailable` names WHY nothing can be said.
 */
export type WorldLayerState =
  | { readonly kind: "ok" }
  | { readonly kind: "empty" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: "no_known_places_in_view" };

/** Honest footnotes the surface names in words. */
export type WorldNote =
  /** People are §20 aggregate buckets (n ≥ 5), never individuals. */
  | "aggregate_only"
  /** The worker demand RPC takes no viewport; its ≤100 rows are filtered here. */
  | "worker_demand_filtered_after_read";

export interface WorldCounts {
  readonly inViewObjects: number;
  readonly inViewWeight: number;
  readonly renderedClusters: number;
  readonly renderedObjects: number;
  readonly overflowClusters: number;
  readonly overflowObjects: number;
  readonly overflowWeight: number;
  readonly outOfViewObjects: number;
  /** Rows with no resolvable country — real, counted, never pinned. */
  readonly unplaced: number;
  /** §20 small-sample people buckets (n < 5) — counted, never drawn. */
  readonly withheld: number;
  /** A DB leg hit `WORLD_ROW_LIMIT` — every count is a lower bound. */
  readonly truncated: boolean;
}

export interface WorldLayerView {
  readonly layer: WorldLayer;
  readonly scale: WorldScale;
  readonly state: WorldLayerState;
  readonly clusters: readonly WorldCluster[];
  readonly view: MarketMapView;
  readonly counts: WorldCounts;
  readonly notes: readonly WorldNote[];
  /** The countries the bounded read was filtered on (evidence, not UI). */
  readonly countries: readonly string[];
}

export interface BuildWorldLayerViewInput {
  readonly layer: WorldLayer;
  readonly bounds: WorldBounds;
  readonly zoom: number;
  readonly countries: readonly string[];
  readonly objects: readonly WorldObject[];
  readonly unplaced?: number;
  readonly withheld?: number;
  readonly truncated?: boolean;
  readonly notes?: readonly WorldNote[];
  /** A failed read: the view is empty AND says so as an error. */
  readonly error?: string | null;
  readonly cap?: number;
  readonly countryCenter?: (code: string) => CityCoord | null;
}

export function buildWorldLayerView(input: BuildWorldLayerViewInput): WorldLayerView {
  const result = clusterWorldObjects(input.error ? [] : input.objects, {
    bounds: input.bounds,
    zoom: input.zoom,
    cap: input.cap,
    countryCenter: input.countryCenter,
  });
  let state: WorldLayerState;
  if (input.error) state = { kind: "error", reason: input.error };
  else if (input.countries.length === 0)
    state = { kind: "unavailable", reason: "no_known_places_in_view" };
  else if (result.clusters.length === 0) state = { kind: "empty" };
  else state = { kind: "ok" };

  return {
    layer: input.layer,
    scale: result.scale,
    state,
    clusters: result.clusters,
    view: toMarketMapView(result.clusters, input.layer),
    counts: {
      inViewObjects: result.inViewObjects,
      inViewWeight: result.inViewWeight,
      renderedClusters: result.clusters.length,
      renderedObjects: result.renderedObjects,
      overflowClusters: result.overflow.clusters,
      overflowObjects: result.overflow.objects,
      overflowWeight: result.overflow.weight,
      outOfViewObjects: result.outOfViewObjects,
      unplaced: input.unplaced ?? 0,
      withheld: input.withheld ?? 0,
      truncated: input.truncated === true,
    },
    notes: input.notes ?? [],
    countries: input.countries,
  };
}

/** What the server action returns to the client. Serialisable, no functions. */
export type WorldViewResult =
  | { readonly kind: "ok"; readonly view: WorldLayerView }
  /** Not signed in — the World is an authenticated surface. */
  | { readonly kind: "not_authenticated" }
  /** The request did not validate (never trusted from the browser). */
  | { readonly kind: "invalid" };
