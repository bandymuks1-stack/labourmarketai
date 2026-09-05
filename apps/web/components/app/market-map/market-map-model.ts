/**
 * MarketMap — the canonical geographic model.
 *
 * ONE map, four presentations. The mode changes size, chrome and interaction
 * affordances; it NEVER changes which component renders or where the data comes
 * from. That is the whole point of collapsing `live-map` / `market-map-*` /
 * `workspace-map` into a single surface.
 */

export type MarketMapMode =
  /** Landing hero — the product demonstrating itself. Compact, no controls. */
  | "landing"
  /** Inside the conversation's ResultPanel. */
  | "result"
  /** A full module surface. */
  | "dashboard"
  /** Edge-to-edge. */
  | "fullscreen";

/** Which signal the map is currently showing. */
export type MarketMapLayer = "demand" | "people" | "projects" | "jobs";

/**
 * A point on the map. Coordinates are REAL WGS84 — never invented, never
 * jittered for looks.
 *
 * NOTE the privacy boundary this type has to respect: `lib/market-map/
 * spatial-entities.ts` keeps PERSON presence structurally coordinate-free
 * (k-anonymity: n<3 dropped, n<5 banded, and a guard asserts no lat/lng key can
 * exist on the person type). So a `people` anchor here is always an AREA
 * aggregate — a city or region centroid with a count — never an individual.
 */
/**
 * How precisely an anchor's coordinate is known.
 *
 *  - `city`    — resolved from the canonical city table. The pin IS the place.
 *  - `country` — only a country was known, so this is the country centroid: an
 *                APPROXIMATE aggregate, never a city. It must be labelled as
 *                such and must never carry a city name, because a centroid
 *                wearing a city label is a fabricated location.
 */
export type AnchorPrecision = "city" | "country";

export interface MarketAnchor {
  readonly id: string;
  readonly label: string;
  /** Defaults to `city` — an anchor is precise unless it says otherwise. */
  readonly precision?: AnchorPrecision;
  readonly lat: number;
  readonly lng: number;
  /** Aggregate magnitude — headcount needed, people available, project count. */
  readonly weight: number;
  readonly layer: MarketMapLayer;
  /** Country ISO-2, used to tie an anchor to a highlighted region. */
  readonly country: string;
}

export interface MarketRegion {
  /** ISO-2. */
  readonly code: string;
  readonly label: string;
  /** 0..1 relative intensity for choropleth shading. */
  readonly intensity: number;
  readonly anchors: readonly MarketAnchor[];
}

/**
 * Where a map view's numbers came from. Rendered as a visible badge — the
 * viewer must never have to guess whether a figure is real.
 *
 *  - `live`       — real rows from this environment's database.
 *  - `demo`       — a scripted product demonstration on REAL geography. Allowed
 *                   ONLY on the public landing, and always labelled. It shows
 *                   what the product does; it never claims to be today's market.
 *  - `acceptance` — deterministic local fixtures.
 */
export type MarketDataOrigin = "live" | "demo" | "acceptance";

export interface MarketMapView {
  readonly regions: readonly MarketRegion[];
  readonly origin: MarketDataOrigin;
  /** Focus when nothing is selected. Europe-first. */
  readonly center: readonly [number, number];
  readonly zoom: number;
}

/** Europe-first default view. */
export const EUROPE_CENTER: readonly [number, number] = [52.2, 6.0];
export const EUROPE_ZOOM = 5;

/** Per-mode geometry. Height is the only thing a mode really changes. */
export const MODE_HEIGHT: Record<MarketMapMode, string> = {
  landing: "h-[clamp(20rem,42vh,28rem)]",
  result: "h-[clamp(16rem,32vh,22rem)]",
  dashboard: "h-[clamp(24rem,60vh,40rem)]",
  fullscreen: "h-[100dvh]",
};

/** Normalise raw counts to 0..1 for shading, on an ABSOLUTE scale.
 *
 *  Deliberately NOT `value / max`: relative shading makes the busiest region
 *  fully saturated even when it holds three roles, which reads as "the market
 *  is hot here" when it is not. Same defect the Player Card skill bars had. */
export function intensityOf(value: number, scaleMax = 25): number {
  if (value <= 0) return 0;
  return Math.min(value / scaleMax, 1);
}

/** Highest-signal region — what the map should fly to for a question. */
export function topRegion(view: MarketMapView): MarketRegion | null {
  let best: MarketRegion | null = null;
  for (const r of view.regions) {
    if (!best || r.intensity > best.intensity) best = r;
  }
  return best;
}

export function anchorsForLayer(
  region: MarketRegion,
  layer: MarketMapLayer,
): readonly MarketAnchor[] {
  return region.anchors.filter((a) => a.layer === layer);
}

/**
 * WHERE THE MAP MUST LOOK so that every anchor it drew can actually be reached.
 *
 * THE DEFECT THIS EXISTS FOR (2026-09-05, found by a production walk). The map
 * mounted — and `autoFly` flew back — to a FIXED Europe centre and zoom, chosen
 * for a large container. The dashboard result map is ~319x288. At that size the
 * Netherlands falls inside the viewport and Lithuania does not, so a real LT
 * need rendered an anchor that Leaflet drew as `d="M0 0"`: present in the DOM,
 * announced with `role="button"` and an aria-label, focusable and activatable by
 * KEYBOARD — and with no geometry at all, so a pointer could never hit it.
 * Demand existed, the marker existed, and no mouse user could open it.
 *
 * A fixed frame is a claim that the demand is where we guessed it would be.
 * This computes the frame from the anchors the map ACTUALLY drew instead.
 *
 * HONESTY BOUNDS THE ZOOM. Fitting a single anchor would otherwise zoom to
 * street level, and a country-precision aggregate rendered at city zoom claims a
 * precision the row does not have — the same lie the dashed marker exists to
 * avoid. So an approximate anchor in the set clamps the fit to a country-wide
 * zoom; only an all-city set may go closer.
 */
export const ANCHOR_FIT_MAX_ZOOM = 8;
export const APPROX_FIT_MAX_ZOOM = 5;

export interface AnchorFit {
  /** Every drawn anchor's coordinate. Empty when the map drew nothing. */
  readonly points: readonly (readonly [number, number])[];
  /** True when any fitted anchor is a country-level aggregate. */
  readonly anyApprox: boolean;
  /** The zoom the fit may not exceed — see the honesty note above. */
  readonly maxZoom: number;
}

/**
 * The anchors a fit must cover, for the layer currently drawn.
 *
 * `revealCount` mirrors the draw loop's own cap so the frame covers exactly
 * what is on screen — fitting anchors that were never drawn would frame empty
 * space and, during the landing's staged reveal, fight the animation.
 */
export function anchorFit(
  view: MarketMapView,
  layer: MarketMapLayer,
  revealCount?: number,
): AnchorFit {
  const limit = revealCount ?? Number.POSITIVE_INFINITY;
  const points: (readonly [number, number])[] = [];
  let anyApprox = false;
  let drawn = 0;
  for (const region of view.regions) {
    for (const a of anchorsForLayer(region, layer)) {
      if (drawn >= limit) break;
      drawn += 1;
      points.push([a.lat, a.lng] as const);
      if (a.precision === "country") anyApprox = true;
    }
    if (drawn >= limit) break;
  }
  return {
    points,
    anyApprox,
    maxZoom: anyApprox ? APPROX_FIT_MAX_ZOOM : ANCHOR_FIT_MAX_ZOOM,
  };
}
