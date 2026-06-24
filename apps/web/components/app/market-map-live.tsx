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

export function MarketMapLive({
  selected,
  radiusKm,
  onPick,
  ariaLabel,
}: {
  selected: SelectedLocation | null;
  radiusKm: number;
  /** Called with real coordinates when the worker taps the map. */
  onPick: (lat: number, lng: number) => void;
  ariaLabel: string;
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
      const { point, zoom } = pointFor(selected);
      if (!point) return;
      L.circle(point, {
        radius: radiusKm * 1000,
        color: "#22D3EE",
        weight: 1,
        fillColor: "#22D3EE",
        fillOpacity: 0.12,
      }).addTo(layer);
      L.circleMarker(point, {
        radius: 7,
        color: "#0B1014",
        weight: 2,
        fillColor: "#22D3EE",
        fillOpacity: 1,
      }).addTo(layer);
      map.setView(point, zoom);
    })();
  }, [selected, radiusKm]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      data-testid="market-map-live"
      className="h-72 w-full overflow-hidden rounded-lg"
      style={{ touchAction: "pan-x pan-y" }}
    />
  );
}
