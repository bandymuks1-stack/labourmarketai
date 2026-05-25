import {
  SKILL_HINTS_LT,
  WORK_DIRECTION_HINTS_LT,
  ACTIVITY_HINTS_LT,
} from "./keywords";

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
  /** Canonical skill slugs the parser thinks were mentioned. */
  skillSlugs: string[];
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

const EMPTY: JournalSuggestions = {
  time: null,
  quantity: null,
  skillSlugs: [],
  workDirectionSlug: null,
  siteName: null,
  institutionName: null,
  topic: null,
  fragments: [],
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

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Match every hours/minutes/days mention in the text, returning normalized
 *  values. */
function findAllTimes(
  lower: string,
): { value: number; unitSlug: "hours" | "days" | "minutes" }[] {
  const out: { value: number; unitSlug: "hours" | "days" | "minutes" }[] = [];
  const hoursRe = /(\d+(?:[.,]\d+)?)\s*(?:valand[\p{L}]*|val\.?|h\b)/giu;
  const daysRe = /(\d+(?:[.,]\d+)?)\s*(?:dien[\p{L}]*|d\.?)\b/giu;
  const minutesRe = /(\d+(?:[.,]\d+)?)\s*(?:minu[čt][\p{L}]*|min\.?)/giu;
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
  return null;
}

/** Recognise a minutes-as-words mention. */
function detectMinutesWord(f: string): number | null {
  const keys = numberWordKeysAlternation();
  const m = new RegExp(
    `(?:^|[^\\p{L}])(${keys})\\s+minu[čt][\\p{L}]*(?=\\s|[.,!?]|$)`,
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
  const digitHourMatch = f.match(/(\d+(?:[.,]\d+)?)\s*(?:valand[\p{L}]*|val\.?|h\b)/u);
  if (digitHourMatch) hours = toNumber(digitHourMatch[1]);
  if (hours === null) hours = detectHoursWord(f);

  // "su puse" = "and a half" — adds 0.5h to the hours we already have.
  if (hours !== null && /\s+su\s+puse/.test(f)) {
    hours = hours + 0.5;
  } else if (hours === null && /\s+su\s+puse/.test(f)) {
    // "valandą su puse" already detected via detectHoursWord (= 1) plus +0.5;
    // but if hours is still null, default to 1.5.
    hours = 1.5;
  }

  // Minutes contribution.
  let minutes: number | null = null;
  const digitMinMatch = f.match(/(\d+(?:[.,]\d+)?)\s*(?:minu[čt][\p{L}]*|min\.?)/u);
  if (digitMinMatch) minutes = toNumber(digitMinMatch[1]);
  if (minutes === null) minutes = detectMinutesWord(f);

  // Days contribution (only used when no hours/minutes present — days don't
  // compound with sub-hour units in journal language).
  if (hours === null && minutes === null) {
    let days: number | null = null;
    const digitDayMatch = f.match(/(\d+(?:[.,]\d+)?)\s*(?:dien[\p{L}]*|d\.?)/u);
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

/** Split a free-text entry into discrete work fragments. */
function splitFragments(text: string): string[] {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/,\s*(ir|bei)\s+/gi, " | ")
    .replace(/\s+(ir|bei)\s+/gi, " | ");
  // Do not split on plain commas if the next chunk introduces a `tema:`
  // (theme) qualifier — the theme is metadata for the previous fragment,
  // not a new fragment. We protect it with a placeholder first.
  const protectedText = normalized.replace(/,\s*(tema\s*:)/giu, " ##TEMA## $1");
  return protectedText
    .split(/[.;!?\n|,]+/)
    .map((s) => s.replace(/##TEMA##/g, ",").trim())
    .filter((s) => s.length > 0);
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

  // 2) Quantity + unit.
  let quantity: JournalSuggestions["quantity"] = null;
  const sqm = lower.match(
    /(\d+(?:[.,]\d+)?)\s*(?:m\s*2|m²|kv\.?\s*m|kvadrat)/i,
  );
  const meters = sqm ? null : lower.match(/(\d+(?:[.,]\d+)?)\s*m\b(?!²)/i);
  const pieces = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:vnt\.?|štuk)/i);
  const kg = lower.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  const pkg = lower.match(/(\d+(?:[.,]\d+)?)\s*pakuo/i);
  if (sqm) {
    const v = toNumber(sqm[1]);
    if (v !== null) quantity = { value: v, unitSlug: "square_meters" };
  } else if (meters) {
    const v = toNumber(meters[1]);
    if (v !== null) quantity = { value: v, unitSlug: "meters" };
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

  // 3) Skills + work direction.
  const skillSlugs = pickSlug(lower, SKILL_HINTS_LT);
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
  const fragments: JournalFragmentSuggestion[] = [];
  const rawParts = splitFragments(text);
  for (const raw of rawParts) {
    const localTime = detectFragmentTime(raw);
    const { slug, label } = detectActivity(raw);
    const isUnknown = localTime !== null && slug === null && label === null;
    if (localTime || slug || label) {
      fragments.push({
        rawPhrase: raw,
        time: localTime,
        activitySlug: slug,
        activityLabel: label,
        isUnknown,
      });
    }
  }

  const hasAny =
    time !== null ||
    quantity !== null ||
    skillSlugs.length > 0 ||
    workDirectionSlug !== null ||
    siteName !== null ||
    institutionName !== null ||
    topic !== null ||
    fragments.length > 0;

  return {
    time,
    quantity,
    skillSlugs,
    workDirectionSlug,
    siteName,
    institutionName,
    topic,
    fragments,
    hasAny,
  };
}
