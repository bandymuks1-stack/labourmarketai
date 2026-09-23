import { formatUtcDate, formatUtcDateRange } from "@/lib/time/display";

import {
  monthsBetween,
  projectPeriodAggregateByMonth,
  type PeriodMonthlyProjection,
} from "./period-projection";
import {
  extractSourceTimeCues,
  sourceTimeConflicts,
  type SourceStatedDuration,
  type SourceStatedRate,
  type SourceTimeConflict,
  type SourceTimeCues,
  type TimeSemantics,
} from "./time-semantics";

/**
 * THE ONE PROVENANCE-AND-PRECISION READING of a period record (owner rule
 * 2026-09-23, superseding the 2026-09-17 equal-monthly display).
 *
 * "Never manufacture precision." A source that proves 800 total hours
 * proves 800 hours — not 133.33 a month, and not a day's share. What a
 * reader may be shown depends on WHERE the period came from:
 *
 *   source_period       the SOURCE stated the period, and no rate. Only here
 *                       may the total be drawn as an even monthly share —
 *                       labelled DERIVED, summing to the total exactly.
 *   source_rate         the source's own words state a rate ("each month
 *                       only 50 hours"). That rate IS the monthly figure the
 *                       source gives; it is shown as the source's fact beside
 *                       the total, and nothing is divided.
 *   interpreted_period  a PERSON chose the period at import (or the importer
 *                       derived it). The span is shown at MONTH precision
 *                       with how it came to be, and NO monthly figure: the
 *                       total is not the source's per-month statement, and a
 *                       split would invent one. Where the span disagrees with
 *                       the source's words, the disagreement travels with it.
 *
 * Every surface that draws a period record reads it HERE — the subject's
 * profile, the organization's record list, the historical workspace, the
 * company person page, the planning calendar and the work-model ledger — so
 * no surface can split a figure another surface labels as an interpretation.
 *
 * Pure: strings and numbers in, a reading out. Stores nothing.
 */

export type PeriodProvenance = "source" | "human_choice" | "derived";

/** Fields that state a PERIOD. A row-level `workDate` is never one of them:
 *  a day the source stated says nothing about a period a person chose. */
const PERIOD_FACT = /^(periodStart|periodEnd|period_start|period_end)$/i;
/** Fields that state a DAY. */
const DAY_FACT = /^(workDate|activityDate|activity_date)$/i;

function methodOf(derived: Record<string, unknown> | null | undefined, key: string): string | null {
  const d = derived?.[key] as { method?: unknown } | undefined;
  return d && typeof d === "object" && typeof d.method === "string" ? d.method : null;
}

/**
 * How the record's WHEN came to be. For a PERIOD record: the time-semantics
 * decision that set it (`human_choice` when a person chose it, `derived`
 * otherwise), else `source` when the source stated a period field, else the
 * method recorded for it. For a DAY record: `source` when the source stated
 * the day, else the method of its derived date. Pure; it reads the record's
 * own provenance and never guesses.
 */
export function periodProvenance(rec: {
  readonly activityDate: string | null;
  readonly periodStart: string | null;
  readonly factFields: readonly string[];
  readonly derived: Record<string, unknown> | null | undefined;
}): PeriodProvenance {
  const derived = rec.derived ?? {};
  if (rec.periodStart) {
    // The commit writes a time-semantics period into the canonical columns;
    // the decision that set it is what this period IS.
    const ts = derived.timeSemantics as { periodStart?: unknown; method?: unknown } | undefined;
    if (ts && typeof ts.periodStart === "string" && ts.periodStart !== "") {
      return ts.method === "human_choice" ? "human_choice" : "derived";
    }
    if (rec.factFields.some((f) => PERIOD_FACT.test(f))) return "source";
    const m = methodOf(derived, "periodStart") ?? methodOf(derived, "timeSemantics");
    if (m === null) return "source";
    return m === "human_choice" ? "human_choice" : "derived";
  }
  if (rec.factFields.some((f) => DAY_FACT.test(f))) return "source";
  const m = methodOf(derived, "workDate") ?? methodOf(derived, "activityDate");
  if (m === null) return "source";
  return m === "human_choice" ? "human_choice" : "derived";
}

/** A period at MONTH precision: `YYYY-MM` bounds and the calendar months it touches. */
export interface MonthSpan {
  readonly first: string;
  readonly last: string;
  readonly months: number;
}

/** The month span of an ISO-day period, or null for a missing / inverted one. */
export function monthSpanOf(periodStart: string | null | undefined, periodEnd: string | null | undefined): MonthSpan | null {
  if (!periodStart || !periodEnd) return null;
  const months = monthsBetween(periodStart, periodEnd);
  if (!months || months.length === 0) return null;
  return { first: months[0], last: months[months.length - 1], months: months.length };
}

interface ReadingBase {
  /** The canonical total, exactly as recorded. */
  readonly totalHours: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly span: MonthSpan;
  /** What the source's words state, verbatim — null when they state nothing. */
  readonly duration: SourceStatedDuration | null;
  readonly rate: SourceStatedRate | null;
}

export type PeriodEvidenceReading =
  | (ReadingBase & {
      readonly kind: "source_period";
      readonly provenance: "source";
      /** The ONLY place an even monthly share may exist — labelled DERIVED. */
      readonly projection: PeriodMonthlyProjection;
    })
  | (ReadingBase & {
      readonly kind: "source_rate";
      readonly provenance: "source";
      readonly rate: SourceStatedRate;
    })
  | (ReadingBase & {
      readonly kind: "interpreted_period";
      readonly provenance: "human_choice" | "derived";
      /** Always month: a span a person chose is not a day-precise fact. */
      readonly precision: "month";
      /** Where the span / total disagree with the source's words. */
      readonly conflicts: readonly SourceTimeConflict[];
    });

function cuesOf(
  derived: Record<string, unknown> | null | undefined,
  sourceText: string | null | undefined,
): SourceTimeCues | null {
  const ts = derived?.timeSemantics as TimeSemantics | undefined;
  // Cues recorded at classification win; a classification from before they
  // existed is read from the source text itself (the same words, the same rule).
  if (ts && ts.sourceCues !== undefined) return ts.sourceCues ?? null;
  return extractSourceTimeCues(sourceText);
}

/**
 * Read ONE period record. `null` when it is not a period record with a
 * positive total (a day record, a missing or inverted span, no figure) —
 * nothing is fabricated to fill a gap.
 */
export function readPeriodEvidence(input: {
  readonly hours: number | null | undefined;
  readonly periodStart: string | null | undefined;
  readonly periodEnd: string | null | undefined;
  readonly derived?: Record<string, unknown> | null;
  /** The canonical fields the SOURCE stated for this record. */
  readonly factFields?: readonly string[] | null;
  /** The source's own sentence — read for a stated rate / duration when the
   *  classification predates them. */
  readonly sourceText?: string | null;
}): PeriodEvidenceReading | null {
  const hours = input.hours;
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours <= 0) return null;
  const periodStart = input.periodStart ?? null;
  const periodEnd = input.periodEnd ?? null;
  const span = monthSpanOf(periodStart, periodEnd);
  if (!span || !periodStart || !periodEnd) return null;

  const derived = input.derived ?? {};
  const provenance = periodProvenance({
    activityDate: null,
    periodStart,
    factFields: input.factFields ?? [],
    derived,
  });
  const cues = cuesOf(derived, input.sourceText);
  const base: ReadingBase = {
    totalHours: Math.round(hours * 100) / 100,
    periodStart,
    periodEnd,
    span,
    duration: cues?.duration ?? null,
    rate: cues?.rate ?? null,
  };

  if (provenance !== "source") {
    return {
      ...base,
      kind: "interpreted_period",
      provenance,
      precision: "month",
      conflicts: sourceTimeConflicts({ hours, periodStart, periodEnd, cues }),
    };
  }
  if (base.rate) return { ...base, kind: "source_rate", provenance: "source", rate: base.rate };
  const projection = projectPeriodAggregateByMonth({ hours, periodStart, periodEnd });
  if (!projection) return null;
  return { ...base, kind: "source_period", provenance: "source", projection };
}

/** A total as the source gave it: `800`, `7.5` — never `800.00`. */
export function formatHoursAsStated(hours: number): string {
  return String(Math.round(hours * 100) / 100);
}

/** A month span in the reader's locale: "Jun – Nov 2025", "Jun 2025". */
export function formatMonthSpan(span: MonthSpan, locale: string): string {
  return (
    formatUtcDateRange(`${span.first}-01`, `${span.last}-01`, locale, {
      month: "short",
      year: "numeric",
    }) ?? `${span.first} – ${span.last}`
  );
}

/** A month span in the ISO form surfaces that print ISO days use. */
export function isoMonthSpan(span: MonthSpan): string {
  return span.first === span.last ? span.first : `${span.first} – ${span.last}`;
}

/**
 * A record's WHEN at the precision it actually has: the day; a SOURCE
 * period as its days; a period a person chose (or the importer derived) as
 * MONTHS — "2025-06 – 2025-11", never "2025-06-01 – 2025-11-30". ISO when no
 * locale is given (the surfaces that print ISO days), localized otherwise.
 */
export function recordWhen(
  rec: {
    readonly activityDate: string | null;
    readonly periodStart: string | null;
    readonly periodEnd: string | null;
    readonly factFields?: readonly string[] | null;
    readonly derived?: Record<string, unknown> | null;
  },
  locale?: string,
): string | null {
  if (rec.activityDate) return locale ? formatUtcDate(rec.activityDate, locale) : rec.activityDate;
  if (!rec.periodStart) return null;
  const end = rec.periodEnd ?? null;
  const provenance = periodProvenance({
    activityDate: null,
    periodStart: rec.periodStart,
    factFields: rec.factFields ?? [],
    derived: rec.derived,
  });
  const span = monthSpanOf(rec.periodStart, end);
  if (provenance !== "source" && span) {
    return locale ? formatMonthSpan(span, locale) : isoMonthSpan(span);
  }
  if (locale) return formatUtcDateRange(rec.periodStart, end, locale);
  return [rec.periodStart, end].filter(Boolean).join(" – ");
}
