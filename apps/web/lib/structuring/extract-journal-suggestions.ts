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
};

const EMPTY: JournalSuggestions = {
  time: null,
  quantity: null,
  skillSlugs: [],
  workDirectionSlug: null,
  siteName: null,
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
 *  values. Used to break the legacy "first match only" parser and let the
 *  caller see how many time fragments exist. */
function findAllTimes(
  lower: string,
): { value: number; unitSlug: "hours" | "days" | "minutes" }[] {
  const out: { value: number; unitSlug: "hours" | "days" | "minutes" }[] = [];
  const hoursRe =
    /(\d+(?:[.,]\d+)?)\s*(?:valand[oųa][s]?|val\.?|h\b)/gi;
  const daysRe = /(\d+(?:[.,]\d+)?)\s*(?:dien[ąa]?[s]?|d\.?)\b/gi;
  const minutesRe = /(\d+(?:[.,]\d+)?)\s*(?:minut[ėeų][s]?|min\.?)/gi;
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

/** Single-hour word forms — "valandą", "vieną valandą", "pusvalandį",
 *  "pusę valandos". Digitless, so the numeric regex misses them.
 *
 *  JS `\b` is ASCII-only and breaks on Lithuanian characters (`ą`, `ę`, etc.)
 *  — every boundary here uses explicit non-letter lookaround instead. */
function detectWordHours(
  fragment: string,
): { value: number; unitSlug: "hours" } | null {
  const f = fragment.toLowerCase();
  if (/(?:^|\s)vieną\s+valand[ąoų]/.test(f)) {
    return { value: 1, unitSlug: "hours" };
  }
  if (/(?:^|\s)pusvaland[įio]/.test(f)) {
    return { value: 0.5, unitSlug: "hours" };
  }
  if (/(?:^|\s)pusę\s+valandos(?=\s|[.,!?]|$)/.test(f)) {
    return { value: 0.5, unitSlug: "hours" };
  }
  // Bare "valandą" / "valando" / "valandų" with no preceding digit.
  if (
    /(?:^|[^\d])valand[ąoų](?=\s|[.,!?]|$)/.test(f) &&
    !/\d\s*valand/.test(f)
  ) {
    return { value: 1, unitSlug: "hours" };
  }
  return null;
}

/** Split a free-text entry into discrete work fragments. Splitters:
 *  - sentence terminators (`.` `;` `!` `?`)
 *  - comma + `ir|bei` (e.g. "..., ir 5 valandas ...")
 *  - bare `ir`/`bei` between two time-bearing clauses. */
function splitFragments(text: string): string[] {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/,\s*(ir|bei)\s+/gi, " | ")
    .replace(/\s+(ir|bei)\s+/gi, " | ");
  return normalized
    .split(/[.;!?\n|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Pick the strongest activity hint for one fragment. Returns slug + LT label
 *  when matched. When wording is recognizably "work" but no slug is in the
 *  taxonomy (e.g. cashier), returns a label only — surfaced as a review-only
 *  free-text suggestion (no fake taxonomy entry). */
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

/**
 * Inspect a worker's free-text journal entry and return a set of structured
 * suggestions. The caller is expected to render these as proposals next to
 * confirm / edit / discard actions.
 *
 * Supports LT input for M1; other locales fall back to numbers + skill hints
 * only and will be expanded as we add localized dictionaries.
 */
export function extractJournalSuggestions(text: string): JournalSuggestions {
  if (!text || text.trim().length === 0) return EMPTY;
  const lower = text.toLowerCase();

  const allTimes = findAllTimes(lower);

  // 1) Legacy single-time field — first numeric hit, else first word-form hit.
  let time: JournalSuggestions["time"] = allTimes[0] ?? null;
  if (!time) {
    time = detectWordHours(lower);
  }

  // 2) Quantity + unit. m² / kv. m / m / vnt / kg / pakuotės.
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

  // 3) Skills (whole-text scan — multi-fragment text often shares context).
  const skillSlugs = pickSlug(lower, SKILL_HINTS_LT);

  // 4) Work direction (one — the first matching profession-ish bucket).
  const dirs = pickSlug(lower, WORK_DIRECTION_HINTS_LT);
  const workDirectionSlug = dirs[0] ?? null;

  // 5) Site name — only when clearly marked (avoids hallucinated locations).
  let siteName: string | null = null;
  const siteMatch = text.match(
    /\b(?:objekt(?:as|e)?|aikštel(?:ė|ėje|eje)|vietoj(?:e)?|adres(?:as|u))[:\s]+([A-ZĄČĘĖĮŠŲŪŽ][^.,;\n]{1,60})/iu,
  );
  if (siteMatch) siteName = siteMatch[1].trim();

  // 6) Multi-fragment pass — only when the worker logged more than one work
  //    item in the same entry. Each fragment gets its own time + activity.
  const fragments: JournalFragmentSuggestion[] = [];
  const rawParts = splitFragments(text);
  for (const raw of rawParts) {
    const lowerRaw = raw.toLowerCase();
    const localTimes = findAllTimes(lowerRaw);
    const localTime = localTimes[0] ?? detectWordHours(raw);
    const { slug, label } = detectActivity(raw);
    if (localTime || slug || label) {
      fragments.push({
        rawPhrase: raw,
        time: localTime,
        activitySlug: slug,
        activityLabel: label,
      });
    }
  }

  const hasAny =
    time !== null ||
    quantity !== null ||
    skillSlugs.length > 0 ||
    workDirectionSlug !== null ||
    siteName !== null ||
    fragments.length > 0;

  return {
    time,
    quantity,
    skillSlugs,
    workDirectionSlug,
    siteName,
    fragments,
    hasAny,
  };
}
