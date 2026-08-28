/**
 * CONCEPT LABEL SETS — the data path for a language.
 *
 * A file here is DATA, not matching logic: `slug → { exact, synonyms }` for a
 * language code, plus its provenance. Registering one gives that language real
 * recognition through the existing recognizer with **no TypeScript logic, no
 * new guard file and no change to any call site** — which is the whole point of
 * the seam (LANGUAGE_MATRIX §4.1 step 2).
 *
 * WHAT BELONGS HERE. Labels with a traceable origin: an ESCO multilingual
 * label import (step 3 — this is the shape that import writes), a translator's
 * reviewed deliverable, a curated terminology list. The provenance string is
 * required because a label set with no origin is indistinguishable from a
 * guess, and a guessed needle is how a product starts over-claiming a person's
 * capabilities.
 *
 * WHAT DOES NOT. Machine-translated labels nobody reviewed, and labels for a
 * slug the canonical taxonomy has not seeded — `unseededSlugsIn` refuses those
 * (doctrine §7: a language may express a concept, never invent one).
 *
 * REGISTERING A LANGUAGE IS NOT CLAIMING IT. Coverage is measured from the
 * terms actually present (`conceptLanguageCoverage`), so a registered language
 * with no labels reports zero and reads as uncovered everywhere. That is the
 * honest state for Georgian below.
 */
import type { ConceptLabelSet } from "../types";

/**
 * Georgian / Kartvelian — an explicit owner requirement, and the largest single
 * language gap in the product (LANGUAGE_MATRIX §7.1: absent from catalogs,
 * routing, packs and recognition alike).
 *
 * It is registered here with NO labels on purpose. Registration removes the
 * ARCHITECTURAL exclusion — before this seam, `RECOGNITION_LANGUAGES` was a
 * closed twelve-member tuple and a Georgian label could not be represented in
 * the type system at all, let alone reach the dictionary. Coverage is a
 * separate, unfinished, curation-shaped problem, and filling this object is
 * the entire remaining work: no code changes with it.
 *
 * Georgian sits outside ESCO's EU language set, so step 3 of the migration
 * plan will not produce these labels as a side effect. They need their own
 * sourced curation pass — recorded so it is never silently assumed to fall out
 * of the EU import.
 */
export const KA_LABELS: ConceptLabelSet = {
  language: "ka",
  provenance:
    "AWAITING CURATION — registered so Georgian is representable; no labels are claimed, and coverage reports 0",
  labels: {},
};

/**
 * The registered label sets.
 *
 * Everything here is merged into the ONE recognizer dictionary through
 * `labelSetSource`. Adding a language means adding a file and one line.
 */
export const CONCEPT_LABEL_SETS: readonly ConceptLabelSet[] = [KA_LABELS];
