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
  /** An ABSOLUTE start date the person stated ("nuo spalio 5", "from 5
   *  October", "с 5 октября", "2026-10-05") — owner contract 2026-09-04 §9:
   *  "I need 12 scaffolders in Rotterdam from 5 October" must keep its date.
   *  `startIso` is the stated day; no end is invented. */
  | "from_date"
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

/**
 * Month stems, folded, one row per month — LT (genitive as people write
 * dates: "spalio 5"), EN, RU (genitive: "5 октября"), NL, DE, PL. A stem
 * matches a WHOLE word prefix, so "kov" (LT March) cannot fire inside another
 * word and "spal" needs the day beside it. Ordered by month number.
 */
const MONTH_STEMS: ReadonlyArray<readonly string[]> = [
  ["saus", "jan", "январ", "januari", "januar", "stycz"],
  ["vasar", "feb", "феврал", "februari", "februar", "lut"],
  ["kov", "mar", "март", "maart", "marz", "marc"],
  ["baland", "apr", "апрел", "april", "kwiet"],
  ["geguz", "may", "мая", "май", "mei", "mai", "maj"],
  ["birzel", "jun", "июн", "juni", "czerw"],
  ["liep", "jul", "июл", "juli", "lip"],
  ["rugpj", "aug", "август", "augustus", "sierp"],
  ["rugsej", "sep", "сентябр", "september", "wrze"],
  ["spal", "oct", "октябр", "oktober", "pazdz"],
  ["lapkri", "nov", "ноябр", "november", "listopad"],
  ["gruod", "dec", "декабр", "december", "grudn"],
];

/** "from" across the locales — the word that turns a date into a START. */
const FROM_WORD = "(?:nuo|from|starting|с|со|vanaf|ab|od)";

function monthOf(word: string): number | null {
  for (let m = 0; m < MONTH_STEMS.length; m++) {
    if (MONTH_STEMS[m].some((stem) => word.startsWith(stem))) return m + 1;
  }
  return null;
}

/** The next occurrence of `month/day` on or after today (UTC). A stated day
 *  that already passed this year means next year — never a date in the past. */
function nextOccurrence(todayIso: string, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const today = utc(todayIso);
  for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCMonth() !== month - 1) return null; // e.g. 31 April
    if (d.getTime() >= today.getTime()) return toIso(d);
  }
  return null;
}

/**
 * An absolute START date, when the person stated one:
 *   "nuo spalio 5", "nuo spalio 5 d.", "from 5 October", "from October 5",
 *   "с 5 октября", "vanaf 5 oktober", "ab 5. Oktober", "od 5 października",
 *   or an ISO day "2026-10-05" (with or without the from-word).
 * Returns the ISO day or `null`. Deliberately does not read "5/10" — the
 * day/month order differs per country and a wrong guess is worse than a
 * question.
 */
export function parseStartDate(text: string, todayIso: string): string | null {
  const folded = foldText(text ?? "");
  const iso = folded.match(/\b(\d{4})-(\d{2})-(\d{2})\b/u);
  if (iso) {
    const d = utc(`${iso[1]}-${iso[2]}-${iso[3]}`);
    return Number.isNaN(d.getTime()) ? null : toIso(d);
  }
  // day-first: "nuo 5 spalio" / "from 5 October" / "с 5 октября" / "ab 5. Oktober"
  // NB: `\b` is ASCII-only in JS, so a Cyrillic from-word ("с") gets an
  // explicit non-letter left edge instead.
  const dayFirst = folded.match(
    new RegExp(`(?:^|[^\\p{L}])${FROM_WORD}\\s+(\\d{1,2})\\.?\\s+([\\p{L}]+)`, "u"),
  );
  if (dayFirst) {
    const month = monthOf(dayFirst[2]);
    if (month) return nextOccurrence(todayIso, month, Number.parseInt(dayFirst[1], 10));
  }
  // month-first: "nuo spalio 5" / "from October 5"
  const monthFirst = folded.match(
    new RegExp(`(?:^|[^\\p{L}])${FROM_WORD}\\s+([\\p{L}]+)\\s+(\\d{1,2})(?!\\d)`, "u"),
  );
  if (monthFirst) {
    const month = monthOf(monthFirst[1]);
    if (month) return nextOccurrence(todayIso, month, Number.parseInt(monthFirst[2], 10));
  }
  return null;
}

/** "until" across the locales — the word that turns a date into an END. */
const UNTIL_WORD = "(?:iki|until|till|to|до|tot|t/m|bis|do)";

/**
 * An absolute END date ("iki spalio 20", "until 20 October", "до 20 октября",
 * "tot 20 oktober", "bis 20. Oktober", "do 20 października") — the same
 * month/day reading as the start, anchored on or after the start day so
 * "nuo spalio 5 iki spalio 20" never reads the end as next year. `null` when
 * none is stated.
 */
export function parseEndDate(text: string, todayIso: string, startIso: string | null): string | null {
  const folded = foldText(text ?? "");
  const anchor = startIso ?? todayIso;
  // A written date — "iki 2027-03-31", "until 31.03.2027", "bis 31.3.2027" —
  // the way a person copies it off a certificate. Prod walk 2026-09-04:
  // "turiu naują A1 pažymą iki 2027-03-31" left the valid-until field empty.
  const iso = folded.match(
    new RegExp(`(?:^|[^\\p{L}])${UNTIL_WORD}\\s+(\\d{4})-(\\d{2})-(\\d{2})(?!\\d)`, "u"),
  );
  if (iso) return validIsoDate(iso[1], iso[2], iso[3]);
  const dmy = folded.match(
    new RegExp(`(?:^|[^\\p{L}])${UNTIL_WORD}\\s+(\\d{1,2})[./](\\d{1,2})[./](\\d{4})(?!\\d)`, "u"),
  );
  if (dmy) return validIsoDate(dmy[3], dmy[2], dmy[1]);
  const dayFirst = folded.match(
    new RegExp(`(?:^|[^\\p{L}])${UNTIL_WORD}\\s+(\\d{1,2})\\.?\\s+([\\p{L}]+)`, "u"),
  );
  if (dayFirst) {
    const month = monthOf(dayFirst[2]);
    if (month) return nextOccurrence(anchor, month, Number.parseInt(dayFirst[1], 10));
  }
  const monthFirst = folded.match(
    new RegExp(`(?:^|[^\\p{L}])${UNTIL_WORD}\\s+([\\p{L}]+)\\s+(\\d{1,2})(?!\\d)`, "u"),
  );
  if (monthFirst) {
    const month = monthOf(monthFirst[1]);
    if (month) return nextOccurrence(anchor, month, Number.parseInt(monthFirst[2], 10));
  }
  return null;
}

/** "2027-3-31" → "2027-03-31" when it is a real calendar day, else null (a
 *  written date that does not exist is never silently "corrected"). */
function validIsoDate(y: string, m: string, d: string): string | null {
  const yy = Number.parseInt(y, 10);
  const mm = Number.parseInt(m, 10);
  const day = Number.parseInt(d, 10);
  if (!Number.isFinite(yy) || mm < 1 || mm > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(yy, mm - 1, day));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== day) return null;
  return `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Duration units, folded stems: weeks / months across the locales. */
// `\w` is ASCII-only in JS — Cyrillic and Lithuanian endings need `\p{L}`.
const WEEK_WORD = /^(savait[\p{L}]*|weeks?|недел[\p{L}]*|weken|week|wochen?|tygodn[\p{L}]*)$/u;
const MONTH_WORD = /^(men[\p{L}]*|months?|месяц[\p{L}]*|maand[\p{L}]*|monat[\p{L}]*|miesi[\p{L}]*)$/u;

/**
 * A stated DURATION ("3 savaitėms", "for 3 weeks", "на 3 недели", "3 weken",
 * "3 Wochen", "na 3 tygodnie", "2 mėnesiams", "for two months") → the number
 * of days it spans, or `null`. Word-numbers count too.
 */
export function parseDurationDays(text: string): number | null {
  const tokens = (text ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const folded = tokens.map(foldText);
  for (let i = 1; i < folded.length; i++) {
    const unit = WEEK_WORD.test(folded[i]) ? 7 : MONTH_WORD.test(folded[i]) ? 30 : 0;
    if (!unit) continue;
    const candidate = tokens[i - 1];
    const digits = /^\d{1,2}$/.test(candidate) ? Number.parseInt(candidate, 10) : null;
    const value = digits ?? parseWordNumber(candidate);
    if (value !== null && value >= 1 && value <= 52) return value * unit;
  }
  return null;
}

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

  // An absolute start date is the most precise thing a person can state — it
  // wins over the coarse phrases. No end is invented.
  const startIso = parseStartDate(text ?? "", todayIso);
  if (startIso) {
    // An END is stated as a date ("iki spalio 20"), a duration ("3
    // savaitėms") or a day count — in that order of precision. Nothing is
    // invented when none is stated.
    const duration = parseDurationDays(text ?? "");
    const endIso =
      parseEndDate(text ?? "", todayIso, startIso) ??
      (duration ? plusDays(startIso, duration - 1) : days ? plusDays(startIso, days - 1) : undefined);
    return { kind: "from_date", startIso, ...(endIso ? { endIso } : {}), days };
  }

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
