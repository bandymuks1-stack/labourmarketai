import {
  SKILL_HINTS_LT,
  WORK_DIRECTION_HINTS_LT,
} from "./keywords";

/**
 * RULE-BASED suggestion extractor for a free-text work journal entry. This is
 * NOT AI — it is a small lexicon + regex pass. Suggestions are NEVER facts;
 * the worker must confirm each one before it gets persisted (§7).
 */
export type JournalSuggestions = {
  /** Detected duration in a single canonical unit (hours / days / minutes). */
  time: { value: number; unitSlug: "hours" | "days" | "minutes" } | null;
  /** Detected quantity + unit (e.g. 35 m²). */
  quantity: { value: number; unitSlug: string } | null;
  /** Canonical skill slugs the parser thinks were mentioned. */
  skillSlugs: string[];
  /** Canonical work direction slug (a profession slug). */
  workDirectionSlug: string | null;
  /** Site / location mention if the worker named one (e.g. "objektas Vilniuje"). */
  siteName: string | null;
  /** Did the parser find anything at all worth showing? */
  hasAny: boolean;
};

const EMPTY: JournalSuggestions = {
  time: null,
  quantity: null,
  skillSlugs: [],
  workDirectionSlug: null,
  siteName: null,
  hasAny: false,
};

// ── helpers ────────────────────────────────────────────────────────────────

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

// Numeric helpers — accept commas, dots, spaces (e.g. "35,5" or "1 200").
function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ── main ───────────────────────────────────────────────────────────────────

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

  // 1) Duration — hours / days / minutes. Take the FIRST clear hit so the
  // suggestion stays single-valued (worker can edit if needed).
  let time: JournalSuggestions["time"] = null;
  const hours =
    lower.match(/(\d+(?:[.,]\d+)?)\s*(?:valand[oųa][s]?|val\.?|h\b)/i);
  const days = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:dien[ąa]?[s]?|d\.?)\b/i);
  const minutes = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:minut[ėeų][s]?|min\.?)/i);
  if (hours) {
    const v = toNumber(hours[1]);
    if (v !== null) time = { value: v, unitSlug: "hours" };
  } else if (days) {
    const v = toNumber(days[1]);
    if (v !== null) time = { value: v, unitSlug: "days" };
  } else if (minutes) {
    const v = toNumber(minutes[1]);
    if (v !== null) time = { value: v, unitSlug: "minutes" };
  }

  // 2) Quantity + unit. m² / kv. m / m / vnt / kg / pakuotės.
  let quantity: JournalSuggestions["quantity"] = null;
  const sqm = lower.match(
    /(\d+(?:[.,]\d+)?)\s*(?:m\s*2|m²|kv\.?\s*m|kvadrat)/i,
  );
  const meters = sqm
    ? null
    : lower.match(/(\d+(?:[.,]\d+)?)\s*m\b(?!²)/i);
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

  // 3) Skills
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

  const hasAny =
    time !== null ||
    quantity !== null ||
    skillSlugs.length > 0 ||
    workDirectionSlug !== null ||
    siteName !== null;

  return { time, quantity, skillSlugs, workDirectionSlug, siteName, hasAny };
}
