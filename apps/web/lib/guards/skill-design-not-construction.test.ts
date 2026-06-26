import { describe, expect, it } from "vitest";
import { extractProfileSkillClaims } from "@/lib/profile/skill-claim-extractor";

/**
 * Skill-recognition false-positive guard (production-trust-bugs-p0, issue B).
 *
 * Owner production finding: website/web design text ("Dirbau su svetainės
 * dizainu 9 h") wrongly surfaced a construction-adjacent skill (interior
 * design). LT "svetainė" can also mean "living room", but the compound
 * "svetainės dizainas" means WEBSITE design in modern use, so it must default
 * to the honest IT/design suggestion and NEVER yield an unrelated interior /
 * construction skill. Interior design stays recognised from its OWN explicit
 * needles. Valid recognition for other sectors must keep working.
 */

const labels = (t: string): string[] =>
  extractProfileSkillClaims(t).map((c) => c.label);

const CONSTRUCTION_OR_INTERIOR = /interjer|interior|statyb|mūr|mur|tinkav|fasad|construction/i;

describe("website/web design text never produces construction/interior skills", () => {
  for (const text of [
    "Dirbau su svetainės dizainu 9 h",
    "Dirbau su web dizainu 9 valandas",
    "Kūriau svetainės dizainą",
  ]) {
    it(`"${text}" → no construction/interior label`, () => {
      const got = labels(text);
      const bad = got.filter((l) => CONSTRUCTION_OR_INTERIOR.test(l));
      expect(bad, `unexpected construction/interior in: ${JSON.stringify(got)}`).toEqual([]);
    });
    it(`"${text}" → still suggests the honest website-design skill`, () => {
      expect(labels(text)).toContain("Interneto svetainės dizainas");
    });
  }
});

describe("genuine recognition is preserved", () => {
  it("explicit interior text still recognises interior design", () => {
    expect(labels("Dariau interjero dizainą kambariui")).toContain("Interjero dizainas");
  });
  it("driving text still recognises driving", () => {
    expect(labels("Vairavau sunkvežimį")).toContain("Vairavimas");
  });
});
