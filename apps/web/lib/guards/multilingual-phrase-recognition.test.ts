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
import { LT_FIXTURES } from "../structuring/language-packs/fixtures/lt";
import { EN_FIXTURES } from "../structuring/language-packs/fixtures/en";
import { RU_FIXTURES } from "../structuring/language-packs/fixtures/ru";
import type { PhraseCase } from "../structuring/language-packs/types";

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

describe("KNOWN GAPS — pinned so coverage claims stay honest", () => {
  // (2026-07-04 wave 2: the former data-entry/Excel class-E gap is FILLED.
  //  2026-07-04 PR3A: NL/DE/PL canaries REPLACED by real offline packs.
  //  2026-07-04 PR3B: LV/ET canaries REPLACED by the lv/et packs — their
  //  canary sentences are now POSITIVE fixtures; FI gained its first-ever
  //  coverage (pack + minimum taxonomy locale). DA/NO/SV remain RED below —
  //  audit runtime/audits/offline-multilingual-skill-recognition-audit-2026-07-04.md.)

  // RED-language canaries: ordinary work sentences in the still-uncovered
  // Scandinavian locales produce AT MOST accidental fuzzy brushes (measured:
  // DA "pakkede"→"packed", NO "pakket"→"parket", SV "packade"→"packag" — all
  // 1-edit spelling accidents, none of them coverage). Locale display names
  // are NOT recognition. If a pin fails with an exact/synonym hit, real
  // coverage was added: update the audit and replace the canary with a full
  // phrase pack (the NL/DE/PL and LV/ET pins fell exactly this way).
  const RED_LANGUAGE_CANARIES: Array<[string, string]> = [
    ["DA", "Jeg arbejdede på lageret og pakkede varer."],
    ["NO", "Jeg jobbet på lageret og pakket varer."],
    ["SV", "Jag arbetade på lagret och packade varor."],
  ];
  for (const [lang, text] of RED_LANGUAGE_CANARIES) {
    it(`${lang} has no real recognition yet (fuzzy accidents at most): ${text}`, () => {
      const got = recognizeSkills(text, 10);
      expect(got.every((s) => s.via === "fuzzy")).toBe(true);
    });
  }
});
