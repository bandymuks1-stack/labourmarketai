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

  it("the MarketPulse panels use honest product-system language, not fabricated live metrics", () => {
    // Honest-landing preview: the page no longer disclaims fabricated data with
    // an "illustrative" chip — it removes the fabricated data instead. The
    // recent-matches panel shows match LOGIC (need -> readiness), never people
    // or "X min ago" timestamps.
    const feed = read("components/app/recent-matches-feed.tsx");
    expect(feed.includes("minutesAgo")).toBe(false);
    expect(/\bmin ago\b|timeAgo/.test(feed)).toBe(false);
    const mp = read("components/marketing/market-pulse.tsx");
    expect(mp.includes("illustrativeSample")).toBe(false);
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

  it("the public sample player card stays non-construction (S3)", () => {
    // The four FUT-style featured cards were deleted with the concept card
    // (S3 player-card honesty). The ONE public sample persona — shared by the
    // landing showcase and /for-workers via lib/player-card/sample-card.ts —
    // must stay deliberately non-construction (§3.3): a cook, not a builder.
    const sample = read("lib/player-card/sample-card.ts");
    expect(sample).toMatch(/professionSlug:\s*"cook"/);
    const code = sample
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(code.toLowerCase()).not.toMatch(/construction|statyba|bricklay|"mason"|"tiler"/);
  });
});
