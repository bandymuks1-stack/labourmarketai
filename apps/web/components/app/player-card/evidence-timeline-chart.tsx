import type { EvidenceMonth } from "@/lib/player-card/evidence-visuals";

/**
 * §5.2 EVIDENCE GROWTH — the worker's own work-journal entries per calendar
 * month. A real column chart, not a sentence with a number in it.
 *
 * Server-rendered inline SVG: no charting library, no client hook, so the
 * columns are in the DOM on first paint and a Playwright check can assert them
 * without waiting for hydration.
 *
 * HONESTY: every column height is `entries / max` of REAL counts. A month with
 * nothing logged renders a real baseline tick, never an interpolated curve.
 * When the whole window is empty the chart is replaced by a plain sentence —
 * an empty chart frame would read as a product that has no data model.
 */

export interface EvidenceChartLabels {
  readonly title: string;
  readonly hint: string;
  readonly empty: string;
  /** "{count} entries in the last 12 months" — already interpolated. */
  readonly total: string;
  /** "Most: {count} in {month}" — already interpolated, or null when flat. */
  readonly peak: string | null;
  /** Short month names, index-aligned with `months`. */
  readonly monthLabels: readonly string[];
  /** Screen-reader summary of the real series. */
  readonly ariaLabel: string;
}

// viewBox units. `preserveAspectRatio="none"` stretches the columns to the
// container width; rects scale cleanly, and no text lives inside the SVG.
const VB_W = 100;
const VB_H = 40;
const FLOOR = 1.5; // a visible tick for a real zero month

export function EvidenceTimelineChart({
  months,
  labels,
}: {
  months: readonly EvidenceMonth[];
  labels: EvidenceChartLabels;
}) {
  const max = months.reduce((m, x) => (x.entries > m ? x.entries : m), 0);

  if (months.length === 0 || max === 0) {
    return (
      <section
        className="flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
        data-testid="player-card-evidence-chart"
        data-chart-state="empty"
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.title}
        </span>
        <p className="text-meta leading-relaxed text-text-secondary">
          {labels.empty}
        </p>
      </section>
    );
  }

  const slot = VB_W / months.length;
  const barW = Math.max(1.2, slot * 0.56);
  const gap = (slot - barW) / 2;

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid="player-card-evidence-chart"
      data-chart-state="live"
      data-chart-months={months.length}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.title}
        </span>
        <span className="text-meta text-text-secondary">{labels.total}</span>
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="h-20 w-full sm:h-24"
        role="img"
        aria-label={labels.ariaLabel}
      >
        {/* Half-scale reference line — reading help, not decoration. */}
        <line
          x1="0"
          y1={VB_H / 2}
          x2={VB_W}
          y2={VB_H / 2}
          className="stroke-ink-600"
          strokeWidth="1"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        {months.map((m, i) => {
          const h = m.entries === 0 ? FLOOR : (m.entries / max) * (VB_H - 3);
          const isLast = i === months.length - 1;
          return (
            <rect
              key={m.month}
              x={i * slot + gap}
              y={VB_H - h}
              width={barW}
              height={h}
              className={
                m.entries === 0
                  ? "fill-ink-600"
                  : isLast
                    ? "fill-brand-cyan"
                    : "fill-brand-blue"
              }
              data-month={m.month}
              data-entries={m.entries}
            />
          );
        })}
        <line
          x1="0"
          y1={VB_H}
          x2={VB_W}
          y2={VB_H}
          className="stroke-ink-500"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Axis labels live in HTML so they never distort with the SVG. */}
      <ul className="flex justify-between" aria-hidden>
        {months.map((m, i) => (
          <li
            key={m.month}
            className="flex-1 text-center font-mono text-meta uppercase tracking-label text-text-muted"
          >
            <span className={i % 2 === 0 ? "" : "hidden sm:inline"}>
              {labels.monthLabels[i] ?? ""}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-meta leading-relaxed text-text-secondary">
        {labels.peak ? `${labels.peak} · ${labels.hint}` : labels.hint}
      </p>
    </section>
  );
}
