/**
 * Shared Google Maps JS loader + geocoding helpers (client-only).
 *
 * Loads the REAL Google Maps JavaScript API exactly once, with the `places`
 * library so forward geocoding / address search works. The browser key is read
 * by the caller from validated env and passed in — it is NEVER hardcoded here
 * and NEVER printed. When no key is configured, nothing loads and callers fall
 * back to an honest, non-technical manual-entry state (no env-key names, no raw
 * API strings ever reach the user — see lib/guards/map-locator-real.test.ts).
 *
 * Markers created through this module are REAL, consent-gated points only: the
 * signed-in user's OWN location, placed after they press "use my location" or
 * type a place. No sample/placeholder marker arrays, no other users' points,
 * never an exact street address surfaced as data.
 */

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface GeocodeHit {
  readonly lat: number;
  readonly lng: number;
  /** Human-readable city/region/country context (never a raw lat,lng dump). */
  readonly label: string;
}

interface GLatLngLiteral {
  lat: number;
  lng: number;
}
interface GGeocoderResult {
  formatted_address?: string;
  geometry: { location: { lat(): number; lng(): number } };
  address_components?: ReadonlyArray<{ long_name: string; types: string[] }>;
}
interface GGeocoder {
  geocode(
    request: Record<string, unknown>,
    callback: (results: GGeocoderResult[] | null, status: string) => void,
  ): void;
}
export interface GMap {
  setCenter(c: GLatLngLiteral): void;
  setZoom(z: number): void;
}
export interface GMarker {
  setPosition(c: GLatLngLiteral): void;
  setMap(map: GMap | null): void;
}
interface GMapsNamespace {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  Geocoder: new () => GGeocoder;
}
interface GMapsGlobal {
  maps?: GMapsNamespace;
}

declare global {
  interface Window {
    google?: GMapsGlobal;
    __lmGmapsLoading?: Promise<void>;
  }
}

/** Load the real Google Maps JS API once (with the places library). */
export function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (window.__lmGmapsLoading) return window.__lmGmapsLoading;
  window.__lmGmapsLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(key) +
      "&libraries=places&loading=async&v=weekly";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("google-maps-load-failed"));
    document.head.appendChild(s);
  });
  return window.__lmGmapsLoading;
}

/** True once the API is present in the window (callers can build a map). */
export function mapsReady(): boolean {
  return typeof window !== "undefined" && !!window.google?.maps;
}

/** Construct a market-map viewport. Center/zoom is a VIEWPORT, not a data point. */
export function createMap(el: HTMLElement, center: LatLng, zoom: number): GMap | null {
  const maps = window.google?.maps;
  if (!maps) return null;
  return new maps.Map(el, {
    center: { lat: center.lat, lng: center.lng },
    zoom,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });
}

/**
 * Place / move the single self-location marker (the user's OWN consented point).
 * Pass marker=null to create one; reuse the returned marker to move it.
 */
export function setSelfMarker(
  map: GMap,
  at: LatLng,
  marker: GMarker | null,
): GMarker | null {
  const maps = window.google?.maps;
  if (!maps) return marker;
  if (marker) {
    marker.setPosition({ lat: at.lat, lng: at.lng });
    marker.setMap(map);
    return marker;
  }
  return new maps.Marker({
    map,
    position: { lat: at.lat, lng: at.lng },
  });
}

/** Reverse geocode coordinates -> readable place (city/region/country). */
export function reverseGeocode(at: LatLng): Promise<string | null> {
  const maps = window.google?.maps;
  if (!maps) return Promise.resolve(null);
  const geocoder = new maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat: at.lat, lng: at.lng } }, (results, status) => {
      if (status !== "OK" || !results || results.length === 0) {
        resolve(null);
        return;
      }
      resolve(readablePlace(results) ?? results[0].formatted_address ?? null);
    });
  });
}

/** Forward geocode a typed place -> coordinates + readable label. */
export function forwardGeocode(query: string): Promise<GeocodeHit | null> {
  const maps = window.google?.maps;
  const q = query.trim();
  if (!maps || q.length === 0) return Promise.resolve(null);
  const geocoder = new maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ address: q }, (results, status) => {
      if (status !== "OK" || !results || results.length === 0) {
        resolve(null);
        return;
      }
      const loc = results[0].geometry.location;
      resolve({
        lat: loc.lat(),
        lng: loc.lng(),
        label: readablePlace(results) ?? results[0].formatted_address ?? q,
      });
    });
  });
}

/**
 * Prefer locality + admin area + country over a full street address, so the UI
 * shows a human place ("Vilnius, Lithuania") rather than an exact residence.
 */
function readablePlace(results: GGeocoderResult[]): string | null {
  for (const r of results) {
    const parts: string[] = [];
    const comps = r.address_components ?? [];
    const pick = (type: string) =>
      comps.find((c) => c.types.includes(type))?.long_name;
    const locality =
      pick("locality") ?? pick("postal_town") ?? pick("administrative_area_level_2");
    const region = pick("administrative_area_level_1");
    const country = pick("country");
    if (locality) parts.push(locality);
    if (region && region !== locality) parts.push(region);
    if (country) parts.push(country);
    if (parts.length > 0) return parts.join(", ");
  }
  return null;
}