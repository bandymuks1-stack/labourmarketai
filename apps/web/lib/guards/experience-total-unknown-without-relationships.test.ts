import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ONE EXPERIENCE TOTAL, ONE RULE (decision 0025; audit 2026-10-20).
 *
 * When a person's relationships to organizations could not be read, journal
 * hours lose their organization and an hour inside an organization period is
 * counted twice. The profile and the Player Card (experienceFiguresOf) showed
 * UNKNOWN; the Living CV and Work in numbers showed the inflated sum (e.g.
 * 825 h against an 800 h period). Every surface now follows the same rule.
 */
const APP = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(APP, p), "utf8");

describe("the experience total is UNKNOWN wherever relationships are unknown", () => {
  it("the shared figure helper (profile, Player Card)", () => {
    expect(read("lib/journal/experience-figures.ts")).toMatch(/relationships == null\s*\? null/);
  });
  it("Work in numbers and the journal's work intelligence (ExperienceScale)", () => {
    expect(read("components/app/work-in-numbers/experience-scale.tsx")).toMatch(
      /const total = relationships == null \? null : experience\.hours;/,
    );
  });
  it("the Living CV and the EU CV (verified CV model)", () => {
    const cv = read("lib/cv-export/verified-cv.ts");
    expect(cv).toMatch(/return relationships == null \? \{ \.\.\.pe, hours: null \} : pe;/);
    expect(cv).toMatch(/withUnknownTotalWhenUnattributed\(\s*deriveProfessionalExperience\(/);
  });
});
