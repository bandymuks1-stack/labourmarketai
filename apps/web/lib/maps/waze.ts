/**
 * Waze navigation handoff (deep links only).
 *
 * Labourmarket.ai opens Waze EXTERNALLY for navigation — it does NOT compute or
 * claim a Waze ETA / travel time, does NOT scrape Waze, and uses NO Waze API or
 * key. The universal `waze.com/ul` link opens the Waze app on mobile and the
 * Waze Live Map on web (mobile + web fallback in one URL).
 */

export type WazeDestination =
  | { readonly kind: "coords"; readonly lat: number; readonly lng: number }
  | { readonly kind: "query"; readonly q: string };

function isFiniteCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Official Waze universal deep link (app on mobile, Live Map on web). */
export function wazeDeepLink(dest: WazeDestination): string {
  if (dest.kind === "coords") {
    return `https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(dest.q)}&navigate=yes`;
}

/** A map location the app might navigate to. Coordinates are optional and are
 *  only ever used when exact navigation is explicitly permitted. */
export interface MapDestination {
  readonly kind: "company" | "agency" | "request" | "project" | "person" | "area";
  readonly lat?: number | null;
  readonly lng?: number | null;
  /** Approximate area label (city / region / operating area). */
  readonly areaQuery?: string | null;
  /** Exact coordinates are owner/public-approved for this destination. */
  readonly exactAllowed?: boolean;
  /** Hard block: an exact personal home / residence is NEVER a destination. */
  readonly isPersonalHome?: boolean;
}

/**
 * Build a permitted Waze destination, honoring privacy:
 *  - an exact personal home/residence is NEVER returned;
 *  - a person is navigated only to an APPROXIMATE area, never exact coords;
 *  - exact coords are used ONLY when explicitly allowed; otherwise the
 *    approximate area query is used;
 *  - returns null when no permitted destination exists, so the caller hides the
 *    "Open in Waze" action (no fake destination, no fake route).
 */
export function wazeDestinationFromLocation(
  loc: MapDestination,
): WazeDestination | null {
  if (loc.isPersonalHome) return null;
  if (loc.kind === "person") {
    return loc.areaQuery ? { kind: "query", q: loc.areaQuery } : null;
  }
  if (loc.exactAllowed && isFiniteCoord(loc.lat, loc.lng)) {
    return { kind: "coords", lat: loc.lat as number, lng: loc.lng as number };
  }
  return loc.areaQuery ? { kind: "query", q: loc.areaQuery } : null;
}