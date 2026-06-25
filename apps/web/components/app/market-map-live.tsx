"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as LeafletTypes from "leaflet";
import { type SelectedLocation } from "@/lib/location/location-model";
import { resolveLocation } from "@/lib/location/city-coordinates";

/**
 * Real interactive Market Map — OpenStreetMap raster tiles via Leaflet.
 *
 * A REAL online map provider (free OSM tiles, no API key, no secret, no
 * paid/proprietary provider): the worker sees actual geography, streets and regions, can
 * pan/zoom, and taps the map to set a real coordinate. The only marker drawn is
 * the worker's OWN chosen location (privacy: no other users' locations, no fake
 * market points) plus their search radius. Honest empty state = the real map
 * with no markers until the worker sets a location.
 *
 * Leaflet is loaded with a dynamic import inside an effect so it never evaluates
 * during SSR (it touches `window`). A vector `circleMarker` is used instead of
 * the default icon to avoid bundler image-path issues.
 *
 * MVP ONLY: `tile.openstreetmap.org` is the OSM community tile server — fine for
 * owner review / low traffic, NOT production-scale infra. The migration target
 * (free, key-free, no paid vendor) is documented separately in
 * docs/audits/market-map-long-term-map-strategy.md.
 */

/** Sensible default view (served-markets region) before any location is set. */
const DEFAULT_CENTER: [number, number] = [56.5, 17];
const DEFAULT_ZOOM = 4;

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
  const radius = isCompany ? "10px" : "9999px";
  const inner = identity.avatarUrl
    ? `<img src="${escapeHtml(identity.avatarUrl)}" alt="" style="width:40px;height:40px;border-radius:${radius};object-fit:cover;display:block" />`
    : `<div style="width:40px;height:40px;border-radius:${radius};background:#22D3EE;color:#0B1014;display:flex;align-items:center;justify-content:center;font:700 16px/1 ui-sans-serif,system-ui,sans-serif">${safeInitial}</div>`;
  const pill = identity.statusLabel
    ? `<div style="margin-top:2px;background:rgba(34,211,238,.16);color:#22D3EE;font:700 8px/1.4 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:9999px;border:1px solid rgba(34,211,238,.5)">${escapeHtml(identity.statusLabel)}</div>`
    : "";
  return (
    `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">` +
    `<div style="padding:3px;border-radius:${isCompany ? "13px" : "9999px"};background:#0B1014;border:2px solid #22D3EE;box-shadow:0 8px 20px rgba(0,0,0,.55)">${inner}</div>` +
    `<div style="margin-top:4px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:rgba(11,16,20,.94);color:#E8EEF2;font:600 11px/1.3 ui-sans-serif,system-ui,sans-serif;padding:2px 8px;border-radius:8px;border:1px solid rgba(34,211,238,.5)">${safeName}</div>` +
    pill +
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
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const layerRef = useRef<LeafletTypes.LayerGroup | null>(null);
  // Keep the latest onPick without re-initialising the map.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Initialise the Leaflet map once (client only).
  useEffect(() => {
    let cancelled = false;
    let created: LeafletTypes.Map | null = null;
    void (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current || mapRef.current) return;
        created = L.map(containerRef.current, {
          scrollWheelZoom: false,
          attributionControl: true,
        }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(created);
        created.on("click", (e: LeafletTypes.LeafletMouseEvent) => {
          onPickRef.current(e.latlng.lat, e.latlng.lng);
        });
        mapRef.current = created;
        layerRef.current = L.layerGroup().addTo(created);
        // Tiles can mis-size when the container animates in.
        created.invalidateSize();
      } catch (err) {
        // A map-runtime failure must never crash the page — the location +
        // radius controls below stay usable as a provider-free fallback.
        console.error("[market-map-live] init failed:", err);
      }
    })();
    return () => {
      cancelled = true;
      created?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

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
          iconSize: [140, 74],
          iconAnchor: [70, 40],
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
      className="h-[58vh] min-h-[20rem] w-full overflow-hidden rounded-lg md:h-[28rem]"
      style={{ touchAction: "pan-x pan-y" }}
    />
  );
}
