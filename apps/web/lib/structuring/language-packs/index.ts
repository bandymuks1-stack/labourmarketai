/**
 * Offline language-pack registry (owner mandate 2026-07-04).
 *
 * Every pack listed here is merged into the ONE recognizer dictionary
 * (../skill-recognition.ts TERMS) at module init — static data, no I/O, no
 * network, safe in client and server bundles. LT/EN/RU needles live in the
 * base lexicon (../keywords.ts / ../synonyms.ts), NOT here — packs cover the
 * remaining product languages.
 *
 * Registering a pack immediately subjects it to the guards in
 * lib/guards/offline-language-pack.test.ts (core-slug coverage, fixture
 * minimums, seeded-slug-only, offline proof).
 */
import type { LanguagePack, RecognitionLanguage } from "./types";
import { NL_PACK } from "./nl";
import { DE_PACK } from "./de";
import { PL_PACK } from "./pl";
import { LV_PACK } from "./lv";
import { ET_PACK } from "./et";
import { FI_PACK } from "./fi";
import { DA_PACK } from "./da";
import { NO_PACK } from "./no";
import { SV_PACK } from "./sv";

export const LANGUAGE_PACKS: readonly LanguagePack[] = [
  NL_PACK,
  DE_PACK,
  PL_PACK,
  LV_PACK,
  ET_PACK,
  FI_PACK,
  DA_PACK,
  NO_PACK,
  SV_PACK,
];

/** Languages whose needles live in the base lexicon, not in a pack. */
export const BASE_LEXICON_LANGUAGES: readonly RecognitionLanguage[] = ["lt", "en", "ru"];

/** All languages with real offline recognition coverage right now. */
export const COVERED_RECOGNITION_LANGUAGES: readonly RecognitionLanguage[] = [
  ...BASE_LEXICON_LANGUAGES,
  ...LANGUAGE_PACKS.map((p) => p.language),
];
