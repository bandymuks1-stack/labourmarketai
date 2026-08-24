"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as LeafletTypes from "leaflet";

import {
  EUROPE_CENTER,
  EUROPE_ZOOM,
  MODE_HEIGHT,
  anchorsForLayer,
  type MarketAnchor,
  type MarketMapLayer,
  type MarketMapMode,
  type MarketMapView,
  type MarketRegion,
} from "./market-map-model";
import { mountLeafletMap } from "./leaflet-engine";

/**
 * THE CANONICAL MARKET MAP.
 *
 * The market-data presentation of the ONE map module. Every geographic
 * surface boots through `./leaflet-engine.ts` (W3 row 28 finished the
 * long-promised collapse): this component draws market anchors;
 * `./location-map.tsx` (ex `market-map-live.tsx`) draws the own-location
 * picker; `world-state/workspace-map.tsx` draws the workspace clusters — one
 * engine, one tile source, three presentations. (`live-map.tsx` and the
 * non-geographic `labour-market-world-map.tsx` radial diagram died earlier.)
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
  onSelectAnchor,
  className = "",
  revealCount,
}: {
  view: MarketMapView;
  mode?: MarketMapMode;
  layer?: MarketMapLayer;
  /** ISO-2 of the focused region — the map flies to it when it changes. */
  selectedCode?: string | null;
  onSelectRegion?: (code: string | null) => void;
  /**
   * The clicked ANCHOR, not just its country (Goal 3).
   *
   * `onSelectRegion` answers "which country was touched", which is all the
   * landing hero needs. Continuing into projects needs the PLACE, and the
   * anchor is the only thing that knows its own precision: a city anchor may
   * become a city selection, the dashed country aggregate may not. Handing the
   * whole anchor over keeps that decision with the data instead of
   * reconstructing it from a country code afterwards.
   *
   * Both fire when both are given — the region highlight and the drill-down
   * are different consequences of one click, not two competing ones.
   */
  onSelectAnchor?: (anchor: MarketAnchor) => void;
  className?: string;
  /**
   * How many anchors are currently drawn, counted across the whole view.
   *
   * The market REACTING is the point: signals land one after another rather
   * than the full answer blinking into place, which is what makes the hero read
   * as a system working instead of an image loading. Leave undefined to draw
   * everything at once (the authenticated surfaces do).
   */
  revealCount?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const layerGroupRef = useRef<LeafletTypes.LayerGroup | null>(null);
  const LRef = useRef<typeof LeafletTypes | null>(null);
  const [ready, setReady] = useState(false);

  // ── mount the map once (via the ONE Leaflet engine, W3 row 28) ────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hostRef.current || mapRef.current) return;
      const { L, map } = await mountLeafletMap(hostRef.current, {
        mapOptions: {
          center: [...EUROPE_CENTER] as [number, number],
          zoom: EUROPE_ZOOM,
          // The landing map is a demonstration, not a tool: it must never trap
          // the page scroll under the cursor.
          scrollWheelZoom: mode !== "landing",
          zoomControl: mode === "dashboard" || mode === "fullscreen",
          attributionControl: true,
          dragging: mode !== "landing",
          doubleClickZoom: mode !== "landing",
        },
        maxZoom: 12,
        minZoom: 3,
      });
      if (cancelled || mapRef.current) {
        map.remove();
        return;
      }
      LRef.current = L;
      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();

    // The container's height is not fixed everywhere any more: on the landing
    // hero the map stretches to balance the AI column, whose own height
    // changes as the conversation phases animate. Leaflet sizes its tile grid
    // once at mount, so a container that grows afterwards leaves dead grey
    // space until `invalidateSize()` re-measures — the same reason
    // `location-map.tsx` calls it after animating in. rAF coalesces observer
    // bursts to one re-measure per frame.
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        mapRef.current?.invalidateSize();
      });
    });
    if (hostRef.current) observer.observe(hostRef.current);

    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(raf);
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

    let drawn = 0;
    const limit = revealCount ?? Number.POSITIVE_INFINITY;

    for (const region of view.regions) {
      const anchors = anchorsForLayer(region, layer);
      const dimmed = selectedCode !== null && selectedCode !== region.code;

      for (const a of anchors) {
        if (drawn >= limit) break;
        drawn += 1;
        // Radius encodes the aggregate. sqrt keeps a 20-person anchor from
        // rendering 20x the area of a 1-person anchor — area, not radius, is
        // what the eye reads as quantity.
        //
        // Kept deliberately small: at country zoom the Randstad cities sit
        // within ~50km, so generous radii merge Rotterdam/Den Haag/Amsterdam
        // into one blob and the map stops showing WHERE the demand is.
        const radius = 4 + Math.sqrt(Math.max(a.weight, 1)) * 1.7;
        // An APPROXIMATE country aggregate must not look like a city pin.
        // Dashed and hollow, so precision is legible without reading the
        // tooltip — and it is never colour alone that carries the difference.
        const approx = a.precision === "country";
        const circle = L.circleMarker([a.lat, a.lng], {
          radius: approx ? radius + 3 : radius,
          weight: 2,
          dashArray: approx ? "3 3" : undefined,
          color: dimmed ? "#64748b" : LAYER_STROKE[layer],
          fillColor: dimmed ? "#64748b" : LAYER_FILL[layer],
          fillOpacity: dimmed ? 0.15 : approx ? 0.14 : 0.55,
          opacity: dimmed ? 0.35 : 0.95,
        });
        circle.bindTooltip(`${a.label} · ${a.weight}${approx ? " ~" : ""}`, {
          direction: "top",
          offset: [0, -radius],
        });
        circle.addTo(group);

        if (onSelectRegion || onSelectAnchor) {
          // A marker that acts must look like it acts, and must be reachable
          // without a mouse — Leaflet's circleMarker is an SVG <path> with no
          // affordance of its own. `getElement()` only returns once the layer
          // is on the map, which is why this runs AFTER `addTo`.
          circle.on("click", () => {
            onSelectRegion?.(region.code);
            onSelectAnchor?.(a);
          });
          // Leaflet types `getElement()` as `Element`; a circleMarker's element
          // is always the SVG path it just drew.
          const el = circle.getElement() as SVGElement | null;
          if (el) {
            el.style.cursor = "pointer";
            el.setAttribute("tabindex", "0");
            el.setAttribute("role", "button");
            el.setAttribute("data-anchor-id", a.id);
            el.setAttribute("data-anchor-precision", a.precision ?? "city");
            el.setAttribute("aria-label", `${a.label} · ${a.weight}`);
            el.addEventListener("keydown", (ev) => {
              const key = (ev as KeyboardEvent).key;
              if (key !== "Enter" && key !== " ") return;
              ev.preventDefault();
              onSelectRegion?.(region.code);
              onSelectAnchor?.(a);
            });
          }
        }
      }
    }
  }, [ready, view, layer, selectedCode, onSelectRegion, onSelectAnchor, revealCount]);

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
