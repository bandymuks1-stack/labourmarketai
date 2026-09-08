/**
 * LANGUAGE → WORLD STATE (W4). PURE.
 *
 * `WORLD_STATE_UX_ARCHITECTURE_V1` step 0.5.2: **the AI writes World State
 * instead of navigating.** This module is the deterministic half of that — it
 * turns a sentence into World State filter dimensions:
 *
 *   "Ieškau darbo Vokietijoje"  →  country = DE
 *   "tik su apgyvendinimu"      →  accommodation = provided_free
 *
 * No LLM. The conversation must work with the model entirely off (doctrine §7),
 * so this is weighted vocabulary matching, exactly like `intent-router.ts` — and
 * it borrows that module's Unicode word boundary rather than defining a second
 * one.
 *
 * ── ONLY DIMENSIONS THE WORLD CAN ACTUALLY HONOUR ─────────────────────────
 * The lock lists eight example dimensions (location, objectType, salary,
 * housing, language, employment, industry, radius). Only SIX of them have a
 * canonical filter over real rows today — `DiscoveryFilterState`: profession,
 * country, start, accommodation, transport, tool. Salary, language, employment
 * and radius have no filter, so this module cannot set them and does not
 * pretend to: `UNSUPPORTED_DIMENSIONS` names them, the caller says so out loud,
 * and the guard asserts the two lists never drift apart.
 *
 * A filter that silently does nothing is worse than a filter that says it does
 * not exist yet.
 *
 * ── THE VOCABULARY IS THE PERSON'S REAL WORLD ─────────────────────────────
 * Terms come from the canonical catalogues; the VALUES a dimension may take are
 * built by the caller from `collectDiscoveryFacets` over the rows the person can
 * actually see. So the AI can only filter to something that exists in their
 * world, and when they name something that does not, the caller can say which
 * values *are* there instead of returning a silent empty list.
 *
 * Every match carries `matchedText` — the words that produced it. That is the
 * WHY the owner requires: the person is always told what the AI understood.
 */

import { UNICODE_WORD_BOUNDARY } from "@/lib/conversation/intent-router";
import {
  EMPTY_DISCOVERY_FILTERS,
  type DiscoveryFilterState,
} from "@/lib/opportunities/discovery-filters";

/** The dimensions a sentence may set, and the canonical filter field each one
 *  writes. Keys are the lock's vocabulary; values are `DiscoveryFilterState`. */
export const WORLD_STATE_DIMENSIONS = {
  country: "country",
  profession: "profession",
  start: "start",
  accommodation: "accommodation",
  transport: "transport",
  tool: "tool",
  // Owner contract 2026-09-04 §4A/§15: "Where can I do an internship?" — the
  // declared opportunity type is a World State dimension the board honours.
  opportunityType: "opportunityType",
} as const satisfies Record<string, keyof DiscoveryFilterState>;

export type WorldStateDimension = keyof typeof WORLD_STATE_DIMENSIONS;

/**
 * Dimensions the owner's lock names that this product cannot filter on yet.
 * Recorded so the honesty is testable rather than remembered: the caller tells
 * the person "I cannot filter by pay yet" instead of ignoring the words.
 */
export const UNSUPPORTED_DIMENSIONS = ["salary", "language", "employment", "radius"] as const;
export type UnsupportedDimension = (typeof UNSUPPORTED_DIMENSIONS)[number];

/** One value a dimension may take, with every word that names it. */
export interface VocabularyTerm {
  readonly dimension: WorldStateDimension;
  /** The canonical value written into World State (ISO-2 code, slug, enum). */
  readonly value: string;
  /** Localized names for it, in every language the person might use. */
  readonly terms: readonly string[];
  /** False when the value is NOT present on the person's own board — the
   *  caller recognises the word but reports honestly that nothing matches. */
  readonly available: boolean;
}

export interface WorldStateMatch {
  readonly dimension: WorldStateDimension;
  readonly value: string;
  /** The exact words in the sentence that set it — shown to the person. */
  readonly matchedText: string;
  readonly available: boolean;
}

export interface WorldStateReading {
  /** Canonical filters, ready for `applyDiscoveryFilters`. Only AVAILABLE
   *  matches reach this: filtering to a value the board does not contain would
   *  produce an empty list with no explanation. */
  readonly filters: DiscoveryFilterState;
  /** Everything understood, available or not — this is the explanation. */
  readonly matches: readonly WorldStateMatch[];
  /** Recognised words for a dimension the product cannot filter on yet. */
  readonly unsupported: readonly UnsupportedDimension[];
}

/**
 * Words that name a dimension this product cannot filter on. Recognising them
 * is the point: the person said something meaningful and deserves to be told it
 * is not supported, rather than to watch it be silently dropped.
 */
const UNSUPPORTED_PATTERNS: ReadonlyArray<{
  readonly dimension: UnsupportedDimension;
  readonly re: RegExp;
}> = [
  { dimension: "salary", re: /(€|eur\b|atlyg|valand[ai]nis|per\s+hour|зарплат|оплат|gehalt|salaris|\bpay\b|\bsalary\b)/iu },
  { dimension: "language", re: /(kalb(a|ą|os|ų)|\blanguage|язык|\bsprache\b|\btaal\b)/iu },
  { dimension: "employment", re: /(etat|pilnas\s+darbo|full[-\s]?time|part[-\s]?time|ставк|vollzeit|teilzeit)/iu },
  { dimension: "radius", re: /(\bkm\b|spindul|\bradius\b|радиус|\bumkreis\b)/iu },
];

/**
 * The shortest prefix of a term that still identifies it.
 *
 * Inflected languages are the reason: the catalogue says "Vokietija" and the
 * person says "Vokietijoje"; the catalogue says "Nyderlandai" and the person
 * says "Nyderlanduose". Matching the whole word would miss every real sentence.
 * Two characters come off the end, but never below five, so short names stay
 * whole and a four-letter fragment can never match half the catalogue.
 */
export function termStem(term: string): string {
  const t = term.trim().toLowerCase();
  if (t.includes(" ")) return t; // multi-word names are matched in full
  return t.slice(0, Math.max(5, t.length - 2));
}

/** Escape a literal for use inside a RegExp. */
function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does the sentence contain this term? A stem match anchored at a word START —
 * so "Vokietijoje" matches "Vokietija", while "german" inside an unrelated word
 * cannot fire mid-token.
 */
function findTerm(haystack: string, term: string): string | null {
  const stem = termStem(term);
  if (stem.length < 3) return null;
  // Word-start boundary, then the stem, then any run of letters (the ending).
  const re = new RegExp(`${UNICODE_WORD_BOUNDARY}(${escape(stem)}[\\p{L}]*)`, "iu");
  const m = re.exec(haystack);
  return m ? m[1] : null;
}

/**
 * Read World State out of a sentence.
 *
 * One value per dimension: the LONGEST matched text wins, because a longer
 * match is the more specific reading ("Šiaurės Airija" beats "Airija"). Ties
 * keep vocabulary order, so the result is deterministic for the same inputs.
 */
export function readWorldState(
  text: string,
  vocabulary: readonly VocabularyTerm[],
): WorldStateReading {
  const sentence = (text ?? "").trim();
  if (sentence === "") {
    return { filters: EMPTY_DISCOVERY_FILTERS, matches: [], unsupported: [] };
  }

  const best = new Map<WorldStateDimension, WorldStateMatch>();
  for (const entry of vocabulary) {
    for (const term of entry.terms) {
      const matchedText = findTerm(sentence, term);
      if (!matchedText) continue;
      const current = best.get(entry.dimension);
      if (current && current.matchedText.length >= matchedText.length) continue;
      best.set(entry.dimension, {
        dimension: entry.dimension,
        value: entry.value,
        matchedText,
        available: entry.available,
      });
    }
  }

  const matches = [...best.values()];
  const filters: Record<string, string | null> = { ...EMPTY_DISCOVERY_FILTERS };
  for (const m of matches) {
    // Unavailable values are understood and reported, never applied.
    if (m.available) filters[WORLD_STATE_DIMENSIONS[m.dimension]] = m.value;
  }

  const unsupported = UNSUPPORTED_PATTERNS.filter((u) => u.re.test(sentence)).map(
    (u) => u.dimension,
  );

  return {
    filters: filters as unknown as DiscoveryFilterState,
    matches,
    unsupported,
  };
}
