import { monthsBetween } from "@/lib/organization-evidence/period-projection";
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
 *                       months it covers with NO figure on any of them, how
 *                       the span came to be, the source's own stated rate or
 *                       duration, and a warning when they disagree.
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
}) {
  const r = readPeriodEvidence({ hours, periodStart, periodEnd, derived, factFields, sourceText });
  if (!r) return null;
  const total = `${formatHoursAsStated(r.totalHours)} h`;

  if (r.kind === "source_period") {
    const p = r.projection;
    return (
      <div
        className={className ?? "flex flex-col gap-1.5"}
        data-testid="period-monthly-share"
        data-kind={r.kind}
        data-method={p.method}
        data-months={p.monthCount}
        data-total={p.totalHours}
      >
        {/* The period as a TIME RIBBON (work-world PeriodBand): the total is one
            real figure, split visually across the months it touches — only
            because the SOURCE stated this period and no rate of its own. The
            `monthlyShare` label is the reader's "derived · not source days". */}
        <PeriodBand totalLabel={total} derivedLabel={labels.monthlyShare} months={p.months} />
        {/* The exact month figures stay available as text beneath the ribbon —
            the ribbon shows the shape, the list states the numbers. */}
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-meta tabular-nums text-text-secondary">
          {p.months.map((m) => (
            <li key={m.month} data-month={m.month}>
              {m.month} · {m.hours.toFixed(2)} h
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // A span with NO monthly figure: the months it covers, nothing divided.
  const months = (monthsBetween(r.periodStart, r.periodEnd) ?? []).map((month) => ({ month, hours: null }));
  const stated = [r.kind === "interpreted_period" ? r.duration : null, r.rate].filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );
  const conflicts = r.kind === "interpreted_period" ? r.conflicts : [];
  return (
    <div
      className={className ?? "flex flex-col gap-1.5"}
      data-testid="period-monthly-share"
      data-kind={r.kind}
      data-provenance={r.provenance}
      data-months={r.span.months}
      data-total={r.totalHours}
      data-conflicts={conflicts.length > 0 ? conflicts.join(" ") : undefined}
    >
      <PeriodBand totalLabel={total} derivedLabel={labels.noMonthlyFigure} months={months} />
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
