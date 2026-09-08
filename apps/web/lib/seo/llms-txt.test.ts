import { describe, expect, it } from "vitest";

import { buildLlmsTxt, LLMS_TXT_PUBLIC_PATHS } from "./llms-txt";

describe("llms.txt (AEO)", () => {
  const txt = buildLlmsTxt("https://labourmarket.ai/");

  it("is Markdown with the H1, a blockquote summary and the canonical origin", () => {
    expect(txt.startsWith("# LabourMarket.ai\n")).toBe(true);
    expect(txt).toMatch(/^> LabourMarket\.ai is a work and professional-life platform/m);
    expect(txt).toContain("Canonical origin: https://labourmarket.ai ");
    // trailing slash on the origin is normalised, never doubled
    expect(txt).not.toContain("https://labourmarket.ai//");
  });

  it("links every public path under the English locale and names all three sitemaps", () => {
    for (const { path } of LLMS_TXT_PUBLIC_PATHS) {
      expect(txt).toContain(`(https://labourmarket.ai/en${path})`);
    }
    expect(txt).toContain("/sitemap.xml");
    expect(txt).toContain("/questions-sitemap.xml");
    expect(txt).toContain("/jobs-sitemap.xml");
    expect(txt).toContain("/.well-known/security.txt");
  });

  it("never points an LLM at a private surface", () => {
    for (const priv of ["/dashboard/", "/onboarding/", "/auth/", "/cv/"]) {
      expect(txt).not.toMatch(new RegExp(`\\]\\(https://labourmarket\\.ai/[a-z]{2}${priv.replace("/", "\\/")}`));
    }
  });

  it("keeps the forbidden claims out (imported vacancies are not customers; no accuracy claims; no drifting counts; no demo framing)", () => {
    expect(txt).toMatch(/imported market data/);
    expect(txt).toMatch(/not customers of LabourMarket\.ai/);
    expect(txt).not.toMatch(/\d{1,3}(,\d{3})+\s+(jobs|vacancies|employers|companies)/i);
    expect(txt).not.toMatch(/accuracy of \d|% match/i);
    expect(txt).not.toMatch(/(?<![\p{L}\p{N}_])demos?(?![\p{L}\p{N}_])/iu);
    expect(txt).not.toMatch(/demonstr/i);
  });
});
