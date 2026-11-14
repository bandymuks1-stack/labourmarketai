import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activeLocales } from "@/lib/i18n/config";
import {
  foldForMatch,
  matchProfessionAcrossLocales,
  matchProfessionByLabel,
} from "./public-vacancy-profession-match";
import { __SOURCE_TERM_OCCUPATIONS, publisherTermsForTypedWord } from "./public-vacancy-source-terms";

const catalogue = (locale: string) =>
  Object.entries(
    JSON.parse(readFileSync(join(process.cwd(), "messages", locale, "professions.json"), "utf8")) as Record<string, string>,
  ).map(([slug, label]) => ({ slug, label }));

/**
 * Production, 2026-11-14, signed out: `slaugytoja`, `медсестра`, `pielęgniarka`,
 * `Krankenschwester`, `verpleegkundige`, `buhalteris`, `бухгалтер`, `księgowy`,
 * `Buchhalter`, `boekhouder` each answered "0 vacancies" while the board held
 * nursing and accounting ads in the publishers' languages.
 */
describe("a typed job word with no catalogue profession", () => {
  it("offers the nursing ads in every publisher language, for each reader language", () => {
    for (const word of ["slaugytoja", "nurse", "медсестра", "pielęgniarka", "Krankenschwester", "verpleegkundige"]) {
      expect(publisherTermsForTypedWord(word), word).toEqual([
        { language: "nb", term: "sykepleier" },
        { language: "sv", term: "sjuksköterska" },
      ]);
    }
  });

  it("offers the accounting ads likewise", () => {
    for (const word of ["buhalteris", "accountant", "bookkeeper", "бухгалтер", "księgowy", "Buchhalter", "boekhouder"]) {
      const terms = publisherTermsForTypedWord(word).map((t) => `${t.language}:${t.term}`);
      expect(terms, word).toEqual([
        "nb:regnskapsfører",
        "nb:regnskapsmedarbeider",
        "sv:redovisningsekonom",
        "sv:ekonomiassistent",
      ]);
    }
  });

  it("takes an inflected or unaccented form", () => {
    expect(publisherTermsForTypedWord("slaugytojos").length).toBeGreaterThan(0);
    expect(publisherTermsForTypedWord("pielegniarka").length).toBeGreaterThan(0);
    expect(publisherTermsForTypedWord("NURSE").length).toBeGreaterThan(0);
  });

  it("prefers no country or language: languages come in code order", () => {
    for (const [key, o] of Object.entries(__SOURCE_TERM_OCCUPATIONS)) {
      const langs = publisherTermsForTypedWord(o.typed[0]!).map((t) => t.language);
      expect(langs, key).toEqual([...langs].sort());
      expect(new Set(langs).size, `${key} names every publisher language`).toBe(
        Object.keys(o.publisher).length,
      );
    }
  });

  it("offers nothing for a publisher's own word, an unknown word or a short one", () => {
    expect(publisherTermsForTypedWord("sjuksköterska")).toEqual([]);
    expect(publisherTermsForTypedWord("psykolog")).toEqual([]);
    expect(publisherTermsForTypedWord("qqxzvw")).toEqual([]);
    expect(publisherTermsForTypedWord("nu")).toEqual([]);
    expect(publisherTermsForTypedWord("")).toEqual([]);
  });

  it("never shadows a catalogue profession: those words already become the filter", () => {
    const all = activeLocales.map(catalogue);
    for (const [key, o] of Object.entries(__SOURCE_TERM_OCCUPATIONS)) {
      for (const word of o.typed) {
        for (const options of all) {
          expect(matchProfessionByLabel(word, options), `${key}: "${word}" is a catalogue word`).toBeNull();
        }
      }
    }
  });

  it("no typed word names two occupations", () => {
    const seen = new Map<string, string>();
    for (const [key, o] of Object.entries(__SOURCE_TERM_OCCUPATIONS)) {
      for (const word of o.typed) {
        const f = foldForMatch(word);
        expect(seen.get(f) ?? key, `"${word}"`).toBe(key);
        seen.set(f, key);
      }
    }
  });
});

describe("a phrase is not an inflected form of a one-word profession", () => {
  // Production 2026-11-14: /pl/jobs?q=kierownik projektu redirected to ?profession=driver.
  const pl = catalogue("pl");
  it("kierownik projektu is not a driver; kierowcy still is", () => {
    expect(matchProfessionByLabel("kierownik projektu", pl)).toBeNull();
    expect(matchProfessionByLabel("kierowcy", pl)).toBe("driver");
    expect(matchProfessionByLabel("kierowców", pl)).toBe("driver");
  });
  it("and it is offered as the project manager search", () => {
    expect(publisherTermsForTypedWord("kierownik projektu").map((t) => t.term)).toEqual([
      "prosjektleder",
      "projektledare",
    ]);
  });
});

describe("English words that answered zero for an existing profession", () => {
  const own = catalogue("en");
  const others = activeLocales.filter((l) => l !== "en").map(catalogue);
  it.each([
    ["warehouse operative", "warehouse_worker"],
    ["warehouse operator", "warehouse_worker"],
    ["janitor", "cleaner"],
    ["care assistant", "caregiver"],
    ["care worker", "caregiver"],
  ])("%s becomes the %s filter", (word, slug) => {
    expect(matchProfessionAcrossLocales(word, own, others)).toBe(slug);
  });
});

describe("the board shows the same-job links (source guard)", () => {
  const page = readFileSync(
    join(process.cwd(), "app", "[locale]", "(marketing)", "jobs", "page.tsx"),
    "utf8",
  );
  it("only for a free-text search, as normal search links", () => {
    expect(page).toContain("!profession && query && !wantsSaved ? publisherTermsForTypedWord(query) : []");
    expect(page).toContain("href={`/jobs?q=${encodeURIComponent(t.term)}`}");
    expect(page).toContain('data-testid="public-jobs-same-job-search"');
  });
});
