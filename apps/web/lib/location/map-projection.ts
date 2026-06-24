/**
 * Provider-free map projection (pure, no DB, no network, no map provider).
 *
 * The location feature is a REAL, interactive coordinate map of the markets the
 * platform serves — NOT external tiles, NOT a paid provider, NOT a fake marker.
 * This module is the deterministic geometry behind it: an equirectangular
 * projection over a fixed Baltic + Northern-Europe bounding box, its inverse
 * (so tapping the map yields real coordinates), country reference centroids,
 * and a radius-to-viewBox helper. Everything here is pure + unit-tested so the
 * interactive component can stay thin.
 *
 * `preserveAspectRatio="none"` is used on the SVG so the [0..VIEW_W]×[0..VIEW_H]
 * viewBox maps 1:1 onto the rendered element — that keeps tap→coordinate math
 * exact. The mild stretch is acceptable for a location PICKER (the goal is
 * "where am I / where do I want work", not navigation-grade cartography).
 */

import type { SelectedLocation } from "./location-model";
import { hasCoords } from "./location-model";

/** Geographic bounding box (degrees) covering LT/LV/EE/PL/DE/NL/DK/NO/SE/FI. */
export const LNG_MIN = 2;
export const LNG_MAX = 33;
export const LAT_MIN = 46;
export const LAT_MAX = 72;

/** SVG viewBox extent (unitless; the element scales responsively). */
export const VIEW_W = 100;
export const VIEW_H = 100;

export interface ViewPoint {
  readonly x: number;
  readonly y: number;
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

/** Project geographic lat/lng → viewBox point. Out-of-box inputs are clamped
 *  so a marker never renders off-canvas. */
export function project(lat: number, lng: number): ViewPoint {
  const cl = clamp(lng, LNG_MIN, LNG_MAX);
  const ca = clamp(lat, LAT_MIN, LAT_MAX);
  return {
    x: ((cl - LNG_MIN) / (LNG_MAX - LNG_MIN)) * VIEW_W,
    y: ((LAT_MAX - ca) / (LAT_MAX - LAT_MIN)) * VIEW_H,
  };
}

/** Inverse of {@link project}: a viewBox point (e.g. a tap) → real lat/lng,
 *  clamped to the box. */
export function invert(x: number, y: number): { lat: number; lng: number } {
  const cx = clamp(x, 0, VIEW_W);
  const cy = clamp(y, 0, VIEW_H);
  return {
    lng: LNG_MIN + (cx / VIEW_W) * (LNG_MAX - LNG_MIN),
    lat: LAT_MAX - (cy / VIEW_H) * (LAT_MAX - LAT_MIN),
  };
}

/** Approximate centroids (lat, lng) for each served market — REAL reference
 *  points, used to render geographic context dots and to place a marker for a
 *  manual country-only selection (no fake precision implied: it is the country
 *  centroid, shown as such). */
export const COUNTRY_CENTROIDS: Readonly<
  Record<string, { lat: number; lng: number }>
> = {
  LT: { lat: 55.2, lng: 23.9 },
  LV: { lat: 56.9, lng: 24.9 },
  EE: { lat: 58.9, lng: 25.6 },
  PL: { lat: 52.0, lng: 19.4 },
  DE: { lat: 51.2, lng: 10.4 },
  NL: { lat: 52.2, lng: 5.5 },
  DK: { lat: 56.0, lng: 9.5 },
  NO: { lat: 60.8, lng: 9.0 },
  SE: { lat: 62.0, lng: 15.5 },
  FI: { lat: 63.0, lng: 26.0 },
};

/** Radius (km) → viewBox ellipse semi-axes at a given latitude. Longitude is
 *  compressed by cos(lat), so the ring is an ellipse, not a circle — honest to
 *  the projection. */
export function radiusToViewBox(
  radiusKm: number,
  lat: number,
): { rx: number; ry: number } {
  const KM_PER_DEG_LAT = 111;
  const unitsPerDegLat = VIEW_H / (LAT_MAX - LAT_MIN);
  const unitsPerDegLng = VIEW_W / (LNG_MAX - LNG_MIN);
  const latRad = (clamp(lat, LAT_MIN, LAT_MAX) * Math.PI) / 180;
  const cos = Math.max(0.2, Math.cos(latRad)); // floor avoids blow-up near poles
  return {
    ry: (radiusKm / KM_PER_DEG_LAT) * unitsPerDegLat,
    rx: (radiusKm / (KM_PER_DEG_LAT * cos)) * unitsPerDegLng,
  };
}

/** The point to plot for a selected location, or null when it carries neither
 *  coordinates nor a known country centroid. */
export function locationToPoint(loc: SelectedLocation | null): ViewPoint | null {
  if (!loc) return null;
  if (hasCoords(loc)) return project(loc.lat, loc.lng);
  if (loc.country && COUNTRY_CENTROIDS[loc.country]) {
    const c = COUNTRY_CENTROIDS[loc.country];
    return project(c.lat, c.lng);
  }
  return null;
}

/** Graticule (reference grid) lines every `stepDeg` degrees, as viewBox
 *  coordinates ready for `<line>` rendering. */
export function graticule(stepDeg = 5): {
  vertical: { x: number }[];
  horizontal: { y: number }[];
} {
  const vertical: { x: number }[] = [];
  const horizontal: { y: number }[] = [];
  for (let lng = Math.ceil(LNG_MIN / stepDeg) * stepDeg; lng <= LNG_MAX; lng += stepDeg) {
    vertical.push({ x: project(LAT_MIN, lng).x });
  }
  for (let lat = Math.ceil(LAT_MIN / stepDeg) * stepDeg; lat <= LAT_MAX; lat += stepDeg) {
    horizontal.push({ y: project(lat, LNG_MIN).y });
  }
  return { vertical, horizontal };
}
