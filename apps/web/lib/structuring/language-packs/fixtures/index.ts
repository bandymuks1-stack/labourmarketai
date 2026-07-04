/**
 * Phrase-fixture registry — one entry per recognition language. `null` means
 * the language has NO offline recognition yet (honest RED). The guards in
 * lib/guards/offline-language-pack.test.ts fail if a registered language pack
 * lacks fixtures, or if a fixture set is below the owner minimums
 * (≥15 phrases, ≥5 false-positive cases).
 */
import type { LanguageFixtures, RecognitionLanguage } from "../types";
import { LT_FIXTURES } from "./lt";
import { EN_FIXTURES } from "./en";
import { RU_FIXTURES } from "./ru";
import { NL_FIXTURES } from "./nl";
import { DE_FIXTURES } from "./de";
import { PL_FIXTURES } from "./pl";
import { LV_FIXTURES } from "./lv";
import { ET_FIXTURES } from "./et";
import { FI_FIXTURES } from "./fi";

export const LANGUAGE_FIXTURES: Readonly<
  Record<RecognitionLanguage, LanguageFixtures | null>
> = {
  lt: LT_FIXTURES,
  en: EN_FIXTURES,
  ru: RU_FIXTURES,
  nl: NL_FIXTURES,
  de: DE_FIXTURES,
  pl: PL_FIXTURES,
  lv: LV_FIXTURES,
  et: ET_FIXTURES,
  fi: FI_FIXTURES,
  // RED — no offline recognition yet (PR3C: da/no/sv).
  da: null,
  no: null,
  sv: null,
};
