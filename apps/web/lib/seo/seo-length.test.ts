import { describe, expect, it } from "vitest";
import { BRAND_NAME, PAGE_SEO, brandedTitle, buildPageMetadata } from "./metadata";

/**
 * SEO audit 2026-11-03: the brand appeared twice in titles that already name it
 * ("What is LabourMarket.ai · LabourMarket.ai"), and the six longest curated
 * descriptions (180–420 characters) were cut off in search results.
 */
describe("brandedTitle", () => {
  it("appends the brand once", () => {
    expect(brandedTitle("Open jobs")).toBe(`Open jobs · ${BRAND_NAME}`);
  });
  it("never repeats a brand the title already names", () => {
    expect(brandedTitle("What is LabourMarket.ai")).toBe("What is LabourMarket.ai");
    expect(buildPageMetadata({ locale: "en", path: "/about", title: "What is LabourMarket.ai" }).title).toBe(
      "What is LabourMarket.ai",
    );
  });
});

const SHORTENED = ["workers", "createCv", "projectCostCalculator", "professions", "jobs", "workOpportunities"] as const;

describe("shortened curated descriptions stay within 160 characters", () => {
  for (const key of SHORTENED) {
    it(key, () => {
      for (const [locale, copy] of Object.entries(PAGE_SEO[key])) {
        expect(copy.description.length, `${key}.${locale}`).toBeLessThanOrEqual(160);
      }
    });
  }
});
