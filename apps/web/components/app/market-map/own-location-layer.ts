import type * as LeafletTypes from "leaflet";
import { type SelectedLocation } from "@/lib/location/location-model";
import { resolveLocation } from "@/lib/location/city-coordinates";

/**
 * THE OWN-LOCATION LAYER of the ONE map.
 *
 * Formerly the standalone `location-map.tsx` (a second Leaflet instance that
 * drew only the caller's own pin + radius). The own location and its search
 * radius are now CONTROLS OF the canonical `<MarketMap>`: this module is the
 * pure drawing half (no React, no engine boot) that `market-map.tsx` calls on
 * its own layer groups. One engine, one map instance per page.
 *
 * Only the viewer's OWN chosen location is ever drawn here (privacy: no other
 * users' locations, no fake points).
 */

/** The active identity for the location marker (real data only). `kind`
 *  distinguishes a person from a company so the marker label/icon respects the
 *  active context — a company context never reuses the personal identity. */
export type MapIdentity = {
  kind: "person" | "company";
  name: string;
  initial: string;
  avatarUrl: string | null;
  /** Short real status/type pill (e.g. "Jūs" / "Įmonė"); omit when none. */
  statusLabel?: string | null;
  /** Localized profession / lead-capability label (real, from the worker row);
   *  omit when not set. */
  professionLabel?: string | null;
  /** Localized availability label (real availability_status); omit when unknown. */
  availabilityLabel?: string | null;
};

/** What the map needs to draw + edit the viewer's own location. */
export interface OwnLocationOverlay {
  readonly selected: SelectedLocation | null;
  readonly radiusKm: number;
  readonly identity?: MapIdentity;
  /** Draw NO own-marker and NO radius (company context, no confirmed location). */
  readonly suppress?: boolean;
  /** A NOT-yet-saved candidate point (F12 safe editing). */
  readonly previewPoint?: { lat: number; lng: number } | null;
  /** Called with real coordinates when the person taps the map. */
  readonly onPick?: (lat: number, lng: number) => void;
}

/** Country-level resolution zooms out; a city/device point zooms in. */
export function ownPointFor(loc: SelectedLocation | null): {
  point: [number, number] | null;
  zoom: number;
} {
  const r = resolveLocation(loc);
  if (!r.coord) return { point: null, zoom: 5 };
  const zoom = r.precision === "country" ? 6 : 11;
  return { point: [r.coord.lat, r.coord.lng], zoom };
}

/** Escape user-controlled text before it goes into the Leaflet divIcon HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Build the identity pin HTML for the Leaflet divIcon. Inline styles (not
 *  Tailwind classes) because the marker DOM is injected by Leaflet and would
 *  otherwise be purged. Real data only; neutral signals only (silent-trust). */
export function identityPinHtml(identity: MapIdentity): string {
  const safeName = escapeHtml(identity.name);
  const safeInitial = escapeHtml(identity.initial || "•");
  const isCompany = identity.kind === "company";
  const radius = isCompany ? "12px" : "9999px";
  const inner = identity.avatarUrl
    ? `<img src="${escapeHtml(identity.avatarUrl)}" alt="" style="width:52px;height:52px;border-radius:${radius};object-fit:cover;display:block" />`
    : `<div style="width:52px;height:52px;border-radius:${radius};background:rgb(var(--c-ink-700));color:rgb(var(--c-text-primary));display:flex;align-items:center;justify-content:center;font:700 18px/1 ui-sans-serif,system-ui,sans-serif">${safeInitial}</div>`;
  const statusPill = identity.statusLabel
    ? `<span style="background:rgba(34,211,238,.16);color:#22D3EE;font:700 8px/1.4 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:9999px;border:1px solid rgba(34,211,238,.5)">${escapeHtml(identity.statusLabel)}</span>`
    : "";
  const availPill = identity.availabilityLabel
    ? `<span style="background:rgba(232,238,242,.10);color:#E8EEF2;font:600 8px/1.4 ui-sans-serif,system-ui,sans-serif;padding:1px 6px;border-radius:9999px;border:1px solid rgba(232,238,242,.25)">${escapeHtml(identity.availabilityLabel)}</span>`
    : "";
  const professionLine = identity.professionLabel
    ? `<div style="margin-top:2px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#A9B4BD;font:500 9px/1.3 ui-sans-serif,system-ui,sans-serif">${escapeHtml(identity.professionLabel)}</div>`
    : "";
  const pills = [statusPill, availPill].filter(Boolean).join("");
  const pillRow = pills
    ? `<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px;justify-content:center;max-width:160px">${pills}</div>`
    : "";
  const ringColor = "#22D3EE";
  return (
    `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">` +
    `<div style="padding:3px;border-radius:${isCompany ? "15px" : "9999px"};background:#0B1014;border:2px solid ${ringColor};box-shadow:0 8px 22px rgba(0,0,0,.6)">${inner}</div>` +
    `<div style="margin-top:4px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:rgba(11,16,20,.94);color:#E8EEF2;font:700 11px/1.3 ui-sans-serif,system-ui,sans-serif;padding:2px 8px;border-radius:8px;border:1px solid rgba(34,211,238,.5)">${safeName}</div>` +
    professionLine +
    pillRow +
    `</div>`
  );
}

/** Draw the saved own marker + radius into `group`. Returns the point drawn
 *  (so the caller can frame it) or null when nothing was drawn. */
export function drawOwnLocation(
  L: typeof LeafletTypes,
  group: LeafletTypes.LayerGroup,
  overlay: OwnLocationOverlay,
): { point: [number, number]; zoom: number } | null {
  group.clearLayers();
  if (overlay.suppress) return null;
  const { point, zoom } = ownPointFor(overlay.selected);
  if (!point) return null;
  L.circle(point, {
    radius: overlay.radiusKm * 1000,
    color: "#22D3EE",
    weight: 1,
    fillColor: "#22D3EE",
    fillOpacity: 0.12,
  }).addTo(group);
  if (overlay.identity) {
    const icon = L.divIcon({
      html: identityPinHtml(overlay.identity),
      className: "lm-map-identity-pin",
      iconSize: [160, 108],
      iconAnchor: [80, 29],
    });
    const marker = L.marker(point, {
      icon,
      keyboard: true,
      interactive: true,
      title: overlay.identity.name,
    }).addTo(group);
    marker.bindPopup(
      `<div style="min-width:140px">${identityPinHtml(overlay.identity)}</div>`,
      { closeButton: true, autoPan: false },
    );
  } else {
    L.circleMarker(point, {
      radius: 7,
      color: "#0B1014",
      weight: 2,
      fillColor: "#22D3EE",
      fillOpacity: 1,
    }).addTo(group);
  }
  return { point, zoom };
}

/** Draw the dashed, not-yet-saved PREVIEW point (F12 safe editing). The saved
 *  marker layer is untouched — the old location visibly stays until confirmed. */
export function drawPreviewPoint(
  L: typeof LeafletTypes,
  group: LeafletTypes.LayerGroup,
  previewPoint: { lat: number; lng: number } | null | undefined,
  radiusKm: number,
): void {
  group.clearLayers();
  if (!previewPoint) return;
  const point: [number, number] = [previewPoint.lat, previewPoint.lng];
  L.circle(point, {
    radius: radiusKm * 1000,
    color: "#F59E0B",
    weight: 1.5,
    dashArray: "6 6",
    fillColor: "#F59E0B",
    fillOpacity: 0.08,
  }).addTo(group);
  L.circleMarker(point, {
    radius: 8,
    color: "#0B1014",
    weight: 2,
    fillColor: "#F59E0B",
    fillOpacity: 1,
  }).addTo(group);
}
