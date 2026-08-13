/**
 * Coarse time-window parsing (V9 value-intent foundation) — PURE, UTC.
 *
 * "kitą savaitę turiu dvi laisvas dienas" carries WHEN and HOW LONG, and the
 * intake read neither. This module turns the coarse phrases people actually
 * type — next/this week, next month, "N days" — into UTC calendar windows,
 * with the SAME date discipline the employer-availability windows use (dates
 * are UTC calendar days; W12 doctrine).
 *
 * COARSE BY DESIGN. It answers "roughly when", never invents precision:
 * anything it cannot read is `kind: "none"` — no defaulting, no guessing.
 * Weeks are Monday-based ISO weeks in UTC.
 */
import { foldText } from "./normalize";
import { parseWordNumber } from "./word-numbers";

export type TimeWindowKind =
  | "next_week"
  | "this_week"
  | "next_month"
  | "days_count"
  | "none";

export interface TimeWindow {
  readonly kind: TimeWindowKind;
  /** Inclusive UTC day bounds (YYYY-MM-DD) — absent when kind is "none". */
  readonly startIso?: string;
  readonly endIso?: string;
  /** A stated day COUNT ("dvi laisvas dienas") — may ride on any kind. */
  readonly days?: number;
}

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plusDays(iso: string, days: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Monday of the ISO week containing `todayIso` (UTC). */
function mondayOf(todayIso: string): string {
  const d = utc(todayIso);
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return toIso(d);
}

/** Folded phrase needles per kind — LT/EN/RU + opportunistic NL/DE. */
const KIND_NEEDLES: ReadonlyArray<{ kind: TimeWindowKind; res: RegExp[] }> = [
  {
    kind: "next_week",
    res: [
      /kita\s+savait/u, // kitą savaitę (folded)
      /ateinancia\s+savait/u,
      /next\s+week/u,
      /следующ[\p{L}]*\s+недел/u,
      /volgende\s+week/u,
      /nachste\s+woche/u,
    ],
  },
  {
    kind: "this_week",
    res: [
      /sia\s+savait/u, // šią savaitę (folded)
      /this\s+week/u,
      /этой\s+недел/u,
      /эту\s+недел/u,
      /deze\s+week/u,
      /diese\s+woche/u,
    ],
  },
  {
    kind: "next_month",
    res: [
      /kita\s+men/u, // kitą mėnesį (folded "kita menesi")
      /ateinanti\s+men/u,
      /next\s+month/u,
      /следующ[\p{L}]*\s+месяц/u,
      /volgende\s+maand/u,
      /nachsten?\s+monat/u,
    ],
  },
];

/** Day-count words across the locales (folded stems). */
const DAY_WORD = /^(dien\w*|days?|день|дня|дней|дни|dagen|dag|tage?n?)$/u;

/** "N days" — digits or word-numbers within two tokens before a day word. */
function findDayCount(text: string): number | null {
  const tokens = (text ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const folded = tokens.map(foldText);
  for (let i = 0; i < folded.length; i++) {
    if (!DAY_WORD.test(folded[i])) continue;
    for (let back = 1; back <= 2 && i - back >= 0; back++) {
      const candidate = tokens[i - back];
      const digits = /^\d{1,3}$/.test(candidate)
        ? Number.parseInt(candidate, 10)
        : null;
      const value = digits ?? parseWordNumber(candidate);
      if (value !== null && value >= 1 && value <= 366) return value;
    }
  }
  return null;
}

/**
 * Parse the coarse time window a sentence states, relative to `todayIso`.
 *
 * A phrase kind (next week / this week / next month) wins the window bounds;
 * a stated day count rides along as `days`. A bare "N days" with no phrase
 * becomes `days_count` anchored at today — the coarsest honest reading.
 */
export function parseTimeWindow(text: string, todayIso: string): TimeWindow {
  const folded = foldText(text ?? "");
  const days = findDayCount(text ?? "") ?? undefined;

  for (const { kind, res } of KIND_NEEDLES) {
    if (!res.some((re) => re.test(folded))) continue;
    if (kind === "next_week") {
      const start = plusDays(mondayOf(todayIso), 7);
      return { kind, startIso: start, endIso: plusDays(start, 6), days };
    }
    if (kind === "this_week") {
      const start = mondayOf(todayIso);
      return { kind, startIso: start, endIso: plusDays(start, 6), days };
    }
    // next_month: first to last day of the following calendar month (UTC).
    const d = utc(todayIso);
    const start = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
    );
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0));
    return { kind, startIso: toIso(start), endIso: toIso(end), days };
  }

  if (days !== undefined) {
    return {
      kind: "days_count",
      startIso: todayIso,
      endIso: plusDays(todayIso, days - 1),
      days,
    };
  }
  return { kind: "none" };
}
