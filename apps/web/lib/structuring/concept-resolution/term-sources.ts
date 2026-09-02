/**
 * TERM SOURCES — where the recognizer's needles come from.
 *
 * This is the seam that removes the language ceiling. Before it, the
 * dictionary in `../skill-recognition.ts` was assembled from three hardcoded
 * imports, so "add a language" and "write a TypeScript file of curated
 * matching data plus a fixture guard" were the same act. Now the dictionary is
 * assembled from an ORDERED LIST of sources, and a source may be data.
 *
 * THE THREE SHIPPED SOURCES, in evidence order:
 *
 *   1. `base-lexicon`   — the historic LT/EN/RU needles + curated synonyms.
 *                         Unchanged, and the ONLY fuzzy-eligible source.
 *   2. `language-packs` — the nine curated offline packs. Unchanged.
 *   3. `label-data`     — pure `ConceptLabelSet` data for ANY language code.
 *                         Zero today; this is the path languages 13–26 take.
 *
 * ORDER IS NOT PRECEDENCE. The recognizer resolves ties by evidence tier and
 * match length, not by source position, so a later source can never quietly
 * outrank a curated needle. The order exists so coverage reporting and
 * debugging read in a stable sequence.
 *
 * INVARIANTS THIS FILE KEEPS:
 *   - no source may mint a concept (doctrine §7): every slug must already be
 *     seeded in the canonical taxonomy. `assertSeededSlugs` is the check, and
 *     the guard suite runs it over every shipped source.
 *   - a new source is never fuzzy-eligible. The fuzzy tier stays base-lexicon
 *     only, because a 1-edit window across many languages multiplies
 *     collisions — measured, not assumed.
 *
 * Pure static data assembly. No IO, no network, safe in client + server.
 */
import { SKILL_HINTS_LT } from "../keywords";
import { SKILL_SYNONYMS } from "../synonyms";
import { LANGUAGE_PACKS, BASE_LEXICON_LANGUAGES } from "../language-packs";
import { CONCEPT_LABEL_SETS } from "./labels";
import type { ConceptLabelSet, ConceptLanguage, ConceptTerm, ConceptTermSource } from "./types";

/**
 * The sentinel language of the historic base lexicon.
 *
 * Its rows interleave Lithuanian, English and Russian without per-needle
 * attribution. Splitting them would be curation presented as measurement, so
 * they carry one honest label and the SOURCE declares the three languages it
 * reaches.
 */
export const BASE_LEXICON_LANGUAGE: ConceptLanguage = "base";

/** Every canonical slug the seeded taxonomy knows, from the base lexicon. */
export function seededSlugs(): ReadonlySet<string> {
  return new Set(SKILL_HINTS_LT.map((r) => r.slug));
}

const baseLexiconSource: ConceptTermSource = {
  id: "base-lexicon",
  provenance: "curated LT/EN/RU needles + synonym sets (lib/structuring/keywords.ts, synonyms.ts)",
  languages: BASE_LEXICON_LANGUAGES,
  terms: () => {
    const out: ConceptTerm[] = [];
    for (const row of SKILL_HINTS_LT) {
      for (const n of row.needles) {
        out.push({
          slug: row.slug,
          term: n,
          tier: "exact",
          language: BASE_LEXICON_LANGUAGE,
          // The historic fuzzy source, and deliberately the only one.
          fuzzyEligible: true,
        });
      }
    }
    for (const [slug, phrases] of Object.entries(SKILL_SYNONYMS)) {
      for (const p of phrases) {
        out.push({
          slug,
          term: p,
          tier: "synonym",
          language: BASE_LEXICON_LANGUAGE,
          fuzzyEligible: true,
        });
      }
    }
    return out;
  },
};

const languagePackSource: ConceptTermSource = {
  id: "language-packs",
  provenance: "curated offline packs (lib/structuring/language-packs/), owner mandate 2026-07-04",
  languages: LANGUAGE_PACKS.map((p) => p.language),
  terms: () => {
    const out: ConceptTerm[] = [];
    for (const pack of LANGUAGE_PACKS) {
      for (const [slug, set] of Object.entries(pack.skills)) {
        for (const n of set.exact) {
          out.push({ slug, term: n, tier: "exact", language: pack.language, fuzzyEligible: false });
        }
        for (const p of set.synonyms ?? []) {
          out.push({ slug, term: p, tier: "synonym", language: pack.language, fuzzyEligible: false });
        }
      }
    }
    return out;
  },
};

/** Build a term source from pure label data — the data path for a new language. */
export function labelSetSource(sets: readonly ConceptLabelSet[]): ConceptTermSource {
  return {
    id: "label-data",
    provenance:
      sets.length === 0
        ? "no label sets registered yet"
        : sets.map((s) => `${s.language}: ${s.provenance}`).join(" · "),
    languages: sets.map((s) => s.language),
    terms: () => {
      const out: ConceptTerm[] = [];
      for (const set of sets) {
        for (const [slug, labels] of Object.entries(set.labels)) {
          for (const n of labels.exact) {
            out.push({ slug, term: n, tier: "exact", language: set.language, fuzzyEligible: false });
          }
          for (const p of labels.synonyms ?? []) {
            out.push({ slug, term: p, tier: "synonym", language: set.language, fuzzyEligible: false });
          }
        }
      }
      return out;
    },
  };
}

/** The shipped sources, in stable order. */
export const CONCEPT_TERM_SOURCES: readonly ConceptTermSource[] = [
  baseLexiconSource,
  languagePackSource,
  labelSetSource(CONCEPT_LABEL_SETS),
];

/**
 * Every term from every source, flattened.
 *
 * `sources` is injectable for the same reason the egress grant table is: a
 * seam whose only live subject set is the three shipped sources is
 * indistinguishable from a seam that does not work. A test proves a NEW
 * language reaches the dictionary by passing one in — and proves the negative
 * control by leaving it out.
 */
export function conceptTerms(
  sources: readonly ConceptTermSource[] = CONCEPT_TERM_SOURCES,
): readonly ConceptTerm[] {
  return sources.flatMap((s) => s.terms());
}

/**
 * Slugs a source emits that the canonical taxonomy does not know.
 *
 * Empty is the only acceptable answer for a shipped source. A source that
 * names an unseeded concept would be inventing a capability, which is exactly
 * what doctrine §7 forbids — so this returns the offenders rather than a
 * boolean, to make the failure legible.
 */
export function unseededSlugsIn(source: ConceptTermSource): readonly string[] {
  const seeded = seededSlugs();
  const bad = new Set<string>();
  for (const t of source.terms()) if (!seeded.has(t.slug)) bad.add(t.slug);
  return [...bad].sort();
}
