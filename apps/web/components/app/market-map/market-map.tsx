"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as LeafletTypes from "leaflet";

import {
  EUROPE_CENTER,
  EUROPE_ZOOM,
  MODE_HEIGHT,
  anchorsForLayer,
  type MarketMapLayer,
  type MarketMapMode,
  type MarketMapView,
  type MarketRegion,
} from "./market-map-model";

/**
 * THE CANONICAL MARKET MAP.
 *
 * One Leaflet map for every geographic surface in the product — landing hero,
 * conversation ResultPanel, dashboard module, fullscreen. Previously this was
 * four things: `live-map.tsx` (real Europe polygons but fed from
 * `content/placeholders`), `market-map-live.tsx` (real Leaflet, location
 * picker), `workspace-map.tsx` (real Leaflet inside the panel) and
 * `labour-market-world-map.tsx` (a radial diagram that is not geography at all).
 *
 * REAL ENGINE, REAL COORDINATES. Leaflet + OpenStreetMap tiles, WGS84
 * throughout. No SVG illustration standing in for a map, no scattered dots, no
 * invented coordinates.
 *
 * DARK MODE WITHOUT A SECOND TILE PROVIDER. OSM's standard raster tiles are
 * light-only. Rather than add a paid/dark tile vendor, the tile pane alone is
 * inverted via CSS; markers and overlays sit in different panes, so they keep
 * their true colours. That keeps one tile source and one component.
 *
 * PRIVACY. `people` anchors are area aggregates (city/region centroids with a
 * count). Individuals are never plotted — `spatial-entities.ts` keeps the person
 * type structurally coordinate-free and a guard asserts it stays that way.
 */
export function MarketMap({
  view,
  mode = "result",
  layer = "demand",
  selectedCode = null,
  onSelectRegion,
  className = "",
}: {
  view: MarketMapView;
  mode?: MarketMapMode;
  layer?: MarketMapLayer;
  /** ISO-2 of the focused region — the map flies to it when it changes. */
  selectedCode?: string | null;
  onSelectRegion?: (code: string | null) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const layerGroupRef = useRef<LeafletTypes.LayerGroup | null>(null);
  const LRef = useRef<typeof LeafletTypes | null>(null);
  const [ready, setReady] = useState(false);

  // ── mount the map once ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Leaflet touches `window`, so it can only be imported on the client.
      const L = (await import("leaflet")).default as unknown as typeof LeafletTypes;
      if (cancelled || !hostRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(hostRef.current, {
        center: [...EUROPE_CENTER] as [number, number],
        zoom: EUROPE_ZOOM,
        // The landing map is a demonstration, not a tool: it must never trap
        // the page scroll under the cursor.
        scrollWheelZoom: mode !== "landing",
        zoomControl: mode === "dashboard" || mode === "fullscreen",
        attributionControl: true,
        dragging: mode !== "landing",
        doubleClickZoom: mode !== "landing",
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 12,
        minZoom: 3,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, [mode]);

  // ── draw anchors whenever the data, layer or selection changes ────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!ready || !L || !map || !group) return;

    group.clearLayers();

    for (const region of view.regions) {
      const anchors = anchorsForLayer(region, layer);
      const dimmed = selectedCode !== null && selectedCode !== region.code;

      for (const a of anchors) {
        // Radius encodes the aggregate. sqrt keeps a 20-person anchor from
        // rendering 20x the area of a 1-person anchor — area, not radius, is
        // what the eye reads as quantity.
        //
        // Kept deliberately small: at country zoom the Randstad cities sit
        // within ~50km, so generous radii merge Rotterdam/Den Haag/Amsterdam
        // into one blob and the map stops showing WHERE the demand is.
        const radius = 4 + Math.sqrt(Math.max(a.weight, 1)) * 1.7;
        const circle = L.circleMarker([a.lat, a.lng], {
          radius,
          weight: 2,
          color: dimmed ? "#64748b" : LAYER_STROKE[layer],
          fillColor: dimmed ? "#64748b" : LAYER_FILL[layer],
          fillOpacity: dimmed ? 0.15 : 0.55,
          opacity: dimmed ? 0.35 : 0.95,
        });
        circle.bindTooltip(`${a.label} · ${a.weight}`, {
          direction: "top",
          offset: [0, -radius],
        });
        if (onSelectRegion) {
          circle.on("click", () => onSelectRegion(region.code));
        }
        circle.addTo(group);
      }
    }
  }, [ready, view, layer, selectedCode, onSelectRegion]);

  // ── fly to the selected region ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!selectedCode) {
      map.flyTo([...EUROPE_CENTER] as [number, number], EUROPE_ZOOM, {
        duration: 0.9,
      });
      return;
    }
    const region = view.regions.find((r) => r.code === selectedCode);
    const first = region?.anchors[0];
    if (!first) return;
    map.flyTo([first.lat, first.lng], 7, { duration: 1.1 });
  }, [ready, selectedCode, view.regions]);

  return (
    <div
      className={`relative overflow-hidden rounded-card border border-ink-600 ${MODE_HEIGHT[mode]} ${className}`}
      data-testid="market-map"
      data-map-mode={mode}
      data-map-layer={layer}
      data-map-origin={view.origin}
    >
      <div ref={hostRef} className="market-map-host size-full" />
      {!ready ? (
        <div className="absolute inset-0 grid place-items-center bg-ink-900/60">
          <span className="text-meta text-text-muted">…</span>
        </div>
      ) : null}
    </div>
  );
}

/** Layer colours. Distinct hues so a layer switch is legible at a glance. */
const LAYER_FILL: Record<MarketMapLayer, string> = {
  demand: "#f59e0b",
  people: "#22d3ee",
  projects: "#a78bfa",
  jobs: "#34d399",
};
const LAYER_STROKE: Record<MarketMapLayer, string> = {
  demand: "#fbbf24",
  people: "#67e8f9",
  projects: "#c4b5fd",
  jobs: "#6ee7b7",
};

export type { MarketRegion };
