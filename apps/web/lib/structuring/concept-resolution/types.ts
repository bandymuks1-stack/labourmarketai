/**
 * CONCEPT RESOLUTION — the named seam between a human expression and a
 * canonical concept (LANGUAGE_MATRIX §4.1 step 2).
 *
 * WHY THIS EXISTS. Recognition worked, and it worked in twelve languages, but
 * a hand-written needle pack was the ONLY implementation of
 * `expression → concept`. That is not a translation gap, it is an
 * architectural ceiling: every new language cost ~235 lines of curated code
 * plus its own fixture guard, so languages 13–26 were priced out by the
 * design rather than by the work. Nothing else could ever answer the
 * question, because nothing else was callable.
 *
 * This file makes the question callable independently of who answers it:
 *
 *   language-specific expression
 *     → [ term sources ]  deterministic lexical resolution (packs + label data)
 *     → [ resolvers ]     any future answer: ESCO labels, dictionaries,
 *                         embeddings, the AI router — added, never swapped in
 *     → CANONICAL CONCEPT (slug — language-independent)
 *
 * TWO SEAMS, DELIBERATELY. They answer different questions and a single one
 * would have collapsed them:
 *
 *   `ConceptTermSource` — WHERE DO THE NEEDLES COME FROM. It feeds the one
 *     existing recognizer dictionary. A source may be code (the curated packs,
 *     unchanged) or DATA (a label set for any language code). This is the seam
 *     that removes the ceiling: a thirteenth language becomes rows, not a file
 *     of hand-written matching logic.
 *
 *   `ConceptResolver` — WHO ANSWERS. The lexicon resolver is the first and
 *     default one and its behaviour is unchanged byte for byte. A semantic
 *     resolver added later joins the list; it does not replace the
 *     deterministic path, because doctrine I-7 requires matching to work with
 *     no generative AI at all.
 *
 * WHAT THIS DOES NOT DO, ON PURPOSE. It does not invent a second skill
 * system (doctrine §2): every source and every resolver emits the SAME
 * canonical slug the seeded taxonomy already uses, and none of them may mint
 * a concept that is not already seeded. It does not change a single
 * recognition result today — the no-loss guard pins that.
 *
 * Pure types. No IO, no env, safe in client and server bundles.
 */

/**
 * A language code a concept may be expressed in.
 *
 * DELIBERATELY AN OPEN STRING, not a union of the languages that happen to
 * have coverage today. The closed 12-member tuple in `../language-packs/types`
 * was a type-level statement that no other language exists, and it had to be
 * edited before a Georgian label could even be REPRESENTED. Coverage is a
 * measured property of the data (see `conceptLanguageCoverage`), never a
 * property of the type — so a language with zero terms is honestly reported
 * as zero rather than being unspeakable.
 */
export type ConceptLanguage = string;

/** Evidence tier of a lexical match. Mirrors the recognizer's own vocabulary. */
export type ConceptMatchTier = "exact" | "synonym" | "fuzzy";

/**
 * One folded-matchable expression of one canonical concept.
 *
 * `fuzzyEligible` is carried, not derived: the fuzzy tier is base-lexicon-only
 * (LT/EN/RU) because a 1-edit window across twelve languages multiplies
 * collisions — a measured finding, not a preference. A new source is NEVER
 * fuzzy-eligible by default; opting in is an explicit, reviewable act.
 */
export interface ConceptTerm {
  /** Canonical, language-independent concept id. Must already be seeded. */
  readonly slug: string;
  /** The needle, as authored. Folding happens in the recognizer. */
  readonly term: string;
  readonly tier: Exclude<ConceptMatchTier, "fuzzy">;
  readonly language: ConceptLanguage;
  /** May this term seed the light-fuzzy tier? Default false for new sources. */
  readonly fuzzyEligible: boolean;
}

/**
 * A contributor of terms to the ONE recognizer dictionary.
 *
 * `id` is stable and appears in coverage reporting, so an operator can see
 * WHICH source gave a language its reach — curated code or imported data.
 */
export interface ConceptTermSource {
  readonly id: string;
  /** Human-readable provenance: who curated this, from what, when. */
  readonly provenance: string;
  /**
   * The languages this source CLAIMS to cover.
   *
   * Declared rather than derived, because one source legitimately covers
   * several: the historic base lexicon interleaves Lithuanian, English and
   * Russian needles in the same rows and no per-needle attribution exists for
   * it. Inventing one would be a curated claim dressed as a measurement, so
   * the source states its reach and `conceptLanguageCoverage` reports the
   * claim and the term count side by side.
   */
  readonly languages: readonly ConceptLanguage[];
  readonly terms: () => readonly ConceptTerm[];
}

/**
 * A pure label set for one language — the DATA shape that replaces a
 * hand-written pack.
 *
 * `slug → { exact, synonyms }`, exactly the pack shape, minus the code. An
 * ESCO import, a curated spreadsheet and a translator's deliverable all
 * produce this without touching TypeScript logic.
 */
export interface ConceptLabelSet {
  readonly language: ConceptLanguage;
  /** Where these labels came from. Rendered in coverage reports. */
  readonly provenance: string;
  readonly labels: Readonly<
    Record<string, { readonly exact: readonly string[]; readonly synonyms?: readonly string[] }>
  >;
}

/** A concept a resolver recognised in the text, with its evidence. */
export interface ResolvedConcept {
  readonly slug: string;
  readonly tier: ConceptMatchTier;
  readonly confidence: "high" | "medium" | "low";
  /** What in the user's own text triggered it — never a fabricated reason. */
  readonly matchedText: string;
  /** Which resolver answered. */
  readonly resolver: string;
}

export interface ResolveOptions {
  readonly limit?: number;
  /**
   * The language the text is believed to be in, when known.
   *
   * OPTIONAL BY DESIGN. The deterministic lexicon is language-blind — one
   * folded dictionary, all languages at once — which is why a worker may mix
   * Lithuanian and English in one sentence and still be understood. A resolver
   * that DOES need the language (a translation or embedding tier) reads it
   * here; passing it must never narrow the lexical path.
   */
  readonly language?: ConceptLanguage;
}

/** Whoever can answer `expression → concept`. */
export interface ConceptResolver {
  readonly id: string;
  /**
   * True when this resolver can say anything at all about this input. A
   * resolver that cannot must say so rather than return an empty list, so
   * "nothing matched" and "nobody could look" stay different answers.
   */
  readonly canResolve: (text: string, opts: ResolveOptions) => boolean;
  readonly resolve: (text: string, opts: ResolveOptions) => readonly ResolvedConcept[];
}
