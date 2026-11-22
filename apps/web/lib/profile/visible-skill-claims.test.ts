import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { presentSkills } from "@/lib/cv-export/skill-presentation";
import { mergeSavedRows } from "@/lib/worker/saved-rows";
import { skillClaimChips, visibleSkillClaims } from "./visible-skill-claims";

const row = (id: string) => ({ id, label: `claim ${id}` });

describe("visibleSkillClaims", () => {
  it("shows a claim that arrives in a later server read (the add-then-refresh case)", () => {
    const removed = new Set<string>();
    const before = visibleSkillClaims([row("a")], removed);
    const afterRefresh = visibleSkillClaims([row("b"), row("a")], removed);
    expect(before.map((c) => c.id)).toEqual(["a"]);
    expect(afterRefresh.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("hides a claim removed in this session until the refresh drops it", () => {
    const removed = new Set(["a"]);
    expect(visibleSkillClaims([row("b"), row("a")], removed).map((c) => c.id)).toEqual(["b"]);
    expect(visibleSkillClaims([row("b")], removed).map((c) => c.id)).toEqual(["b"]);
  });
});

const nameOf = (slug: string) => ({ programming: "Programavimas" })[slug] ?? slug;
const present = (claims: { id: string; label: string }[]) =>
  presentSkills({
    tiers: { confirmed: [], evidence: ["programming"], declared: [] },
    claims: claims.map((c) => ({ ...c, origin: "profile" as const })),
    practice: {},
    nameOf,
  });

describe("skillClaimChips — a saved claim shows in place before the page refresh arrives (P-13, run 44637832323)", () => {
  it("without a presentation, one chip per claim", () => {
    expect(skillClaimChips(null, [row("a"), row("b")]).map((c) => c.ids)).toEqual([["a"], ["b"]]);
  });

  // NEGATIVE CONTROL: before this change the chips came from the presentation
  // only, so a claim the save confirmed was invisible until the refreshed page
  // (built after the insert) committed — in production after its slowest read.
  it("a claim the presentation does not hold yet still shows, as its own chip", () => {
    const built = present([{ id: "old", label: "Plytelės" }]);
    const savedNow = mergeSavedRows([{ id: "old", label: "Plytelės" }], {
      saved: [{ id: "new", label: "QA įgūdis" }],
      removed: [],
    });
    const chips = skillClaimChips(built, savedNow);
    expect(chips.map((c) => c.label)).toEqual(["Plytelės", "QA įgūdis"]);
    expect(chips.find((c) => c.label === "QA įgūdis")?.ids).toEqual(["new"]);
  });

  it("once the refreshed presentation holds the claim, it is shown once, by the presentation", () => {
    const claims = [
      { id: "new", label: "QA įgūdis" },
      { id: "old", label: "Plytelės" },
    ];
    const chips = skillClaimChips(present(claims), claims);
    expect(chips.filter((c) => c.ids.includes("new"))).toHaveLength(1);
    expect(chips).toHaveLength(2);
  });

  it("a claim folded into a catalogued skill is never repeated as a chip", () => {
    const claims = [{ id: "c1", label: "programavimas" }];
    const p = present(claims);
    expect(p.claimsFoldedIntoSkills).toBe(1);
    expect(skillClaimChips(p, claims)).toEqual([]);
  });

  it("case variants stay one chip whose removal covers every variant", () => {
    const claims = [
      { id: "a", label: "Plytelės" },
      { id: "b", label: "plyteles" },
    ];
    const chips = skillClaimChips(present(claims), claims);
    expect(chips).toHaveLength(1);
    expect([...chips[0]!.ids].sort()).toEqual(["a", "b"]);
  });

  it("a claim removed in this session is gone from its folded chip", () => {
    const claims = [
      { id: "a", label: "Plytelės" },
      { id: "b", label: "plyteles" },
    ];
    const chips = skillClaimChips(present(claims), visibleSkillClaims(claims, new Set(["a"])));
    expect(chips.map((c) => c.ids)).toEqual([["b"]]);
  });
});

describe("capability profile section reads claims from the prop, not from seeded state", () => {
  const src = readFileSync(join(process.cwd(), "components", "app", "capability-profile-section.tsx"), "utf8");

  it("no useState seeded with the claims prop (it would freeze the first list)", () => {
    expect(src).not.toMatch(/useState<ProfileSkillClaimRow\[\]>\(\s*claims\s*\)/);
    expect(src).not.toMatch(/setSavedClaims\b/);
  });

  it("derives the shown claims from the prop on every render, plus only what a save confirmed", () => {
    // useSavedRows(claims) merges the live prop with the rows the server
    // returned; it never seeds state from the prop.
    expect(src).toMatch(/useSavedRows\(\s*claims\s*\)/);
    expect(src).toMatch(/visibleSkillClaims\(\s*claimsWithSaved\s*,/);
    expect(src).toMatch(/skillClaimChips\(\s*skillPresentation\s*,\s*savedClaims\s*\)/);
  });
});
