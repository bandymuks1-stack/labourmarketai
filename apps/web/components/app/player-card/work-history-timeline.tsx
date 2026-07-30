import type { HistoryTimeline } from "@/lib/player-card/evidence-visuals";

/**
 * §5.2 WORK HISTORY TIMELINE — WHERE and WHEN the work happened, on one real
 * time band instead of a stack of date strings.
 *
 * Segments are absolutely positioned by the fractions the pure deriver
 * computed from real `engagement_contexts` dates, so the picture cannot drift
 * from the data. Year ticks are real calendar boundaries inside the span.
 *
 * HONESTY: an engagement with no start date is never placed — it is counted in
 * a line under the band. A running engagement ends at "now" and says so.
 */

export interface HistoryTimelineLabels {
  readonly title: string;
  readonly current: string;
  /** "{count} records without a date …" — interpolated, or null when none. */
  readonly undated: string | null;
  /** "2023-06-01 – 2026-07-30" — the real span, already formatted. */
  readonly range: string | null;
  /** Real dates per placed engagement, index-aligned with `timeline.lanes`.
   *  These replace the card's old second history list — the same facts, once. */
  readonly laneDetails: readonly string[];
  readonly empty: string;
  readonly ariaLabel: string;
}

export function WorkHistoryTimeline({
  timeline,
  labels,
}: {
  timeline: HistoryTimeline;
  labels: HistoryTimelineLabels;
}) {
  if (timeline.lanes.length === 0) {
    // Nothing placeable. When there is not even an undated row, the whole
    // block would say nothing at all — so it renders nothing.
    if (timeline.undatedCount === 0) return null;
    return (
      <section
        className="flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
        data-testid="player-card-history-timeline"
        data-chart-state="empty"
      >
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.title}
        </span>
        <p className="text-meta leading-relaxed text-text-secondary">
          {labels.undated ?? labels.empty}
        </p>
      </section>
    );
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid="player-card-history-timeline"
      data-chart-state="live"
      data-chart-lanes={timeline.lanes.length}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.title}
        </span>
        {labels.range ? (
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.range}
          </span>
        ) : null}
      </div>

      <div
        className="relative flex flex-col gap-1.5"
        role="img"
        aria-label={labels.ariaLabel}
      >
        {/* Real year boundaries, behind the segments. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {timeline.ticks.map((t) => (
            <span
              key={t.year}
              className="absolute top-0 bottom-4 w-px bg-ink-600"
              style={{ left: `${t.fraction * 100}%` }}
            />
          ))}
        </div>

        {timeline.lanes.map((lane, i) => (
          <div
            key={lane.id}
            className="flex flex-col gap-0.5"
            data-testid="player-card-history-lane"
            data-lane={lane.id}
          >
            <div className="relative h-6">
              <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-ink-700/60" />
              <div
                className={`absolute inset-y-0 flex items-center rounded-full px-2 ${
                  lane.current
                    ? "bg-brand-cyan/25 ring-1 ring-inset ring-brand-cyan/60"
                    : "bg-brand-blue/25 ring-1 ring-inset ring-brand-blue/50"
                }`}
                style={{
                  left: `${lane.startFraction * 100}%`,
                  width: `${Math.max(6, (lane.endFraction - lane.startFraction) * 100)}%`,
                }}
              >
                <span className="truncate text-meta font-medium leading-none text-text-primary">
                  {lane.label}
                </span>
              </div>
            </div>
            {/* The real dates, stated once — the card no longer repeats this
                as a separate history list below (owner: no filler rows). */}
            {labels.laneDetails[i] ? (
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {labels.laneDetails[i]}
              </span>
            ) : null}
          </div>
        ))}

        {/* Year scale under the band. */}
        <div aria-hidden className="relative h-3">
          {timeline.ticks.map((t) => (
            <span
              key={t.year}
              className="absolute top-0 -translate-x-1/2 font-mono text-meta uppercase tracking-label text-text-muted"
              style={{ left: `${t.fraction * 100}%` }}
            >
              {t.year}
            </span>
          ))}
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta leading-relaxed text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-4 rounded-full bg-brand-cyan/60" />
          {labels.current}
        </span>
        {labels.undated ? <span>{labels.undated}</span> : null}
      </p>
    </section>
  );
}
