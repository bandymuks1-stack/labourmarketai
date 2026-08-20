import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { landingTreeSource } from "./landing-composition";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf8");

describe("public homepage evidence integrity", () => {
  const landing = landingTreeSource(webRoot, 3);
  const command = read(
    "app/[locale]/live-market-review/live-market-command.tsx",
  );
  const data = read("lib/market/live-market-landing.ts");
  const styles = read(
    "app/[locale]/live-market-review/live-market-command.module.css",
  );

  it("uses public readers rather than hardcoded market totals", () => {
    expect(data).toContain("readPublicVacancySupplyCounts");
    expect(data).toContain("searchPublicVacancyPreviews");
    expect(command).not.toMatch(/41[,.]272|7[,.]920|4[,.]289/);
  });

  it("contains no fake trend chart or recent-activity timestamp", () => {
    expect(landing).not.toContain("Sparkline");
    expect(landing).not.toContain("const SPARK");
    expect(landing).not.toMatch(/\bminutesAgo\b|\b\d+\s+min ago\b/i);
  });

  it("keeps conceptual sector activity separate from named geography", () => {
    expect(command).toContain('data-layer="conceptual-sector-activity"');
    expect(command).not.toMatch(
      /Rotterdam|Berlin|Helsinki|Paris|Warsaw|Milan|Antwerp|Bucharest|Copenhagen|Valencia/,
    );
    expect(styles).toContain("filter: blur(1.8px)");
  });

  it("spans sectors without making construction the product boundary", () => {
    for (const sector of [
      "logistics",
      "care",
      "hospitality",
      "manufacturing",
      "technology",
      "agriculture",
    ]) {
      expect(command).toContain(sector);
    }
  });
});
