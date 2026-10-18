"use client";

import { useState } from "react";

import type { CareerJourney, JourneyLevel } from "@/lib/cv-export/career-journey";
import { cn } from "@/lib/utils";

/**
 * THE CAREER JOURNEY MAP — the Living CV as a route (Future Experience B,
 * owner decision 2026-10-14). Draws `deriveCareerJourney` and nothing else:
 *
 *   stops     engagements / organization records on a time axis
 *   lines     skills; a line touches a stop ONLY where the journal links them
 *   gaps      stretches with no stop (unknown, never zero) as a dotted rail
 *   horizon   derived directions past "now", labelled derived
 *
 * Line STYLE is the evidence tier (solid = confirmed by a second party,
 * dashed = the person's journal, hollow stub = declared) — never colour
 * alone; each line's colour only tells lines apart. Green is never used
 * (it means a second party's confirmation, which a line is not).
 *
 * Interaction: tapping a line in the legend focuses it (the others dim), so
 * a person can follow one skill through their working life. The full list
 * below the map (the Living CV's own lists) is the accessible equivalent;
 * the map itself is `role="img"` with a text summary.
 *
 * Phone: the axis turns vertical (newest at the top, the horizon above
 * "now"), so a thumb scrolls back in time instead of sideways.
 */

export type CareerJourneyLabels = {
  readonly title: string;
  readonly summary: string;
  readonly now: string;
  readonly gap: string;
  readonly horizon: string;
  readonly derived: string;
  readonly linksUnknown: string;
  readonly level: Readonly<Record<JourneyLevel, string>>;
  readonly focusHint: string;
  readonly showAll: string;
  /** Resolved names. */
  readonly skill: Readonly<Record<string, string>>;
  /** One per horizon item: the direction's name, and the evidence it rests on. */
  readonly horizonItem: readonly { readonly name: string; readonly detail: string }[];
  readonly stationMeta: Readonly<Record<string, string>>;
};

const LINE_TONES = [
  "text-brand-cyan",
  "text-brand-violet",
  "text-tier-bronze",
  "text-brand-purple",
  "text-tier-silver",
  "text-text-secondary",
] as const;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const DASH: Record<JourneyLevel, string | undefined> = {
  confirmed: undefined,
  recorded: "10 6",
  declared: "2 6",
};

export function CareerJourneyMap({
  journey,
  labels,
}: {
  readonly journey: CareerJourney;
  readonly labels: CareerJourneyLabels;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const toneOf = (slug: string) => LINE_TONES[journey.lines.findIndex((l) => l.slug === slug) % LINE_TONES.length];
  const dim = (slug: string) => focus !== null && focus !== slug;

  if (journey.stations.length === 0 && journey.lines.length === 0) return null;

  // ── Desktop geometry: x = time, one row per line, stops as capsules. ──
  const W = 960;
  const PAD_L = 24;
  const AXIS_W = 640;
  const HORIZON_X0 = PAD_L + AXIS_W + 40;
  const TOP = 110;
  const rowY = (i: number) => TOP + i * 46;
  const rowsH = rowY(Math.max(journey.lines.length, 1) - 1) + 30;
  const H = rowsH + 100;
  const span = Math.max(journey.spanDays, 1);
  const x = (day: number) => PAD_L + (day / span) * AXIS_W;

  // Station labels: each takes the first lane (above / below, near / far)
  // where it overlaps no label already placed — dense careers stay legible.
  type Placed = {
    readonly key: string;
    readonly x: number;
    readonly y: number;
    readonly anchor: "start" | "middle" | "end";
    /** The label sits above the band of lines (else below). */
    readonly above: boolean;
  };
  /** Where a station's capsule spans: the rows of the lines that stop there. */
  const capsuleY = (s: (typeof journey.stations)[number]) => {
    const rows = s.lines.map((slug) => journey.lines.findIndex((l) => l.slug === slug)).filter((i) => i >= 0);
    return {
      rows,
      y0: rows.length > 0 ? rowY(Math.min(...rows)) - 12 : rowsH - 10,
      y1: rows.length > 0 ? rowY(Math.max(...rows)) + 12 : rowsH + 2,
    };
  };
  const placedLabels: Placed[] = [];
  {
    const taken: Record<number, [number, number][]> = {};
    for (const s of journey.stations) {
      const mid = x((s.startDay + s.endDay) / 2);
      const width = Math.max(clip(s.title, 24).length * 7.2, (labels.stationMeta[s.key] ?? "").length * 6.6) + 12;
      const anchor = mid > x(span) - width / 2 ? "end" : mid < PAD_L + width / 2 ? "start" : "middle";
      const lx = anchor === "end" ? mid + 10 : anchor === "start" ? mid - 10 : mid;
      const left = anchor === "end" ? lx - width : anchor === "start" ? lx : lx - width / 2;
      // Lanes sit OUTSIDE the band of lines (above the first row, below the
      // last), so a label never lies on a line it does not belong to.
      const above = [
        { id: 0, y: rowY(0) - 40, above: true },
        { id: 2, y: rowY(0) - 70, above: true },
      ];
      const below = [
        { id: 1, y: rowsH + 26, above: false },
        { id: 3, y: rowsH + 56, above: false },
      ];
      // A stop low in the band (or with no line) prefers the lanes below it,
      // so its leader stays short and crosses as few lines as possible.
      const { rows } = capsuleY(s);
      const low = rows.length === 0 || rows.reduce((a, b) => a + b, 0) / rows.length >= (journey.lines.length - 1) / 2;
      const lanes = low ? [...below, ...above] : [...above, ...below];
      const free = lanes.find((lane) => !(taken[lane.id] ?? []).some(([a, b]) => left < b && left + width > a)) ?? lanes[0];
      (taken[free.id] ??= []).push([left, left + width]);
      placedLabels.push({ key: s.key, x: lx, y: free.y, anchor, above: free.above });
    }
  }

  // Year marks on the axis (1 January of every year the route spans).
  const years: { year: number; day: number }[] = [];
  if (journey.axisStart) {
    const startMs = Date.parse(`${journey.axisStart}T00:00:00Z`);
    const y0 = new Date(startMs).getUTCFullYear();
    for (let yr = y0 + 1; ; yr++) {
      const day = Math.round((Date.UTC(yr, 0, 1) - startMs) / 86_400_000);
      if (day > span) break;
      years.push({ year: yr, day });
    }
  }

  // ── Phone geometry: y = time (newest at the top), one column per line. ──
  const PW = 360;
  const colX = (i: number) => 28 + i * 22;
  const labelX = colX(Math.max(journey.lines.length, 1) - 1) + 24;
  const PH_TOP = 40 + journey.horizon.length * 44 + 30;
  const PH_SPAN = Math.max(journey.stations.length * 74, 240);
  const py = (day: number) => PH_TOP + (1 - day / span) * PH_SPAN;
  const PH = PH_TOP + PH_SPAN + 40;

  return (
    <section
      aria-label={labels.title}
      data-testid="cv-journey"
      className="flex flex-col gap-4 rounded-card border border-ink-600/70 bg-ink-800/50 p-4 print:hidden sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-title font-semibold tracking-tightest text-text-primary">{labels.title}</h2>
        <p className="text-support text-text-secondary">{labels.summary}</p>
        {journey.linksUnknown ? (
          <p role="status" className="text-support text-text-muted" data-testid="cv-journey-links-unknown">
            {labels.linksUnknown}
          </p>
        ) : null}
      </header>

      {/* DESKTOP — horizontal route. */}
      <div className="hidden overflow-x-auto sm:block">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={labels.summary}
          className="h-auto w-full min-w-[640px]"
          data-testid="cv-journey-map"
        >
          {/* horizon zone */}
          <rect x={HORIZON_X0 - 14} y={TOP - 40} width={W - HORIZON_X0 + 14} height={rowsH - TOP + 52} rx={10} className="fill-ink-700/40" />
          <text x={HORIZON_X0} y={TOP - 50} className="fill-text-muted font-mono text-meta">
            {labels.horizon} · {labels.derived}
          </text>
          {/* now marker */}
          <line x1={x(span)} x2={x(span)} y1={TOP - 40} y2={rowsH + 40} className="stroke-brand-blue" strokeWidth={2} strokeDasharray="5 5" />
          <text x={x(span) + 6} y={rowsH + 36} textAnchor="start" className="fill-brand-blue font-mono text-meta font-semibold">
            {labels.now}
          </text>

          {/* year marks — the scale of the route */}
          {years.map((yr) => (
            <g key={`y-${yr.year}`}>
              <line x1={x(yr.day)} x2={x(yr.day)} y1={rowsH + 4} y2={rowsH + 10} className="stroke-ink-500" />
              <text x={x(yr.day)} y={rowsH + 92} textAnchor="middle" className="fill-text-muted font-mono text-meta">
                {yr.year}
              </text>
            </g>
          ))}

          {/* gaps: a quiet band — unknown time, never zero, never a failure */}
          {journey.gaps.map((g) => (
            <g key={`gap-${g.fromDay}`} data-testid="cv-journey-gap">
              <rect x={x(g.fromDay)} y={TOP - 22} width={Math.max(x(g.toDay) - x(g.fromDay), 2)} height={rowsH - TOP + 34} className="fill-ink-700/40" />
              <text x={(x(g.fromDay) + x(g.toDay)) / 2} y={TOP - 10} textAnchor="middle" className="fill-text-muted text-meta">
                {labels.gap}
              </text>
            </g>
          ))}

          {/* lines: from the first stop to now (declared: a short stub) */}
          {journey.lines.map((l, i) => {
            // The line runs where the skill was really worked (its first stop
            // or first own entry → its last); after that a faint trace to
            // "now" — still on the map, never claimed as recent work.
            const x0 = l.startDay !== null ? x(l.startDay) : x(span) - 40;
            const x1 = l.endDay !== null ? Math.max(x(l.endDay), x0 + 6) : x(span);
            return (
              <g key={l.slug} className={cn(toneOf(l.slug), "transition-opacity", dim(l.slug) && "opacity-20")} data-testid={`cv-journey-path-${l.slug}`}>
                <line x1={x0} x2={x1} y1={rowY(i)} y2={rowY(i)} stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeDasharray={DASH[l.level]} />
                {l.level === "declared" ? (
                  <line x1={x0} x2={x1} y1={rowY(i)} y2={rowY(i)} className="stroke-ink-800" strokeWidth={2} />
                ) : null}
                {x1 < x(span) - 8 ? (
                  <line x1={x1 + 6} x2={x(span)} y1={rowY(i)} y2={rowY(i)} stroke="currentColor" strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" opacity={0.5} />
                ) : null}
              </g>
            );
          })}

          {/* stations: one capsule spanning the rows of the lines that stop there */}
          {journey.stations.map((s, si) => {
            const mid = x((s.startDay + s.endDay) / 2);
            const { y0, y1 } = capsuleY(s);
            const label = placedLabels[si];
            return (
              <g key={s.key} data-testid={`cv-journey-stop-${s.key}`}>
                {/* leader: label → stop */}
                <line
                  x1={mid}
                  x2={mid}
                  y1={label.above ? label.y + 18 : label.y - 14}
                  y2={label.above ? y0 : y1}
                  className="stroke-ink-500"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                <title>{`${s.title}${labels.stationMeta[s.key] ? ` · ${labels.stationMeta[s.key]}` : ""}`}</title>
                <rect
                  x={mid - 10}
                  y={y0}
                  width={20}
                  height={y1 - y0}
                  rx={10}
                  className={cn("fill-ink-900", s.current ? "stroke-brand-blue" : "stroke-text-primary")}
                  strokeWidth={s.source === "organization" ? 2 : 3}
                  strokeDasharray={s.level === "declared" ? "4 4" : undefined}
                />
                <text x={label.x} y={label.y} textAnchor={label.anchor} className="fill-text-primary text-support font-semibold">
                  {clip(s.title, 24)}
                </text>
                <text x={label.x} y={label.y + 14} textAnchor={label.anchor} className="fill-text-muted font-mono text-meta">
                  {labels.stationMeta[s.key] ?? ""}
                </text>
              </g>
            );
          })}

          {/* horizon items */}
          {journey.horizon.map((h, i) => (
            <g key={h.professionId}>
              <circle cx={HORIZON_X0 + 8} cy={TOP - 14 + i * 44} r={8} className="fill-ink-900 stroke-ink-500" strokeWidth={2} strokeDasharray="3 3" />
              <text x={HORIZON_X0 + 24} y={TOP - 16 + i * 44} className="fill-text-primary text-support font-medium">
                {clip(labels.horizonItem[i]?.name ?? "", 26)}
              </text>
              <text x={HORIZON_X0 + 24} y={TOP + i * 44} className="fill-text-muted text-meta">
                {labels.horizonItem[i]?.detail ?? ""}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* PHONE — vertical route, newest at the top. */}
      <div className="sm:hidden">
        <svg viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={labels.summary} className="h-auto w-full" data-testid="cv-journey-map-phone">
          <text x={8} y={18} className="fill-text-muted font-mono text-meta">
            {labels.horizon} · {labels.derived}
          </text>
          {journey.horizon.map((h, i) => (
            <g key={h.professionId}>
              <circle cx={colX(0)} cy={44 + i * 44} r={8} className="fill-ink-900 stroke-ink-500" strokeWidth={2} strokeDasharray="3 3" />
              <text x={labelX} y={42 + i * 44} className="fill-text-primary text-support font-medium">
                {clip(labels.horizonItem[i]?.name ?? "", 24)}
              </text>
              <text x={labelX} y={58 + i * 44} className="fill-text-muted text-meta">
                {labels.horizonItem[i]?.detail ?? ""}
              </text>
            </g>
          ))}
          <line x1={4} x2={PW - 4} y1={py(span)} y2={py(span)} className="stroke-brand-blue" strokeWidth={2} strokeDasharray="5 5" />
          <text x={PW - 6} y={py(span) - 6} textAnchor="end" className="fill-brand-blue font-mono text-meta font-semibold">
            {labels.now}
          </text>
          {years.map((yr) => (
            <text key={`py-${yr.year}`} x={PW - 4} y={py(yr.day) + 4} textAnchor="end" className="fill-text-muted font-mono text-meta">
              {yr.year}
            </text>
          ))}
          {journey.lines.map((l, i) => {
            const y0 = l.startDay !== null ? py(l.startDay) : py(span) + 40;
            const y1 = l.endDay !== null ? Math.min(py(l.endDay), y0 - 6) : py(span);
            return (
              <g key={l.slug} className={cn(toneOf(l.slug), dim(l.slug) && "opacity-20")}>
                <line x1={colX(i)} x2={colX(i)} y1={y1} y2={y0} stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeDasharray={DASH[l.level]} />
                {l.level === "declared" ? (
                  <line x1={colX(i)} x2={colX(i)} y1={y1} y2={y0} className="stroke-ink-800" strokeWidth={2} />
                ) : null}
                {y1 > py(span) + 8 ? (
                  <line x1={colX(i)} x2={colX(i)} y1={py(span)} y2={y1 - 6} stroke="currentColor" strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" opacity={0.5} />
                ) : null}
              </g>
            );
          })}
          {journey.stations.map((s) => {
            const y = py((s.startDay + s.endDay) / 2);
            const cols = s.lines.map((slug) => journey.lines.findIndex((l) => l.slug === slug)).filter((i) => i >= 0);
            const x0 = cols.length > 0 ? colX(Math.min(...cols)) - 11 : colX(0) - 11;
            const x1 = cols.length > 0 ? colX(Math.max(...cols)) + 11 : colX(0) + 11;
            return (
              <g key={s.key}>
                <rect x={x0} y={y - 9} width={x1 - x0} height={18} rx={9} className={cn("fill-ink-900", s.current ? "stroke-brand-blue" : "stroke-text-primary")} strokeWidth={2.5} />
                <text x={labelX} y={y - 1} className="fill-text-primary text-support font-semibold">
                  {clip(s.title, 26)}
                </text>
                <text x={labelX} y={y + 14} className="fill-text-muted font-mono text-meta">
                  {labels.stationMeta[s.key] ?? ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* LEGEND — the lines by name and evidence style; tap to follow one. */}
      <div className="flex flex-col gap-2">
        <p className="text-meta text-text-muted">{labels.focusHint}</p>
        <ul className="flex flex-wrap gap-2" data-testid="cv-journey-legend">
          {journey.lines.map((l) => (
            <li key={l.slug}>
              <button
                type="button"
                aria-pressed={focus === l.slug}
                onClick={() => setFocus((f) => (f === l.slug ? null : l.slug))}
                className={cn(
                  "inline-flex min-h-11 items-center justify-start gap-2 rounded-full border px-3 py-1.5 text-left text-support text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                  focus === l.slug ? "border-text-primary bg-ink-700" : "border-ink-500 hover:border-text-secondary",
                )}
                data-testid={`cv-journey-line-${l.slug}`}
                data-level={l.level}
              >
                <svg aria-hidden viewBox="0 0 28 8" className={cn("h-2 w-7", toneOf(l.slug))}>
                  <line x1="2" x2="26" y1="4" y2="4" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={DASH[l.level]} />
                </svg>
                <span className="min-w-0">
                  {labels.skill[l.slug] ?? l.slug}
                  <span className="ml-1.5 whitespace-nowrap text-meta text-text-muted">· {labels.level[l.level]}</span>
                </span>
              </button>
            </li>
          ))}
          {focus !== null ? (
            <li>
              <button
                type="button"
                onClick={() => setFocus(null)}
                className="inline-flex min-h-11 items-center px-2 text-support text-text-secondary underline-offset-4 hover:underline"
              >
                {labels.showAll}
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
