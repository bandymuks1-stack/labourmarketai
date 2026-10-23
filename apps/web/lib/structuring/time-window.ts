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
      /kito\s+men/u, // "nuo kito mėnesio" — from next month
      /ateinanti\s+men/u,
      /next\s+month/u,
      /следующ[\p{L}]*\s+месяц/u,
      /volgende\s+maand/u,
      /nachsten?\s+monat/u,
    ],
  },
];

/**
 * Month WORDS, folded, one row per month — LT (every case people write: the
 * genitive of "spalio 5", the nominative, accusative and locative), EN (full
 * name or three-letter abbreviation), RU, NL, DE, PL. Ordered by month number.
 *
 * WHOLE WORDS, not prefixes. These used to be stems tested with `startsWith`,
 * and a stem is a prefix of ordinary words: "vasar" (February) starts
 * "vasaros" (summer), so "nuo vasaros" read as 1 February; "mar" (March)
 * starts "Marijampolės", so "20 km nuo Marijampolės" read as a March start;
 * "spal" starts "spalvos" (colour). A word is now a month only when its
 * ENDING is one of that month's real inflections. Cyrillic keeps stem + any
 * ending (those stems do not begin common words), except May, whose does.
 */
const MONTH_WORDS: ReadonlyArray<RegExp> = [
  /^(?:saus(?:is|io|i|yje)|jan(?:uary)?|январ\p{L}*|januari?|stycz(?:en|nia|niu))$/u,
  /^(?:vasar(?:is|io|i|yje)|feb(?:ruary)?|феврал\p{L}*|februari?|lut(?:y|ego|ym)?)$/u,
  /^(?:kov(?:as|o|a|e)|mar(?:ch)?|март\p{L}*|maart|marz|marzec|marc(?:a|u))$/u,
  /^(?:baland(?:is|zio|i|yje)|apr(?:il)?|апрел\p{L}*|kwie(?:cien|tnia|tniu))$/u,
  /^(?:geguz(?:e|es|eje)|may|ма[йяе]|mei|mai|maj(?:a|u)?)$/u,
  /^(?:birzel(?:is|io|i|yje)|june?|июн\p{L}*|juni|czerw(?:iec|ca|cu))$/u,
  /^(?:liep(?:a|os|oje)|july?|июл\p{L}*|juli|lip(?:iec|ca|cu))$/u,
  /^(?:rugpj(?:utis|ucio|uti|utyje)|aug(?:ust|ustus)?|август\p{L}*|sierp(?:ien|nia|niu))$/u,
  /^(?:rugsej(?:is|o|i|yje)|sep(?:t|tember)?|сентябр\p{L}*|wrze(?:sien|snia|sniu))$/u,
  /^(?:spal(?:is|io|i|yje)|oct(?:ober)?|октябр\p{L}*|oktober|pazdziernik(?:a|u)?)$/u,
  /^(?:lapkri(?:tis|cio|ti|tyje)|nov(?:ember)?|ноябр\p{L}*|listopad(?:a|zie)?)$/u,
  /^(?:gruod(?:is|zio|i|yje)|dec(?:ember)?|dezember|декабр\p{L}*|grud(?:zien|nia|niu))$/u,
];

/** "from" across the locales — the word that turns a date into a START. */
const FROM_WORD = "(?:nuo|from|starting|с|со|vanaf|ab|od)";

/** The month (1–12) one FOLDED word names, or `null`. Whole word only — see
 *  MONTH_WORDS for why a prefix is not enough. */
export function monthOf(word: string): number | null {
  for (let m = 0; m < MONTH_WORDS.length; m++) {
    if (MONTH_WORDS[m].test(word)) return m + 1;
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
  // A bare month after the from-word — "nuo spalio", "from October", "с
  // октября" — is how an employer states a start most of the time
  // (production 2026-09-06: "reikia suvirintojo nuo spalio" left the start
  // empty). The FIRST of that month is the coarsest honest day; the month
  // already running means "from now". Never a guess at a later day.
  const bareMonth = folded.match(
    new RegExp(`(?:^|[^\\p{L}])${FROM_WORD}\\s+([\\p{L}]+)(?![\\p{L}])`, "u"),
  );
  if (bareMonth) {
    const month = monthOf(bareMonth[1]);
    if (month) {
      if (utc(todayIso).getUTCMonth() + 1 === month) return todayIso;
      return nextOccurrence(todayIso, month, 1);
    }
  }
  // "rytoj" / "nuo rytojaus" / "tomorrow" / "завтра" / "morgen" / "jutro".
  if (/(?:^|[^\p{L}])(?:rytoj|tomorrow|завтра|morgen|jutro)/u.test(folded)) {
    return plusDays(todayIso, 1);
  }
  return null;
}

/** Any fixed day works as the anchor for a yes/no question: whether a start
 *  date is read never depends on today, only which day it resolves to. */
const PRESENCE_ANCHOR = "2026-01-01";

/**
 * Does the sentence STATE when the work starts? A yes/no reading for the
 * recognizer's "start date" field, built on the same reader as the date
 * itself — `parseStartDate`, the this/next week/month phrases — plus two
 * ways an employer writes a start that are too ambiguous to turn into a day
 * but plainly state one:
 *   - "lapkričio mėn." (a month word followed by "mėn.", "in November");
 *   - "nuo 11-01" (a from-word and a two-part numeric date; which part is the
 *     month differs per country, so `parseStartDate` deliberately does not
 *     resolve it — but it IS a stated start). Hours ("nuo 08-17 val.") are not.
 */
export function mentionsStartTime(text: string): boolean {
  if (parseStartDate(text ?? "", PRESENCE_ANCHOR) !== null) return true;
  const folded = foldText(text ?? "");
  if (KIND_NEEDLES.some(({ res }) => res.some((re) => re.test(folded)))) return true;
  for (const m of folded.matchAll(/(?:^|[^\p{L}])([\p{L}]+)\s+men(?![\p{L}])/gu)) {
    if (monthOf(m[1])) return true;
  }
  const numeric = folded.match(
    new RegExp(
      `(?:^|[^\\p{L}])${FROM_WORD}\\s+(\\d{2})-(\\d{2})(?![\\d-])(?!\\s*(?:val|h(?![\\p{L}])|час|uhr|godz|uur))`,
      "u",
    ),
  );
  if (numeric) {
    const a = Number.parseInt(numeric[1], 10);
    const b = Number.parseInt(numeric[2], 10);
    const monthDay = (mm: number, dd: number) => mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
    if (monthDay(a, b) || monthDay(b, a)) return true;
  }
  return false;
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

/**
 * The deadline phrase parseEndDate read, removed from the ORIGINAL text so a
 * title pre-filled from the same sentence does not keep it as a tail
 * (prod polish 2026-09-04: "pridėk užduotį projektui: sumontuoti pastolius
 * iki 2026-10-03" pre-filled the title WITH "iki 2026-10-03" while the due
 * date was already its own field). Only a phrase this module recognises is
 * removed — a month word must be a real month; anything else stays.
 */
export function stripEndDatePhrase(text: string): string {
  const src = text ?? "";
  const forms = [
    `${UNTIL_WORD}\\s+\\d{4}-\\d{2}-\\d{2}(?!\\d)`,
    `${UNTIL_WORD}\\s+\\d{1,2}[./]\\d{1,2}[./]\\d{4}(?!\\d)`,
    `${UNTIL_WORD}\\s+\\d{1,2}\\.?\\s+[\\p{L}]+`,
    `${UNTIL_WORD}\\s+[\\p{L}]+\\s+\\d{1,2}(?!\\d)`,
  ];
  for (const form of forms) {
    const rx = new RegExp(`(^|[^\\p{L}])(${form})`, "iu");
    const m = src.match(rx);
    if (!m || m.index === undefined) continue;
    const phrase = m[2];
    // month-word forms: the word must be a month this module knows
    const word = phrase.match(/[\p{L}]+\s*$/u)?.[0] ?? phrase.match(/\s([\p{L}]+)\s+\d{1,2}$/u)?.[1];
    const numeric = /\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4}/.test(phrase);
    if (!numeric && (!word || !monthOf(foldText(word)))) continue;
    const start = m.index + m[1].length;
    return (src.slice(0, start) + src.slice(start + phrase.length)).replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
  }
  return src.trim();
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
/** Years: ONLY the Lithuanian dative "metams" ("for a year", "2 metams").
 *  Every other year word ("3 metų", "3 years", "3 года") is far more often
 *  EXPERIENCE than a duration, and must not turn into an end date. */
const YEAR_DATIVE = /^metams$/u;
/** Dative plural words that sit before "metams" WITHOUT counting it — "for
 *  the next / this / coming year". Any OTHER dative plural word there is a
 *  count this module cannot read ("dvejems", a typo), and an unread count
 *  must stay unresolved: a silent "1 year" would invent an end date. */
const YEAR_DETERMINERS = new Set(["kitiems", "siems", "tiems", "sitiems", "ateinantiems", "artimiausiems"]);
const DATIVE_PLURAL_WORD = /^\p{L}+(?:iems|ioms|ems|oms)$/u;

/** Days in a "metams" duration whose preceding token is `prev`; `null` when
 *  that token is a count this module cannot read. */
function yearDativeDays(prev: string | undefined): number | null {
  if (prev === undefined) return 365; // a bare "metams" opens the text: one year
  if (/^\d+$/.test(prev)) {
    const n = Number.parseInt(prev, 10);
    return n >= 1 && n <= 10 ? n * 365 : null;
  }
  const word = parseWordNumber(prev);
  if (word !== null) return word >= 1 && word <= 10 ? word * 365 : null;
  const folded = foldText(prev);
  if (YEAR_DETERMINERS.has(folded)) return 365;
  if (DATIVE_PLURAL_WORD.test(folded)) return null;
  return 365; // a bare "metams" after an ordinary word: one year
}

/**
 * A stated DURATION ("3 savaitėms", "for 3 weeks", "на 3 недели", "3 weken",
 * "3 Wochen", "na 3 tygodnie", "2 mėnesiams", "for two months", "metams",
 * "2 metams", "dvejiems metams") → the number of days it spans, or `null`.
 * Word-numbers count too.
 */
export function parseDurationDays(text: string): number | null {
  const tokens = (text ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const folded = tokens.map(foldText);
  for (let i = 0; i < folded.length; i++) {
    if (!YEAR_DATIVE.test(folded[i])) continue;
    return yearDativeDays(i > 0 ? tokens[i - 1] : undefined);
  }
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
