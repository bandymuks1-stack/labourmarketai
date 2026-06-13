/**
 * Public evidence integrity guards (Step 2 — evidence hardening).
 *
 *  - No fake/illustrative market CHART may render on the public homepage without
 *    a visible "illustrative" label or real provenance (the sample sparkline
 *    section was removed; this stops it silently coming back).
 *  - The public homepage must NOT frame the product as construction-only — the
 *    sample personas must span multiple sectors.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");

const MARKETING_PAGE = "app/[locale]/(marketing)/page.tsx";
const PLACEHOLDERS = "content/placeholders.ts";

describe("no fake market charts on the public homepage", () => {
  const page = read(MARKETING_PAGE);

  it("does not render a Sparkline without an illustrative/provenance label", () => {
    if (page.includes("Sparkline")) {
      // If a chart is reintroduced it must carry an honest label.
      expect(
        /illustrative|Placeholder|provenance/i.test(page),
        "a Sparkline on the homepage must be labelled illustrative or carry provenance",
      ).toBe(true);
    } else {
      expect(page.includes("Sparkline")).toBe(false);
    }
  });

  it("does not ship hardcoded sample chart series", () => {
    expect(page.includes("const SPARK")).toBe(false);
  });

  it("does render the source-backed evidence module instead", () => {
    expect(page).toContain("LabourMarketEvidence");
  });

  it("the MarketPulse concept panels carry a visible illustrative label", () => {
    const mp = read("components/marketing/market-pulse.tsx");
    expect(mp).toContain("illustrativeSample");
    expect(mp).toContain("market-pulse-illustrative");
  });
});

describe("public homepage is not construction-only", () => {
  const ph = read(PLACEHOLDERS);

  it("sample personas/roles span multiple non-construction sectors", () => {
    // At least several distinct non-construction sector signals must appear in
    // the public sample data (player cards, draft board, demand, pulse).
    const nonConstruction = [
      "Warehouse",
      "Delivery driver",
      "Care assistant",
      "Chef",
      "Retail",
      "Cleaner",
      "IT support",
      "CNC",
      "Customer service",
      "Nursing & care",
    ];
    const present = nonConstruction.filter((w) => ph.includes(w));
    expect(
      present.length,
      `expected ≥6 non-construction sector signals, found ${present.length}: ${present.join(", ")}`,
    ).toBeGreaterThanOrEqual(6);
  });

  it("the featured player cards are diversified beyond construction", () => {
    // The four featured hero/showcase cards used to be all construction. At
    // least the logistics, care and hospitality roles must now be present.
    for (const role of ["Warehouse Team Lead", "Care Coordinator", "Chef de partie"]) {
      expect(ph.includes(role), `featured cards should include "${role}"`).toBe(true);
    }
  });
});
