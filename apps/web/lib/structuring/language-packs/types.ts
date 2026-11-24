/**
 * Offline language-pack types (owner mandate 2026-07-04: full multilingual
 * skill recognition MUST work with no internet, no cloud LLM, no remote
 * translation, no live ESCO calls).
 *
 * A language pack is pure static data — per-language needles for the SAME
 * canonical skill slugs the LT/EN/RU lexicon (../keywords.ts) already emits.
 * Packs feed the ONE existing recognizer (../skill-recognition.ts); they are
 * NOT a second skill system (doctrine §2 — one canonical structure, extended).
 *
 * Matching semantics are identical to the base lexicon: needles are folded
 * (see ../normalize) and substring-matched, so write needles in the inflected
 * forms workers actually type. Pack needles never enter the fuzzy tier —
 * fuzzy stays LT/EN/RU-only to keep the cross-language false-positive surface
 * at zero.
 */

/** Every language the product supports for offline text recognition. */
export const RECOGNITION_LANGUAGES = [
  "lt",
  "en",
  "ru",
  "nl",
  "de",
  "pl",
  "lv",
  "et",
  "fi",
  "da",
  "no",
  "sv",
] as const;
export type RecognitionLanguage = (typeof RECOGNITION_LANGUAGES)[number];

export interface SkillNeedleSet {
  /** High-confidence needles (exact tier). Folded substring match. */
  readonly exact: readonly string[];
  /** Medium-confidence curated synonym phrases (synonym tier). */
  readonly synonyms?: readonly string[];
}

export interface LanguagePack {
  readonly language: RecognitionLanguage;
  /** slug → needles. Slugs MUST already exist in SKILL_HINTS_LT (i.e. be
   *  canonically seeded) — a pack can never invent a skill (doctrine §7). */
  readonly skills: Readonly<Record<string, SkillNeedleSet>>;
}

/** One realistic worker sentence and the slugs it must / must not yield. */
export interface PhraseCase {
  readonly text: string;
  /** Slugs that MUST be recognised — and NOT via the fuzzy tier (fuzzy or
   *  display-name luck is not language coverage). */
  readonly expects: readonly string[];
  /** Slugs that must NOT be recognised alongside. */
  readonly forbids?: readonly string[];
}

/** A sentence that must NOT trigger the listed slugs (collision guard). */
export interface FalsePositiveCase {
  readonly text: string;
  readonly forbids: readonly string[];
}

export interface LanguageFixtures {
  readonly language: RecognitionLanguage;
  readonly phrases: readonly PhraseCase[];
  readonly falsePositives: readonly FalsePositiveCase[];
}

/** Guard minimums (lib/guards/offline-language-pack.test.ts). */
export const MIN_PHRASES_PER_LANGUAGE = 15;
export const MIN_FALSE_POSITIVES_PER_LANGUAGE = 5;
