/**
 * TIME SEMANTICS — what an hours figure on a dated source row MEANS.
 *
 * The owner's file carries `800` and `165` on rows dated 2025-11-17. The
 * first reading (#1748) flagged them as "more than a day holds" and refused
 * to write them as a day's duration — right, but for the wrong reason. The
 * human walk established what they are: AGGREGATE hours for work done from
 * home over a broader period. A figure on a dated row is therefore not
 * automatically "this person worked this many hours on this date"; it is
 * one of:
 *
 *   daily             hours worked on that date;
 *   period_aggregate  a total over a broader period the row summarises
 *                     (a month, several months, a week, remote work…);
 *   unknown           the figure cannot be a day and nothing in the source
 *                     says what period it covers.
 *
 * This module classifies BEFORE any canonical interpretation, from the
 * source's own words — never from the two numbers. Nothing here decides;
 * an aggregate or an unknown is a QUESTION for the human, and the answer is
 * recorded as a human choice. The period is derived ONLY when the source
 * states it (an explicit start and end); a span like "16 months" is
 * evidence of an aggregate, not of dates — the period stays UNKNOWN and no
 * date is invented (owner command §1: "determine the period ONLY if the
 * source provides enough evidence").
 *
 * Pure: strings and numbers in, a classification out.
 *
 * WHAT THE SOURCE'S WORDS STATE ABOUT TIME (owner rule 2026-09-23: never
 * manufacture precision). The first reading kept only the first period WORD
 * ("month") and dropped the quantities the sentence carries — "at least 16
 * month", "each month only 50 hours", "7 hours per week". Those are the
 * source's own statements, so they are READ here (`extractSourceTimeCues`),
 * verbatim, and a human's later period is set against them
 * (`sourceTimeConflicts`): a span shorter than a stated minimum, or a total
 * whose per-month / per-week figure differs from a stated rate, is a WARNING
 * carried beside the decision. The human stays sovereign — nothing here
 * refuses a decision, and nothing here computes a figure the source did not
 * state.
 */

import { monthsBetween } from "./period-projection";

export type TimeSemanticsKind = "daily" | "period_aggregate" | "unknown";

/** The calendar units a source sentence names a span or a rate in. */
export type SourceTimeUnit = "day" | "week" | "month" | "year";

/** How a stated duration is bounded: "at least 16 month" is `at_least`. */
export type SourceDurationBound = "exact" | "at_least" | "at_most" | "about";

/** A duration the source states in words, e.g. "at least 16 month". */
export interface SourceStatedDuration {
  readonly count: number;
  readonly unit: SourceTimeUnit;
  readonly bound: SourceDurationBound;
  /** The source's own words, verbatim, as they stand in the text. */
  readonly words: string;
}

/** A rate the source states in words, e.g. "each month only 50 hours". */
export interface SourceStatedRate {
  readonly hours: number;
  readonly per: SourceTimeUnit;
  /** The source's own words, verbatim, as they stand in the text. */
  readonly words: string;
}

/** The quantities the source's WORDS state about time — read, never computed. */
export interface SourceTimeCues {
  readonly method: "source_words";
  readonly duration: SourceStatedDuration | null;
  readonly rate: SourceStatedRate | null;
}

/** Where a human's period and the source's own words disagree. A warning,
 *  never a refusal. */
export type SourceTimeConflict =
  /** The span is shorter than the minimum the source states. */
  | "span_below_stated_minimum"
  /** The span is longer than the maximum the source states. */
  | "span_above_stated_maximum"
  /** The span differs from the (exact or approximate) duration stated. */
  | "span_differs_from_stated"
  /** Total ÷ span differs from the rate the source states. */
  | "rate_differs"
  /** The source's own duration × rate does not make its own total. */
  | "source_internally_inconsistent";

/** How precise a human's period is: `month` when a person gave months. */
export type PeriodPrecision = "day" | "month";

export interface TimeSemantics {
  /** The classification. Generic derived-field readers see it as `value`. */
  readonly value: TimeSemanticsKind;
  readonly method:
    | "daily_within_day"
    | "aggregate_period_words_in_text"
    | "aggregate_period_words_in_context"
    | "exceeds_day_no_period_evidence"
    | "human_choice";
  readonly confidence: number;
  /** The figure as the source wrote it — immutable, carried everywhere. */
  readonly sourceHours: number;
  /** Words in the source that named a period, if any (for the human's eye). */
  readonly note?: string | null;
  /** Remote / work-from-home: true only when the source SAYS so; null =
   *  not evidenced (never false-by-default, never inferred from location). */
  readonly remote: boolean | null;
  /** The aggregate's period, ONLY when the source or a human states it. */
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  /** The duration / rate the source's own words state (absent on rows
   *  classified before 2026-09-23 — read from the text on demand). */
  readonly sourceCues?: SourceTimeCues | null;
  /** How precise the human's period is. `month` when months were given: the
   *  day columns then hold the first and the last day of those months. */
  readonly periodPrecision?: PeriodPrecision | null;
  /** The human's period set against the source's words at decision time. */
  readonly conflictsWithSource?: boolean;
  readonly conflicts?: readonly SourceTimeConflict[];
}

/** More than this on ONE dated row cannot be a day's work. */
export const MAX_DAY_HOURS = 24;

/** Words that name a span of time in the source languages (folded). */
const PERIOD_WORDS = [
  // English
  "month", "months", "monthly", "week", "weeks", "weekly", "year", "years", "yearly", "quarter", "period",
  // Lithuanian
  "menuo", "menesis", "menesi", "menesiai", "menesiais", "menesiu", "menesius", "menesio", "savaite", "savaites", "savaiciu", "savaitems", "metai", "metu", "metus", "laikotarpis", "laikotarpi", "laikotarpiu",
  // Dutch
  "maand", "maanden", "weken", "jaar", "jaren", "periode",
  // German
  "monat", "monate", "monaten", "woche", "wochen", "jahr", "jahre", "zeitraum",
  // Polish
  "miesiac", "miesiace", "miesiecy", "tydzien", "tygodnie", "tygodni", "rok", "lata", "okres",
  // Russian
  "месяц", "месяца", "месяцев", "неделя", "недели", "недель", "год", "года", "лет", "период",
];

/** Words that say the work was done remotely / from home. */
const REMOTE_WORDS = [
  "remote", "remotely", "from home", "work from home", "wfh", "home office",
  "nuotoliniu", "nuotolinis", "nuotoliniu budu", "is namu", "namuose",
  "thuis", "thuiswerk", "vanuit huis", "op afstand",
  "homeoffice", "von zuhause", "remote arbeit",
  "zdalnie", "z domu",
  "удаленно", "из дома", "дистанционно",
];

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hasWord(folded: string, words: readonly string[]): string | null {
  const padded = ` ${folded} `;
  for (const w of words) {
    if (padded.includes(` ${w} `)) return w;
  }
  return null;
}

/** The period words the text carries, or null. */
export function periodWordsIn(text: string | null | undefined): string | null {
  if (!text) return null;
  return hasWord(fold(text), PERIOD_WORDS);
}

/** True only when the source SAYS the work was remote; null otherwise. */
export function remoteEvidencedIn(text: string | null | undefined): true | null {
  if (!text) return null;
  return hasWord(fold(text), REMOTE_WORDS) ? true : null;
}

// ── what the source's words state about time ────────────────────────────────
//
// Word lists are written as a reader writes them and folded ONCE with the
// same `fold()` the period words use, so "mėnesių", "miesięcy" and "каждый"
// match however the source was typed. Patterns are generic: a number next to
// a unit word is a duration, a number next to an hour word next to a unit
// word is a rate. No figure is special.

const UNIT_WORDS: readonly (readonly [SourceTimeUnit, readonly string[]])[] = [
  ["day", ["day", "days", "diena", "dienos", "dienų", "dieną", "dienas", "dienai", "dag", "dagen", "tag", "tage", "tagen", "dzień", "dni", "dnia", "день", "дня", "дней"]],
  ["week", ["week", "weeks", "wk", "savaitė", "savaitės", "savaičių", "savaitę", "savaites", "savaitei", "sav", "weken", "woche", "wochen", "tydzień", "tygodnie", "tygodni", "tygodniu", "tydz", "неделя", "недели", "недель", "неделю", "нед"]],
  ["month", ["month", "months", "mėnuo", "mėnesis", "mėnesį", "mėnesiai", "mėnesiais", "mėnesių", "mėnesius", "mėnesio", "mėn", "maand", "maanden", "mnd", "monat", "monate", "monaten", "monats", "miesiąc", "miesiące", "miesięcy", "miesiąca", "miesiącu", "mies", "месяц", "месяца", "месяцев", "месяцу", "мес"]],
  ["year", ["year", "years", "yr", "yrs", "metai", "metų", "metus", "metams", "jaar", "jaren", "jahr", "jahre", "jahren", "rok", "lata", "lat", "roku", "год", "года", "лет", "году"]],
];

/** A rate adverb names its unit on its own ("7 hours weekly"). */
const RATE_ADVERBS: readonly (readonly [SourceTimeUnit, readonly string[]])[] = [
  ["day", ["daily", "kasdien", "dagelijks", "täglich", "dziennie", "ежедневно"]],
  ["week", ["weekly", "wekelijks", "wöchentlich", "tygodniowo", "еженедельно"]],
  ["month", ["monthly", "kasmėnesį", "maandelijks", "monatlich", "miesięcznie", "ежемесячно"]],
  ["year", ["yearly", "annually", "kasmet", "jaarlijks", "jährlich", "rocznie", "ежегодно"]],
];

const HOUR_WORDS = [
  "h", "hr", "hrs", "hour", "hours",
  "val", "valanda", "valandos", "valandų", "valandas", "valandą",
  "uur", "uren", "u",
  "std", "stunde", "stunden",
  "godz", "godzina", "godziny", "godzin",
  "ч", "час", "часа", "часов",
];

/** "50 WORKING hours" — a qualifier between the figure and the hour word. */
const HOUR_QUALIFIERS = ["working", "work", "billable", "darbo", "werk", "gewerkte", "arbeits", "robocze", "roboczych", "рабочих", "рабочие"];

/** Between the hour word and the unit: "7 hours PER week", "7 val. Į savaitę". */
const RATE_CONNECTORS = [
  "per", "a", "an", "each", "every", "in", "the",
  "kas", "į", "kiekvieną",
  "elke", "iedere", "de", "een",
  "pro", "je", "im", "der", "die", "jede", "jeden", "jeder",
  "na", "w", "co", "każdy", "każdego",
  "в", "за", "на", "каждый", "каждую", "каждые", "каждого",
];

/** Before the unit when the unit comes first: "EACH month only 50 hours". */
const RATE_LEAD_INS = [
  "each", "every", "per", "a",
  "kas", "kiekvieną", "kiekvienas", "kiekvienam",
  "elke", "iedere",
  "pro", "je", "jede", "jeden", "jeder",
  "co", "każdy", "każdego", "na",
  "в", "за", "каждый", "каждую", "каждые", "каждого",
];

/** Between a lead-in unit and its figure: "each month ONLY 50 hours". */
const RATE_FILLERS = [
  "only", "just", "about", "around", "approximately", "approx", "roughly", "up", "to", "max", "maximum", "calculating", "counting", "of",
  "tik", "po", "apie", "iki", "maždaug", "apytiksliai", "skaičiuojant",
  "slechts", "maar", "ongeveer", "circa", "ca",
  "nur", "etwa", "ungefähr", "rund",
  "tylko", "około", "ok",
  "по", "только", "около", "примерно", "всего", "до",
];

/** Phrases that bound a stated duration, keyed by bound, as written. */
const BOUND_PHRASES: readonly (readonly [SourceDurationBound, readonly string[]])[] = [
  ["at_least", [
    "at least", "minimum", "min", "no less than", "not less than", "more than", "over",
    "bent", "mažiausiai", "ne mažiau kaip", "ne mažiau nei", "daugiau nei", "daugiau kaip", "virš",
    "minstens", "ten minste", "meer dan",
    "mindestens", "mehr als", "über",
    "co najmniej", "conajmniej", "ponad", "więcej niż",
    "не менее", "как минимум", "минимум", "более", "больше", "свыше",
  ]],
  ["at_most", [
    "at most", "up to", "no more than", "not more than", "max", "maximum", "less than", "under",
    "iki", "ne daugiau kaip", "ne daugiau nei", "daugiausiai", "mažiau nei",
    "hoogstens", "maximaal", "minder dan",
    "höchstens", "bis zu", "weniger als",
    "maksymalnie", "mniej niż",
    "не более", "максимум", "менее", "меньше",
  ]],
  ["about", [
    "about", "around", "approximately", "approx", "roughly", "circa", "ca",
    "apie", "maždaug", "apytiksliai",
    "ongeveer",
    "etwa", "ungefähr", "rund",
    "około", "ok",
    "около", "примерно", "приблизительно",
  ]],
];

const foldedSet = (words: readonly string[]): ReadonlySet<string> => new Set(words.map(fold));
const foldedUnitMap = (
  lists: readonly (readonly [SourceTimeUnit, readonly string[]])[],
): ReadonlyMap<string, SourceTimeUnit> => {
  const m = new Map<string, SourceTimeUnit>();
  for (const [unit, words] of lists) for (const w of words) m.set(fold(w), unit);
  return m;
};

const UNIT_OF = foldedUnitMap(UNIT_WORDS);
const ADVERB_UNIT_OF = foldedUnitMap(RATE_ADVERBS);
const HOURS = foldedSet(HOUR_WORDS);
const QUALIFIERS = foldedSet(HOUR_QUALIFIERS);
const CONNECTORS = foldedSet(RATE_CONNECTORS);
const LEAD_INS = foldedSet(RATE_LEAD_INS);
const FILLERS = foldedSet(RATE_FILLERS);
/** "every 2 weeks" — a recurrence, never a duration. */
const RECURRENCE = foldedSet(["each", "every", "kas", "elke", "iedere", "alle", "je", "co", "каждые"]);
/** Longest phrase first: "not less than" must win over "less than". */
const BOUNDS: readonly { readonly bound: SourceDurationBound; readonly words: readonly string[] }[] = BOUND_PHRASES
  .flatMap(([bound, phrases]) => phrases.map((p) => ({ bound, words: fold(p).split(" ") })))
  .sort((a, b) => b.words.length - a.words.length);

/** A plausible stated duration, per unit — a year number is not a span. */
const MAX_DURATION: Readonly<Record<SourceTimeUnit, number>> = { day: 3660, week: 520, month: 120, year: 10 };
/** A rate a unit can hold (hours in that unit). */
const MAX_RATE_HOURS: Readonly<Record<SourceTimeUnit, number>> = { day: 24, week: 168, month: 744, year: 8784 };

interface Token {
  /** Folded word, or the number as written. */
  readonly f: string;
  readonly n: number | null;
  readonly start: number;
  readonly end: number;
}

function tokenize(text: string): readonly Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?|[\p{L}\p{M}]+/gu)) {
    const raw = m[0];
    const start = m.index ?? 0;
    const numeric = /^\d/.test(raw);
    out.push({
      f: numeric ? raw : fold(raw),
      n: numeric ? Number(raw.replace(",", ".")) : null,
      start,
      end: start + raw.length,
    });
  }
  return out;
}

/** The bound phrase ending right before token `i`, if any. */
function boundBefore(toks: readonly Token[], i: number): { bound: SourceDurationBound; len: number } | null {
  for (const b of BOUNDS) {
    const len = b.words.length;
    if (i - len < 0) continue;
    if (b.words.every((w, k) => toks[i - len + k].f === w)) return { bound: b.bound, len };
  }
  return null;
}

/** "<n> [qualifier] <hour word>" starting at `i`: the figure and the index after the hour word. */
function hoursAt(toks: readonly Token[], i: number): { hours: number; next: number } | null {
  const t = toks[i];
  if (!t || t.n === null) return null;
  let j = i + 1;
  if (toks[j] && QUALIFIERS.has(toks[j].f)) j += 1;
  if (!toks[j] || !HOURS.has(toks[j].f)) return null;
  return { hours: t.n, next: j + 1 };
}

function rateOf(hours: number, per: SourceTimeUnit): boolean {
  return Number.isFinite(hours) && hours > 0 && hours <= MAX_RATE_HOURS[per];
}

function findRate(text: string, toks: readonly Token[]): SourceStatedRate | null {
  const words = (a: number, b: number) => text.slice(toks[a].start, toks[b].end);
  for (let i = 0; i < toks.length; i += 1) {
    // "7 hours per week", "50 h/month", "7 hours weekly"
    const h = hoursAt(toks, i);
    if (h) {
      const adverb = toks[h.next] ? ADVERB_UNIT_OF.get(toks[h.next].f) : undefined;
      if (adverb && rateOf(h.hours, adverb)) return { hours: h.hours, per: adverb, words: words(i, h.next) };
      for (let k = h.next; k <= h.next + 2 && k < toks.length; k += 1) {
        const unit = UNIT_OF.get(toks[k].f);
        if (unit) {
          if (rateOf(h.hours, unit)) return { hours: h.hours, per: unit, words: words(i, k) };
          break;
        }
        if (!CONNECTORS.has(toks[k].f)) break;
      }
    }
    // "each month only 50 hours", "monthly 50 hours"
    const leadUnit =
      LEAD_INS.has(toks[i].f) && toks[i + 1] ? UNIT_OF.get(toks[i + 1].f) : undefined;
    const adverbUnit = ADVERB_UNIT_OF.get(toks[i].f);
    const per = leadUnit ?? adverbUnit;
    if (per) {
      let k = i + (leadUnit ? 2 : 1);
      for (let skipped = 0; skipped < 3 && toks[k] && FILLERS.has(toks[k].f); skipped += 1) k += 1;
      const g = hoursAt(toks, k);
      if (g && rateOf(g.hours, per)) return { hours: g.hours, per, words: words(i, g.next - 1) };
    }
  }
  return null;
}

function findDuration(text: string, toks: readonly Token[]): SourceStatedDuration | null {
  for (let i = 0; i + 1 < toks.length; i += 1) {
    const t = toks[i];
    if (t.n === null) continue;
    const unit = UNIT_OF.get(toks[i + 1].f);
    if (!unit) continue;
    if (!(t.n > 0 && t.n <= MAX_DURATION[unit])) continue;
    // "EVERY 2 weeks" is how often, not how long the work lasted.
    if (i > 0 && RECURRENCE.has(toks[i - 1].f)) continue;
    const b = boundBefore(toks, i);
    return {
      count: t.n,
      unit,
      bound: b?.bound ?? "exact",
      words: text.slice(toks[b ? i - b.len : i].start, toks[i + 1].end),
    };
  }
  return null;
}

/**
 * The duration and the rate the source's own words state, verbatim — or
 * `null` when the text states neither. "at least 16 month … each month only
 * 50 hours" → a duration {16, month, at_least} and a rate {50 h per month};
 * "7 hours per week" → a rate {7 h per week}. Read from WORDS only: the row's
 * hours figure is never an input.
 */
export function extractSourceTimeCues(text: string | null | undefined): SourceTimeCues | null {
  if (!text) return null;
  const source = text.normalize("NFC");
  const toks = tokenize(source);
  if (toks.length === 0) return null;
  const rate = findRate(source, toks);
  const duration = findDuration(source, toks);
  if (!rate && !duration) return null;
  return { method: "source_words", duration, rate };
}

/** A classification with the source's cues attached, read from the text
 *  when the classification predates them. A human choice keeps its own. */
export function withSourceCues(
  ts: TimeSemantics | null,
  text: string | null | undefined,
): TimeSemantics | null {
  if (!ts || ts.sourceCues !== undefined) return ts;
  return { ...ts, sourceCues: extractSourceTimeCues(text) };
}

// ── a human's period, read at the precision the human gave it ──────────────

const INPUT_MONTH = /^(\d{4})-(\d{2})$/;
const INPUT_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function realDay(iso: string): boolean {
  const m = INPUT_DAY.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** The last calendar day of `YYYY-MM`, as `YYYY-MM-DD`. */
function lastDayOf(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return `${year}-${pad2(month)}-${pad2(d.getUTCDate())}`;
}

export type HumanPeriod =
  | {
      readonly ok: true;
      readonly periodStart: string | null;
      readonly periodEnd: string | null;
      readonly precision: PeriodPrecision | null;
    }
  | { readonly ok: false; readonly problem: string };

/**
 * A human's period as typed: two months (`YYYY-MM`, precision `month` — the
 * day columns get the first and the last day of those months), two days
 * (`YYYY-MM-DD`, precision `day`), or nothing. A start ALONE is refused: it
 * used to be stored as a one-day period (`periodEnd ?? periodStart`), which
 * is a precision nobody stated.
 */
export function periodFromHumanInput(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined,
): HumanPeriod {
  const s = startRaw?.trim() || null;
  const e = endRaw?.trim() || null;
  if (!s && !e) return { ok: true, periodStart: null, periodEnd: null, precision: null };
  if (!s) return { ok: false, problem: "periodStart required with periodEnd" };
  if (!e) {
    return {
      ok: false,
      problem: "periodEnd required: a start alone is not a period — give the last month too, or leave both empty",
    };
  }
  const sm = INPUT_MONTH.exec(s);
  const em = INPUT_MONTH.exec(e);
  if (sm && em) {
    const sy = Number(sm[1]);
    const smo = Number(sm[2]);
    const ey = Number(em[1]);
    const emo = Number(em[2]);
    if (smo < 1 || smo > 12 || emo < 1 || emo > 12) return { ok: false, problem: "period must be YYYY-MM or YYYY-MM-DD" };
    const periodStart = `${sy}-${pad2(smo)}-01`;
    const periodEnd = lastDayOf(ey, emo);
    if (periodEnd < periodStart) return { ok: false, problem: "periodEnd is before periodStart" };
    return { ok: true, periodStart, periodEnd, precision: "month" };
  }
  if (realDay(s) && realDay(e)) {
    if (e < s) return { ok: false, problem: "periodEnd is before periodStart" };
    return { ok: true, periodStart: s, periodEnd: e, precision: "day" };
  }
  if ((sm || INPUT_DAY.test(s)) && (em || INPUT_DAY.test(e))) {
    return { ok: false, problem: "periodStart and periodEnd must have the same precision" };
  }
  return { ok: false, problem: "period must be YYYY-MM or YYYY-MM-DD" };
}

// ── a period set against the source's own words ─────────────────────────────

const UNIT_DAYS: Readonly<Record<SourceTimeUnit, number>> = { day: 1, week: 7, month: 30.4375, year: 365.25 };
/** Relative difference that is still "the same" — rounding, a partial week. */
const TOLERANCE = 0.1;
/** "about 16 months" allows more. */
const ABOUT_TOLERANCE = 0.25;

function dayIndex(iso: string): number | null {
  if (!realDay(iso)) return null;
  const m = INPUT_DAY.exec(iso)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** The span of a period in a unit. A span of whole calendar months counts
 *  them exactly; any other span converts from days. */
export function periodSpanIn(unit: SourceTimeUnit, periodStart: string, periodEnd: string): number | null {
  const a = dayIndex(periodStart);
  const b = dayIndex(periodEnd);
  if (a === null || b === null || b < a) return null;
  const days = b - a + 1;
  if (unit === "day") return days;
  if (unit === "week") return days / UNIT_DAYS.week;
  const [ey, em] = periodEnd.split("-").map(Number);
  const wholeMonths = periodStart.endsWith("-01") && lastDayOf(ey, em) === periodEnd;
  const months = wholeMonths ? (monthsBetween(periodStart, periodEnd)?.length ?? 0) : days / UNIT_DAYS.month;
  return unit === "month" ? months : months / 12;
}

function outsideBound(actual: number, stated: number, bound: SourceDurationBound): boolean {
  if (bound === "at_least") return actual < stated * (1 - TOLERANCE);
  if (bound === "at_most") return actual > stated * (1 + TOLERANCE);
  return Math.abs(actual - stated) / stated > (bound === "about" ? ABOUT_TOLERANCE : TOLERANCE);
}

/**
 * Where a period and a total disagree with what the source's words state.
 * A WARNING list — empty when nothing is stated, nothing differs, or the
 * span is not known. A per-DAY rate is never compared: how many working
 * days a span holds is not stated anywhere.
 */
export function sourceTimeConflicts(input: {
  readonly hours: number | null | undefined;
  readonly periodStart: string | null | undefined;
  readonly periodEnd: string | null | undefined;
  readonly cues: SourceTimeCues | null | undefined;
}): readonly SourceTimeConflict[] {
  const cues = input.cues;
  if (!cues) return [];
  const hours =
    typeof input.hours === "number" && Number.isFinite(input.hours) && input.hours > 0 ? input.hours : null;
  const d = cues.duration;
  const r = cues.rate;
  const out: SourceTimeConflict[] = [];
  if (d && r && hours !== null && r.per !== "day") {
    const statedTotal = r.hours * ((d.count * UNIT_DAYS[d.unit]) / UNIT_DAYS[r.per]);
    if (outsideBound(hours, statedTotal, d.bound)) out.push("source_internally_inconsistent");
  }
  if (input.periodStart && input.periodEnd) {
    if (d) {
      const span = periodSpanIn(d.unit, input.periodStart, input.periodEnd);
      if (span !== null && outsideBound(span, d.count, d.bound)) {
        out.push(
          d.bound === "at_least"
            ? "span_below_stated_minimum"
            : d.bound === "at_most"
              ? "span_above_stated_maximum"
              : "span_differs_from_stated",
        );
      }
    }
    if (r && hours !== null && r.per !== "day") {
      const span = periodSpanIn(r.per, input.periodStart, input.periodEnd);
      if (span !== null && span > 0) {
        const statedOverSpan = r.hours * span;
        if (Math.abs(hours - statedOverSpan) / statedOverSpan > TOLERANCE) out.push("rate_differs");
      }
    }
  }
  return out;
}

/**
 * Classify one dated row's hours figure. Returns `null` for the ordinary
 * case — a figure a day can hold — so a row carries a classification only
 * when the figure needs one. A figure a day cannot hold is an AGGREGATE
 * when the text or the context names a period, else UNKNOWN. In both
 * cases the human decides; nothing operational is derived from it.
 */
export function classifyTimeSemantics(input: {
  readonly hours: number | null;
  readonly hasSingleDate: boolean;
  readonly workText: string | null;
  readonly contextLabel: string | null;
}): TimeSemantics | null {
  const { hours } = input;
  if (hours === null || !input.hasSingleDate) return null;
  if (hours <= MAX_DAY_HOURS) return null;
  const remote = remoteEvidencedIn(input.workText) ?? remoteEvidencedIn(input.contextLabel);
  // The duration and the rate the words state travel with the question, so
  // the human sees them when choosing a period (owner rule 2026-09-23).
  const sourceCues = extractSourceTimeCues(input.workText) ?? extractSourceTimeCues(input.contextLabel);
  const inText = periodWordsIn(input.workText);
  if (inText) {
    return {
      value: "period_aggregate",
      method: "aggregate_period_words_in_text",
      confidence: 0.7,
      sourceHours: hours,
      note: inText,
      remote,
      periodStart: null,
      periodEnd: null,
      sourceCues,
    };
  }
  const inContext = periodWordsIn(input.contextLabel);
  if (inContext) {
    return {
      value: "period_aggregate",
      method: "aggregate_period_words_in_context",
      confidence: 0.6,
      sourceHours: hours,
      note: inContext,
      remote,
      periodStart: null,
      periodEnd: null,
      sourceCues,
    };
  }
  return {
    value: "unknown",
    method: "exceeds_day_no_period_evidence",
    confidence: 1,
    sourceHours: hours,
    note: null,
    remote,
    periodStart: null,
    periodEnd: null,
    sourceCues,
  };
}

/** True when the classification still needs a human: anything a machine
 *  read as non-daily, until a human choice replaces it. */
export function timeSemanticsOpen(ts: TimeSemantics | null | undefined): boolean {
  return !!ts && ts.method !== "human_choice";
}

/** True when the row's hours may be read as a DAY's duration. */
export function countsAsDailyHours(ts: TimeSemantics | null | undefined): boolean {
  return !ts || ts.value === "daily";
}
