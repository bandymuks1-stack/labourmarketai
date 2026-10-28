/**
 * ONE CONTINUOUS BUSINESS HISTORY, READ IN PERIODS (owner model 2026-09-30,
 * docs/design/business-history-continuity-v1.md §2 follow-ups 2 + 3).
 *
 * A continuing business (e.g. LabourMarket.ai) carries work made under earlier
 * legal entities (e.g. Vivat Rex). The PERIOD statements live in
 * `organization_history_periods`; the work lives once in
 * `organization_evidence_records`. This module COMPOSES them on read — no
 * evidence is copied, no record is moved, no legal identity is asserted:
 *
 *   1. a record whose source label (the original sheet name, verbatim in
 *      `source_fact.source_sheet`) is one of a period's `source_labels` belongs
 *      to that period;
 *   2. otherwise a record dated inside a period's DOCUMENTED bounds belongs to
 *      it (NULL bounds are "not documented", never open-ended — they place
 *      nothing);
 *   3. otherwise the record is NOT PLACED, and is counted as such.
 *
 * Every record is counted exactly once. The year timeline counts every record
 * by its own date (a period aggregate by the year its span starts in — it is
 * never split across years or days).
 *
 * Pure: no IO. The reader (`business-history-read.ts`) supplies the rows.
 */

export type HistoryPeriodStatement = {
  readonly id: string;
  readonly periodLabel: string;
  readonly legalEntityLabel: string | null;
  readonly sourceLabels: readonly string[];
  /** ISO day or null = not documented. */
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly continuity: "continuous_business_history" | "separate_history";
  readonly legalEntityRelation:
    | "not_asserted"
    | "same_entity"
    | "renamed"
    | "successor"
    | "sold_and_continued_by_new_entity"
    | "other";
  readonly basis: "owner_statement" | "registry_extract" | "contract" | "other_document";
  readonly basisReference: string | null;
  readonly statement: string | null;
  readonly createdAt: string;
  /** How precisely each bound is known (migration 20261024100000); absent /
   *  null = as stated, to the day. */
  readonly periodStartPrecision?: PeriodBoundPrecision | null;
  readonly periodEndPrecision?: PeriodBoundPrecision | null;
};

export type PeriodBoundPrecision = "day" | "month" | "year";

/**
 * The bound of a stated period that work can CERTAINLY be inside of, given
 * the precision the bound is known to: for the start the latest plausible
 * day, for the end the earliest plausible one (the INNER span). "January
 * 2026" as an end certainly covers work only up to 2026-01-01. Pure, no
 * clock — the ONE rule, shared by the company view and the person's
 * professional history.
 */
export function innerPeriodBound(
  iso: string,
  precision: PeriodBoundPrecision | null | undefined,
  side: "start" | "end",
): string {
  if (!precision || precision === "day") return iso;
  const y = iso.slice(0, 4);
  if (precision === "year") return side === "start" ? `${y}-12-31` : `${y}-01-01`;
  const m = Number(iso.slice(5, 7));
  const yn = Number(y);
  const leap = (yn % 4 === 0 && yn % 100 !== 0) || yn % 400 === 0;
  const last = m === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
  const mm = String(m).padStart(2, "0");
  return side === "start" ? `${y}-${mm}-${String(last).padStart(2, "0")}` : `${y}-${mm}-01`;
}

export type BusinessHistoryRecord = {
  readonly id: string;
  readonly personId: string | null;
  readonly workObjectId: string | null;
  readonly projectId: string | null;
  readonly activityDate: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly hours: number | null;
  /** Verbatim sheet / dataset label from the source, when the source had one. */
  readonly sourceLabel: string | null;
};

export type HistoryBucketTotals = {
  readonly records: number;
  readonly hours: number;
  readonly people: number;
  readonly places: number;
  readonly projects: number;
  /** Earliest / latest day any counted record covers (ISO); null when none. */
  readonly from: string | null;
  readonly to: string | null;
};

export type BusinessHistory = {
  readonly totals: HistoryBucketTotals;
  readonly periods: readonly {
    readonly statement: HistoryPeriodStatement;
    readonly totals: HistoryBucketTotals;
    /** How the records got here: by source label, by documented date. */
    readonly placedByLabel: number;
    readonly placedByDate: number;
  }[];
  readonly notPlaced: HistoryBucketTotals;
  readonly years: readonly ({ readonly year: number } & HistoryBucketTotals)[];
  /** Records with no usable date (counted in totals, in no year). */
  readonly undated: number;
};

const norm = (s: string) => s.trim().toLowerCase();

function dayOf(r: BusinessHistoryRecord): string | null {
  return r.activityDate ?? r.periodStart ?? null;
}

function lastDayOf(r: BusinessHistoryRecord): string | null {
  return r.periodEnd ?? r.activityDate ?? r.periodStart ?? null;
}

class Acc {
  records = 0;
  hours = 0;
  people = new Set<string>();
  places = new Set<string>();
  projects = new Set<string>();
  from: string | null = null;
  to: string | null = null;
  add(r: BusinessHistoryRecord) {
    this.records += 1;
    if (r.hours !== null && Number.isFinite(r.hours) && r.hours > 0) this.hours += r.hours;
    if (r.personId) this.people.add(r.personId);
    if (r.workObjectId) this.places.add(r.workObjectId);
    if (r.projectId) this.projects.add(r.projectId);
    const a = dayOf(r);
    const b = lastDayOf(r);
    if (a && (this.from === null || a < this.from)) this.from = a;
    if (b && (this.to === null || b > this.to)) this.to = b;
  }
  totals(): HistoryBucketTotals {
    return {
      records: this.records,
      hours: Math.round(this.hours * 100) / 100,
      people: this.people.size,
      places: this.places.size,
      projects: this.projects.size,
      from: this.from,
      to: this.to,
    };
  }
}

/** The live statements only: a statement superseded by a later one is history, not a period. */
export function livePeriods(
  all: readonly (HistoryPeriodStatement & { readonly supersedesId: string | null })[],
): HistoryPeriodStatement[] {
  const superseded = new Set(all.map((p) => p.supersedesId).filter((x): x is string => !!x));
  return all.filter((p) => !superseded.has(p.id));
}

export function buildBusinessHistory(
  records: readonly BusinessHistoryRecord[],
  periods: readonly HistoryPeriodStatement[],
): BusinessHistory {
  const total = new Acc();
  const notPlaced = new Acc();
  const perPeriod = periods.map(() => ({ acc: new Acc(), byLabel: 0, byDate: 0 }));
  const labelIndex = new Map<string, number>();
  periods.forEach((p, i) => {
    for (const l of p.sourceLabels) if (!labelIndex.has(norm(l))) labelIndex.set(norm(l), i);
  });
  const years = new Map<number, Acc>();
  let undated = 0;

  for (const r of records) {
    total.add(r);
    // 1. by source label
    const byLabel = r.sourceLabel ? labelIndex.get(norm(r.sourceLabel)) : undefined;
    if (byLabel !== undefined) {
      perPeriod[byLabel].acc.add(r);
      perPeriod[byLabel].byLabel += 1;
    } else {
      // 2. by DOCUMENTED bounds (both ends known), only work CERTAINLY
      //    inside them (a bound known to the month covers its inner span).
      const d = dayOf(r);
      const e = lastDayOf(r);
      const i = d
        ? periods.findIndex(
            (p) =>
              p.periodStart !== null &&
              p.periodEnd !== null &&
              d >= innerPeriodBound(p.periodStart, p.periodStartPrecision, "start") &&
              (e ?? d) <= innerPeriodBound(p.periodEnd, p.periodEndPrecision, "end"),
          )
        : -1;
      if (i >= 0) {
        perPeriod[i].acc.add(r);
        perPeriod[i].byDate += 1;
      } else {
        notPlaced.add(r);
      }
    }
    const d = dayOf(r);
    if (!d) {
      undated += 1;
      continue;
    }
    const y = Number(d.slice(0, 4));
    if (!Number.isFinite(y)) {
      undated += 1;
      continue;
    }
    let acc = years.get(y);
    if (!acc) years.set(y, (acc = new Acc()));
    acc.add(r);
  }

  return {
    totals: total.totals(),
    periods: periods.map((statement, i) => ({
      statement,
      totals: perPeriod[i].acc.totals(),
      placedByLabel: perPeriod[i].byLabel,
      placedByDate: perPeriod[i].byDate,
    })),
    notPlaced: notPlaced.totals(),
    years: [...years.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, acc]) => ({ year, ...acc.totals() })),
    undated,
  };
}
