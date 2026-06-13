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
  skillSuggestions: [],
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
  const hoursRe =
    /(\d+(?:[.,]\d+)?)\s*(?:valand[\p{L}]*|val\.?|h\b|час[\p{L}]*|ч\.?(?=\s|[.,!?]|$))/giu;
  const daysRe =
    /(\d+(?:[.,]\d+)?)\s*(?:dien[\p{L}]*\b|d\.?\b|дн[\p{L}]*|день)/giu;
  const minutesRe =
    /(\d+(?:[.,]\d+)?)\s*(?:minu[čt][\p{L}]*|min\.?|мин[\p{L}]*\.?)/giu;
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
  const digitHourMatch = f.match(
    /(\d+(?:[.,]\d+)?)\s*(?:valand[\p{L}]*|val\.?|h\b|час[\p{L}]*|ч\.?(?=\s|[.,!?]|$))/u,
  );
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
  const digitMinMatch = f.match(
    /(\d+(?:[.,]\d+)?)\s*(?:minu[čt][\p{L}]*|min\.?|мин[\p{L}]*\.?)/u,
  );
  if (digitMinMatch) minutes = toNumber(digitMinMatch[1]);
  if (minutes === null) minutes = detectMinutesWord(f);

  // Days contribution (only used when no hours/minutes present — days don't
  // compound with sub-hour units in journal language).
  if (hours === null && minutes === null) {
    let days: number | null = null;
    const digitDayMatch = f.match(
      /(\d+(?:[.,]\d+)?)\s*(?:dien[\p{L}]*|d\.?|дн[\p{L}]*|день)/u,
    );
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
  // RU «и» joins work items the same way LT "ir"/"bei" do.
  const normalized = text
    .replace(/\r/g, "")
    .replace(/,\s*(ir|bei|и)\s+/gi, " | ")
    .replace(/\s+(ir|bei|и)\s+/gi, " | ");
  // Do not split on plain commas if the next chunk introduces a `tema:`
  // (theme) qualifier — the theme is metadata for the previous fragment,
  // not a new fragment. We protect it with a placeholder first.
  const protectedText = normalized.replace(/,\s*(tema\s*:)/giu, " ##TEMA## $1");
  return protectedText
    .split(/[.;!?\n|,]+/)
    .map((s) => s.replace(/##TEMA##/g, ",").trim())
    .filter((s) => s.length > 0);
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
    if (/^\d+(?:[.,]\d+)?$/.test(w)) continue;
    if (/^valand[\p{L}]*$/u.test(w)) continue;
    if (/^minu[čt][\p{L}]*$/u.test(w)) continue;
    if (/^dien[\p{L}]*$/u.test(w)) continue;
    // RU duration nouns: час/часа/часов, мин/минут, дн/дня/дней, день, ч.
    if (/^час[\p{L}]*$/u.test(w)) continue;
    if (/^мин[\p{L}]*$/u.test(w)) continue;
    if (/^дн[\p{L}]*$/u.test(w)) continue;
    if (/^день$/u.test(w)) continue;
    if (/^ч\.?$/u.test(w)) continue;
    if (TIME_TOKENS.has(w)) continue;
    return false;
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
  const meters = sqm
    ? null
    : lower.match(/(\d+(?:[.,]\d+)?)\s*(?:m\b(?!²)|м(?=\s|[.,!?]|$))/iu);
  const pieces = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:vnt\.?|štuk|шт\.?)/iu);
  const kg = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:kg\b|кг(?=\s|[.,!?]|$))/iu);
  const pkg = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:pakuo|упак)/iu);
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
  const rawParts = splitFragments(text);
  for (const raw of rawParts) {
    const localTime = detectFragmentTime(raw);
    const { slug, label } = detectActivity(raw);
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
  const fragments = mergeContinuationFragments(initialFragments);

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
    skillSuggestions,
    workDirectionSlug,
    siteName,
    institutionName,
    topic,
    fragments,
    hasAny,
  };
}
