import { describe, expect, it } from "vitest";

import { companyCreateProjectSchema } from "./company-schemas";
import { PROJECT_CITY_MAX, PROJECT_TITLE_MAX, PROJECT_TITLE_MIN } from "@/lib/projects/project-title-limits";

/**
 * AI-1 sweep (2026-11-23): the chat's `company.create-project` refused titles
 * and cities of 121–200 characters that the canonical core and the MCP
 * `project.create_*` accept. One set of limits now serves all three.
 */
describe("project create: the chat accepts what the core and MCP accept", () => {
  it("a 150-character title and city pass the chat schema", () => {
    const r = companyCreateProjectSchema.safeParse({ title: "T".repeat(150), city: "C".repeat(150) });
    expect(r.success).toBe(true);
  });

  it("the bounds are exactly the shared ones", () => {
    expect(companyCreateProjectSchema.safeParse({ title: "T".repeat(PROJECT_TITLE_MAX) }).success).toBe(true);
    expect(companyCreateProjectSchema.safeParse({ title: "T".repeat(PROJECT_TITLE_MAX + 1) }).success).toBe(false);
    expect(companyCreateProjectSchema.safeParse({ title: "T".repeat(PROJECT_TITLE_MIN - 1) }).success).toBe(false);
    expect(companyCreateProjectSchema.safeParse({ title: "Site", city: "C".repeat(PROJECT_CITY_MAX + 1) }).success).toBe(false);
  });
});
