import { describe, expect, it, vi, beforeEach } from "vitest";

import { SKILL_HINTS_LT } from "@/lib/structuring/keywords";
import { SKILL_SYNONYMS } from "@/lib/structuring/synonyms";
import { LANGUAGE_PACKS } from "@/lib/structuring/language-packs";
import { LANGUAGE_FIXTURES } from "@/lib/structuring/language-packs/fixtures";
import { recognizeSkills } from "@/lib/structuring/skill-recognition";
import {
  CONCEPT_TERM_SOURCES,
  conceptTerms,
  unseededSlugsIn,
  resolveExpressionToConcepts,
  conceptLanguageCoverage,
  coveredConceptLanguages,
  registeredButUncoveredLanguages,
} from "@/lib/structuring/concept-resolution";
import { labelSetSource } from "@/lib/structuring/concept-resolution/term-sources";
import { CONCEPT_LABEL_SETS } from "@/lib/structuring/concept-resolution/labels";
import type { ConceptLabelSet } from "@/lib/structuring/concept-resolution/types";

/**
 * CONCEPT-RESOLUTION SEAM GUARD (LANGUAGE_MATRIX §4.1 step 2).
 *
 * The seam exists to remove ONE architectural property: that a hand-written
 * needle pack was the only possible implementation of `expression → concept`.
 * That is an ARCHITECTURAL NARROWING claim (ARCHITECTURE §6.1 question B), and
 * question B is precisely the class of claim a passing unit suite does not
 * establish on its own. So this file proves two things that pull in opposite
 * directions, and both have to hold:
 *
 *   A. NO LOSS — routing the dictionary through the seam changed no
 *      recognition result, for any language, on the product's own fixtures.
 *   B. THE CEILING IS GONE — a language with no pack, no code and no fixtures
 *      reaches the REAL recognizer through DATA alone, and does not reach it
 *      when that data is absent (the negative control, without which B proves
 *      nothing).
 */

/** `LANGUAGE_FIXTURES` is a per-language record whose value may be null. */
const ALL_FIXTURES = Object.values(LANGUAGE_FIXTURES).filter(
  (f): f is NonNullable<typeof f> => f !== null,
);

// ── A. NO LOSS ──────────────────────────────────────────────────────────────

describe("concept-resolution seam — no loss (ARCHITECTURE §6.1 question A)", () => {
  it("emits exactly the terms the three hardcoded imports used to assemble", () => {
    // The pre-seam assembly, reconstructed here so the comparison is against
    // the OLD behaviour rather than against the new code describing itself.
    const legacy: string[] = [];
    for (const row of SKILL_HINTS_LT) {
      for (const n of row.needles) legacy.push(`${row.slug}|${n}|exact|fuzzy`);
    }
    for (const [slug, phrases] of Object.entries(SKILL_SYNONYMS)) {
      for (const p of phrases) legacy.push(`${slug}|${p}|synonym|fuzzy`);
    }
    for (const pack of LANGUAGE_PACKS) {
      for (const [slug, set] of Object.entries(pack.skills)) {
        for (const n of set.exact) legacy.push(`${slug}|${n}|exact|nofuzzy`);
        for (const p of set.synonyms ?? []) legacy.push(`${slug}|${p}|synonym|nofuzzy`);
      }
    }

    const viaSeam = conceptTerms().map(
      (t) => `${t.slug}|${t.term}|${t.tier}|${t.fuzzyEligible ? "fuzzy" : "nofuzzy"}`,
    );

    // Order included: the recognizer breaks exact ties by insertion order, so
    // a reordering is a behaviour change even when the SET is identical.
    expect(viaSeam).toEqual(legacy);
  });

  it("resolves every shipped language fixture identically to the recognizer", () => {
    const cases = ALL_FIXTURES.flatMap((f) => f.phrases.map((p) => p.text));
    expect(cases.length).toBeGreaterThan(100);

    for (const text of cases) {
      const direct = recognizeSkills(text, 8).map((s) => `${s.slug}:${s.via}`);
      const seam = resolveExpressionToConcepts(text, { limit: 8 }).map(
        (c) => `${c.slug}:${c.tier}`,
      );
      expect(seam, `seam diverged on: ${text}`).toEqual(direct);
    }
  });

  it("still honours the fixtures' forbidden slugs — no new false positives", () => {
    for (const fixture of ALL_FIXTURES) {
      for (const fp of fixture.falsePositives) {
        const got = resolveExpressionToConcepts(fp.text, { limit: 8 }).map((c) => c.slug);
        for (const forbidden of fp.forbids) {
          expect(got, `${fixture.language}: ${fp.text}`).not.toContain(forbidden);
        }
      }
    }
  });

  it("no shipped source invents a concept the taxonomy has not seeded", () => {
    for (const source of CONCEPT_TERM_SOURCES) {
      expect(unseededSlugsIn(source), `source ${source.id}`).toEqual([]);
    }
  });
});

// ── B. THE CEILING IS GONE ──────────────────────────────────────────────────

/**
 * A language with no pack file, no fixtures, no entry in any tuple and no code
 * of its own. `zxx` is ISO 639-2 "no linguistic content", chosen so this can
 * never collide with a real language somebody later curates.
 */
const SYNTHETIC: ConceptLabelSet = {
  language: "zxx",
  provenance: "guard fixture — proves the data path, never shipped",
  // A slug that must already be seeded: the rule that a language may express a
  // concept but never invent one has to keep holding on the data path too.
  labels: { welding: { exact: ["qqzzvvxxqq"] } },
};

const SYNTHETIC_SENTENCE = "Objekte qqzzvvxxqq darbai baigti.";

describe("concept-resolution seam — a new language is DATA (question B)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("NEGATIVE CONTROL: the sentence resolves to nothing while the data is absent", async () => {
    const fresh = await import("@/lib/structuring/concept-resolution");
    expect(fresh.resolveExpressionToConcepts(SYNTHETIC_SENTENCE, { limit: 8 })).toEqual([]);
  });

  it("registering label DATA alone makes the REAL recognizer resolve it", async () => {
    vi.doMock("@/lib/structuring/concept-resolution/labels", () => ({
      KA_LABELS: { language: "ka", provenance: "test", labels: {} },
      CONCEPT_LABEL_SETS: [SYNTHETIC],
    }));

    // Fresh module graph: the recognizer rebuilds its dictionary from the
    // sources, with no code change anywhere between the data and the match.
    const { resolveExpressionToConcepts: resolveWithData } = await import(
      "@/lib/structuring/concept-resolution"
    );
    const got = resolveWithData(SYNTHETIC_SENTENCE, { limit: 8 });

    expect(got.map((c) => c.slug)).toContain("welding");
    // It arrives as real evidence, not a guess, and it names what triggered it.
    const hit = got.find((c) => c.slug === "welding");
    expect(hit?.tier).toBe("exact");
    expect(hit?.matchedText.toLowerCase()).toContain("qqzzvvxxqq");
    expect(hit?.resolver).toBe("lexicon");

    vi.doUnmock("@/lib/structuring/concept-resolution/labels");
  });

  it("a data source never joins the fuzzy tier — that stays base-lexicon only", () => {
    const source = labelSetSource([SYNTHETIC]);
    expect(source.terms().every((t) => !t.fuzzyEligible)).toBe(true);
  });

  it("the data path is subject to the same no-invented-concepts rule", () => {
    const inventing = labelSetSource([
      {
        language: "zxx",
        provenance: "guard fixture",
        labels: { "a-concept-nobody-seeded": { exact: ["qqzz"] } },
      },
    ]);
    expect(unseededSlugsIn(inventing)).toEqual(["a-concept-nobody-seeded"]);
  });
});

// ── COVERAGE IS MEASURED, NOT DECLARED ──────────────────────────────────────

describe("concept-resolution seam — coverage is measured from terms", () => {
  it("reports every shipped language with a real term count", () => {
    const coverage = conceptLanguageCoverage();
    const byLang = new Map(coverage.map((c) => [c.language, c]));

    for (const lang of ["lt", "en", "ru", "nl", "de", "pl", "lv", "et", "fi", "da", "no", "sv"]) {
      const c = byLang.get(lang);
      expect(c, `${lang} missing from coverage`).toBeDefined();
      expect(c?.termCount, `${lang} term count`).toBeGreaterThan(0);
      expect(c?.covered).toBe(true);
    }
  });

  it("Georgian is REPRESENTABLE and honestly reported as UNCOVERED", () => {
    // Registration removed the architectural exclusion. It did not, and must
    // never be read as having, added coverage: the product may not describe a
    // language as supported because its code appears in an array.
    expect(CONCEPT_LABEL_SETS.map((s) => s.language)).toContain("ka");

    const ka = conceptLanguageCoverage().find((c) => c.language === "ka");
    expect(ka).toBeDefined();
    expect(ka?.termCount).toBe(0);
    expect(ka?.covered).toBe(false);

    expect(coveredConceptLanguages()).not.toContain("ka");
    expect(registeredButUncoveredLanguages()).toContain("ka");
  });

  it("no language is reported as covered without at least one real term", () => {
    for (const c of conceptLanguageCoverage()) {
      expect(c.covered).toBe(c.termCount > 0);
      if (c.covered) expect(c.conceptCount).toBeGreaterThan(0);
    }
  });
});
