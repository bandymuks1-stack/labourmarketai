import { describe, expect, it } from "vitest";
import {
  presentSkills,
  skillMagnitude,
  topPresentedSkills,
  type SkillPracticeFacts,
} from "./skill-presentation";

const facts = (over: Partial<SkillPracticeFacts>): SkillPracticeFacts => ({
  attributedHours: 0,
  confirmedHours: 0,
  sharedHours: 0,
  share: 0,
  entries: 0,
  days: 0,
  contexts: 0,
  lastWorkedDay: null,
  ...over,
});

const NAMES: Record<string, string> = {
  programming: "Programavimas",
  "event-setup": "Renginių paruošimas",
  "cleaning-services": "Patalpų valymas",
  tiling: "Plytelių klojimas",
};
const nameOf = (slug: string) => NAMES[slug] ?? slug;

describe("skill presentation — duplicates fold without a destructive merge (owner defect D)", () => {
  // NEGATIVE CONTROL: on the pre-change tree the CV page rendered
  // `tSkill("programming")` = "Programavimas" AND the claim's
  // `normalized_label` = "programavimas" as two chips (cv/page.tsx
  // declaredAll); nothing folded them.
  it("a free-label claim that is the catalogue skill's own name is shown as the skill, once", () => {
    const p = presentSkills({
      tiers: { confirmed: [], evidence: ["programming"], declared: [] },
      claims: [{ id: "c1", label: "programavimas", origin: "profile" }],
      practice: { programming: facts({ attributedHours: 10, entries: 3, share: 1 }) },
      nameOf,
    });
    expect(p.visible).toBe(1);
    expect(p.claimsFoldedIntoSkills).toBe(1);
    const item = p.groups[0]!.items[0]!;
    expect(item.slug).toBe("programming");
    expect(item.variants).toEqual(["Programavimas", "programavimas"]);
    expect(item.claimIds).toEqual(["c1"]);
  });

  it("a claim whose lexicon mapping points at a held slug folds into that skill", () => {
    const p = presentSkills({
      tiers: { confirmed: [], evidence: [], declared: ["cleaning-services"] },
      claims: [
        { id: "c2", label: "valau patalpas", origin: "profile", mappedSlugs: ["cleaning-services"] },
      ],
      practice: {},
      nameOf,
    });
    expect(p.visible).toBe(1);
    expect(p.groups[0]!.items[0]!.claimIds).toEqual(["c2"]);
  });

  it("case and diacritic variants of a free label are one item that names its variants", () => {
    const p = presentSkills({
      tiers: { confirmed: [], evidence: [], declared: [] },
      claims: [
        { id: "a", label: "renginių paruošimas", origin: "journal" },
        { id: "b", label: "Renginių paruošimas", origin: "profile" },
        { id: "c", label: "Renginiu paruosimas", origin: "profile" },
      ],
      practice: {},
      nameOf,
    });
    expect(p.visible).toBe(1);
    expect(p.variantsFolded).toBe(2);
    const item = p.groups[0]!.items[0]!;
    expect(item.tier).toBe("self_stated");
    // the person's upper-case spelling is the one shown; nothing invented
    expect(item.name).toBe("Renginių paruošimas");
    expect(item.variants).toHaveLength(3);
    expect(item.claimIds).toEqual(["a", "b", "c"]);
    expect(item.claimOrigin).toBe("profile");
  });

  it("different labels stay different items", () => {
    const p = presentSkills({
      tiers: { confirmed: [], evidence: [], declared: [] },
      claims: [
        { label: "Patalpų valymas", origin: "profile" },
        { label: "Patalpų priežiūra", origin: "profile" },
      ],
      practice: {},
      nameOf,
    });
    expect(p.visible).toBe(2);
  });
});

describe("skill presentation — magnitude is visible and ordered (owner defect C)", () => {
  it("0.5 h is a trace and 40 h is major; unknown journal is unknown, never zero", () => {
    expect(skillMagnitude(facts({ attributedHours: 0.5, entries: 1 }), true)).toBe("trace");
    expect(skillMagnitude(facts({ attributedHours: 40, entries: 2 }), true)).toBe("major");
    expect(skillMagnitude(facts({ attributedHours: 3, entries: 1 }), true)).toBe("supported");
    expect(skillMagnitude(facts({ entries: 6, share: 0.3 }), true)).toBe("major");
    expect(skillMagnitude(null, true)).toBe("none");
    expect(skillMagnitude(facts({ attributedHours: 40 }), false)).toBe("unknown");
    expect(skillMagnitude(facts({ sharedHours: 4 }), true)).toBe("trace");
  });

  it("within a tier, hours order the items; across tiers, evidence strength comes first", () => {
    const p = presentSkills({
      tiers: {
        confirmed: [],
        evidence: ["tiling", "programming"],
        declared: ["event-setup"],
      },
      claims: [],
      practice: {
        tiling: facts({ attributedHours: 0.5, entries: 1, share: 0.02 }),
        programming: facts({ attributedHours: 25, entries: 8, share: 0.98 }),
        "event-setup": facts({ attributedHours: 100, entries: 20, share: 0 }),
      },
      nameOf,
    });
    expect(p.groups.map((g) => g.tier)).toEqual(["evidence", "declared"]);
    expect(p.groups[0]!.items.map((i) => i.slug)).toEqual(["programming", "tiling"]);
    expect(p.groups[0]!.items.map((i) => i.magnitude)).toEqual(["major", "trace"]);
    // the declared tier's 100 h skill does not outrank a journal-backed one
    const top = topPresentedSkills(p, 2).map((i) => i.slug);
    expect(top).toEqual(["programming", "tiling"]);
  });

  it("unknown journal: every catalogued item is `unknown` and carries no figures", () => {
    const p = presentSkills({
      tiers: { confirmed: ["tiling"], evidence: [], declared: [] },
      claims: [{ label: "x", origin: "profile" }],
      practice: null,
      nameOf,
    });
    for (const g of p.groups) for (const i of g.items) {
      expect(i.magnitude).toBe("unknown");
      expect(i.practice).toBeNull();
    }
  });

  it("two rows for one slug are one skill", () => {
    const p = presentSkills({
      tiers: { confirmed: ["tiling"], evidence: ["tiling"], declared: [] },
      claims: [],
      practice: {},
      nameOf,
    });
    expect(p.visible).toBe(1);
    expect(p.groups[0]!.tier).toBe("confirmed");
  });
});
