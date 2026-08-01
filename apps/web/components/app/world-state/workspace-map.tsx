"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type * as LeafletTypes from "leaflet";

import { loadWorkspaceMap } from "@/lib/world-state/map-actions";
import {
  boundsFor,
  type WorkspaceMapCluster,
  type WorkspaceMapView,
} from "@/lib/world-state/workspace-map-model";
import { entityKey, type EntityRef } from "@/lib/world-state/world-state";
import { mountLeafletMap } from "@/components/app/market-map/leaflet-engine";
import { useWorldState } from "./world-state-provider";

/**
 * THE WORKSPACE MAP (W6) — the third part of the one workspace becomes real.
 *
 * The lock's rule, finally implemented instead of waived:
 *   "World Map automatiškai reaguoja į World State. … AI pakeičia World
 *    State. World Map persibraižo."
 *
 * TWO-WAY, THROUGH WORLD STATE ONLY:
 *   - selection → map: when `activeEntity` matches a mapped entity the map
 *     flies to it and its marker turns active;
 *   - map → selection: clicking a marker dispatches `open_object` on the SAME
 *     World State the chat and the Context Panel read — the panel opens the
 *     entity and the conversation is about it. No navigation, no route, no
 *     second state.
 *
 * PROFESSIONAL BY CONSTRUCTION:
 *   - clustered per city (one counted marker per place — never a pile of
 *     overlapping pins);
 *   - the view FITS the real data (fitBounds), never a world at zoom 1;
 *   - vector markers in brand colours, a real legend, softened tiles;
 *   - a compact card inside the panel — the map is a working part of the
 *     workspace, not a wall-sized decoration.
 *
 * HONESTY: every marker is a real row from the canonical reads; country-level
 * centroids are labelled approximate; unmapped rows are counted out loud.
 */
export function WorkspaceMap({
  className = "",
}: {
  className?: string;
}) {
  const t = useTranslations("workspace.map");
  const { state, openEntity } = useWorldState();
  const [view, setView] = useState<WorkspaceMapView | null>(null);
  const [failed, setFailed] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const leafletRef = useRef<typeof LeafletTypes | null>(null);
  const markersRef = useRef<LeafletTypes.LayerGroup | null>(null);
  /** Latest state the marker-click handlers should use. */
  const openEntityRef = useRef(openEntity);
  openEntityRef.current = openEntity;

  // ── data ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadWorkspaceMap()
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── map init (via the ONE Leaflet engine, W3 row 28) ────────────────────
  useEffect(() => {
    if (!view || (view.clusters.length === 0 && !view.home)) return;
    let disposed = false;
    (async () => {
      if (!containerRef.current || mapRef.current) return;
      const { L, map } = await mountLeafletMap(containerRef.current, {
        mapOptions: {
          zoomControl: false,
          attributionControl: true,
          scrollWheelZoom: false, // a card inside a panel must not hijack page scroll
          dragging: true,
        },
        maxZoom: 18,
      });
      if (disposed || mapRef.current) {
        map.remove();
        return;
      }
      leafletRef.current = L;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      // Bounds include the viewer's OWN market anchor (owner audit §9.2):
      // the map opens on THEIR market, not on a lone foreign pin.
      const bounds = boundsFor(view.clusters, view.home);
      if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      if (view.home) {
        L.marker([view.home.lat, view.home.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div class="wsmap-home" title=""></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
          interactive: false,
        })
          .addTo(map)
          .bindTooltip(
            `${t("homeLabel")}${view.home.precision === "country" ? ` · ${t("approx")}` : ""}`,
            { direction: "top", offset: L.point(0, -8) },
          );
      }
      drawMarkers(view.clusters, state.activeEntity);
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
    // The map mounts once per data load; selection updates redraw below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /** (Re)draw the cluster markers, highlighting the active entity's place. */
  function drawMarkers(
    clusters: readonly WorkspaceMapCluster[],
    active: EntityRef | null,
  ) {
    const L = leafletRef.current;
    const layer = markersRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    for (const c of clusters) {
      const isActive =
        active !== null && c.entities.some((e) => entityKey(e.ref) === entityKey(active));
      const count = c.entities.length;
      const marker = L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="wsmap-pin${isActive ? " wsmap-pin-active" : ""}">${count > 1 ? count : ""}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        keyboard: true,
        title: c.placeLabel,
      });
      if (count === 1) {
        // ONE entity → clicking IS the selection: open_object on the shared
        // World State. The panel and the conversation follow.
        marker.on("click", () => openEntityRef.current(c.entities[0].ref));
        marker.bindTooltip(
          `${escapeHtml(c.entities[0].label)}${c.precision === "country" ? ` · ${t("approx")}` : ""}`,
          { direction: "top", offset: L.point(0, -10) },
        );
      } else {
        // MANY → a popup listing the real entities; each row opens one.
        const rows = c.entities
          .map(
            (e, i) =>
              `<button type="button" class="wsmap-row" data-i="${i}">${escapeHtml(e.label)}</button>`,
          )
          .join("");
        const popup = L.popup({ closeButton: false, maxWidth: 240 }).setContent(
          `<div class="wsmap-popup"><p class="wsmap-place">${escapeHtml(c.placeLabel)} · ${count}</p>${rows}</div>`,
        );
        marker.bindPopup(popup);
        marker.on("popupopen", (ev) => {
          const el = (ev as unknown as { popup: LeafletTypes.Popup }).popup.getElement();
          el?.querySelectorAll<HTMLButtonElement>(".wsmap-row").forEach((btn) => {
            btn.addEventListener("click", () => {
              const i = Number(btn.dataset.i ?? "-1");
              const entity = c.entities[i];
              if (entity) {
                openEntityRef.current(entity.ref);
                mapRef.current?.closePopup();
              }
            });
          });
        });
      }
      marker.addTo(layer);
    }
  }

  // ── selection → map (World State drives the redraw) ─────────────────────
  const activeKey = state.activeEntity ? entityKey(state.activeEntity) : null;
  useEffect(() => {
    if (!view || !mapRef.current) return;
    drawMarkers(view.clusters, state.activeEntity);
    if (activeKey) {
      const hit = view.clusters.find((c) =>
        c.entities.some((e) => entityKey(e.ref) === activeKey),
      );
      if (hit) {
        mapRef.current.flyTo([hit.lat, hit.lng], Math.max(mapRef.current.getZoom(), 9), {
          duration: 0.6,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, view]);

  // Honest states: reading / nothing mappable / failed — never a blank tile.
  if (failed) return null; // the panel simply has no map section
  if (view && view.clusters.length === 0 && !view.home) {
    return view.unmapped > 0 ? (
      <p className="text-meta text-text-muted" data-testid="workspace-map-unmapped">
        {t("unmappedOnly", { count: view.unmapped })}
      </p>
    ) : null;
  }

  return (
    <div className={className} data-testid="workspace-map">
      <div
        ref={containerRef}
        className="wsmap h-44 w-full overflow-hidden rounded-card border border-ink-500 lg:h-52"
        aria-label={t("regionLabel")}
        role="application"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* The legend states what EVERY mark is — no unexplained dots
            (owner audit §9.1): a pin is real rows grouped per place; the
            ring is the viewer's own market anchor. */}
        <span className="inline-flex items-center gap-1.5 text-meta text-text-muted">
          <span className="wsmap-legend-dot" aria-hidden /> {t("legendEntities")}
        </span>
        {view?.home && (
          <span className="inline-flex items-center gap-1.5 text-meta text-text-muted" data-testid="workspace-map-home-legend">
            <span className="wsmap-legend-home" aria-hidden /> {t("homeLabel")}
          </span>
        )}
        {view && view.unmapped > 0 && (
          <span className="text-meta text-text-muted" data-testid="workspace-map-unmapped">
            {t("unmapped", { count: view.unmapped })}
          </span>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
