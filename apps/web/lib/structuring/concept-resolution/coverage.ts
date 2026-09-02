/**
 * LANGUAGE COVERAGE — measured from the terms that exist, never declared.
 *
 * `LANGUAGE_MATRIX.md` exists because the product kept describing itself by
 * counting FILES: eleven locale catalogs read as eleven languages while five
 * routed and three had transversal recognition. The same mistake was available
 * one layer down — `RECOGNITION_LANGUAGES` was a hand-maintained tuple, so a
 * language was "supported" the moment somebody typed its code into an array.
 *
 * This module answers the question from the dictionary instead: how many terms
 * does this language actually contribute, and from which source. A registered
 * language with no labels reports zero, which is the honest reading of
 * Georgian today.
 *
 * Pure. No IO.
 */
import { CONCEPT_TERM_SOURCES, BASE_LEXICON_LANGUAGE } from "./term-sources";
import type { ConceptLanguage, ConceptTermSource } from "./types";

export interface LanguageCoverage {
  readonly language: ConceptLanguage;
  /** Terms reaching the dictionary for this language. Zero is a real answer. */
  readonly termCount: number;
  /** How many canonical concepts this language can express at all. */
  readonly conceptCount: number;
  /** Source ids that contribute to it. */
  readonly sources: readonly string[];
  /**
   * True only when the language contributes at least one term.
   *
   * The distinction registration/coverage is the one this file exists to keep:
   * a language may be REPRESENTABLE (the architecture no longer excludes it)
   * while being entirely UNCOVERED (nobody has curated its labels yet).
   */
  readonly covered: boolean;
}

/**
 * Per-language coverage across every source.
 *
 * The base lexicon's rows interleave LT/EN/RU with no per-needle attribution,
 * so its terms are attributed to every language that source DECLARES rather
 * than split by a guess. That over-states none of them: the needles really are
 * reachable from all three, which is exactly why the recognizer is language-
 * blind at match time.
 */
export function conceptLanguageCoverage(
  sources: readonly ConceptTermSource[] = CONCEPT_TERM_SOURCES,
): readonly LanguageCoverage[] {
  const terms = new Map<ConceptLanguage, { count: number; slugs: Set<string>; src: Set<string> }>();
  const touch = (lang: ConceptLanguage) => {
    let e = terms.get(lang);
    if (!e) {
      e = { count: 0, slugs: new Set(), src: new Set() };
      terms.set(lang, e);
    }
    return e;
  };

  for (const source of sources) {
    // Every declared language gets an entry even when it contributes nothing —
    // an uncovered language must appear in the report as zero, not vanish from
    // it. A language that is missing from the report cannot be prioritised.
    for (const lang of source.languages) touch(lang);

    for (const t of source.terms()) {
      const langs =
        t.language === BASE_LEXICON_LANGUAGE ? source.languages : [t.language];
      for (const lang of langs) {
        const e = touch(lang);
        e.count += 1;
        e.slugs.add(t.slug);
        e.src.add(source.id);
      }
    }
  }

  return [...terms.entries()]
    .map(([language, e]) => ({
      language,
      termCount: e.count,
      conceptCount: e.slugs.size,
      sources: [...e.src].sort(),
      covered: e.count > 0,
    }))
    .sort((a, b) => b.termCount - a.termCount || a.language.localeCompare(b.language));
}

/** Languages that really can resolve at least one concept. */
export function coveredConceptLanguages(
  sources: readonly ConceptTermSource[] = CONCEPT_TERM_SOURCES,
): readonly ConceptLanguage[] {
  return conceptLanguageCoverage(sources)
    .filter((c) => c.covered)
    .map((c) => c.language);
}

/** Languages the architecture can represent but nobody has curated yet. */
export function registeredButUncoveredLanguages(
  sources: readonly ConceptTermSource[] = CONCEPT_TERM_SOURCES,
): readonly ConceptLanguage[] {
  return conceptLanguageCoverage(sources)
    .filter((c) => !c.covered)
    .map((c) => c.language);
}
