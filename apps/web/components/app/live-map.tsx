"use client";

// Live market preview: low-fidelity preview, bus pakeistas TASK 07 (living-arena
// UI po owner vizualinio užrakto). Hero PreviewChip ("PRE-ALPHA · Activity
// preview") laiko šį žemėlapį sąžiningą — koncepcija, ne live duomenys.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  EUROPE_GEO,
  MAP_H,
  MAP_W,
  project,
  type GeoCountry,
} from "@/components/app/europe-geo";
import { geoPayloads } from "@/content/placeholders";

/** Bounding-box centre of a path's coordinates — used to anchor the
 *  intensity glow and the target-country tooltip. */
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

type Hover = { code: string; name: string; tier: GeoCountry["tier"] } | null;

export function LiveMap() {
  const t = useTranslations("map");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [utc, setUtc] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      setUtc(new Date().toISOString().slice(11, 19)); // HH:MM:SS UTC
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const workers = useMemo(
    () => geoPayloads("map.marker.worker.", "worker"),
    [],
  );
  const projects = useMemo(
    () => geoPayloads("map.marker.project.", "project"),
    [],
  );
  const matches = useMemo(
    () => geoPayloads("map.marker.match.", "match"),
    [],
  );
  const companies = useMemo(
    () => geoPayloads("map.marker.company.", "company"),
    [],
  );
  const intensity = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of geoPayloads("map.country.intensity.", "intensity"))
      m.set(g.code, g.intensity);
    return m;
  }, []);
  const counts = useMemo(() => {
    const m = new Map<
      string,
      { workers: number; projects: number; companies: number; matchesToday: number }
    >();
    for (const g of geoPayloads("map.country.counts.", "counts"))
      m.set(g.code, g);
    return m;
  }, []);

  function onMove(e: React.MouseEvent) {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  const c = hover ? counts.get(hover.code) : undefined;

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMove}
      className="relative w-full overflow-hidden card-border"
    >
      {/* top-right synced UTC label */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-sm border border-state-live/40 bg-ink-900/70 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-state-live">
        <span className="live-dot" aria-hidden />
        {t("label.live")} ·{" "}
        <span suppressHydrationWarning className="tabular-nums">
          {utc ?? "--:--:--"}
        </span>{" "}
        {t("label.utc")}
      </div>

      {/* legend bottom-right */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-sm border border-ink-600/70 bg-ink-900/70 px-2.5 py-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-cyan" />
          <span className="h-2 w-2 rounded-full bg-state-amber" />
          {t("legend.active_markets")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-text-primary/60" />
          {t("legend.expansion_candidates")}
        </span>
      </div>

      {/* market-count caption bottom-left */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("caption")}
      </div>

      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="block h-auto w-full text-brand-blue"
        role="img"
        aria-label={`${t("label.live")} — Europe`}
      >
        <defs>
          <radialGradient id="lm-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0.12" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* frame (very dim continuation, no interaction) */}
        <g className="pointer-events-none">
          {EUROPE_GEO.filter((g) => g.tier === "frame").map((g) => (
            <path
              key={g.name}
              d={g.d}
              className="fill-ink-900 stroke-ink-700 opacity-40"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {/* context (scale, not focus) */}
        <g>
          {EUROPE_GEO.filter((g) => g.tier === "context").map((g) => (
            <path
              key={g.name}
              d={g.d}
              onMouseEnter={() =>
                setHover({ code: g.code, name: g.name, tier: "context" })
              }
              onMouseLeave={() => setHover(null)}
              className="fill-ink-800 stroke-ink-600 transition-colors hover:stroke-text-muted"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {/* target glow */}
        <g className="pointer-events-none">
          {EUROPE_GEO.filter((g) => g.tier === "target").map((g) => {
            const [cx, cy] = centroid(g.d);
            const it = intensity.get(g.code) ?? 0;
            return (
              <circle
                key={`glow-${g.code}`}
                cx={cx}
                cy={cy}
                r={34 + (it / 100) * 70}
                fill="url(#lm-glow)"
                style={{ opacity: 0.18 + (it / 100) * 0.5 }}
              />
            );
          })}
        </g>

        {/* target countries */}
        <g>
          {EUROPE_GEO.filter((g) => g.tier === "target").map((g) => (
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

        {/* match connectors + violet match dots */}
        <g className="pointer-events-none">
          {matches.map((m, i) => {
            const [wx, wy] = project(m.workerCoord[0], m.workerCoord[1]);
            const [px, py] = project(m.projectCoord[0], m.projectCoord[1]);
            return (
              <g key={`match-${i}`}>
                <line
                  x1={wx}
                  y1={wy}
                  x2={px}
                  y2={py}
                  className="stroke-brand-violet"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  strokeDasharray="3 5"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={px}
                  cy={py}
                  r={5}
                  className="map-marker fill-brand-violet"
                  style={{ animationDelay: `${(i * 37) % 200}ms` }}
                />
              </g>
            );
          })}
        </g>

        {/* company markers (white 60%) */}
        <g className="pointer-events-none">
          {companies.map((m, i) => {
            const [x, y] = project(m.coord[0], m.coord[1]);
            return (
              <circle
                key={`co-${i}`}
                cx={x}
                cy={y}
                r={4}
                className="map-marker fill-text-primary/60"
                style={{ animationDelay: `${(i * 53) % 200}ms` }}
              />
            );
          })}
        </g>

        {/* project markers (amber) */}
        <g className="pointer-events-none">
          {projects.map((m, i) => {
            const [x, y] = project(m.coord[0], m.coord[1]);
            return (
              <circle
                key={`pr-${i}`}
                cx={x}
                cy={y}
                r={6}
                className="map-marker fill-state-amber"
                style={{ animationDelay: `${(i * 41) % 200}ms` }}
              />
            );
          })}
        </g>

        {/* worker markers (cyan) — pulse + slow drift */}
        <g className="pointer-events-none">
          {workers.map((m, i) => {
            const [x, y] = project(m.coord[0], m.coord[1]);
            return (
              <g
                key={`wk-${i}`}
                className="map-drift"
                style={{ animationDelay: `${(i % 6) * 0.7}s` }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={4}
                  className="map-marker fill-brand-cyan"
                  style={{ animationDelay: `${50 + (i % 8) * 20}ms` }}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-[16rem] -translate-y-full rounded-md border border-ink-500 bg-ink-900/95 px-3 py-2 text-xs text-text-secondary shadow-card"
          style={{ left: pos.x + 12, top: pos.y - 6 }}
        >
          {hover.tier === "target" && c ? (
            <span>
              <span className="font-mono text-text-primary">
                {hover.code}
              </span>{" "}
              · {c.workers} {t("tooltip.workers")} · {c.projects}{" "}
              {t("tooltip.projects")} · {c.matchesToday}{" "}
              {t("tooltip.matchesToday")}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="text-text-primary">{hover.name}</span>
              <span className="rounded-sm border border-brand-blue/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-blue">
                {t("tooltip.expansion_candidate")}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
