import { effectiveEndDay } from "@/lib/planning/planning-model";
import type {
  HeldTime,
  ReservationGap,
  ReservationSource,
} from "@/lib/workforce/commitment-reservation";

/**
 * HOW MUCH OF A PERIOD IS ALREADY SPOKEN FOR — CAL-9.
 *
 * ── THE DENOMINATOR PROBLEM, STATED PLAINLY ────────────────────────────────
 *
 * "Utilisation" normally means worked time ÷ AVAILABLE time. This product
 * records no available time: there is no contracted-hours column, no FTE
 * fraction, no working-pattern anywhere in the schema (checked 2026-09-14
 * across every migration). Any percentage computed against an assumed
 * eight-hour day or five-day week would be a number invented here and read as
 * a measurement — the exact failure the owner named when approving this.
 *
 * So this file does not invent one. It answers a NARROWER question it can
 * actually measure — how many days of a stated window this person is already
 * committed for — and it NAMES the denominator it used
 * (`UTILISATION_DENOMINATOR`), so nobody can mistake "18 of 30 calendar days"
 * for "60% FTE". Both numbers travel together, always; there is deliberately
 * no way to render the ratio without the window it came from.
 *
 * ── FOUR STATES, BECAUSE UNKNOWN IS NOT ZERO (SEP-7) ───────────────────────
 *
 *   measured  every source answered and every commitment carried dates
 *   partial   the counts are a FLOOR — something real could not be placed on
 *             the calendar (an assignment to a project nobody dated). The
 *             ratio is withheld: a ratio built on an incomplete numerator is
 *             worse than no ratio, because it looks complete.
 *   unknown   a source could not be read at all. Counts are null, NOT zero:
 *             "we could not see their commitments" and "they have none" are
 *             opposite facts and used to render identically.
 *   invalid_window  the caller asked about a window that is not a window.
 *
 * ── DOUBLE COUNTING ────────────────────────────────────────────────────────
 *
 * Days are counted as a SET, not as a sum of ranges. Two overlapping
 * commitments on the same day are one committed day; summing range lengths
 * would let a person be 200% committed, which is how a planner starts
 * reporting impossible numbers with a straight face.
 *
 * PURE. No IO, no clock. The commitment vocabulary and the gap vocabulary are
 * the ones CAL-7 already defines — one description of what holds a person's
 * time, read here over a window instead of at a moment.
 */

/** The denominator this file uses, stated so no caller has to guess. */
export const UTILISATION_DENOMINATOR = "calendar_days" as const;
export type UtilisationDenominator = typeof UTILISATION_DENOMINATOR;

/** A year and a day. Longer windows are a report, not a planning view, and
 *  the day-by-day walk below should not be asked to be one. */
export const MAX_UTILISATION_WINDOW_DAYS = 366;

export type UtilisationState = "measured" | "partial" | "unknown" | "invalid_window";

export interface WorkerUtilisation {
  readonly workerId: string;
  readonly state: UtilisationState;
  readonly denominator: UtilisationDenominator;
  /** The denominator's value — calendar days in the window, inclusive. */
  readonly windowDays: number | null;
  /** Distinct days covered by at least one project or booking commitment. */
  readonly committedDays: number | null;
  /** Distinct days covered by at least one approved absence. */
  readonly unavailableDays: number | null;
  /** Days in the window that are neither committed nor unavailable. */
  readonly freeDays: number | null;
  /**
   * committedDays ÷ windowDays, and ONLY in the `measured` state. Null
   * everywhere else — including `partial`, where the numerator is a floor.
   */
  readonly committedRatio: number | null;
  readonly gaps: readonly ReservationGap[];
}

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

function toDayNumber(iso: string): number | null {
  if (!DAY_RX.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return Number.isNaN(utc) ? null : Math.round(utc / 86_400_000);
}

function empty(workerId: string, state: UtilisationState, gaps: readonly ReservationGap[] = []): WorkerUtilisation {
  return {
    workerId,
    state,
    denominator: UTILISATION_DENOMINATOR,
    windowDays: null,
    committedDays: null,
    unavailableDays: null,
    freeDays: null,
    committedRatio: null,
    gaps,
  };
}

export function measureUtilisation(input: {
  readonly workerId: string;
  readonly window: { readonly startDate: string; readonly endDate: string };
  readonly held: readonly HeldTime[];
  readonly unreadableSources?: readonly ReservationSource[];
}): WorkerUtilisation {
  const gaps: ReservationGap[] = [];
  for (const source of input.unreadableSources ?? []) {
    gaps.push({ reason: "source_unreadable", source });
  }
  // An unread source makes every count a guess. Reporting the days we DID
  // see would understate the truth while looking like a measurement.
  if (gaps.length > 0) return empty(input.workerId, "unknown", gaps);

  const start = toDayNumber(input.window.startDate);
  const end = toDayNumber(input.window.endDate);
  if (start === null || end === null || end < start) {
    return empty(input.workerId, "invalid_window");
  }
  const windowDays = end - start + 1;
  if (windowDays > MAX_UTILISATION_WINDOW_DAYS) {
    return empty(input.workerId, "invalid_window");
  }

  const committed = new Set<number>();
  const unavailable = new Set<number>();
  for (const held of input.held) {
    const heldEnd = effectiveEndDay(held);
    if (!held.startDate || !heldEnd) {
      // A real commitment that cannot be placed on the calendar. It does not
      // become zero days, and it does not become a guess either — it becomes
      // a named reason the answer is a floor.
      gaps.push({
        reason: "undated_commitment",
        source: held.source,
        sourceId: held.sourceId,
        label: held.label,
      });
      continue;
    }
    const from = toDayNumber(held.startDate);
    const to = toDayNumber(heldEnd);
    if (from === null || to === null || to < from) {
      gaps.push({
        reason: "undated_commitment",
        source: held.source,
        sourceId: held.sourceId,
        label: held.label,
      });
      continue;
    }
    const target = held.source === "absence" ? unavailable : committed;
    for (let day = Math.max(from, start); day <= Math.min(to, end); day++) {
      target.add(day);
    }
  }

  let touched = 0;
  for (let day = start; day <= end; day++) {
    if (committed.has(day) || unavailable.has(day)) touched++;
  }

  const partial = gaps.length > 0;
  return {
    workerId: input.workerId,
    state: partial ? "partial" : "measured",
    denominator: UTILISATION_DENOMINATOR,
    windowDays,
    committedDays: committed.size,
    unavailableDays: unavailable.size,
    freeDays: windowDays - touched,
    // Withheld while the numerator is a floor. A ratio that looks complete
    // and is not is the worst of the three options.
    committedRatio: partial ? null : Math.round((committed.size / windowDays) * 100) / 100,
    gaps,
  };
}

/**
 * THE ROSTER, NOT THE PERSON — the same measurement one level up.
 *
 * Aggregating is where a truthful per-person answer usually becomes a false
 * headline, so the rules are strict and visible in the shape:
 *
 *   · the counted denominator is `windowDays × the workers we could actually
 *     count`, never × everyone — otherwise an unreadable worker silently
 *     drags the roster's number toward zero;
 *   · the ratio is issued ONLY when every worker is `measured`. One partial
 *     or unknown row and it is withheld, because a roster percentage is
 *     exactly the number people quote without reading the footnote;
 *   · the three populations are always reported separately, so "we could not
 *     see three people" can never be read as "three people are free".
 */
export interface RosterUtilisationSummary {
  readonly workers: number;
  readonly measured: number;
  readonly partial: number;
  readonly unknown: number;
  readonly invalidWindow: number;
  readonly windowDays: number;
  readonly denominator: UtilisationDenominator;
  /** Committed days summed over the workers that could be counted. */
  readonly committedWorkerDays: number | null;
  /** windowDays × (measured + partial) — the denominator, named again. */
  readonly countedWorkerDays: number | null;
  /** Only when EVERY worker is `measured`. */
  readonly committedRatio: number | null;
  /** Workers with nothing at all in the window, among those measured. Never
   *  presented as a fraction of the whole roster. */
  readonly fullyFreeAmongMeasured: number;
}

export function summariseRosterUtilisation(
  rows: readonly WorkerUtilisation[],
  windowDays: number,
): RosterUtilisationSummary {
  let measured = 0;
  let partial = 0;
  let unknown = 0;
  let invalidWindow = 0;
  let committedWorkerDays = 0;
  let counted = 0;
  let fullyFree = 0;

  for (const row of rows) {
    if (row.state === "measured") measured++;
    else if (row.state === "partial") partial++;
    else if (row.state === "unknown") unknown++;
    else invalidWindow++;

    if (row.committedDays !== null) {
      committedWorkerDays += row.committedDays;
      counted++;
      if (row.state === "measured" && row.committedDays === 0 && row.unavailableDays === 0) {
        fullyFree++;
      }
    }
  }

  const countedWorkerDays = counted > 0 ? counted * windowDays : null;
  const everyoneMeasured = rows.length > 0 && measured === rows.length;
  return {
    workers: rows.length,
    measured,
    partial,
    unknown,
    invalidWindow,
    windowDays,
    denominator: UTILISATION_DENOMINATOR,
    committedWorkerDays: counted > 0 ? committedWorkerDays : null,
    countedWorkerDays,
    committedRatio:
      everyoneMeasured && countedWorkerDays
        ? Math.round((committedWorkerDays / countedWorkerDays) * 100) / 100
        : null,
    fullyFreeAmongMeasured: fullyFree,
  };
}
