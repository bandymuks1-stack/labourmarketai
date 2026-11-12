import { describe, expect, it } from "vitest";

import { BRAND_SEO } from "@/lib/seo/metadata";

import { organizationJsonLd, webSiteJsonLd } from "./answer-seo";

describe("one publisher identity (GEO-6)", () => {
  it("names the same organization on the Organization and WebSite nodes", () => {
    const id = organizationJsonLd("lt")["@id"];
    expect(id).toMatch(/\/#organization$/);
    expect(organizationJsonLd("de")["@id"]).toBe(id);
    expect(webSiteJsonLd("de").publisher["@id"]).toBe(id);
  });

  it("describes it in the page's language", () => {
    expect(organizationJsonLd("lt").description).toBe(BRAND_SEO.lt.description);
    expect(organizationJsonLd("de").description).toBe(BRAND_SEO.de.description);
  });

  it("claims no social profile, because none exists", () => {
    expect(organizationJsonLd("en")).not.toHaveProperty("sameAs");
  });
});
