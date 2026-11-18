import { describe, expect, it } from "vitest";
import skillNames from "@/messages/en/skill-names.json";
import { derivePotentialSkills, POTENTIAL_SKILLS } from "./potential-skills";

describe("potential capabilities (Living CV constitution, decision 0023)", () => {
  it("only names catalogue skills, and never a skill as its own potential", () => {
    const catalogue = new Set(Object.keys(skillNames));
    for (const [from, to] of Object.entries(POTENTIAL_SKILLS)) {
      expect(catalogue.has(from), from).toBe(true);
      for (const t of to) {
        expect(catalogue.has(t), t).toBe(true);
        expect(t).not.toBe(from);
      }
    }
  });

  it("welding work points at reading technical drawings, with its source named", () => {
    expect(derivePotentialSkills(["mig-mag-welding", "welding-blueprint"], ["mig-mag-welding", "welding-blueprint"])).toEqual([
      { slug: "blueprint-reading", fromSlugs: ["mig-mag-welding", "welding-blueprint"] },
    ]);
  });

  it("disappears once the person holds the skill in ANY state — the ladder then speaks", () => {
    expect(derivePotentialSkills(["mig-mag-welding"], ["mig-mag-welding", "blueprint-reading"])).toEqual([]);
  });

  it.each([
    [["bookkeeping"], ["data-entry", "office-software"]],
    [["waiting-tables"], ["customer-service"]],
    [["order-picking"], ["barcode-scanning"]],
    [["teaching"], ["presenting"]],
    [["tiling"], ["grouting"]],
  ])("cross-sector: %j → %j", (evidenced, expected) => {
    expect(derivePotentialSkills(evidenced, evidenced).map((p) => p.slug)).toEqual(expected);
  });

  it("is capped and ordered by how many evidenced skills point at it", () => {
    const r = derivePotentialSkills(["structural-steel", "mig-mag-welding", "site-management"], []);
    expect(r[0]).toEqual({ slug: "blueprint-reading", fromSlugs: ["mig-mag-welding", "structural-steel"] });
    expect(r.length).toBeLessThanOrEqual(4);
  });
});
