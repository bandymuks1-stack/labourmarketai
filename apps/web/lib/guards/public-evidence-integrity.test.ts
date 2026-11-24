import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { landingTreeSource } from "./landing-composition";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf8");

/**
 * The public homepage states only what its readers return. (The LIVE arm's
 * conceptual sector scene and its checks were removed with the arm by owner
 * decision 2026-09-30; the shared reader and the landing tree stay pinned.)
 */
describe("public homepage evidence integrity", () => {
  const landing = landingTreeSource(webRoot, 3);
  const data = read("lib/market/live-market-landing.ts");

  it("uses public readers rather than hardcoded market totals", () => {
    expect(data).toContain("readPublicVacancySupplyCounts");
    expect(data).toContain("searchPublicVacancyPreviews");
    expect(landing).not.toMatch(/41[,.]272|7[,.]920|4[,.]289/);
  });

  it("contains no fake trend chart or recent-activity timestamp", () => {
    expect(landing).not.toContain("Sparkline");
    expect(landing).not.toContain("const SPARK");
    expect(landing).not.toMatch(/\bminutesAgo\b|\b\d+\s+min ago\b/i);
  });
});
