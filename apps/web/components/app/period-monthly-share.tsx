import {
  formatHoursAsStated,
  readPeriodEvidence,
} from "@/lib/organization-evidence/period-provenance";
import { PeriodBand } from "@/components/app/work-world/primitives";

/** The words this renderer needs; every caller passes its own translations. */
export interface PeriodReadingLabels {
  /** "Derived equal monthly share · not source days" — a source period only. */
  readonly monthlyShare: string;
  /** "No monthly figure — the source states only the total". */
  readonly noMonthlyFigure: string;
  /** How a span a person chose / the importer derived came to be. `null`
   *  when the caller already says it beside the period. */
  readonly provenance: { readonly human_choice: string; readonly derived: string } | null;
  /** "Source states: “{words}”" — the source's own words, verbatim. */
  readonly sourceStates: (words: string) => string;
  /** The span disagrees with the source's own words. */
  readonly sourceDiffers: string;
}

/**
 * ONE period record, drawn the way the ONE reading allows
 * (`readPeriodEvidence`, owner rule 2026-09-23 — never manufacture
 * precision). Beside the period record, never instead of it, never on a day.
 *
 *   source_period       the source stated the period and no rate: the even
 *                       monthly share (a DERIVED view, labelled, summing to
 *                       the total exactly).
 *   source_rate         the source's words state a rate: that rate, as the
 *                       source's fact beside the total — nothing divided.
 *   interpreted_period  a person chose the span (or it was derived): the
 *                       total and its month span with NO monthly figure, how
 *                       the span came to be, the source's own stated rate or
 *                       duration, and a warning when they disagree. The month
 *                       ribbon is not drawn for it at all.
 *
 * Totals print as the source gave them ("800 h", never "800.00 h"). Renders
 * nothing when there is no period record to read.
 */
export function PeriodMonthlyShare({
  hours,
  periodStart,
  periodEnd,
  derived,
  factFields,
  sourceText,
  labels,
  className,
  part = "all",
}: {
  hours: number | null | undefined;
  periodStart: string | null | undefined;
  periodEnd: string | null | undefined;
  /** The record's own `derived` — where the period's provenance lives. */
  derived: Record<string, unknown> | null | undefined;
  /** The canonical fields the SOURCE stated for this record. */
  factFields?: readonly string[] | null;
  /** The source's own sentence (read for a stated rate or duration). */
  sourceText?: string | null;
  labels: PeriodReadingLabels;
  className?: string;
  /**
   * WHICH HALF to draw (profile summary-first, 2026-09-23). `all` (the
   * default — every caller before this one) draws the whole reading. A
   * surface that keeps the ribbon on the row and puts the exact month list
   * one tap away draws the two halves separately: `ribbon` beside the
   * record, `months` inside its disclosure. The split only ever applies to a
   * SOURCE period (the one kind that HAS a month list): its ribbon always
   * carries its own derived warning (`labels.monthlyShare`), so the shape is
   * never shown without it; only the repeated numbers move. A span with no
   * monthly figure has no month list to move — its whole reading (total,
   * span, "no monthly figure", the source's own words, any disagreement)
   * stays with `ribbon`/`all`, and its `months` half is empty. Same reading,
   * same figures — nothing is computed twice differently.
   */
  part?: "all" | "ribbon" | "months";
}) {
  const r = readPeriodEvidence({ hours, periodStart, periodEnd, derived, factFields, sourceText });
  if (!r) return null;
  const total = `${formatHoursAsStated(r.totalHours)} h`;

  if (r.kind === "source_period") {
    const p = r.projection;
    return (
      <div
        className={className ?? "flex flex-col gap-1.5"}
        data-testid={part === "months" ? "period-monthly-share-months" : "period-monthly-share"}
        data-part={part}
        data-kind={r.kind}
        data-method={p.method}
        data-months={p.monthCount}
        data-total={p.totalHours}
      >
        {/* The period as a TIME RIBBON (work-world PeriodBand): the total is one
            real figure, split visually across the months it touches — only
            because the SOURCE stated this period and no rate of its own. The
            `monthlyShare` label is the reader's "derived · not source days". */}
        {part !== "months" ? (
          <PeriodBand totalLabel={total} derivedLabel={labels.monthlyShare} months={p.months} />
        ) : null}
        {/* The exact month figures stay available as text beneath the ribbon —
            the ribbon shows the shape, the list states the numbers. */}
        {part !== "ribbon" ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-meta tabular-nums text-text-secondary">
            {p.months.map((m) => (
              <li key={m.month} data-month={m.month}>
                {m.month} · {m.hours.toFixed(2)} h
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  // A span with NO monthly figure: the total and the months it covers, as
  // text — the month ribbon (PeriodBand) is only ever handed a SOURCE
  // period's derived shares, so a chosen span can never be drawn as an even
  // split, not even as unlabelled equal segments. There is no month list
  // here, so the `months` half (a disclosure's copy) has nothing to draw.
  if (part === "months") return null;
  const stated = [r.kind === "interpreted_period" ? r.duration : null, r.rate].filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );
  const conflicts = r.kind === "interpreted_period" ? r.conflicts : [];
  return (
    <div
      className={className ?? "flex flex-col gap-1.5"}
      data-testid="period-monthly-share"
      data-part={part}
      data-kind={r.kind}
      data-provenance={r.provenance}
      data-figures="none"
      data-months={r.span.months}
      data-total={r.totalHours}
      data-conflicts={conflicts.length > 0 ? conflicts.join(" ") : undefined}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="font-mono text-sm font-semibold text-brand-cyan" data-testid="period-total">
          {total}
        </span>
        <span className="font-mono text-meta uppercase tracking-label text-text-muted" data-testid="period-month-span">
          {r.span.first === r.span.last ? r.span.first : `${r.span.first} → ${r.span.last}`}
        </span>
      </div>
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.noMonthlyFigure}</span>
      {r.kind === "interpreted_period" && labels.provenance ? (
        <p className="text-meta text-text-muted" data-testid="period-provenance-label">
          {labels.provenance[r.provenance]}
        </p>
      ) : null}
      {stated.map((c) => (
        <p key={c.words} className="text-meta text-text-secondary" data-testid="period-source-states">
          {labels.sourceStates(c.words)}
        </p>
      ))}
      {conflicts.length > 0 ? (
        <p className="text-meta text-state-amber" data-testid="period-source-differs">
          {labels.sourceDiffers}
        </p>
      ) : null}
    </div>
  );
}
