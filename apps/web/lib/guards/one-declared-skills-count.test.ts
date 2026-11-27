import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { countDeclaredSkills, presentSkills } from "@/lib/cv-export/skill-presentation";
import { skillEvidenceOfPresentation } from "@/lib/profile/skill-evidence";

/**
 * ONE DECLARED-SKILLS COUNT (audit CV-16, owner addendum 2026-11-23:
 * "every surface showing hours, skills or experience uses the same number").
 *
 * The profile stated the number of declared skills three ways and they could
 * differ for one person. Every count is now the skills list's own item count.
 */

const read = (p: string): string =>
  readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

const names: Record<string, string> = { "arc-welding": "Lankinis suvirinimas", tiling: "Plytelių klojimas" };
const nameOf = (slug: string) => names[slug] ?? slug;

describe("declared skills — one count", () => {
  const claims = [
    { label: "Lankinis suvirinimas", origin: "profile" as const }, // IS the held skill
    { label: "glaistymas", origin: "profile" as const },
    { label: "Glaistymas", origin: "profile" as const }, // a spelling of the same claim
  ];

  it("a claim that is a held skill, and two spellings of one claim, count once", () => {
    expect(countDeclaredSkills({ slugs: ["arc-welding", "tiling"], claims, nameOf })).toBe(3);
  });

  it("the count equals the items the skills list shows, whatever the evidence state", () => {
    const shown = presentSkills({
      tiers: { confirmed: ["tiling"], evidence: ["arc-welding"], declared: [] },
      claims,
      practice: null,
      nameOf,
    });
    expect(shown.visible).toBe(3);
    expect(skillEvidenceOfPresentation(shown)).toEqual({ declared: 3, supported: 2, unsupported: 1 });
  });

  it("the Player Card counts by the same rule, not by its own dedup", () => {
    const card = read("lib/player-card/player-card.ts");
    expect(card).toContain("countDeclaredSkills({");
    expect(card).not.toMatch(/labels\.size/);
  });

  it("the profile page states one number", () => {
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).toContain("skillEvidenceOfPresentation(skillPresentation)");
    expect(page).toContain("selfDeclaredCount={declaredSkillCount}");
    expect(page).toContain("skillsDeclared: declaredSkillCount,");
    expect(page).not.toMatch(/(selfDeclaredCount=\{|skillsDeclared: )savedSkillClaims\.length \+ savedSkills\.length/);
  });
});
