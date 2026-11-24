/**
 * Whole Labour Market Correction guard.
 *
 * The public footer tagline must NOT frame the product as construction-only,
 * and the labour-market statistics source registry must exist (no public
 * number without a cited source).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");

function tagline(locale: string): string {
  const json = JSON.parse(
    readFileSync(resolve(webRoot, "messages", `${locale}.json`), "utf-8"),
  ) as { footer?: { tagline?: string } };
  return json.footer?.tagline ?? "";
}

describe("public copy is not construction-only", () => {
  it("EN footer tagline drops the construction-only framing", () => {
    const t = tagline("en");
    expect(t.toLowerCase()).not.toContain("for construction");
    expect(t.toLowerCase()).toContain("every sector");
  });

  it("LT footer tagline drops the construction-only framing", () => {
    const t = tagline("lt");
    expect(t).not.toContain("statybų darbo rinka");
    expect(t.toLowerCase()).toContain("sektori");
  });

  it("RU footer tagline drops the construction-only framing", () => {
    const t = tagline("ru");
    expect(t).not.toContain("для строительства");
    expect(t.toLowerCase()).toContain("сектор");
  });

  it("no locale tagline still says 'for construction'", () => {
    for (const l of ["en", "lt", "ru", "de", "da", "et", "lv", "nl", "no", "pl", "sv"]) {
      expect(
        tagline(l).toLowerCase().includes("for construction"),
        `${l} tagline must not be construction-only`,
      ).toBe(false);
    }
  });
});

describe("labour-market statistics source registry", () => {
  it("the source registry exists and lists the allowed sources", () => {
    const p = resolve(
      repoRoot,
      "docs",
      "audits",
      "labour-market-statistics",
      "SOURCE_REGISTRY.md",
    );
    expect(existsSync(p)).toBe(true);
    const md = readFileSync(p, "utf-8");
    for (const src of ["Eurostat", "EURES", "Cedefop", "Eurofound", "OECD"]) {
      expect(md).toContain(src);
    }
    // Binding provenance rule present.
    expect(md.toLowerCase()).toContain("last checked");
  });
});
