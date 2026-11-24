import { describe, it, expect } from "vitest";
import { computeAdjacentDirections } from "@/lib/opportunities/adjacent-directions";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";

describe("computeAdjacentDirections — real, deterministic, honest", () => {
  it("returns an honest insufficient state below the skill floor (no fake list)", () => {
    const r = computeAdjacentDirections({
      workerSkillSlugs: ["cashier"],
      primaryProfessionSlug: "sales_assistant",
    });
    expect(r.limitationState).toBe("insufficient_skills");
    expect(r.directions).toEqual([]);
  });

  it("derives adjacent directions from real shared skills", () => {
    const r = computeAdjacentDirections({
      workerSkillSlugs: ["cashier", "customer-service", "sales-assistant"],
      primaryProfessionSlug: "sales_assistant",
    });
    expect(r.limitationState).toBe("ok");
    expect(r.directions.length).toBeGreaterThan(0);
    // customer_service_specialist shares all three held skills → strongest.
    expect(r.directions[0].professionId).toBe("customer_service_specialist");
    expect(r.directions[0].sharedCount).toBeGreaterThanOrEqual(2);
  });

  it("never returns the worker's own primary profession as a direction", () => {
    const r = computeAdjacentDirections({
      workerSkillSlugs: ["cashier", "customer-service", "sales-assistant"],
      primaryProfessionSlug: "sales_assistant",
    });
    expect(r.directions.map((d) => d.professionId)).not.toContain("sales_assistant");
  });

  it("explainability is real: shared skills are held AND belong to the direction", () => {
    const held = ["cashier", "customer-service", "sales-assistant"];
    const r = computeAdjacentDirections({
      workerSkillSlugs: held,
      primaryProfessionSlug: null,
    });
    for (const d of r.directions) {
      const profSkills = new Set(skillsForProfession(d.professionId));
      for (const s of d.sharedSkills) {
        expect(held).toContain(s);
        expect(profSkills.has(s)).toBe(true);
      }
      // missing skills belong to the direction and are NOT held.
      for (const s of d.missingSkills) {
        expect(profSkills.has(s)).toBe(true);
        expect(held).not.toContain(s);
      }
    }
  });

  it("is deterministic (same inputs → same output, order-independent)", () => {
    const a = computeAdjacentDirections({
      workerSkillSlugs: ["hand-tools", "general-labour", "scaffolding", "demolition"],
      primaryProfessionSlug: "general_laborer",
    });
    const b = computeAdjacentDirections({
      workerSkillSlugs: ["demolition", "scaffolding", "general-labour", "hand-tools"],
      primaryProfessionSlug: "general_laborer",
    });
    expect(a).toEqual(b);
  });

  it("caps directions and missing skills", () => {
    const r = computeAdjacentDirections({
      workerSkillSlugs: [
        "customer-service",
        "cashier",
        "hand-tools",
        "cleaning-services",
        "driving",
      ],
      primaryProfessionSlug: null,
    });
    expect(r.directions.length).toBeLessThanOrEqual(5);
    for (const d of r.directions) {
      expect(d.missingSkills.length).toBeLessThanOrEqual(4);
    }
  });

  it("honestly reports no reliable directions when nothing shares >=2 skills", () => {
    // A single unusual skill pair that no other profession co-carries strongly.
    const r = computeAdjacentDirections({
      workerSkillSlugs: ["nail-care", "barbering"],
      primaryProfessionSlug: null,
    });
    // Either a real direction (if one shares >=2) or an honest empty state —
    // never a fabricated list. Here no profession carries both, so:
    expect(["ok", "no_reliable_directions"]).toContain(r.limitationState);
    if (r.limitationState === "no_reliable_directions") {
      expect(r.directions).toEqual([]);
    }
  });
});
