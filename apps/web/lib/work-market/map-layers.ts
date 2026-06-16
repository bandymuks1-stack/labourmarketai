/**
 * Work Market Atlas — market-map layer + zoom + visibility model.
 *
 * The live map behaves like a scouting / manager board: zoom out to aggregate
 * region cards, zoom in to location signal cards, zoom in further to object
 * "player" cards. Exact markers appear ONLY after verified coordinates — this
 * module never produces a marker and never carries lat/lng. It is the policy /
 * shape layer; real counts are supplied by the data layer elsewhere.
 *
 * Mirrors the signal-only doctrine from the market map (#422–#425) and the
 * project location block (#426): owner-entered location is a SIGNAL, never a
 * fake point.
 *
 * Pure, deterministic, no DB, no external references.
 */

/** The market-map signal layers. Each maps onto atlas categories / actions. */
export type MapLayerKind =
  | "demand" // company / project needs
  | "worker_signal" // people available for work
  | "offer" // marketplace offers (service / item / accommodation / transport / tool)
  | "accommodation" // places to stay
  | "brigade" // team capacity
  | "readiness_warning" // document / legal gaps
  | "rate"; // real price / pay signals

export const MAP_LAYER_KINDS: readonly MapLayerKind[] = [
  "demand",
  "worker_signal",
  "offer",
  "accommodation",
  "brigade",
  "readiness_warning",
  "rate",
];

/** Zoom bands — far = aggregate, close = individual object. */
export type MapZoom = "far" | "middle" | "close";
export const MAP_ZOOM_ORDER: readonly MapZoom[] = ["far", "middle", "close"];

/** What kind of object a "player" card represents at close zoom. */
export type MapObjectType =
  | "worker"
  | "demand"
  | "team"
  | "accommodation"
  | "offer"
  | "project";

/** Precision of an object's location — drives whether a marker may EVER show. */
export type LocationPrecision =
  | "country"
  | "region"
  | "city"
  | "address_text"
  | "verified_coordinates";

/** A marker may be drawn ONLY for verified coordinates. Single source of truth;
 *  every map renderer must call this and never fall back to lat/lng guesses. */
export function canDrawMarker(precision: LocationPrecision): boolean {
  return precision === "verified_coordinates";
}

/** Aggregate region/country card (far + middle zoom). NEVER a personal address. */
export type AggregateCard = {
  zoom: Extract<MapZoom, "far" | "middle">;
  /** Country or region/city label — aggregate scope only. */
  scopeLabel: string;
  demandCount: number;
  workerSignalCount: number;
  offerCount: number;
  accommodationCount: number;
  readinessWarningCount: number;
  /** Real rate range only — null when there is not enough data. */
  rateRange: { min: number; max: number; currency: string } | null;
  /** One honest next action key (resolved by UI copy). */
  nextActionKey: string;
};

/** Object / player card (close zoom). Detail is gated by precision + allowance. */
export type ObjectCard = {
  zoom: Extract<MapZoom, "close">;
  title: string;
  type: MapObjectType;
  statusKey: string;
  readinessKey: string;
  precision: LocationPrecision;
  /** Real rate only; null when none. */
  rate: { value: number; currency: string; unitKey: string } | null;
  lastUpdated: string | null;
  /** Trust / verification state key (resolved by UI). */
  trustKey: string;
  nextActionKey: string;
};

/** Invariant guard for an aggregate card: it must never leak a personal
 *  address and never claim a rate without data. Returns the list of broken
 *  invariants (empty = OK) so callers/tests can assert honesty. */
export function aggregateCardViolations(card: AggregateCard): string[] {
  const out: string[] = [];
  if (/\b\d+\s+\p{L}+\s+(st\.?|street|g\.|gatv)/iu.test(card.scopeLabel)) {
    out.push("aggregate scopeLabel looks like a street address");
  }
  for (const k of ["demandCount", "workerSignalCount", "offerCount", "accommodationCount", "readinessWarningCount"] as const) {
    if (card[k] < 0 || !Number.isFinite(card[k])) out.push(`${k} must be a real non-negative count`);
  }
  if (card.rateRange && !(card.rateRange.max >= card.rateRange.min)) {
    out.push("rateRange.max must be >= min");
  }
  return out;
}

/** Detail allowed on an object card at close zoom: exact location detail is
 *  shown ONLY when the precision is verified AND the owner allowed it. Default
 *  is the least-revealing scope. */
export function allowedObjectDetail(
  precision: LocationPrecision,
  ownerAllowsExact: boolean,
): "verified_point" | "city_only" | "region_only" {
  if (precision === "verified_coordinates" && ownerAllowsExact) return "verified_point";
  if (precision === "city" || precision === "address_text") return "city_only";
  return "region_only";
}
