"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as LeafletTypes from "leaflet";
import { type SelectedLocation } from "@/lib/location/location-model";
import { resolveLocation } from "@/lib/location/city-coordinates";
import { mountLeafletMap } from "./leaflet-engine";

/**
 * THE OWN-LOCATION PICKER PRESENTATION of the one map module (W3 row 28 —
 * formerly `components/app/market-map-live.tsx`, the product's second
 * standalone Leaflet chain; now a sibling of the canonical `MarketMap` on the
 * SAME engine, `./leaflet-engine.ts`).
 *
 * A REAL online map (free OSM tiles, no API key, no secret, no
 * paid/proprietary provider): the worker sees actual geography, streets and
 * regions, can pan/zoom, and taps the map to set a real coordinate. The only
 * marker drawn is the worker's OWN chosen location (privacy: no other users'
 * locations, no fake market points) plus their search radius. Honest empty
 * state = the real map with no markers until the worker sets a location.
 */

/** WORLD default view before any location is set (PR-G global location model:
 *  the platform serves all ISO countries — no Europe-centred default). When a
 *  country/city IS selected, `pointFor` zooms to it instead. Zoom 2 loads only
 *  a handful of world tiles — no prefetching, OSM-usage friendly. */
const DEFAULT_CENTER: [number, number] = [25, 15];
const DEFAULT_ZOOM = 2;

/** City-level resolution (city table → city coords; country-only → approximate
 *  centroid; unknown → no marker). City precision zooms in closer than an
 *  approximate country point. */
function pointFor(loc: SelectedLocation | null): {
  point: [number, number] | null;
  zoom: number;
} {
  const r = resolveLocation(loc);
  if (!r.coord) return { point: null, zoom: DEFAULT_ZOOM };
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

/** The active-identity for the location marker (real data only). `kind`
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

/** Build the premium mini-player-card pin HTML for the Leaflet divIcon. Inline
 *  styles (not Tailwind classes) because the marker DOM is injected by Leaflet
 *  and would otherwise be purged. Shows the active identity's avatar (or
 *  initial) + name + optional status pill — real data only. A company identity
 *  uses a square-ish building tile; a person uses a round avatar. */
function identityPinHtml(identity: MapIdentity): string {
  const safeName = escapeHtml(identity.name);
  const safeInitial = escapeHtml(identity.initial || "•");
  const isCompany = identity.kind === "company";
  const radius = isCompany ? "12px" : "9999px";
  // Larger avatar (52px) — the own marker should read as a real player card on
  // the map, especially on mobile, not a tiny dot.
  const inner = identity.avatarUrl
    ? `<img src="${escapeHtml(identity.avatarUrl)}" alt="" style="width:52px;height:52px;border-radius:${radius};object-fit:cover;display:block" />`
    : // Monogram fallback uses the SAME theme tokens as the Player Card avatar
      // tile (--c-ink-700 fill + --c-text-primary initials) rather than fixed
      // hex, so it matches the card across themes and reads as the same player
      // card — not a separate bright-cyan blob. The CSS variables cascade into
      // the Leaflet divIcon from :root / [data-theme]. Cyan stays the ring accent.
      `<div style="width:52px;height:52px;border-radius:${radius};background:rgb(var(--c-ink-700));color:rgb(var(--c-text-primary));display:flex;align-items:center;justify-content:center;font:700 18px/1 ui-sans-serif,system-ui,sans-serif">${safeInitial}</div>`;
  const statusPill = identity.statusLabel
    ? `<span style="background:rgba(34,211,238,.16);color:#22D3EE;font:700 8px/1.4 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:9999px;border:1px solid rgba(34,211,238,.5)">${escapeHtml(identity.statusLabel)}</span>`
    : "";
  // Availability — real availability_status only (omitted when unknown).
  const availPill = identity.availabilityLabel
    ? `<span style="background:rgba(232,238,242,.10);color:#E8EEF2;font:600 8px/1.4 ui-sans-serif,system-ui,sans-serif;padding:1px 6px;border-radius:9999px;border:1px solid rgba(232,238,242,.25)">${escapeHtml(identity.availabilityLabel)}</span>`
    : "";
  // Silent-trust rule: the marker shows neutral profile signals only — no
  // verified/confirmed badge, no certification checkmark, no gold trust ring.
  // (Confirmation data stays an internal signal; it is never advertised here.)
  // Profession / lead-capability — real localized label (omitted when unset).
  const professionLine = identity.professionLabel
    ? `<div style="margin-top:2px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#A9B4BD;font:500 9px/1.3 ui-sans-serif,system-ui,sans-serif">${escapeHtml(identity.professionLabel)}</div>`
    : "";
  const pills = [statusPill, availPill].filter(Boolean).join("");
  const pillRow = pills
    ? `<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px;justify-content:center;max-width:160px">${pills}</div>`
    : "";
  // Neutral marker ring — never a trust/certification accent.
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

export function MarketMapLive({
  selected,
  radiusKm,
  onPick,
  ariaLabel,
  identity,
  suppressOwnMarker,
  previewPoint,
}: {
  selected: SelectedLocation | null;
  radiusKm: number;
  /** Called with real coordinates when the worker taps the map. */
  onPick: (lat: number, lng: number) => void;
  ariaLabel: string;
  /** The active identity — when present the map renders a premium identity pin
   *  instead of a plain dot. No other users / no fake signals. */
  identity?: MapIdentity;
  /** When true, draw NO own-marker and NO radius. Used in company context with
   *  no confirmed company location — so the personal location is never shown as
   *  the company marker (honest: the page shows a "location not added" note). */
  suppressOwnMarker?: boolean;
  /** F12 safe editing: a NOT-yet-saved candidate point. Rendered as a
   *  distinct dashed preview marker next to the (still untouched) saved
   *  marker until the user explicitly confirms or cancels. */
  previewPoint?: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const layerRef = useRef<LeafletTypes.LayerGroup | null>(null);
  const previewLayerRef = useRef<LeafletTypes.LayerGroup | null>(null);
  // Keep the latest onPick without re-initialising the map.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Initialise the map once (client only) via the ONE Leaflet engine.
  useEffect(() => {
    let cancelled = false;
    let created: LeafletTypes.Map | null = null;
    void (async () => {
      try {
        if (!containerRef.current || mapRef.current) return;
        const { L, map } = await mountLeafletMap(containerRef.current, {
          mapOptions: { scrollWheelZoom: false, attributionControl: true },
          maxZoom: 19,
        });
        created = map;
        if (cancelled) {
          map.remove();
          created = null;
          return;
        }
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        map.on("click", (e: LeafletTypes.LeafletMouseEvent) => {
          onPickRef.current(e.latlng.lat, e.latlng.lng);
        });
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        previewLayerRef.current = L.layerGroup().addTo(map);
        // Tiles can mis-size when the container animates in.
        map.invalidateSize();
      } catch (err) {
        // A map-runtime failure must never crash the page — the location +
        // radius controls below stay usable as a provider-free fallback.
        console.error("[location-map] init failed:", err);
      }
    })();
    return () => {
      cancelled = true;
      created?.remove();
      mapRef.current = null;
      layerRef.current = null;
      previewLayerRef.current = null;
    };
  }, []);

  // F12 safe editing: draw / clear the dashed PREVIEW marker. The saved
  // marker layer is untouched — the old location visibly stays until the
  // user confirms.
  useEffect(() => {
    void (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layer = previewLayerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();
      if (!previewPoint) return;
      const point: [number, number] = [previewPoint.lat, previewPoint.lng];
      L.circle(point, {
        radius: radiusKm * 1000,
        color: "#F59E0B",
        weight: 1.5,
        dashArray: "6 6",
        fillColor: "#F59E0B",
        fillOpacity: 0.08,
      }).addTo(layer);
      L.circleMarker(point, {
        radius: 8,
        color: "#0B1014",
        weight: 2,
        fillColor: "#F59E0B",
        fillOpacity: 1,
      }).addTo(layer);
    })();
  }, [previewPoint, radiusKm]);

  // Draw / move the worker's own marker + radius when the selection changes.
  useEffect(() => {
    void (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();
      // Company context with no confirmed company location → draw nothing (the
      // personal location must never masquerade as the company marker).
      if (suppressOwnMarker) return;
      const { point, zoom } = pointFor(selected);
      if (!point) return;
      L.circle(point, {
        radius: radiusKm * 1000,
        color: "#22D3EE",
        weight: 1,
        fillColor: "#22D3EE",
        fillOpacity: 0.12,
      }).addTo(layer);
      if (identity) {
        // Premium identity marker — the active identity's avatar/initial + name
        // + status pill at the OWN chosen location (real data; no other users,
        // no fake points). Tappable: opens a mini-card popup with the same real
        // identity info.
        const icon = L.divIcon({
          html: identityPinHtml(identity),
          className: "lm-map-identity-pin",
          iconSize: [160, 108],
          iconAnchor: [80, 29],
        });
        const marker = L.marker(point, {
          icon,
          keyboard: true,
          interactive: true,
          title: identity.name,
        }).addTo(layer);
        marker.bindPopup(
          `<div style="min-width:140px">${identityPinHtml(identity)}</div>`,
          { closeButton: true, autoPan: false },
        );
      } else {
        // Fallback dot when no identity is supplied.
        L.circleMarker(point, {
          radius: 7,
          color: "#0B1014",
          weight: 2,
          fillColor: "#22D3EE",
          fillOpacity: 1,
        }).addTo(layer);
      }
      map.setView(point, zoom);
    })();
  }, [selected, radiusKm, identity, suppressOwnMarker]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      data-testid="market-map-live"
      className="h-[66vh] min-h-[24rem] w-full overflow-hidden rounded-lg md:h-[32rem]"
      style={{ touchAction: "pan-x pan-y" }}
    />
  );
}
