import { describe, expect, it } from "vitest";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";
import { readTargetOccupationGap, targetOccupationFromSentence } from "./target-occupation-gap";

const row = (slug: string, entries: number, confirmedHours = 0, confirmed = 0) => ({
  slug,
  entries,
  confirmedHours,
  provenance: { confirmed },
});

describe("named-target skill gap (owner 2026-09-29 §13)", () => {
  it("reads the occupation the question names", () => {
    const read = targetOccupationFromSentence;
    expect(read("Ką turėčiau išmokti, kad galėčiau dirbti suvirintoju?")).toBe("welder");
    expect(read("Ką turėčiau išmokti, kad galėčiau dirbti virėju?")).toBe("cook");
    expect(read("Ko man trūksta, kad galėčiau dirbti virtuvės pagalbininku?")).toBe("kitchen_helper");
    expect(read("What should I learn to work as a welder?")).toBe("welder");
    expect(read("Was muss ich lernen, um als Schweißer zu arbeiten?")).toBe("welder");
    expect(read("Чему мне нужно научиться, чтобы работать сварщиком?")).toBe("welder");
    // no occupation named → the general gap answer keeps the question
    expect(read("Kokių įgūdžių man trūksta?")).toBeNull();
  });

  it("puts every required skill on the rung the person's own rows support — never higher", () => {
    const gap = readTargetOccupationGap("welder", [
      row("arc-welding", 4, 12),
      row("gas-cutting", 2),
      row("tig-welding", 0),
      row("tiling", 9, 30), // evidence outside the target is not counted toward it
    ])!;
    expect(gap.required).toEqual(skillsForProfession("welder"));
    expect(gap.confirmed).toEqual(["arc-welding"]);
    expect(gap.recorded).toEqual(["gas-cutting"]);
    expect(gap.stated).toEqual(["tig-welding"]);
    expect(gap.missing).toEqual(["mig-mag-welding", "structural-steel", "welding-blueprint"]);
  });

  it("an untimed confirmed entry still counts as confirmed", () => {
    const gap = readTargetOccupationGap("cook", [row("cooking", 1, 0, 1)])!;
    expect(gap.confirmed).toEqual(["cooking"]);
    expect(gap.missing).toEqual(["waiting-tables"]);
  });

  it("an occupation the platform has no requirements for is unknown, not 'nothing missing'", () => {
    expect(readTargetOccupationGap("astronaut", [])).toBeNull();
  });
});
