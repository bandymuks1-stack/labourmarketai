import { describe, expect, it } from "vitest";

import { recognizeSkills } from "./skill-recognition";
import { LANGUAGE_PACKS } from "./language-packs";
import { SKILL_RECOGNITION_STATUS } from "./language-packs/recognition-status";

/**
 * TRANSVERSAL CAPABILITY RECOGNITION — the nine offline pack languages.
 *
 * The eight transversal slugs (migration
 * 20260827060000_transversal_capability_skills_v1) are the education pilot's
 * vocabulary: a student's evidence is projects, presentations, teamwork and
 * volunteering, not tiling. They shipped recognisable in LT/EN/RU only, which
 * meant a Latvian or Danish learner writing the exact same sentence still got
 * an empty CV — the "person with no experience" verdict, restored by language.
 *
 * This file proves the nine packs (da de et fi lv nl no pl sv) really close
 * that, in the only way that counts: REAL sentences, through the ONE
 * recognizer, offline. A needle table nobody exercises is not coverage.
 */

const TRANSVERSAL_SLUGS = [
  "presenting",
  "stakeholder-engagement",
  "partnership-development",
  "negotiation",
  "project-coordination",
  "report-writing",
  "teamwork",
  "research",
] as const;

const slugsOf = (text: string): string[] => recognizeSkills(text, 12).map((s) => s.slug);

describe("every offline pack carries real needles for every transversal capability", () => {
  for (const pack of LANGUAGE_PACKS) {
    it(`${pack.language}: all 8 transversal slugs have non-empty exact needles`, () => {
      for (const slug of TRANSVERSAL_SLUGS) {
        const set = pack.skills[slug];
        expect(set, `${pack.language} has no needles for '${slug}'`).toBeTruthy();
        expect(set!.exact.length, `${pack.language}/${slug}`).toBeGreaterThan(0);
      }
    });

    it(`${pack.language}: every transversal needle is a real phrase, not a stem`, () => {
      for (const slug of TRANSVERSAL_SLUGS) {
        for (const needle of pack.skills[slug]!.exact) {
          // Short stems are how a transversal needle turns into noise: a
          // capability row is written from an exact match, so a loose needle
          // manufactures a capability nobody claimed (keywords.ts discipline).
          expect(needle.trim().length, `${pack.language}/${slug}: "${needle}"`).toBeGreaterThan(5);
        }
      }
    });

    it(`${pack.language}: each needle really resolves to its own slug`, () => {
      for (const slug of TRANSVERSAL_SLUGS) {
        for (const needle of pack.skills[slug]!.exact) {
          expect(slugsOf(needle), `${pack.language}/${slug}: "${needle}"`).toContain(slug);
        }
      }
    });
  }
});

describe("the classification says what the packs actually do", () => {
  it("all eight transversal slugs are classified core", () => {
    for (const slug of TRANSVERSAL_SLUGS) {
      expect(SKILL_RECOGNITION_STATUS[slug]?.kind, slug).toBe("core");
    }
  });
});

describe("real learner sentences resolve in every pack language", () => {
  // One sentence a student could plausibly write, per language, carrying at
  // least two transversal capabilities — the shape the LT owner example had.
  const CASES: ReadonlyArray<[string, string, readonly string[]]> = [
    [
      "nl",
      "Ik presenteerde het project aan belanghebbenden en heb literatuuronderzoek gedaan",
      ["presenting", "stakeholder-engagement", "research"],
    ],
    [
      "de",
      "Ich koordinierte das Projekt, hielt einen Vortrag und schrieb einen Bericht",
      ["project-coordination", "presenting", "report-writing"],
    ],
    [
      "pl",
      "Prezentowałem projekt, prowadziłem badania i praca zespołowa była kluczowa",
      ["presenting", "research", "teamwork"],
    ],
    [
      "lv",
      "Koordinēju projektu, sagatavoju ziņojumu un komandas darbs bija svarīgs",
      ["project-coordination", "report-writing", "teamwork"],
    ],
    [
      "et",
      "Esitlesin projekti, kirjutasin aruande ja meeskonnatöö sujus hästi",
      ["presenting", "report-writing", "teamwork"],
    ],
    [
      "fi",
      "Esittelin projektin, kirjoitin raportin ja tiimityö sujui hyvin",
      ["presenting", "report-writing", "teamwork"],
    ],
    [
      "da",
      "Jeg holdt oplæg, skrev rapport og teamarbejde fyldte meget",
      ["presenting", "report-writing", "teamwork"],
    ],
    [
      "no",
      "Jeg holdt innlegg, skrev rapport og teamarbeid var viktig",
      ["presenting", "report-writing", "teamwork"],
    ],
    [
      "sv",
      "Jag höll presentation, skrev rapport och teamarbete var viktigt",
      ["presenting", "report-writing", "teamwork"],
    ],
  ];

  for (const [lang, text, expected] of CASES) {
    it(`${lang}: "${text}"`, () => {
      const got = slugsOf(text);
      for (const slug of expected) expect(got, `${lang}: ${text}`).toContain(slug);
    });
  }

  it("covers every registered pack language (no pack silently skipped)", () => {
    const covered = new Set(CASES.map(([lang]) => lang));
    for (const pack of LANGUAGE_PACKS) {
      expect(covered.has(pack.language), `no learner sentence for ${pack.language}`).toBe(true);
    }
  });
});

describe("the needles stay narrow (no capability nobody claimed)", () => {
  const NEUTRAL: ReadonlyArray<[string, string]> = [
    ["nl", "Ik maakte het kantoor schoon en waste de ramen"],
    ["de", "Ich habe Fliesen verlegt und die Wände gestrichen"],
    ["pl", "Układałem płytki i malowałem ściany"],
    ["lv", "Liku flīzes un krāsoju sienas"],
    ["et", "Panin plaate ja värvisin seinu"],
    ["fi", "Laatoitin ja maalasin seiniä"],
    ["da", "Jeg lagde fliser og malede vægge"],
    ["no", "Jeg la fliser og malte vegger"],
    ["sv", "Jag lade kakel och målade väggar"],
  ];
  for (const [lang, text] of NEUTRAL) {
    it(`${lang}: plain trade work yields NO transversal capability`, () => {
      const got = new Set(slugsOf(text));
      for (const slug of TRANSVERSAL_SLUGS) {
        expect(got.has(slug), `${lang}: "${text}" wrongly yielded ${slug}`).toBe(false);
      }
    });
  }
});
