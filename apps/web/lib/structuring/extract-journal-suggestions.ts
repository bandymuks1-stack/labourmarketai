import {
  SKILL_HINTS_LT,
  WORK_DIRECTION_HINTS_LT,
  ACTIVITY_HINTS_LT,
} from "./keywords";
import {
  recognizeSkills,
  RECOGNITION_LIMIT,
  type RecognizedSkill,
} from "./skill-recognition";
import {
  extractProfileSkillClaims,
  type SkillClaimSuggestion,
} from "@/lib/profile/skill-claim-extractor";

/**
 * RULE-BASED suggestion extractor for a free-text work journal entry. This is
 * NOT AI — it is a small lexicon + regex pass. Suggestions are NEVER facts;
 * the worker must confirm each one before it gets persisted (§7).
 */
export type JournalSuggestions = {
  /** Detected duration in a single canonical unit (hours / days / minutes).
   *  Legacy single-suggestion field — present when the text has exactly one
   *  time mention. Multi-fragment text populates `fragments` instead. */
  time: { value: number; unitSlug: "hours" | "days" | "minutes" } | null;
  /** Detected quantity + unit (e.g. 35 m²). */
  quantity: { value: number; unitSlug: string } | null;
  /** Canonical skill slugs the parser thinks were mentioned (capped). */
  skillSlugs: string[];
  /** Rich, evidence-ordered skill suggestions (slug + confidence + reason).
   *  Superset of `skillSlugs` — the composer renders these so each suggestion
   *  can show WHY it appeared and how strong the match is. */
  skillSuggestions: RecognizedSkill[];
  /** Canonical work direction slug (a profession slug). */
  workDirectionSlug: string | null;
  /** Site / location mention if the worker named one (e.g. "objektas Vilniuje"). */
  siteName: string | null;
  /** Institution / organization name when the worker mentioned one
   *  (e.g. "Vytauto Didžiojo universitete"). Free-text, review-only —
   *  there is no organisation taxonomy mounted to this yet. */
  institutionName: string | null;
  /** Topic / theme of the work when the worker prefixed it with `tema:` /
   *  `theme:` (free text, review-only). */
  topic: string | null;
  /** Per-fragment suggestions when the worker logged multiple work items in
   *  one entry ("1h driver, 3h cashier, 5h roofing"). Each fragment keeps the
   *  raw phrase so the UI can show evidence next to the interpretation. */
  fragments: JournalFragmentSuggestion[];
  /** The day's total the person stated BESIDE the itemised fragments —
   *  "Šiandien 9 valandas dirbau: 5 val. X, 2 val. Y, 2 val. Z". It is the
   *  sum of the items, not one more item, so it is kept OUT of `fragments`
   *  (issue #1689: persisted as a fragment it doubled a 9 h day to 18 h).
   *  `matchesFragments` says whether the items add up to it; when they do
   *  not, the intake records the stated figure as the entry-level duration
   *  the canonical work-time rule sets aside and names (§13), never as
   *  hours. Null when nothing beside the items states a total. */
  statedTotal: {
    value: number;
    unitSlug: "hours" | "days" | "minutes";
    rawPhrase: string;
    matchesFragments: boolean;
  } | null;
  /** Explicit self-declared capabilities/specializations the worker NAMED in
   *  the text (e.g. "lietuviškos virtuvės gamyba", "vairavimas", "pardavimai",
   *  "sutarčių ruošimas"). Reuses the SAME dictionary as the profile composer
   *  (`extractProfileSkillClaims`) so specializations are preserved and not
   *  flattened into only a generic parent chip — a journal entry and a profile
   *  narrative recognise capabilities identically. These are review-only,
   *  unverified suggestions (doctrine §7); the worker confirms each before it
   *  is added to their profile as a self-declared claim. */
  capabilitySuggestions: SkillClaimSuggestion[];
  /** Did the parser find anything at all worth showing? */
  hasAny: boolean;
};

export type JournalFragmentSuggestion = {
  /** Raw phrase from the original text (so the UI can show evidence). */
  rawPhrase: string;
  /** Detected time for this fragment, if any. */
  time: { value: number; unitSlug: "hours" | "days" | "minutes" } | null;
  /** Canonical activity slug if the lexicon matched (may be null). */
  activitySlug: string | null;
  /** Human-readable activity label (LT). Always set when the fragment has any
   *  recognizable activity wording — even if no slug matched the taxonomy. */
  activityLabel: string | null;
  /** True when the fragment carries a recognisable time but no matched
   *  activity (slug + label both null) — surfaces as a "Nesuprasta /
   *  patikslinkite" card in the composer so the worker can attach a free-text
   *  label. Unknown-phrase rows are persisted as `unknown_phrase` metric
   *  entries for future admin/agent review (no fake auto-classify). */
  isUnknown: boolean;
};

/**
 * The duration-unit vocabulary — ONE list per unit, lt / ru / en / nl / de
 * (issue #1689, measured 2026-09-12 over the five routed locales: "5 hours",
 * "5 hrs", "5 uur", "5 Std.", "5 Stunden", "2 Tage" read NO duration while
 * every LT / RU form did — a worker writing in English, Dutch or German
 * lost the hours-per-skill chain at the first step; and the one-letter
 * abbreviation `d` read "Sumontavau 5 duris" / "Installed 5 doors" as
 * FIVE DAYS of work because nothing bounded it). Regex sources over
 * lower-cased text; every time regex in this file and the recognition-side
 * fragmenter is built from these three lists — no other unit list exists.
 *
 *  - full words take any inflection ("valandas", "часов", "Stunden", "uren");
 *  - a one-letter abbreviation (h / u / d / ч) must stand ALONE — no letter
 *    or digit after it — so "5 hektarai", "5 užsakymai", "5 duris" are
 *    quantities, never time;
 *  - `minu[čct]` covers minutės / minutes / minuten / Minuten, on both the
 *    original (č) and the folded (c) text.
 */
export const HOUR_UNIT_SOURCES: readonly string[] = [
  "valand[\\p{L}]*",
  "val\\.?",
  "час[\\p{L}]*",
  "ч\\.?(?![\\p{L}\\p{N}])",
  "hours?(?![\\p{L}])",
  "hrs?\\.?(?![\\p{L}])",
  "h\\.?(?![\\p{L}\\p{N}])",
  "uur(?![\\p{L}])",
  "uren(?![\\p{L}])",
  "u\\.?(?![\\p{L}\\p{N}])",
  "stunden?(?![\\p{L}])",
  "std\\.?(?![\\p{L}])",
];
export const MINUTE_UNIT_SOURCES: readonly string[] = [
  "minu[čct][\\p{L}]*",
  "min\\.?",
  "мин[\\p{L}]*\\.?",
];
export const DAY_UNIT_SOURCES: readonly string[] = [
  "dien[\\p{L}]*",
  "d\\.?(?![\\p{L}\\p{N}])",
  "дн[\\p{L}]*",
  "день",
  "days?(?![\\p{L}])",
  "dag(?:en)?(?![\\p{L}])",
  "tage?(?![\\p{L}])",
];

const HOUR_UNIT_RX_SRC = HOUR_UNIT_SOURCES.join("|");
const MINUTE_UNIT_RX_SRC = MINUTE_UNIT_SOURCES.join("|");
const DAY_UNIT_RX_SRC = DAY_UNIT_SOURCES.join("|");
const DIGIT_HOURS_RX = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(?:${HOUR_UNIT_RX_SRC})`,
  "iu",
);
const DIGIT_MINUTES_RX = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(?:${MINUTE_UNIT_RX_SRC})`,
  "iu",
);
const DIGIT_DAYS_RX = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(?:${DAY_UNIT_RX_SRC})`,
  "iu",
);
/** One whole lower-cased word that IS a duration unit ("valandas", "hours",
 *  "uur", "std", "h"). The word test of `isTimeToken`, and of the
 *  recognition-side fragmenter's meaningfulness rule, for the same lists. */
const DURATION_UNIT_WORD_RX = new RegExp(
  `^(?:${HOUR_UNIT_RX_SRC}|${MINUTE_UNIT_RX_SRC}|${DAY_UNIT_RX_SRC})$`,
  "iu",
);
export function isDurationUnitWord(word: string): boolean {
  return DURATION_UNIT_WORD_RX.test(word);
}

/**
 * Canonical duration-unit patterns (regex sources, folded-text compatible) —
 * the three lists above, flattened. Exported so the universal journal
 * fragmenter strips trailing time expressions with the exact same vocabulary
 * instead of re-inventing it.
 */
export const DURATION_UNIT_PATTERNS: readonly string[] = [
  ...HOUR_UNIT_SOURCES,
  ...MINUTE_UNIT_SOURCES,
  ...DAY_UNIT_SOURCES,
];

/**
 * Canonical quantity-unit patterns (regex sources) — the SAME unit families
 * the quantity matcher below recognises (m² / kv.m / vnt / kg / pakuotės and
 * their RU spellings). Exported for the journal fragmenter (see above).
 */
export const QUANTITY_UNIT_PATTERNS: readonly string[] = [
  "m\\s*2",
  "m²",
  "kv\\.?\\s*m",
  "kvadrat[\\p{L}]*",
  "м\\s*2",
  "м²",
  "кв\\.?\\s*м",
  "vnt\\.?",
  "stuk[\\p{L}]*",
  "шт\\.?",
  "kg",
  "кг",
  "pakuo[\\p{L}]*",
  "упак[\\p{L}]*",
  "m",
  "м",
];

const EMPTY: JournalSuggestions = {
  time: null,
  quantity: null,
  skillSlugs: [],
  skillSuggestions: [],
  workDirectionSlug: null,
  siteName: null,
  institutionName: null,
  topic: null,
  fragments: [],
  statedTotal: null,
  capabilitySuggestions: [],
  hasAny: false,
};

function pickSlug(
  haystack: string,
  table: { slug: string; needles: string[] }[],
): string[] {
  const found = new Set<string>();
  for (const row of table) {
    for (const n of row.needles) {
      if (n && haystack.includes(n)) {
        found.add(row.slug);
        break;
      }
    }
  }
  return [...found];
}

/** Max skill suggestions surfaced for one entry. The matcher uses short
 *  substring stems (e.g. "stali", "klijav") that can each touch several of a
 *  worker's declared skills; without a cap a single short entry produced a
 *  broad, illogical-looking skill cloud (owner mobile review). We keep the
 *  most specifically-evidenced few and let the worker add the rest manually. */
export const SKILL_SUGGESTION_LIMIT = 4;

/** Longest needle from `table` for `slug` that is actually present in `lower`.
 *  Longer matched stem = more specific evidence in the worker's own words. */
function bestNeedleLength(
  lower: string,
  slug: string,
  table: { slug: string; needles: string[] }[],
): number {
  let best = 0;
  for (const row of table) {
    if (row.slug !== slug) continue;
    for (const n of row.needles) {
      if (n && lower.includes(n) && n.length > best) best = n.length;
    }
  }
  return best;
}

/**
 * Deterministically rank skill slugs by how specifically the entry text
 * evidences them, then cap to `limit`. Pure + order-stable (ties break
 * alphabetically) so the same entry always yields the same short list. This is
 * NOT new detection — it only orders + trims what `pickSlug` already matched, so
 * a narrow entry surfaces a few relevant suggestions instead of a wide cloud.
 */
export function rankSkillSlugs(
  lower: string,
  slugs: readonly string[],
  limit: number = SKILL_SUGGESTION_LIMIT,
): string[] {
  return [...slugs]
    .map((slug) => ({ slug, score: bestNeedleLength(lower, slug, SKILL_HINTS_LT) }))
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, Math.max(0, limit))
    .map((x) => x.slug);
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Match every hours/minutes/days mention in the text, returning normalized
 *  values.
 *
 *  RU (2026-06-12): Russian unit forms ride the SAME regexes («4 часа»,
 *  «30 минут», «2 дня», «8 ч»). Note `\b` is useless next to Cyrillic just
 *  like next to LT diacritics — the RU alternatives end with `[\p{L}]*`
 *  (consume the inflection) or an explicit lookahead instead. */
function findAllTimes(
  lower: string,
): { value: number; unitSlug: "hours" | "days" | "minutes" }[] {
  const out: { value: number; unitSlug: "hours" | "days" | "minutes" }[] = [];
  const hoursRe = new RegExp(DIGIT_HOURS_RX, "giu");
  const daysRe = new RegExp(DIGIT_DAYS_RX, "giu");
  const minutesRe = new RegExp(DIGIT_MINUTES_RX, "giu");
  for (const m of lower.matchAll(hoursRe)) {
    const v = toNumber(m[1]);
    if (v !== null) out.push({ value: v, unitSlug: "hours" });
  }
  for (const m of lower.matchAll(daysRe)) {
    const v = toNumber(m[1]);
    if (v !== null) out.push({ value: v, unitSlug: "days" });
  }
  for (const m of lower.matchAll(minutesRe)) {
    const v = toNumber(m[1]);
    if (v !== null) out.push({ value: v, unitSlug: "minutes" });
  }
  return out;
}

/** Lithuanian number-word lexicon (accusative case — the form used with
 *  durations: "dvi valandas", "penkiolika minučių"). Lowercase only. */
const LT_NUMBER_WORDS: Record<string, number> = {
  vieną: 1,
  viena: 1,
  vienas: 1,
  dvi: 2,
  trys: 3,
  tris: 3,
  keturias: 4,
  keturi: 4,
  penkias: 5,
  penkis: 5,
  šešias: 6,
  šešis: 6,
  septynias: 7,
  septynis: 7,
  aštuonias: 8,
  aštuonis: 8,
  devynias: 9,
  devynis: 9,
  dešimt: 10,
  vienuolika: 11,
  dvylika: 12,
  trylika: 13,
  keturiolika: 14,
  penkiolika: 15,
  šešiolika: 16,
  septyniolika: 17,
  aštuoniolika: 18,
  devyniolika: 19,
  dvidešimt: 20,
};

function numberWordKeysAlternation(): string {
  return Object.keys(LT_NUMBER_WORDS)
    .sort((a, b) => b.length - a.length)
    .join("|");
}

/** Recognise a hours-as-words mention. Returns hours (may be fractional from
 *  "valandą su puse" = 1.5). */
function detectHoursWord(f: string): number | null {
  if (/(?:^|\s)pusvaland[įio]/.test(f)) return 0.5;
  if (/(?:^|\s)pusę\s+valandos(?=\s|[.,!?]|$)/.test(f)) return 0.5;
  // RU idioms: «полчаса» = 0.5h, «полтора часа» = 1.5h.
  if (/(?:^|[^\p{L}])полчаса(?=\s|[.,!?]|$)/u.test(f)) return 0.5;
  if (/(?:^|[^\p{L}])полтора\s+час[\p{L}]*(?=\s|[.,!?]|$)/u.test(f)) return 1.5;
  const keys = numberWordKeysAlternation();
  // Number-word + valand*
  const m = new RegExp(
    `(?:^|[^\\p{L}])(${keys})\\s+valand[\\p{L}]*(?=\\s|[.,!?]|$)`,
    "u",
  ).exec(f);
  if (m) {
    const v = LT_NUMBER_WORDS[m[1]];
    if (v !== undefined) return v;
  }
  // Bare valandą / valandos / valandų (= 1 hour) when no digit + no number-word.
  if (
    /(?:^|[^\d])valand[ąoų](?=\s|[.,!?]|$)/.test(f) &&
    !/\d\s*valand/.test(f)
  ) {
    return 1;
  }
  // RU: bare «час» / «часа» (= 1 hour, «работал час») when no digit precedes.
  if (
    /(?:^|[^\p{L}\d])час(?:а|у)?(?=\s|[.,!?]|$)/u.test(f) &&
    !/\d\s*час/u.test(f) &&
    !/полчаса|полтора/u.test(f)
  ) {
    return 1;
  }
  return null;
}

/** Recognise a minutes-as-words mention. */
function detectMinutesWord(f: string): number | null {
  const keys = numberWordKeysAlternation();
  const m = new RegExp(
    `(?:^|[^\\p{L}])(${keys})\\s+(?:${MINUTE_UNIT_RX_SRC})(?=\\s|[.,!?]|$)`,
    "u",
  ).exec(f);
  if (m) {
    const v = LT_NUMBER_WORDS[m[1]];
    if (v !== undefined) return v;
  }
  return null;
}

/** Recognise a days-as-words mention. */
function detectDaysWord(f: string): number | null {
  const keys = numberWordKeysAlternation();
  const m = new RegExp(
    `(?:^|[^\\p{L}])(${keys})\\s+dien[\\p{L}]*(?=\\s|[.,!?]|$)`,
    "u",
  ).exec(f);
  if (m) {
    const v = LT_NUMBER_WORDS[m[1]];
    if (v !== undefined) return v;
  }
  return null;
}

/** Single-fragment duration parser. Handles:
 *    - bare digit forms ("3 valandas", "15 minučių"),
 *    - word-only forms ("keturias valandas", "penkiolika minučių", "valandą"),
 *    - compound hours+minutes ("valandą dvidešimt minučių" = 1h20min),
 *    - half-hour idioms ("valandą su puse" = 1.5h, "pusvalandį" = 0.5h).
 *
 *  Returns the canonical unit:
 *    - if any minutes contribution exists ⇒ result is normalized to minutes
 *      (e.g. 1h20min ⇒ 80 minutes). The composer can re-cast for display.
 *    - else hours / days as detected.
 *
 *  JS `\b` is ASCII-only and breaks on Lithuanian characters (`ą`, `ę`, etc.)
 *  — every boundary here uses explicit non-letter lookaround instead. */
function detectFragmentTime(
  fragment: string,
): { value: number; unitSlug: "hours" | "minutes" | "days" } | null {
  const f = fragment.toLowerCase();

  // Hours contribution (digit OR word OR special idiom).
  let hours: number | null = null;
  const digitHourMatch = f.match(DIGIT_HOURS_RX);
  if (digitHourMatch) hours = toNumber(digitHourMatch[1]);
  if (hours === null) hours = detectHoursWord(f);

  // "su puse" (LT) / «с половиной» (RU) = "and a half" — adds 0.5h to the
  // hours we already have.
  const andAHalf = /\s+su\s+puse/.test(f) || /\s+с\s+половиной/u.test(f);
  if (hours !== null && andAHalf) {
    hours = hours + 0.5;
  } else if (hours === null && andAHalf) {
    // "valandą su puse" already detected via detectHoursWord (= 1) plus +0.5;
    // but if hours is still null, default to 1.5.
    hours = 1.5;
  }

  // Minutes contribution.
  let minutes: number | null = null;
  const digitMinMatch = f.match(DIGIT_MINUTES_RX);
  if (digitMinMatch) minutes = toNumber(digitMinMatch[1]);
  if (minutes === null) minutes = detectMinutesWord(f);

  // Days contribution (only used when no hours/minutes present — days don't
  // compound with sub-hour units in journal language).
  if (hours === null && minutes === null) {
    let days: number | null = null;
    const digitDayMatch = f.match(DIGIT_DAYS_RX);
    if (digitDayMatch) days = toNumber(digitDayMatch[1]);
    if (days === null) days = detectDaysWord(f);
    if (days !== null) return { value: days, unitSlug: "days" };
  }

  if (hours !== null && minutes !== null) {
    // Compound — normalise to minutes for precision.
    return { value: hours * 60 + minutes, unitSlug: "minutes" };
  }
  if (hours !== null) return { value: hours, unitSlug: "hours" };
  if (minutes !== null) return { value: minutes, unitSlug: "minutes" };
  return null;
}

/**
 * A dot that is NOT a sentence boundary (issue #1689, the owner's own
 * sentence "5 val. programavau, 2 val. testavau" split into "5 val" +
 * "programavau" — the hours lost their activity and the activity its hours):
 *   - the abbreviation dot of a unit followed by a lower-case continuation
 *     ("5 val. programavau", "30 min. pertrauka", "2 ч. тестировал"). An
 *     upper-case continuation ("6 val. Glaisčiau sienas") still ends the
 *     sentence, so two items each stating their own time stay two items;
 *   - a dot or comma between two digits ("3.5 val.", "1,5 h");
 *   - a dot inside one token with no whitespace after it ("LabourMarket.ai",
 *     "www.imone.lt") — the name is one word, not two sentences.
 * Written against the ORIGINAL text (case matters for the first rule).
 */
const UNIT_ABBREVIATION_RX =
  /((?:^|[^\p{L}])(?:val|min|h|hrs?|u|d|ч|мин|vnt|kv|kg|m|м|шт)\.)(?=[ \t]+\p{Ll})/gu;
/** German "Std." stands before a capitalised noun as a rule ("5 Std. Fliesen
 *  verlegt", "4 Std. Wände gestrichen") — the lower-case test above would end
 *  the sentence after every German hour figure and the hours would lose
 *  their work. Its dot is protected before any letter. */
const DE_HOUR_ABBREVIATION_RX = /((?:^|[^\p{L}])std\.)(?=[ \t]+\p{L})/giu;
const PROTECTED_DOT = "##DOT##";
const PROTECTED_COMMA = "##COMMA##";

/**
 * Replace every non-boundary dot/comma with the given marks so a later split
 * on `.` / `,` leaves them alone. Exported so the universal journal
 * fragmenter (`./journal-fragmenter`, the recognition side) protects the
 * SAME dots this extractor protects — two fragmenters, one rule; when both
 * cut at the same places a persisted phrase re-fragments to the derivation's
 * own ids (see `mapRecognitionToPersistedFragments`). Callers that need
 * index alignment pass single-character marks.
 */
export function protectNonBoundaryDots(
  text: string,
  marks: { readonly dot: string; readonly comma: string } = {
    dot: PROTECTED_DOT,
    comma: PROTECTED_COMMA,
  },
): string {
  return text
    .replace(UNIT_ABBREVIATION_RX, (m) => m.replace(".", marks.dot))
    .replace(DE_HOUR_ABBREVIATION_RX, (m) => m.replace(".", marks.dot))
    .replace(/(\d)\.(\d)/g, `$1${marks.dot}$2`)
    .replace(/(\d),(\d)/g, `$1${marks.comma}$2`)
    .replace(/(\p{L})\.(\p{L})/gu, `$1${marks.dot}$2`);
}

function restoreProtected(fragment: string): string {
  return fragment
    .split(PROTECTED_DOT)
    .join(".")
    .split(PROTECTED_COMMA)
    .join(",")
    .replace(/##TEMA##/g, ",");
}

/**
 * The colon that introduces an itemisation — "dirbau 9 val.: 5 val. X, 2
 * val. Y" — closes the header phrase. Only a colon followed by whitespace and
 * a digit splits (so "tema: sienos" stays whole); the header is returned
 * separately so the multi-fragment pass can read it as the STATED TOTAL of
 * the items that follow, never as one more item.
 */
export const ITEMISING_COLON_RX = /:\s+(?=\d)/u;

/** Split a free-text entry into discrete work fragments. */
function splitFragments(text: string): { parts: string[]; headerCount: number } {
  // RU «и», EN "and", NL "en", DE "und" join work items the same way LT
  // "ir"/"bei" do ("5 hours tiling and 4 hours painting" is two items).
  const normalized = protectNonBoundaryDots(text.replace(/\r/g, ""))
    .replace(/,\s*(ir|bei|и|and|en|und)\s+/gi, " | ")
    .replace(/\s+(ir|bei|и|and|en|und)\s+/gi, " | ");
  // Do not split on plain commas if the next chunk introduces a `tema:`
  // (theme) qualifier — the theme is metadata for the previous fragment,
  // not a new fragment. We protect it with a placeholder first.
  const protectedText = normalized.replace(/,\s*(tema\s*:)/giu, " ##TEMA## $1");
  const colonAt = protectedText.search(ITEMISING_COLON_RX);
  const header = colonAt > 0 ? protectedText.slice(0, colonAt) : "";
  const body = colonAt > 0 ? protectedText.slice(colonAt + 1) : protectedText;
  const toParts = (chunk: string): string[] =>
    chunk
      .split(/[.;!?\n|,]+/)
      // A protected abbreviation dot left LAST in its part ("Mūrijau sieną
      // 5 val. | klojau…") is trailing punctuation again — dropped, so the
      // persisted phrase reads exactly as it did before the protection.
      .map((s) => restoreProtected(s).trim().replace(/[.]+$/, ""))
      .filter((s) => s.length > 0);
  const headerParts = header ? toParts(header) : [];
  return { parts: [...headerParts, ...toParts(body)], headerCount: headerParts.length };
}

/** True when every word in the fragment is part of a time/numeric idiom
 *  (cardinal numeral, duration noun, "su"/"puse"/"ir"/"bei", or a digit). */
function isTimeOnlyFragment(fragment: string): boolean {
  const TIME_TOKENS = new Set([
    "su",
    "puse",
    "ir",
    "bei",
    "pusvaland",
    "pusvalandį",
    "pusvalandi",
    // RU time-idiom tokens («два часа с половиной», «полчаса», «и»).
    "с",
    "половиной",
    "полчаса",
    "полтора",
    "и",
    ...Object.keys(LT_NUMBER_WORDS),
  ]);
  const words = fragment
    .toLowerCase()
    .replace(/[.,;!?]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  for (const w of words) {
    if (isTimeToken(w, TIME_TOKENS)) continue;
    return false;
  }
  return true;
}

/** One lower-cased word that belongs to a time expression: a digit, a
 *  duration noun (the LT / RU vocabulary `findAllTimes` reads) or an idiom
 *  token. Exactly the per-word test `isTimeOnlyFragment` always applied. */
function isTimeToken(w: string, idiom: ReadonlySet<string>): boolean {
  if (/^\d+(?:[.,]\d+)?$/.test(w)) return true;
  if (isDurationUnitWord(w)) return true;
  return idiom.has(w);
}

const WHERE_IDIOM_TOKENS: ReadonlySet<string> = new Set([
  "su",
  "puse",
  "с",
  "половиной",
  ...Object.keys(LT_NUMBER_WORDS),
]);
/** The bare work verb names no trade: "dirbau virtuvėje" is still only a
 *  place. First-person and plural past forms, lt/en/ru/nl/de. */
const GENERIC_WORK_VERB_RX =
  /^(?:dirbau|dirbome|dirbom|worked|working|работал|работала|работали|gewerkt|werkte|gearbeitet)$/u;
/** LT place prepositions that take a noun after them: "ant stogo", "prie
 *  kasos", "pas klientą", "po tiltu". */
const LT_PLACE_PREPOSITION_RX = /^(?:ant|prie|pas|po|virš|virs|šalia|salia|už|uz|tarp)$/u;
/** LT verb endings that can never be a locative noun — 1st person past
 *  ("klijavau", "glaisčiau") and the plural past / present forms ("dirbome",
 *  "dažėme", "dirbate", "klojame"). The plural check needs length so that
 *  "kieme" (in the yard) and "name" (in the house) stay places. */
const LT_VERB_ENDING_RX = /(?:au|iau)$/u;
const LT_PLURAL_VERB_ENDING_RX = /(?:ome|ėme|eme|ote|ėte|ete|ate|iate|ime|ite|ame)$/u;
/** LT genitive endings a modifier carries before a locative noun: "sporto
 *  salėje", "mokyklos virtuvėje", "kliento bute", "prekybos centre". */
const LT_GENITIVE_ENDING_RX = /(?:o|os|ų|u|io|ios|ies|aus|iaus|ės|es|ių)$/u;

/**
 * An item that says only WHERE (issue #1689, measured 2026-09-12). Under a
 * header that names the work — "9 val. klijavau plyteles: 5 val. virtuvėje,
 * 4 val. vonioje" — an item that is nothing but a time and a place phrase
 * describes where the header's work happened, not a second kind of work.
 * Measured over 238 locative place phrases (lt / en / ru / nl / de): about
 * fifty of them are ALSO lexicon needles for a trade (kitchen → cooking,
 * warehouse, factory, garden, stable, till, roof, barbershop …), so the
 * tiler's 5 h in the kitchen were 5 h of cooking on both the intake and
 * the recognition side. The rule is structural — the shape of the phrase,
 * never a list of banned place words:
 *   - after the time tokens (and an optional bare work verb, which names no
 *     trade) only letters remain, one to four words;
 *   - LT: a place preposition + one or two words ("ant stogo", "prie
 *     kasos"), or a locative noun — every LT locative ends in -e
 *     ("virtuvėje", "sandėlyje", "salone", "namuose") — alone or behind one
 *     genitive modifier ("sporto salėje", "mokyklos virtuvėje"). A verb
 *     form ("glaisčiau", "klijavome") is never a place, so an item that
 *     names its own work keeps its own reading;
 *   - EN / RU / NL / DE: a place preposition, an optional article, one to
 *     three words ("in the kitchen", «на складе», "in de keuken", "im
 *     Lager", "at the till", "on site").
 * Only the two stated-total rules read this (the extractor's inheritance
 * and the recognition side's lane 4c): a bare place item with NO header —
 * "Dirbau virtuvėje 5 val." — is untouched, because nothing else says what
 * was done there.
 */
export function describesWhereOnly(phrase: string): boolean {
  const words = phrase
    .replace(/[.,;:!?]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .filter((w) => !isTimeToken(w, WHERE_IDIOM_TOKENS));
  if (words.length === 0) return false;
  if (words.some((w) => !/^\p{L}+$/u.test(w))) return false;
  if (GENERIC_WORK_VERB_RX.test(words[0])) words.shift();
  if (words.length === 0 || words.length > 4) return false;
  const [first, ...tail] = words;
  const last = words[words.length - 1];

  // EN / RU / NL / DE: preposition-led phrase.
  const en = /^(?:in|at|on|inside|outside)$/u;
  const ru = /^(?:в|во|на|у)$/u;
  const nl = /^(?:in|op|bij|achter|aan)$/u;
  const de1 = /^(?:im|am|beim)$/u;
  const de2 = /^(?:in|an|auf|bei)$/u;
  if (en.test(first) || ru.test(first) || nl.test(first) || de1.test(first)) {
    const rest = tail.filter((w, i) => !(i === 0 && /^(?:the|a|an|de|het|een)$/u.test(w)));
    return rest.length >= 1 && rest.length <= 3;
  }
  if (de2.test(first) && tail.length >= 2 && /^(?:der|den|dem)$/u.test(tail[0])) {
    return tail.length - 1 <= 3;
  }

  // LT: preposition + noun, or a locative noun with at most one modifier.
  if (LT_PLACE_PREPOSITION_RX.test(first)) {
    return tail.length >= 1 && tail.length <= 2;
  }
  if (words.length > 2) return false;
  if (last.length < 4 || !last.endsWith("e")) return false;
  if (LT_VERB_ENDING_RX.test(last)) return false;
  if (last.length >= 6 && LT_PLURAL_VERB_ENDING_RX.test(last)) return false;
  if (words.length === 2) {
    if (LT_VERB_ENDING_RX.test(first)) return false;
    if (first.length >= 6 && LT_PLURAL_VERB_ENDING_RX.test(first)) return false;
    if (!LT_GENITIVE_ENDING_RX.test(first)) return false;
  }
  return true;
}

/** Sum two duration values, normalising to minutes when one of them is in
 *  minutes (so 2h + 15min becomes 135 minutes). */
function addTimes(
  a: { value: number; unitSlug: "hours" | "minutes" | "days" },
  b: { value: number; unitSlug: "hours" | "minutes" | "days" },
): { value: number; unitSlug: "hours" | "minutes" | "days" } {
  // Days never combine with hours/minutes in journal language.
  if (a.unitSlug === "days" || b.unitSlug === "days") return a;
  const aMin = a.unitSlug === "hours" ? a.value * 60 : a.value;
  const bMin = b.unitSlug === "hours" ? b.value * 60 : b.value;
  const total = aMin + bMin;
  // Result stays in minutes whenever a fractional or sub-hour part exists.
  if (total % 60 !== 0) return { value: total, unitSlug: "minutes" };
  return { value: total / 60, unitSlug: "hours" };
}

/** Post-split fragment merge: when fragment N is purely a duration
 *  descriptor ("Dvi valandas") and fragment N+1 carries the activity
 *  ("penkiolika minučių glaiščiau sienas"), join them so the worker
 *  sees ONE card with the combined time + the right activity. Otherwise
 *  the worker would have to attach an activity to the orphan time card
 *  by hand (the v3 unknown-phrase flow). */
function mergeContinuationFragments(
  fragments: JournalFragmentSuggestion[],
): JournalFragmentSuggestion[] {
  const out: JournalFragmentSuggestion[] = [];
  let i = 0;
  while (i < fragments.length) {
    const cur = fragments[i];
    const next = fragments[i + 1];
    const curHasNoActivity =
      cur.activitySlug === null && cur.activityLabel === null;
    const curIsTimeOnly =
      cur.time !== null && curHasNoActivity && isTimeOnlyFragment(cur.rawPhrase);
    if (curIsTimeOnly && next && next.time !== null) {
      const mergedTime = addTimes(cur.time!, next.time);
      const mergedRaw = `${cur.rawPhrase} ir ${next.rawPhrase}`.trim();
      out.push({
        rawPhrase: mergedRaw,
        time: mergedTime,
        activitySlug: next.activitySlug,
        activityLabel: next.activityLabel,
        isUnknown:
          mergedTime !== null &&
          next.activitySlug === null &&
          next.activityLabel === null,
      });
      i += 2;
      continue;
    }
    out.push(cur);
    i += 1;
  }
  return out;
}

/** Minutes of a fragment time, for comparing a stated total with its items.
 *  `days` never converts (no approved workday length), so a total in days is
 *  never matched against items in hours. */
function timeInMinutes(t: {
  value: number;
  unitSlug: "hours" | "minutes" | "days";
}): number | null {
  if (t.unitSlug === "hours") return t.value * 60;
  if (t.unitSlug === "minutes") return t.value;
  return null;
}

/**
 * Take the STATED TOTAL out of the fragment list (issue #1689). A fragment is
 * the total — not one more work item — when the entry has at least two other
 * timed fragments and either:
 *   - it stood before the itemising colon ("Šiandien 9 valandas dirbau
 *     LabourMarket.ai: …", "9 val. klijavau plyteles: 5 val. virtuvėje, 4
 *     val. vonioje") — the colon says the items ARE that time. When such a
 *     header names an activity, the items that name none inherit it: the
 *     header described the work, the items described where or how; or
 *   - it names no activity and its time equals the sum of the other timed
 *     fragments ("Dirbau 9 val. 5 val. programavau, 2 val. testavau, 2 val.
 *     ieškojau partnerių" — the person restated the day, then itemised it).
 * Without a colon a timed fragment WITH an activity is always an item: "9
 * val. klijavau plyteles, 5 val. …" is work, whatever follows it. Nothing
 * here changes a figure — the total is returned beside the fragments with
 * whether the items add up.
 */
function separateStatedTotal(
  fragments: JournalFragmentSuggestion[],
  headerPhrases: ReadonlySet<string>,
): {
  fragments: JournalFragmentSuggestion[];
  statedTotal: JournalSuggestions["statedTotal"];
} {
  const timed = fragments.filter((f) => f.time !== null);
  if (timed.length < 3) return { fragments, statedTotal: null };
  const noActivity = (f: JournalFragmentSuggestion) =>
    f.activitySlug === null && f.activityLabel === null;
  const sumOthers = (self: JournalFragmentSuggestion): number | null => {
    let sum = 0;
    for (const f of timed) {
      if (f === self) continue;
      const m = timeInMinutes(f.time!);
      if (m === null) return null;
      sum += m;
    }
    return sum;
  };
  const addsUp = (f: JournalFragmentSuggestion): boolean => {
    const own = timeInMinutes(f.time!);
    const others = sumOthers(f);
    return own !== null && others !== null && Math.abs(own - others) < 1;
  };
  const header = timed.find((f) => headerPhrases.has(f.rawPhrase)) ?? null;
  const total = header ?? timed.find((f) => noActivity(f) && addsUp(f)) ?? null;
  if (!total) return { fragments, statedTotal: null };
  const inherit = header && !noActivity(header) ? header : null;
  // A timed item that names no activity inherits the header's; so does one
  // that says only WHERE ("5 val. virtuvėje" under "9 val. klijavau
  // plyteles") — the place noun's own lexicon reading (cooking) is the
  // wrong kind of work for a tiler's kitchen (`describesWhereOnly`).
  const describesHeaderWork = (f: JournalFragmentSuggestion): boolean =>
    f.time !== null && (noActivity(f) || describesWhereOnly(f.rawPhrase));
  return {
    fragments: fragments
      .filter((f) => f !== total)
      .map((f) =>
        inherit && describesHeaderWork(f)
          ? {
              ...f,
              activitySlug: inherit.activitySlug,
              activityLabel: inherit.activityLabel,
              isUnknown: false,
            }
          : f,
      ),
    statedTotal: {
      value: total.time!.value,
      unitSlug: total.time!.unitSlug,
      rawPhrase: total.rawPhrase,
      matchesFragments: addsUp(total),
    },
  };
}

/** Pick the strongest activity hint for one fragment. */
function detectActivity(
  fragment: string,
): { slug: string | null; label: string | null } {
  const f = fragment.toLowerCase();
  for (const row of ACTIVITY_HINTS_LT) {
    for (const n of row.needles) {
      if (n && f.includes(n)) {
        return { slug: row.slug, label: row.label };
      }
    }
  }
  return { slug: null, label: null };
}

/** Recognise an institution / organization mention. Returns the inflected form
 *  the worker typed (no normalisation — review-only). */
function detectInstitution(text: string): string | null {
  // Pattern 1: explicit prefix ("...universitete", "...kolegijoje",
  //   "...gimnazijoje", "...institute", "...mokykloje"). Capture the head
  //   noun + up to two preceding capitalised words (genitive constructions
  //   like "Vytauto Didžiojo universitete").
  const inst = text.match(
    /((?:[A-ZĄČĘĖĮŠŲŪŽ][\p{L}]+\s+){0,3}(?:universitet|kolegij|gimnazij|institut|mokykl|akademij)[\p{L}]*)/u,
  );
  if (inst) return inst[1].trim();
  return null;
}

/** Recognise a topic / theme mention prefixed with `tema:` / `theme:`. */
function detectTopic(text: string): string | null {
  const m = text.match(/\btema\s*:\s*([^.;\n]+?)(?=[.;\n]|$)/i);
  if (m) return m[1].trim();
  const en = text.match(/\btheme\s*:\s*([^.;\n]+?)(?=[.;\n]|$)/i);
  if (en) return en[1].trim();
  return null;
}

/**
 * Inspect a worker's free-text journal entry and return a set of structured
 * suggestions.
 */
export function extractJournalSuggestions(text: string): JournalSuggestions {
  if (!text || text.trim().length === 0) return EMPTY;
  const lower = text.toLowerCase();

  const allTimes = findAllTimes(lower);

  // 1) Legacy single-time field — first hit, else word-form.
  let time: JournalSuggestions["time"] = allTimes[0] ?? null;
  if (!time) {
    const v = detectFragmentTime(lower);
    if (v) time = v;
  }

  // 2) Quantity + unit. RU unit spellings (Cyrillic «м²», «кв.м», «шт»,
  //    «кг», «упак») ride the same regexes — same canonical unit slugs.
  let quantity: JournalSuggestions["quantity"] = null;
  const sqm = lower.match(
    /(\d+(?:[.,]\d+)?)\s*(?:m\s*2|m²|kv\.?\s*m|kvadrat|м\s*2|м²|кв\.?\s*м|квадрат)/iu,
  );
  // Distance (issue #1689, registry row 20260911130000): "320 km" / "320 км".
  // Read BEFORE plain metres — `\d+\s*m\b` never matches "km", but a
  // kilometre reading must win over any later metre figure in the sentence.
  const km = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:km\b|км(?=\s|[.,!?]|$))/iu);
  const meters =
    sqm || km
      ? null
      : lower.match(/(\d+(?:[.,]\d+)?)\s*(?:m\b(?!²)|м(?=\s|[.,!?]|$))/iu);
  const pieces = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:vnt\.?|štuk|шт\.?)/iu);
  const kg = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:kg\b|кг(?=\s|[.,!?]|$))/iu);
  const pkg = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:pakuo|упак)/iu);
  // Pallets (logistics): LT "paletės / palečių / padėklai", EN "pallets",
  // RU "паллеты / поддоны". Covers and cases have no safe textual reading —
  // they stay picker-only rather than guessed.
  const pallets = lower.match(
    /(\d+(?:[.,]\d+)?)\s*(?:pal+e[tč]|pad[ėe]kl|паллет|палет|поддон)/iu,
  );
  if (sqm) {
    const v = toNumber(sqm[1]);
    if (v !== null) quantity = { value: v, unitSlug: "square_meters" };
  } else if (km) {
    const v = toNumber(km[1]);
    if (v !== null) quantity = { value: v, unitSlug: "kilometers" };
  } else if (meters) {
    const v = toNumber(meters[1]);
    if (v !== null) quantity = { value: v, unitSlug: "meters" };
  } else if (pallets) {
    const v = toNumber(pallets[1]);
    if (v !== null) quantity = { value: v, unitSlug: "pallets" };
  } else if (pieces) {
    const v = toNumber(pieces[1]);
    if (v !== null) quantity = { value: v, unitSlug: "pieces" };
  } else if (kg) {
    const v = toNumber(kg[1]);
    if (v !== null) quantity = { value: v, unitSlug: "kilograms" };
  } else if (pkg) {
    const v = toNumber(pkg[1]);
    if (v !== null) quantity = { value: v, unitSlug: "packages" };
  }

  // 3) Skills + work direction. Tiered recognition (exact > synonym > fuzzy)
  //    on folded text — LT without diacritics, RU, EN; capped + ordered so a
  //    short entry never surfaces a broad, illogical skill cloud, and each
  //    suggestion carries a reason + confidence (Recognition v1).
  const skillSuggestions = recognizeSkills(text, RECOGNITION_LIMIT);
  const skillSlugs = skillSuggestions.map((m) => m.slug);
  const dirs = pickSlug(lower, WORK_DIRECTION_HINTS_LT);
  const workDirectionSlug = dirs[0] ?? null;

  // 4) Site name (legacy explicit-marker form).
  let siteName: string | null = null;
  const siteMatch = text.match(
    /\b(?:objekt(?:as|e)?|aikštel(?:ė|ėje|eje)|vietoj(?:e)?|adres(?:as|u))[:\s]+([A-ZĄČĘĖĮŠŲŪŽ][^.,;\n]{1,60})/iu,
  );
  if (siteMatch) siteName = siteMatch[1].trim();

  // 5) Institution and topic (v3).
  const institutionName = detectInstitution(text);
  const topic = detectTopic(text);

  // 6) Multi-fragment pass.
  const initialFragments: JournalFragmentSuggestion[] = [];
  const { parts: rawParts, headerCount } = splitFragments(text);
  // The raw phrases that stood BEFORE an itemising colon — candidates for
  // the stated total below (a header without a time is simply a fragment
  // like any other, or nothing).
  const headerPhrases = new Set(rawParts.slice(0, headerCount));
  for (const raw of rawParts) {
    const localTime = detectFragmentTime(raw);
    const activity = detectActivity(raw);
    let slug = activity.slug;
    let label = activity.label;
    // Cross-sector fallback (full-text recognition, P0): when the per-fragment
    // ACTIVITY lexicon has no match, consult the SAME capability dictionary the
    // whole entry uses (extractProfileSkillClaims). This makes the fragment
    // recogniser understand IT/web, driving, communication, gardening, heavy
    // equipment, cooking, etc. — instead of falsely showing a recognised work
    // item as "Nesuprasta / patikslinkite". Label-only (slug stays null) so no
    // fake taxonomy is invented; if the dictionary is also silent the fragment
    // legitimately stays unknown for the worker to clarify.
    if (slug === null && label === null) {
      const cap = extractProfileSkillClaims(raw)[0];
      if (cap) label = cap.label;
    }
    // Multilingual fallback (#1689, measured 2026-09-12): the activity
    // lexicon and the capability dictionary are Lithuanian-first, so "5 uur
    // getegeld" / "5 Std. Fliesen verlegt" / "5 hours tiling" carried their
    // hours with "kind of work not recognised" while the skill recognizer —
    // which reads all five routed languages — knew the work exactly. A STRONG
    // (exact / synonym) skill reading becomes the fragment's activity key; the
    // surfaces name a skill slug as they name a profession slug. Never the
    // fuzzy tier: a guess is an offer for the worker, not a kind of work.
    if (slug === null && label === null) {
      const strong = recognizeSkills(raw, 3).find(
        (m) => m.via === "exact" || m.via === "synonym",
      );
      if (strong) slug = strong.slug;
    }
    const isUnknown = localTime !== null && slug === null && label === null;
    if (localTime || slug || label) {
      initialFragments.push({
        rawPhrase: raw,
        time: localTime,
        activitySlug: slug,
        activityLabel: label,
        isUnknown,
      });
    }
  }
  // Collapse "Dvi valandas | penkiolika minučių glaiščiau sienas" into one
  // card — fragment-to-time pairing was wrong before this pass.
  // The stated total leaves the list BEFORE the continuation merge, so a
  // bare header ("9 val.: 5 val. X, 4 val. Y") can never be glued onto its
  // own first item as "9 val ir 5 val. X".
  const { fragments: items, statedTotal } = separateStatedTotal(
    initialFragments,
    headerPhrases,
  );
  const fragments = mergeContinuationFragments(items);

  // 7) Explicit named capabilities / specializations. Same dictionary as the
  //    profile composer so e.g. "lietuviškos virtuvės gamyba" surfaces BOTH
  //    the parent ("Maisto gamyba") AND the specialization, instead of being
  //    flattened to the generic parent only. Review-only, unverified (§7).
  const capabilitySuggestions = extractProfileSkillClaims(text);

  const hasAny =
    time !== null ||
    quantity !== null ||
    skillSlugs.length > 0 ||
    workDirectionSlug !== null ||
    siteName !== null ||
    institutionName !== null ||
    topic !== null ||
    fragments.length > 0 ||
    capabilitySuggestions.length > 0;

  return {
    time,
    quantity,
    skillSlugs,
    skillSuggestions,
    workDirectionSlug,
    siteName,
    institutionName,
    topic,
    fragments,
    statedTotal,
    capabilitySuggestions,
    hasAny,
  };
}
