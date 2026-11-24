import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractJournalSuggestions } from "./extract-journal-suggestions";

/**
 * v1 construction work recognition — deterministic LT journal phrase → skill
 * slug. These are SUGGESTIONS (not verified facts); confirmation stays manual.
 * Each expected slug exists in messages/{locale}/skill-names.json.
 */

const CASES: { text: string; slug: string }[] = [
  { text: "dirbau su pastoliu", slug: "scaffolding" },
  { text: "kasiau smėlį", slug: "earthworks" },
  { text: "dažiau sienas", slug: "painting" },
  { text: "tapetavau koridorių", slug: "wallpapering" },
  { text: "stačiau medinį karkasą", slug: "timber-framing" },
  { text: "montavau sijas", slug: "timber-framing" },
  { text: "kėliau gegnes", slug: "timber-framing" },
  { text: "dariau apkalimą", slug: "timber-framing" },
  { text: "klojau perdangos klojinius", slug: "formwork" },
  { text: "surinkau sąramas", slug: "concrete-pouring" },
  { text: "dirbau pagal brėžinius", slug: "blueprint-reading" },
];

describe("journal work recognition v1 — real LT phrases → skill slugs", () => {
  for (const { text, slug } of CASES) {
    it(`"${text}" → ${slug}`, () => {
      expect(extractJournalSuggestions(text).skillSlugs).toContain(slug);
    });
  }

  it("unknown / vague text suggests no construction skill (no fabrication)", () => {
    expect(extractJournalSuggestions("buvau darbe ir grįžau namo").skillSlugs).toHaveLength(0);
    expect(extractJournalSuggestions("").skillSlugs).toHaveLength(0);
  });

  it("every recognized slug exists in the skill-names taxonomy (lt)", () => {
    const names = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "messages", "lt", "skill-names.json"), "utf8"),
    ) as Record<string, string>;
    for (const { slug } of CASES) {
      expect(names[slug], `lt skill-names missing ${slug}`).toBeTruthy();
    }
  });
});

describe("review inbox copy is human, not raw keys", () => {
  const src = readFileSync(
    join(__dirname, "..", "..", "components", "app", "journal-inbox-entry.tsx"),
    "utf8",
  );
  it("separates approve-entry from confirm-skills + shows recognized tags", () => {
    expect(src).toMatch(/t\("inbox\.confirmEntry"\)/);
    expect(src).toMatch(/t\("inbox\.confirmSkills"\)/);
    expect(src).toMatch(/t\("inbox\.suggestedFromEntry"\)/);
    expect(src).toMatch(/declaredUnverified\.length > 0 \?/);
  });
  for (const locale of ["en", "lt"] as const) {
    it(`${locale} inbox has the new keys`, () => {
      const j = JSON.parse(
        readFileSync(join(__dirname, "..", "..", "messages", locale, "journal.json"), "utf8"),
      ) as { inbox: Record<string, string> };
      for (const k of ["confirmEntry", "confirmSkills", "suggestedFromEntry", "noSkillsRecognized", "writeConcreteWorks"]) {
        expect(j.inbox[k], `${locale} inbox.${k}`).toBeTruthy();
      }
    });
  }
});
