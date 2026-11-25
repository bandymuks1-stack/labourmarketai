import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { presentSkills } from "@/lib/cv-export/skill-presentation";
import { derivePotentialSkills } from "@/lib/skills/potential-skills";

/**
 * EVERY SKILL AND EVERY JOB IS LISTED ONCE ON THE LIVING CV
 * (owner P0 2026-11-23, "CV skills and work experience shown twice").
 *
 * The defect: `/[locale]/cv` mounted the premium hero (`PremiumLivingCv`)
 * WITH its own skill region ("What you can do", from the raw tiers, eight
 * then "+N more") and its own experience region ("Where you have worked",
 * the engagements + the organizations' records + leadership merged), and
 * then the document's sections listed the same rows again: `cv-skills`
 * (through `presentSkills`) and `cv-work-history` / `cv-practice-history` /
 * `cv-organizations-roles` / the organizations' history group. Both were on
 * screen at every width. Reproduced on the isolated stack by
 * tests/e2e/cv-shown-twice-isolated.spec.ts (CV2-2: 2 listings → 1).
 *
 * What this pins:
 *  1. the hero lists neither skills nor experience — it is the identity
 *     moment (name, professions, figures) and the leadership block;
 *  2. the page lists skills ONCE, through the one presentation
 *     (`presentSkills`, decision 0023 — inference kept), and history ONCE,
 *     through the one renderer per section; the only other reads of the same
 *     rows are the career journey's DIAGRAM stations and skill lines;
 *  3. the presentation folds a claim into the skill it already is and one
 *     slug into one item — a fold, never a deletion (rule 1 of
 *     skill-presentation.ts) — and the potential capabilities stay derived.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
/** Code without comment lines, so an explanation never satisfies a pin. */
const code = (rel: string) =>
  read(rel)
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
    .join("\n");
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const hero = code("components/app/cv/premium-living-cv.tsx");
const page = code("app/[locale]/cv/page.tsx");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    const st = statSync(join(root, rel));
    if (st.isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

describe("1 · the hero lists no skills and no experience", () => {
  it("takes no capability or experience list and renders no list of its own", () => {
    expect(hero).not.toMatch(/\bcapabilities\b|\bexperience\b|hiddenCapabilities|PremiumCvCapability|PremiumCvExperience/);
    expect(hero).not.toMatch(/<(ul|ol|li)\b/);
    expect(hero).not.toMatch(/premium-cv-capabilities|premium-cv-experience/);
  });
  it("is mounted by the Living CV page only, without a list prop", () => {
    const callers = [...sources("app"), ...sources("components")].filter((f) => read(f).includes("<PremiumLivingCv"));
    expect(callers.map((f) => relative(root, join(root, f)).replaceAll("\\", "/"))).toEqual(["app/[locale]/cv/page.tsx"]);
    const call = page.slice(page.indexOf("<PremiumLivingCv"), page.indexOf("/>", page.indexOf("leadership={<OrganizationsLeadership")));
    expect(call).not.toMatch(/capabilities=|experience=|hiddenCapabilities=/);
  });
});

describe("2 · the page lists each skill and each job once", () => {
  it("skills: one section, through the one presentation", () => {
    expect(count(page, 'data-testid="cv-skills"')).toBe(1);
    expect(count(page, "presentSkills({")).toBe(1);
    expect(page).toMatch(/\{presentation\.groups\.map\(/);
    // The raw tiers are mapped once more only for the journey diagram's lines.
    expect(count(page, "cv.tiers[tier].map(")).toBe(1);
    expect(page).toMatch(/skills: \(\["confirmed", "evidence", "declared"\] as const\)\.flatMap\(\(tier\) =>\s*cv\.tiers\[tier\]\.map\(/);
  });
  it("history: one renderer per section; the journey's stations are the only other read", () => {
    expect(count(page, 'data-testid="cv-history-node"')).toBe(1);
    expect(count(page, "historyItems(employmentHistory)")).toBe(1);
    expect(count(page, "historyItems(practiceHistory)")).toBe(1);
    expect(count(page, "<CvOrganizationHistory")).toBe(1);
    expect(count(page, 'data-testid="cv-organization-role"')).toBe(1);
    // workHistory / organizationHistory are mapped once more, inside deriveCareerJourney's stations only.
    expect(count(page, "cv.workHistory.map(")).toBe(1);
    expect(count(page, "(cv.organizationHistory ?? []).map(")).toBe(1);
    const journey = page.slice(page.indexOf("deriveCareerJourney({"), page.indexOf("const journeyLabels"));
    expect(journey).toContain("...cv.workHistory.map(");
    expect(journey).toContain("...(cv.organizationHistory ?? []).map(");
  });
});

describe("3 · one item per skill, inference kept", () => {
  const nameOf = (slug: string) => ({ tiling: "Tiling", flooring: "Flooring" })[slug] ?? slug;

  it("a claim that IS the journal-backed skill is folded into it, with its variant said — not dropped, not listed twice", () => {
    const p = presentSkills({
      tiers: { confirmed: [], evidence: ["tiling", "flooring"], declared: [] },
      claims: [
        { id: "c1", label: "tiling", origin: "profile" },
        { id: "c2", label: "Tiling ", origin: "journal" },
      ],
      practice: null,
      nameOf,
    });
    const all = p.groups.flatMap((g) => g.items);
    const tiling = all.filter((i) => /tiling/i.test(i.name));
    expect(tiling).toHaveLength(1);
    expect(tiling[0]!.tier).toBe("evidence");
    expect(tiling[0]!.claimIds).toEqual(["c1", "c2"]);
    expect(tiling[0]!.variants.length).toBeGreaterThan(1);
    expect(p.claimsFoldedIntoSkills).toBe(2);
    expect(p.visible).toBe(2);
  });

  it("one slug held in two tiers is one item, at its strongest tier", () => {
    const p = presentSkills({
      tiers: { confirmed: ["tiling"], evidence: ["tiling"], declared: ["tiling"] },
      claims: [],
      practice: {},
      nameOf,
    });
    expect(p.visible).toBe(1);
    expect(p.groups[0]!.tier).toBe("confirmed");
  });

  it("free labels that differ only by case or diacritics are one item; different words stay two", () => {
    const p = presentSkills({
      tiers: { confirmed: [], evidence: [], declared: [] },
      claims: [
        { label: "Patalpų valymas", origin: "profile" },
        { label: "patalpu valymas", origin: "journal" },
        { label: "Patalpų priežiūra", origin: "profile" },
      ],
      practice: {},
      nameOf,
    });
    expect(p.visible).toBe(2);
    expect(p.variantsFolded).toBe(1);
  });

  it("decision 0023: recorded tiling still points at a potential capability", () => {
    expect(derivePotentialSkills(["tiling"], ["tiling"]).map((s) => s.slug)).toContain("grouting");
    // the page still derives and shows them
    expect(page).toMatch(/const potentialCapabilities = derivePotentialSkills\(/);
    expect(page).toContain('data-testid="cv-potential"');
  });
});
