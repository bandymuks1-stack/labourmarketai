/**
 * Deterministic work-log extractor — parses a worker's free-text sentence into
 * the fields a work-journal entry needs, WITHOUT any LLM (doctrine §7 / brief
 * §10: the deterministic layer must cover work-time on its own).
 *
 * IMPORTANT — what is a claim vs. a display aid:
 *   - The worker's ORIGINAL sentence (`notes`) is the legal evidence and is
 *     saved verbatim as the journal entry's `original_text`. Skills are
 *     recognized from it by the canonical journal pipeline — nothing here
 *     declares a skill.
 *   - `date` and `site` map to real `journal_entry_metrics` rows.
 *   - `start` / `end` / `breakMinutes` / `hoursLabel` / `task` are a PARSE
 *     PREVIEW shown so the worker can verify the system understood them; they
 *     are NOT persisted as separate structured claims (they already live inside
 *     the evidence text). This keeps the preview honest: "I understood it this
 *     way" — confirm to save the real fields.
 *
 * Pure module: no IO. `today` (YYYY-MM-DD) is passed in so the function stays
 * deterministic and unit-testable; the client supplies the real current date.
 */
import { isExplicitJournalRequest } from "./intent-router";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";

export type WorkLogParse = {
  /** ISO date (YYYY-MM-DD) — parsed or defaulted to `today`. */
  date: string;
  /** HH:MM 24h — null when no span was stated. */
  start: string | null;
  end: string | null;
  /** Minutes of break, 0 when none stated. */
  breakMinutes: number;
  /** Worked-time in minutes, when derivable (span − break, or explicit hours). */
  workedMinutes: number | null;
  /** Human label for worked time, e.g. "8 val. 15 min." — null when unknown. */
  hoursLabel: string | null;
  /** Best-effort context — the entry's ONE `site_name` slot ("Objektas /
   *  vieta"): the word after "objekte"/"site"/"на объекте", a NAME after a
   *  place noun ("sandėlyje Kaune", "projekte LabourMarket.ai") or after
   *  the work verb ("dirbau LabourMarket.ai"). Shown for correction, never
   *  saved unseen. */
  site: string | null;
  /** Best-effort activity phrase (trailing clause) — display only. */
  task: string | null;
  /** The worker's own words — saved verbatim as the entry evidence. */
  notes: string;
  /** True when we parsed at least a date-defining or time-defining signal, so
   *  the flow can decide whether to ask ONE clarifying question first. */
  hasSignal: boolean;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Parse "8", "8:30", "8.30", "0830" → minutes since midnight, or null. */
function toMinutes(h: string, m?: string): number | null {
  const hh = Number(h);
  const mm = m != null ? Number(m) : 0;
  if (!Number.isInteger(hh) || hh < 0 || hh > 23) return null;
  if (!Number.isInteger(mm) || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function hhmm(mins: number): string {
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

/** "8 val. 15 min." in the worker's shorthand (locale-neutral units). */
function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} val. ${m} min.`;
  if (h > 0) return `${h} val.`;
  return `${m} min.`;
}

// "nuo 8 iki 17", "from 8:30 to 17", "с 8 до 17", or a bare "8-17" / "8:00–17:00".
// A clock span is a number PAIR standing on its own: a digit run glued to a
// letter, another digit or a connector is a reference, a date or a code, not
// a working day — measured on production (2026-09-11), "QA-S13-1789111905948"
// was read as 13:00–17:00 and became four worked hours. So the first number
// may not follow a letter / digit / connector, and the last may not run on
// into more digits or a further "-NN" segment ("2026-09-11", "12-13-14",
// "A-7-12" are none of them spans).
const SPAN_RE =
  /(?<![\p{L}\p{N}_\-–—/.:])(?:nuo|from|с|von|van)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:iki|to|до|bis|tot|[-–—])\s*(\d{1,2})(?:[:.](\d{2}))?(?!\p{N}|[-–—/]\p{N})/iu;
// Polish "od 7 do 16" — read ONLY as the od…do PAIR: a bare "2 do 3 godzin"
// is a range of hours (2–3 h), never the clock span 02:00–03:00. Measured
// 2026-10-11: without it a Polish welder's "od 7 do 16, 30 min przerwy"
// saved the 30-minute break as the day's work.
const PL_SPAN_RE =
  /(?<![\p{L}\p{N}_])od\s*(\d{1,2})(?:[:.](\d{2}))?\s*do\s*(\d{1,2})(?:[:.](\d{2}))?(?!\p{N}|[-–—/]\p{N})/iu;

const DAY_MINUTES = 24 * 60;
/** A span may run past midnight only when it STARTS in the afternoon or
 *  evening: "nuo 22 iki 6" is a night shift, while "8-5" could as well be a
 *  12-hour clock day (8 am–5 pm) — that reading is left unparsed, never
 *  guessed (the person states the time instead). */
const OVERNIGHT_EARLIEST_START = 12 * 60;
/** What may stand between two spans for the second to be part of the SAME
 *  working day: a comma/semicolon/plus or one "and" word, nothing else.
 *  "8-12 ir 13-17" is a split shift; "8-17, sumontavau 3-4 langus" is one
 *  span followed by a count. */
const SPAN_JOINER_RE = /^\s*(?:[,;+&/]\s*)?(?:(?:ir|and|и|und|en|i|oraz|a|bei)\s+)?$/iu;

type ResolvedSpans = {
  /** Minutes since midnight of the first span's start. */
  readonly start: number;
  /** Minutes since the first span's day midnight — may exceed 24 h - 1 when
   *  the work ran past midnight; read `% DAY_MINUTES` for the clock time. */
  readonly end: number;
  /** Sum of the spans' own minutes (the gaps between them are not in it). */
  readonly worked: number;
  /** Sum of the gaps between joined spans. */
  readonly gap: number;
  readonly count: number;
};

/**
 * Every clock span the sentence states for ONE working day, resolved on one
 * time line: a night shift ends on the next day ("nuo 22 iki 6" = 8 h, was
 * 0 h), and joined spans add up ("8-12 ir 13-17" = 8 h, was the first 4 h).
 * The second and later spans count only while they are joined to the
 * previous one (SPAN_JOINER_RE) and follow it in time; the first span that
 * does not ends the chain, so a later stray range is never added. `null` when
 * no span resolves.
 */
function resolveClockSpans(raw: string): ResolvedSpans | null {
  const pick = (re: RegExp) => [...raw.matchAll(new RegExp(re.source, "giu"))];
  let matches = pick(SPAN_RE);
  if (matches.length === 0) matches = pick(PL_SPAN_RE);
  if (matches.length === 0) return null;

  let first = 0;
  let prevEnd = 0;
  let prevIndexEnd = 0;
  let worked = 0;
  let gap = 0;
  let count = 0;
  for (const m of matches) {
    const s = toMinutes(m[1]!, m[2]);
    const e = toMinutes(m[3]!, m[4]);
    if (s == null || e == null || s === e) break;
    // Past midnight only from the afternoon on, and only when the span reads
    // as clock time — written with minutes ("22:00-06:00") or with words
    // ("nuo 22 iki 6") — so a bare descending pair ("20-5 cm") stays a range.
    if (e < s && (s < OVERNIGHT_EARLIEST_START || (m[2] == null && m[4] == null && /[-–—]/u.test(m[0])))) break;
    if (count > 0 && !SPAN_JOINER_RE.test(raw.slice(prevIndexEnd, m.index))) break;
    // Place the span on the time line of the day the previous one ended on
    // (the first span on its own day); it may itself cross midnight.
    const ls = Math.floor(prevEnd / DAY_MINUTES) * DAY_MINUTES + s;
    const le = ls + (e > s ? e - s : e + DAY_MINUTES - s);
    if (count > 0 && (ls < prevEnd || le - first > DAY_MINUTES)) break;
    if (count === 0) first = ls;
    else gap += ls - prevEnd;
    worked += le - ls;
    prevEnd = le;
    prevIndexEnd = m.index + m[0].length;
    count += 1;
  }
  if (count === 0) return null;
  return { start: first, end: prevEnd, worked, gap, count };
}

// "45 min", "45 minučių", "45 мин", optionally near a break word.
const BREAK_RE =
  /(\d{1,3})\s*(?:min|минут|мин)\w*/iu;
// `\b` bounds the ASCII "break" only — "breakdown" is work, not a pause.
const BREAK_CONTEXT_RE = /(pertrauk|piet[uū]|\bbreaks?\b|lunch|обед|перерыв|pauze|pause|przerw|mittag)/iu;
// A break stated in HOURS — "1 h break", "1 val. pertrauka", "перерыв 1 час".
// Read only when the hour figure stands BESIDE the break word, so the day's
// own "9 valandas" is never taken for the break.
const BREAK_HOUR_UNIT = String.raw`(\d{1,2})(?:[.,](\d))?\s*(?:h(?!\p{L})|hrs?(?!\p{L})|hour\w*|val\.?|valand\w*|ч(?!\p{L})|час\w*)`;
const BREAK_WORD = String.raw`(?:pertrauk\w*|piet\w*|\bbreaks?\b|lunch|обед\w*|перерыв\w*|pauze|pause|przerw\w*|mittag\w*)`;
const BREAK_HOURS_RE = new RegExp(
  `${BREAK_HOUR_UNIT}\\s*${BREAK_WORD}|${BREAK_WORD}\\s*(?:of\\s+|for\\s+|[:–—-]\\s*)?${BREAK_HOUR_UNIT}`,
  "iu",
);
// explicit "8 valandas / hours / часов"
// pl "8,5 godziny" / "8 godz." and de "8 Std." were not read (walk 2026-10-11:
// a Polish entry saved with no duration).
const EXPLICIT_HOURS_RE = /(\d{1,2})(?:[:.,](\d{1,2}))?\s*(?:val\.?|valand\w*|hour\w*|hrs?|час\w*|uur|stunden?|godz\w*|std\.?(?!\p{L}))/iu;
// site after "objekte X" / "statyboje X" / "site X" / "на объекте в X" —
// the locative forms only: "Statyba" inside a company name is a NAME, not
// a place word (the context rules below read it)
//
// THE WORD AFTER A PLACE WORD IS NOT ALWAYS A PLACE (local UX review
// 2026-10-24, row 8.2): "on site for 6 hours" filled the site with "for",
// "… auf der Baustelle gemauert" with "gemauert" — a function word and a
// verb, saved unless the person noticed. So the place word may be followed
// by one preposition ("auf der Baustelle in Berlin", "на объекте в Kaunas",
// "na budowie w Gdańsku"), and the captured word must pass `isSiteWord`: not
// a function word, not a time word, not a number, not a verb form.
// `(?<!\p{L})` keeps "website" from reading as "site".
const SITE_RE =
  /(?<!\p{L})(?:objekt\p{L}*|statybo(?:je|se)|site|на\s+объекте|op\s+de\s+locatie|op\s+de\s+bouwplaats|auf\s+der\s+baustelle|na\s+budowie|na\s+obiekcie)(?:\s+(?:in|at|в|w|we|im|in\s+der|bei|op|te|ant|prie))?\s+(\p{L}[\p{L}\p{N}'’-]{1,40})/giu;
/** Words that follow a place word in ordinary work sentences and are never
 *  the place itself: prepositions, articles, conjunctions, day words, the
 *  hours units and generic quantifiers, in the six active languages. */
const SITE_STOP_WORDS: ReadonlySet<string> = new Set([
  // en
  "for", "at", "in", "on", "the", "a", "an", "with", "from", "to", "until", "till", "and", "or",
  "today", "yesterday", "all", "whole", "day", "morning", "afternoon", "evening", "hours", "hour",
  "doing", "working", "again", "too", "also",
  // lt
  "ir", "su", "nuo", "iki", "per", "visą", "visa", "šiandien", "vakar", "valandas", "valandų",
  "val", "dieną", "rytą", "vakare", "dar", "taip", "pat",
  // ru
  "и", "с", "до", "для", "весь", "всю", "сегодня", "вчера", "часов", "часа", "час", "день",
  "утром", "вечером", "тоже", "ещё", "еще",
  // nl
  "en", "met", "van", "tot", "voor", "de", "het", "een", "vandaag", "gisteren", "uur", "uren",
  "hele", "dag", "ook",
  // de
  "und", "mit", "von", "bis", "für", "den", "die", "das", "der", "ein", "eine", "heute",
  "gestern", "stunden", "stunde", "ganzen", "tag", "auch",
  // pl
  "i", "z", "od", "do", "przez", "dla", "dzisiaj", "dziś", "wczoraj", "godzin", "godziny",
  "cały", "dzień", "też", "także",
]);
/** A past-tense / participle shape (LT -au, EN -ed/-ing, DE/NL ge…t/en,
 *  RU -л/-ла/-ли, PL -łem/-łam/-ł…) — a verb, never a place. A lower-case
 *  LT word ending in -au is a first-person verb ("mūrijau", "dirbau"), not a
 *  locative place (-e, -oje, -uose, -yje). */
const SITE_VERB_SHAPE_RE =
  /^(?:\p{L}{2,}(?:au|ome|ėme)|[a-z]{2,}(?:ed|ing)|ge\p{L}{3,}(?:t|en)|\p{L}{2,}(?:ал|ала|али|ил|ила|или|ял|яла|яли|ел|ела|ели)|\p{L}{2,}(?:łem|łam|łeś|łaś|ł|ła|li|ły))$/iu;

/** True when the word after a place word can be a site name. A capitalised
 *  word ("Berlin", "Roterdame", "Kaunas") always can; a lower-case one only
 *  when it is no function word, time word or verb form. */
function isSiteWord(word: string): boolean {
  const w = word.toLowerCase();
  if (SITE_STOP_WORDS.has(w)) return false;
  // A word that NAMES WORK is the work, not the place — German capitalises
  // every noun, so "auf der Baustelle Fliesen verlegt" must not read
  // "Fliesen" as the site. Exact / synonym tiers only: a fuzzy guess never
  // takes a real place name away.
  if (recognizeSkills(word, 1).some((s) => s.via !== "fuzzy")) return false;
  if (/^\p{Lu}/u.test(word)) return true;
  if (SITE_VERB_SHAPE_RE.test(word)) return false;
  return w.length >= 3;
}

/** The first place-word reading whose word passes `isSiteWord`. */
function siteAfterPlaceWord(raw: string): string | null {
  for (const m of raw.matchAll(SITE_RE)) {
    const word = trimName(m[1] ?? "");
    if (word && isSiteWord(word)) return word;
  }
  return null;
}
// ── the CONTEXT slot (issue #1689, re-audit line 0) ────────────────────────
// The entry carries ONE free context — `site_name`, "Objektas / vieta": the
// object, place, project or client the work was for. The owner's own
// sentence, "Šiandien 9 valandas dirbau LabourMarket.ai: …", named its
// context and the flow captured nothing, so the person had to retype it.
// Two further readings, both a PARSE PREVIEW the person corrects before
// the save (never a silent claim):
//   · a place noun the sentence names — warehouse / office / project /
//     company / shop / at the client — followed by a NAME: a capitalised
//     token or a dotted one ("LabourMarket.ai"), optionally two words
//     ("UAB Statyba"). The name requirement is what keeps "sandėlyje
//     iškroviau" from reading the verb as the place;
//   · the work verb itself followed by such a NAME — "dirbau LabourMarket.ai",
//     "worked at Acme", "работал в Maxima", "gewerkt bij Bol", "gearbeitet
//     bei Bosch". A digit after the verb ("dirbau 8 valandas", "nuo 8") is
//     never a name, so the time reading is untouched.
// A proper NAME: starts with an upper-case letter; may carry dots, digits,
// "&", an apostrophe or a hyphen; a second capitalised word may follow.
const NAME = String.raw`(\p{Lu}[\p{L}\p{N}.&'’-]{1,40}(?:\s\p{Lu}[\p{L}\p{N}.&'’-]{1,40})?)`;
const SITE_PLACE_NOUN_RE = new RegExp(
  String.raw`(?<!\p{L})(?:[Ss]andėl\p{L}*|[Bb]iur\p{L}*|[Pp]rojekt\p{L}*|[Įį]mon\p{L}*|[Ff]irm\p{L}*|[Pp]arduotuv\p{L}*|[Kk]lientui|[Pp]as\s+klient\p{L}*|[Ww]arehouse|[Oo]ffice|[Pp]roject|[Cc]ompany|[Ss]hop|[Ss]tore|[Aa]t\s+the\s+client|[Ff]or\s+client|[Нн]а\s+складе|[Вв]\s+офисе|[Нн]а\s+проекте|[Вв]\s+компании|[Вв]\s+фирме|[Вв]\s+магазине|[Уу]\s+клиента|[Ii]n\s+het\s+magazijn|[Oo]p\s+kantoor|[Ii]n\s+het\s+project|[Bb]ij\s+de\s+klant|[Ii]m\s+Lager|[Ii]m\s+Büro|[Ii]m\s+Projekt|[Ii]n\s+der\s+Firma|[Bb]eim\s+Kunden)\s+` + NAME,
  "u",
);
const SITE_AFTER_WORK_VERB_RE = new RegExp(
  String.raw`(?<!\p{L})(?:[Dd]irbau|[Dd]irbome|[Ww]orked\s+(?:at|for|on)|[Рр]аботал[аи]?\s+(?:в|на|у|для)|[Gg]ewerkt\s+(?:bij|voor|aan)|[Gg]earbeitet\s+(?:bei|für|an))\s+` + NAME,
  "u",
);
/** Trailing sentence punctuation is never part of a name ("LabourMarket.ai:"). */
function trimName(name: string): string {
  return name.replace(/[.,:;!?]+$/u, "").trim();
}
// "šiandien" today, "vakar" yesterday, explicit ISO, "liepos 24"/"24 d."
const TODAY_RE = /(šiandien|today|сегодня|vandaag|heute|dzisiaj|dziś)/iu;
const YESTERDAY_RE = /(vakar|yesterday|вчера|gisteren|gestern|wczoraj)/iu;
// Checked FIRST: every one of these CONTAINS its language's "yesterday"
// (už-VAKAR, поза-ВЧЕРА, vor-GESTERN, eer-GISTEREN, przed-WCZORAJ), so a
// day-before-yesterday sentence used to be filed one day late.
const DAY_BEFORE_YESTERDAY_RE =
  /(užvakar|uzvakar|day\s+before\s+yesterday|позавчера|vorgestern|eergisteren|przedwczoraj)/iu;
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

/** Add `deltaDays` to an ISO date string, staying pure (no Date.now). */
function shiftIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000;
  const dt = new Date(base);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * `defaultDay` is the day the person already chose (the journal calendar's
 * selected day). It is used ONLY when the sentence names no day of its own;
 * "vakar"/"šiandien" stay relative to the real `today`. Omitted → `today`.
 */
export function extractWorkLog(
  text: string,
  today: string,
  defaultDay: string = today,
): WorkLogParse {
  const raw = (text ?? "").trim();
  const q = raw.toLowerCase();

  // ── date ────────────────────────────────────────────────────────────────
  let date = defaultDay;
  let dateSignal = false;
  const iso = raw.match(ISO_RE);
  if (iso) {
    date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    dateSignal = true;
  } else if (DAY_BEFORE_YESTERDAY_RE.test(q)) {
    date = shiftIso(today, -2);
    dateSignal = true;
  } else if (YESTERDAY_RE.test(q)) {
    date = shiftIso(today, -1);
    dateSignal = true;
  } else if (TODAY_RE.test(q)) {
    date = today;
    dateSignal = true;
  }

  // ── time span ─────────────────────────────────────────────────────────────
  let start: string | null = null;
  let end: string | null = null;
  let spanMinutes: number | null = null;
  // Gap between joined spans ("8-12 ir 13-17" → 60), read as the break.
  let spanGapMinutes: number | null = null;
  const spans = resolveClockSpans(raw);
  if (spans) {
    start = hhmm(spans.start);
    end = hhmm(spans.end % DAY_MINUTES);
    spanMinutes = spans.worked;
    if (spans.count > 1) spanGapMinutes = spans.gap;
  }

  // ── break ─────────────────────────────────────────────────────────────────
  let breakMinutes = 0;
  // Only treat a "NN min" as a break when a break word is present anywhere in
  // the sentence — otherwise a stray "45 min" (e.g. travel) is left alone.
  if (BREAK_CONTEXT_RE.test(q)) {
    const br = raw.match(BREAK_RE);
    if (br) {
      const n = Number(br[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 600) breakMinutes = n;
    } else {
      const bh = raw.match(BREAK_HOURS_RE);
      if (bh) {
        const h = Number(bh[1] ?? bh[3]);
        const tenth = Number(bh[2] ?? bh[4] ?? 0);
        const n = Math.round((h + tenth / 10) * 60);
        if (Number.isFinite(n) && n >= 0 && n <= 600) breakMinutes = n;
      }
    }
  }

  // Joined spans already leave the pause OUT ("8-12 ir 13-17": the hour
  // between them is the break). A break stated on top of them may be that
  // same pause or another one — the sentence does not say, so no span figure
  // is recorded at all (never a guess; the person states the time instead).
  if (spanGapMinutes != null) {
    if (breakMinutes > 0) {
      start = null;
      end = null;
      spanMinutes = null;
    } else {
      breakMinutes = spanGapMinutes;
    }
  }

  // ── worked minutes ────────────────────────────────────────────────────────
  let workedMinutes: number | null = null;
  if (spanMinutes != null && spanGapMinutes != null) {
    // the spans' own sum — the gap between them is already not in it
    workedMinutes = spanMinutes;
  } else if (spanMinutes != null) {
    workedMinutes = Math.max(0, spanMinutes - breakMinutes);
  } else {
    const eh = raw.match(EXPLICIT_HOURS_RE);
    if (eh) {
      const h = Number(eh[1]);
      const frac = eh[2] != null ? Number(`0.${eh[2]}`) : 0;
      if (Number.isFinite(h) && h >= 0 && h <= 24) {
        workedMinutes = Math.round((h + frac) * 60) - breakMinutes;
        if (workedMinutes < 0) workedMinutes = Math.round((h + frac) * 60);
      }
    }
  }
  const hoursLabel = workedMinutes != null ? durationLabel(workedMinutes) : null;

  // ── site ──────────────────────────────────────────────────────────────────
  let site: string | null = null;
  site = siteAfterPlaceWord(raw);
  if (site === null) {
    const siteM = raw.match(SITE_PLACE_NOUN_RE) ?? raw.match(SITE_AFTER_WORK_VERB_RE);
    if (siteM) site = trimName(siteM[1]!) || null;
  }

  // ── task (best effort, display only) ──────────────────────────────────────
  // Trailing clause after the last comma, when it looks like an activity
  // (contains letters and isn't just a time/break token). Never a hard claim.
  let task: string | null = null;
  const parts = raw.split(/[,.;]/).map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (
    last &&
    parts.length > 1 &&
    /[A-Za-zÀ-ÿА-Яа-яĀ-ž]/.test(last) &&
    !SPAN_RE.test(last) &&
    !PL_SPAN_RE.test(last) &&
    !BREAK_RE.test(last) &&
    !BREAK_HOURS_RE.test(last) &&
    last.length <= 80
  ) {
    task = last;
  }

  const hasSignal = dateSignal || start != null || workedMinutes != null;

  return {
    date,
    start,
    end,
    breakMinutes,
    workedMinutes,
    hoursLabel,
    site,
    task,
    notes: raw,
    hasSignal,
  };
}

/**
 * IS THIS SENTENCE THE WORK, OR A REQUEST ABOUT THE JOURNAL?
 *
 * Production 2026-09-06 (real-person join walk): "Užpildyk darbo žurnalą"
 * opened the journal flow — correctly, it is an explicit request — but the
 * flow carried the REQUEST SENTENCE as the entry's evidence, and two taps
 * later `journal_entries.original_text = 'Užpildyk darbo žurnalą'`. The
 * request became the record.
 *
 * A draft may persist only when the sentence carries WORK CONTENT — at
 * least one of:
 *   - a time span or a worked duration ("nuo 8 iki 17", "8 valandas");
 *   - a place ("objekte Kaune");
 *   - a recognised activity (the canonical skill recogniser reads it — the
 *     same one the journal pipeline uses — or a past-tense work verb in the
 *     person's own language: "montavau", "dirbau", "installed", "работал",
 *     "gearbeitet").
 * Otherwise the flow ASKS what was done. A sentence that names the journal
 * and carries nothing else is a META REQUEST and is refused at the schema
 * floor too, so no path can save it.
 *
 * `today` does not matter here (a date alone is not work content), so the
 * function takes none and stays trivially pure.
 */
export type JournalDraftReadiness = "ok" | "meta-request" | "no-content";

// Past-tense work verbs. LT: the explicit "dirbau/dirbome" plus the regular
// 1st-person past endings (-avau, -ojau, -ėjau/-ejau, -iau, -inau, -ovau,
// -uvau, -davau and their plurals) — NEVER a bare "-au", which is also the
// present tense ("taisau", "valau", "pildau"). EN: a regular "-ed" verb. RU: the
// -л/-ла/-ли past, with the journal word itself ("журнал" ends in "-ал")
// excluded. DE/NL: a "ge…t / ge…en" participle.
const PAST_WORK_VERB_RE =
  /(?<![\p{L}])(?:dirbau|dirbome|dirbom|worked|работал|работала|работали|gewerkt|gearbeitet)(?![\p{L}])|(?<![\p{L}])[\p{L}]{2,}(?:avau|ojau|ėjau|ejau|iau|inau|ovau|uvau|davau|avome|ojome|ėjome|ejome|iome|inome|ovome|uvome)(?![\p{L}])|(?<![\p{L}])[a-z]{3,}ed(?![\p{L}])|(?<![\p{L}])(?!журнал)[\p{L}]{3,}(?:ал|ала|али|ил|ила|или|ял|яла|яли)(?![\p{L}])|(?<![\p{L}])ge[\p{L}]{3,}(?:t|en)(?![\p{L}])/iu;

export function journalDraftReadiness(text: string): JournalDraftReadiness {
  const raw = (text ?? "").trim();
  if (!raw) return "no-content";
  const parse = extractWorkLog(raw, "2000-01-01");
  const hasContent =
    parse.start !== null ||
    parse.workedMinutes !== null ||
    parse.site !== null ||
    PAST_WORK_VERB_RE.test(raw) ||
    recognizeSkills(raw, 1).length > 0;
  if (hasContent) return "ok";
  return isExplicitJournalRequest(raw) ? "meta-request" : "no-content";
}

/** The server-floor form of the rule: a sentence that only ASKS for the
 *  journal is never evidence. Used by the log-work input schema. */
export function isJournalMetaRequest(text: string): boolean {
  return journalDraftReadiness(text) === "meta-request";
}
