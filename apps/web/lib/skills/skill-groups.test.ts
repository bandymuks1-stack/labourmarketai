import { describe, expect, it } from "vitest";
import {
  classifySkillSlug,
  groupSkillsByFunction,
  SKILL_GROUP_ORDER,
} from "./skill-groups";

/**
 * systemic-ux-skills-v1 — the functional taxonomy axis separates the kinds of
 * skill the owner said were being dumped into one flat list.
 */
describe("classifySkillSlug — owner's mixed examples land in distinct groups", () => {
  it("a trade/profession → profession", () => {
    expect(classifySkillSlug("plumber")).toBe("profession");
    expect(classifySkillSlug("tiler")).toBe("profession");
  });
  it("a concrete work skill → specific", () => {
    expect(classifySkillSlug("drainage")).toBe("specific");
    expect(classifySkillSlug("pipefitting")).toBe("specific");
    expect(classifySkillSlug("tiling")).toBe("specific");
  });
  it("a transferable ability → general", () => {
    expect(classifySkillSlug("driving")).toBe("general");
    expect(classifySkillSlug("public-speaking")).toBe("general");
  });
  it("a business/coordination ability → administrative", () => {
    expect(classifySkillSlug("recruiting")).toBe("administrative");
    expect(classifySkillSlug("accounting")).toBe("administrative");
    expect(classifySkillSlug("work-scheduling")).toBe("administrative");
    expect(classifySkillSlug("team-coordination")).toBe("administrative");
  });
  it("unknown slug defaults to specific (never throws)", () => {
    expect(classifySkillSlug("some-unmapped-slug")).toBe("specific");
  });
});

describe("groupSkillsByFunction — emits non-empty buckets in canonical order", () => {
  it("separates a mixed list and keeps order", () => {
    const grouped = groupSkillsByFunction([
      { slug: "plumber" },
      { slug: "drainage" },
      { slug: "driving" },
      { slug: "recruiting" },
      { slug: "tiling" },
    ]);
    const order = grouped.map((g) => g.group);
    // order must follow SKILL_GROUP_ORDER (profession, specific, general, admin)
    const expected = SKILL_GROUP_ORDER.filter((g) => order.includes(g));
    expect(order).toEqual(expected);
    const specific = grouped.find((g) => g.group === "specific");
    expect(specific?.items.map((i) => i.slug)).toEqual(["drainage", "tiling"]);
  });
  it("omits empty buckets", () => {
    const grouped = groupSkillsByFunction([{ slug: "plumber" }]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].group).toBe("profession");
  });
});
