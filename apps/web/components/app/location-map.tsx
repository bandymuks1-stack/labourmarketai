"use client";

import { useMemo } from "react";
import type { SelectedLocation } from "@/lib/location/location-model";
import {
  invert,
  graticule,
  locationToPoint,
  radiusToViewBox,
  COUNTRY_CENTROIDS,
  project,
  VIEW_W,
  VIEW_H,
} from "@/lib/location/map-projection";

/**
 * Provider-free, INTERACTIVE location map (no Google, no tiles, no key).
 *
 * A real coordinate map of the served markets: a geographic graticule plus the
 * served-country reference points give context, the worker's selection is
 * plotted at its TRUE position with its search radius, and tapping anywhere on
 * the map sets a real coordinate (the inverse projection) — usable on mobile
 * (a tap IS a click). Honest by construction: every point is a real coordinate,
 * never a fake marker, and nothing here claims an external provider.
 */
export function LocationMap({
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
  const grid = useMemo(() => graticule(5), []);
  const point = locationToPoint(selected);
  const markerLat = selected?.lat ?? null;
  const ring =
    point !== null
      ? radiusToViewBox(radiusKm, markerLat ?? 56)
      : null;

  function handlePick(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const { lat, lng } = invert(x, y);
    onPick(lat, lng);
  }

  return (
    <button
      type="button"
      onClick={handlePick}
      aria-label={ariaLabel}
      data-testid="location-map"
      className="block w-full cursor-crosshair rounded-lg"
      style={{ touchAction: "manipulation" }}
    >
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className="h-44 w-full rounded-lg"
      aria-hidden
    >
      {/* Sea backdrop. */}
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="rgb(var(--c-ink-900))" />

      {/* Graticule — geographic reference grid. */}
      <g stroke="rgb(var(--c-brand-blue))" strokeOpacity="0.12" strokeWidth="0.25">
        {grid.vertical.map((v, i) => (
          <line key={`v${i}`} x1={v.x} y1={0} x2={v.x} y2={VIEW_H} />
        ))}
        {grid.horizontal.map((h, i) => (
          <line key={`h${i}`} x1={0} y1={h.y} x2={VIEW_W} y2={h.y} />
        ))}
      </g>

      {/* Served-market reference points (real centroids) for geographic context. */}
      <g aria-hidden>
        {Object.entries(COUNTRY_CENTROIDS).map(([code, c]) => {
          const p = project(c.lat, c.lng);
          const isSel = selected?.country === code;
          return (
            <g key={code}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isSel ? 1.4 : 0.9}
                fill="rgb(var(--c-brand-blue))"
                fillOpacity={isSel ? 0.9 : 0.45}
              />
              <text
                x={p.x + 1.6}
                y={p.y + 0.8}
                fontSize="2.6"
                fill="rgb(var(--c-text-muted))"
              >
                {code}
              </text>
            </g>
          );
        })}
      </g>

      {/* The worker's selection: search-radius ring + marker dot. */}
      {point && ring && (
        <g data-testid="location-map-marker">
          <ellipse
            cx={point.x}
            cy={point.y}
            rx={Math.max(ring.rx, 1)}
            ry={Math.max(ring.ry, 1)}
            fill="rgb(var(--c-brand-cyan))"
            fillOpacity="0.12"
            stroke="rgb(var(--c-brand-cyan))"
            strokeOpacity="0.5"
            strokeWidth="0.4"
          />
          <circle cx={point.x} cy={point.y} r="1.6" fill="rgb(var(--c-brand-cyan))" />
          <circle
            cx={point.x}
            cy={point.y}
            r="0.7"
            fill="rgb(var(--c-ink-900))"
          />
        </g>
      )}
    </svg>
    </button>
  );
}
