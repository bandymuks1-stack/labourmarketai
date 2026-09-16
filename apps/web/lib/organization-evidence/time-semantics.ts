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
 */

export type TimeSemanticsKind = "daily" | "period_aggregate" | "unknown";

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
