/**
 * PERIOD AGGREGATE → EQUAL MONTHLY SHARE — a READ-SIDE derived view.
 *
 * Owner decision 2026-09-17 (B1 historical import): an aggregate a human
 * has confirmed over a period ("800 h, 2025-06-01 → 2025-11-30, remote")
 * is to be READ as evenly distributed across its calendar months. The
 * canonical record stays exactly ONE period record (`period_start`,
 * `period_end`, `hours`); this module derives a per-month view of it and
 * stores nothing. Nothing here is a day: the output has no day key, so it
 * can never be summed into a day ledger by accident, and no surface may
 * present a share as "worked X hours on this date".
 *
 *   SOURCE FACT (800 h, "16 month")  ≠  HUMAN CONFIRMATION (6 months, dates)
 *   ≠  DERIVED PROJECTION (this: 133.34 / 133.34 / 133.33 / 133.33 / 133.33 / 133.33)
 *
 * EXACT CONSERVATION. Hours are split in integer hundredths: every month
 * gets ⌊H/n⌋ hundredths and the remainder r (< n) goes one hundredth each to
 * the FIRST r months, deterministically. The shares therefore sum to the
 * total to the cent — never 799.98 or 800.02 — and the same input always
 * yields the same shares.
 *
 * Pure: strings and numbers in, a projection (or null) out. A missing or
 * invalid period, or a non-positive total, yields `null` — no projection is
 * ever fabricated to fill a gap.
 */

export interface PeriodMonthShare {
  /** `YYYY-MM`. */
  readonly month: string;
  /** This month's share in hours, to the hundredth. */
  readonly hours: number;
}

export interface PeriodMonthlyProjection {
  readonly method: "equal_month_share";
  /** The canonical total, unchanged. */
  readonly totalHours: number;
  readonly monthCount: number;
  /** Oldest → newest, one entry per calendar month the period touches. */
  readonly months: readonly PeriodMonthShare[];
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(s: string | null | undefined): { y: number; m: number } | null {
  if (!s) return null;
  const hit = ISO_DAY.exec(s.trim());
  if (!hit) return null;
  const y = Number(hit[1]);
  const m = Number(hit[2]);
  const d = Number(hit[3]);
  if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m };
}

/** Calendar months from `start` to `end` inclusive, as `YYYY-MM`. */
export function monthsBetween(periodStart: string, periodEnd: string): readonly string[] | null {
  const a = parseDay(periodStart);
  const b = parseDay(periodEnd);
  if (!a || !b) return null;
  const first = a.y * 12 + (a.m - 1);
  const last = b.y * 12 + (b.m - 1);
  if (last < first) return null;
  const out: string[] = [];
  for (let k = first; k <= last; k += 1) {
    const y = Math.floor(k / 12);
    const m = (k % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

/**
 * The even monthly share of one confirmed period aggregate, or `null` when
 * there is nothing honest to derive (no period, an inverted period, a
 * non-positive total).
 */
export function projectPeriodAggregateByMonth(input: {
  readonly hours: number | null | undefined;
  readonly periodStart: string | null | undefined;
  readonly periodEnd: string | null | undefined;
}): PeriodMonthlyProjection | null {
  const hours = input.hours;
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours <= 0) return null;
  if (!input.periodStart) return null;
  const months = monthsBetween(input.periodStart, input.periodEnd ?? input.periodStart);
  if (!months || months.length === 0) return null;

  const n = months.length;
  // Integer hundredths: the only arithmetic that conserves the total exactly.
  const totalCents = Math.round(hours * 100);
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  const shares = months.map((month, i) => ({
    month,
    hours: (base + (i < remainder ? 1 : 0)) / 100,
  }));
  return {
    method: "equal_month_share",
    totalHours: totalCents / 100,
    monthCount: n,
    months: shares,
  };
}

/** The shares' sum in hundredths — what a guard compares to the total. */
export function projectionSumCents(p: PeriodMonthlyProjection): number {
  return p.months.reduce((acc, m) => acc + Math.round(m.hours * 100), 0);
}
