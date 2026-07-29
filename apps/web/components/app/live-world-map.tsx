"use client";

// World directions map: low-fidelity directional overview of the market
// directions the platform serves, on a full-world canvas. Concept visual, not
// live data — no pseudo-live clock, no fabricated counts, no "live" status
// framing. The hero renders it under the same honest concept chip as before.
// Decorative motion (marker pulse) is CSS-class driven and fully disabled by
// the single prefers-reduced-motion block in globals.css.

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  WORLD_GEO,
  WORLD_H,
  WORLD_W,
  type WorldCountry,
} from "@/components/app/world-geo";

/** Bounding-box centre of a path's coordinates — anchors the target-country
 *  glow and pulse dot. (Same approach as the former Europe map.) */
function centroid(d: string): [number, number] {
  const n = d.match(/-?\d+(?:\.\d+)?/g);
  if (!n) return [0, 0];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    const x = +n[i];
    const y = +n[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

/** The US bounding box spans Alaska→Hawaii→mainland, so its bbox centre lands
 *  in the Pacific; pin the few wide countries to a hand-picked anchor. */
const ANCHOR_OVERRIDE: Record<string, [number, number]> = {
  // projectWorld(-98, 39) ≈ mainland US centroid
  US: [227, 125],
};

type Hover = { code: string; name: string; tier: WorldCountry["tier"] } | null;

export function LiveWorldMap() {
  const t = useTranslations("map");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const targets = useMemo(
    () => WORLD_GEO.filter((g) => g.tier === "target"),
    [],
  );
  const context = useMemo(
    () => WORLD_GEO.filter((g) => g.tier === "context"),
    [],
  );

  function onMove(e: React.MouseEvent) {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMove}
      className="relative w-full overflow-hidden card-border"
    >
      {/* top-right static directions label */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-sm border border-ink-600/70 bg-ink-900/70 px-2 py-1 font-mono text-meta uppercase tracking-label text-text-muted">
        {t("label.live")}
      </div>

      {/* legend bottom-right */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-sm border border-ink-600/70 bg-ink-900/70 px-2.5 py-2 font-mono text-meta uppercase tracking-label text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-cyan" />
          {t("world.legendTarget")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-text-primary/60" />
          {t("world.legendContext")}
        </span>
      </div>

      {/* caption bottom-left */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 font-mono text-meta uppercase tracking-label text-text-muted">
        {t("world.caption")}
      </div>

      <svg
        viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
        className="block h-auto w-full text-brand-blue"
        role="img"
        aria-label={t("world.aria")}
      >
        <defs>
          <radialGradient id="lwm-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0.12" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* context (world scale, not focus) */}
        <g>
          {context.map((g) => (
            <path
              key={g.name}
              d={g.d}
              onMouseEnter={() =>
                setHover({ code: g.code, name: g.name, tier: "context" })
              }
              onMouseLeave={() => setHover(null)}
              className="fill-ink-800 stroke-ink-600 transition-colors hover:stroke-text-muted"
              strokeWidth={0.75}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {/* target glow (uniform, decorative — no fabricated intensity data) */}
        <g className="pointer-events-none">
          {targets.map((g) => {
            const [cx, cy] = ANCHOR_OVERRIDE[g.code] ?? centroid(g.d);
            return (
              <circle
                key={`glow-${g.code}`}
                cx={cx}
                cy={cy}
                r={30}
                fill="url(#lwm-glow)"
                style={{ opacity: 0.45 }}
              />
            );
          })}
        </g>

        {/* target countries */}
        <g>
          {targets.map((g) => (
            <path
              key={g.name}
              d={g.d}
              onMouseEnter={() =>
                setHover({ code: g.code, name: g.name, tier: "target" })
              }
              onMouseLeave={() => setHover(null)}
              className="fill-ink-700 stroke-brand-blue transition-colors hover:stroke-brand-cyan"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {/* target anchor dots (cyan pulse; CSS-driven, reduced-motion safe) */}
        <g className="pointer-events-none">
          {targets.map((g, i) => {
            const [cx, cy] = ANCHOR_OVERRIDE[g.code] ?? centroid(g.d);
            return (
              <circle
                key={`dot-${g.code}`}
                cx={cx}
                cy={cy}
                r={3.5}
                className="map-marker fill-brand-cyan"
                style={{ animationDelay: `${(i * 47) % 300}ms` }}
              />
            );
          })}
        </g>
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-[16rem] -translate-y-full rounded-md border border-ink-500 bg-ink-900/95 px-3 py-2 text-xs text-text-secondary shadow-card"
          style={{ left: pos.x + 12, top: pos.y - 6 }}
        >
          {hover.tier === "target" ? (
            <span>
              <span className="font-mono text-text-primary">{hover.code}</span>{" "}
              · {t("tooltip.activeDirection")}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="text-text-primary">{hover.name}</span>
              <span className="rounded-sm border border-brand-blue/40 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-brand-blue">
                {t("tooltip.expansion_candidate")}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
