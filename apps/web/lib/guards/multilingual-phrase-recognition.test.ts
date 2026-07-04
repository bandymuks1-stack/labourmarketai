/**
 * Multilingual realistic-phrase recognition guard (owner mandate 2026-07-04).
 *
 * Fixtures are REAL worker sentences — the owner's mandatory LT phrase pack
 * plus EN and RU equivalents for the same labour-market families. Every
 * expectation was MEASURED against the recognizer (probe run 2026-07-04),
 * then pinned. The fixture DATA now lives in
 * lib/structuring/language-packs/fixtures/{lt,en,ru}.ts (offline language-pack
 * registry) — moved verbatim, every case still runs here, and the unified
 * offline guard (offline-phrase-recognition.test.ts) additionally requires
 * non-fuzzy matches. This guard is the proof line between:
 *   - "locale translated"        → messages/{locale}/skill-names.json only
 *   - "recognized from real text" → what the fixture packs prove
 *   - "installed in DB"           → seed migrations / installation-chain guard
 *   - "usable as evidence"        → journal/profile flows + worker_skills
 *
 * KNOWN-GAP cases are pinned as recognising NOTHING on purpose: when someone
 * adds coverage, the pin fails and the coverage audit must be updated. Do NOT
 * delete a GAP pin to make a test pass — implement the language pack instead.
 * (2026-07-04 PR3A: NL/DE/PL pins fell exactly this way — replaced by the
 * NL/DE/PL offline packs + fixture files.)
 */
import { describe, expect, it } from "vitest";
import { recognizeSkills } from "../structuring/skill-recognition";
import { COVERED_RECOGNITION_LANGUAGES } from "../structuring/language-packs";
import { LANGUAGE_FIXTURES } from "../structuring/language-packs/fixtures";
import { LT_FIXTURES } from "../structuring/language-packs/fixtures/lt";
import { EN_FIXTURES } from "../structuring/language-packs/fixtures/en";
import { RU_FIXTURES } from "../structuring/language-packs/fixtures/ru";
import {
  RECOGNITION_LANGUAGES,
  type PhraseCase,
} from "../structuring/language-packs/types";

const slugsOf = (text: string): string[] =>
  recognizeSkills(text, 10).map((s) => s.slug);

function runPack(name: string, pack: readonly PhraseCase[]) {
  describe(name, () => {
    for (const c of pack) {
      it(`recognises: ${c.text}`, () => {
        const got = slugsOf(c.text);
        for (const slug of c.expects) expect(got).toContain(slug);
        for (const slug of c.forbids ?? []) expect(got).not.toContain(slug);
      });
    }
  });
}

runPack("LT phrase pack (owner mandatory list)", LT_FIXTURES.phrases);
runPack("EN phrase pack (same families)", EN_FIXTURES.phrases);
runPack("RU phrase pack (same families)", RU_FIXTURES.phrases);

describe("CANARY LIFECYCLE COMPLETE — every product language is covered", () => {
  // History of this block (each pin fell by gaining REAL coverage, exactly
  // as the canary contract demanded):
  //   wave 2      → data-entry/Excel class-E gap filled;
  //   PR3A        → NL/DE/PL canaries replaced by offline packs;
  //   PR3B        → LV/ET canaries replaced; FI covered for the first time;
  //   PR3C        → DA/NO/SV canaries replaced (their sentences are now
  //                 POSITIVE fixtures — the measured fuzzy accidents
  //                 "pakkede"→"packed" / "pakket"→"parket" /
  //                 "packade"→"packag" are superseded by exact needles).
  // The permanent replacement for the canaries: every language in the
  // product set MUST have a pack/base lexicon AND phrase fixtures. If a
  // language loses its fixtures or pack, this (and the offline-language-pack
  // guard) fails — coverage can never silently regress to display-only.
  it("all 12 recognition languages have offline coverage with fixtures", () => {
    expect([...COVERED_RECOGNITION_LANGUAGES].sort()).toEqual(
      [...RECOGNITION_LANGUAGES].sort(),
    );
    for (const lang of RECOGNITION_LANGUAGES) {
      expect(LANGUAGE_FIXTURES[lang], `${lang} lost its phrase fixtures`).not.toBeNull();
    }
  });

  // The Scandinavian ex-canary sentences must now recognise via EXACT
  // needles — never again via the old fuzzy spelling accidents.
  const EX_CANARIES: Array<[string, string, string[]]> = [
    ["DA", "Jeg arbejdede på lageret og pakkede varer.", ["warehouse-operations", "packaging"]],
    ["NO", "Jeg jobbet på lageret og pakket varer.", ["warehouse-operations", "packaging"]],
    ["SV", "Jag arbetade på lagret och packade varor.", ["warehouse-operations", "packaging"]],
  ];
  for (const [lang, text, expected] of EX_CANARIES) {
    it(`${lang} ex-canary now recognises for real: ${text}`, () => {
      const got = recognizeSkills(text, 10);
      const bySlug = new Map(got.map((s) => [s.slug, s]));
      for (const slug of expected) {
        expect(bySlug.has(slug), slug).toBe(true);
        expect(bySlug.get(slug)!.via, `${slug} must not be a fuzzy accident`).not.toBe("fuzzy");
      }
    });
  }
});
