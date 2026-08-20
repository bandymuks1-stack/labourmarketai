import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const webRoot = join(__dirname, "..", "..");
const reviewRoot = join(webRoot, "app", "[locale]", "live-market-review");

const pageSource = readFileSync(join(reviewRoot, "page.tsx"), "utf8");
const commandSource = readFileSync(
  join(reviewRoot, "live-market-command.tsx"),
  "utf8",
);
const stylesSource = readFileSync(
  join(reviewRoot, "live-market-command.module.css"),
  "utf8",
);
const dataSource = readFileSync(
  join(webRoot, "lib", "market", "live-market-landing.ts"),
  "utf8",
);

describe("live market owner-review surface", () => {
  it("uses the governed current vacancy projection instead of pinned UI numbers", () => {
    expect(pageSource).toContain("readLiveMarketLandingSnapshot");
    expect(dataSource).toContain("readPublicVacancySupplyCounts");
    expect(dataSource).toContain("searchPublicVacancyPreviews");
    expect(commandSource).not.toMatch(/41[,.]272|7[,.]920|4[,.]289/);
  });

  it("uses real Europe geometry and does not ship a raster or video hero", () => {
    expect(commandSource).toContain("EUROPE_GEO");
    expect(commandSource).toContain('country.code === "SE"');
    expect(commandSource).not.toMatch(
      /<img|<video|\.mp4|\.webm|background-image:\s*url/i,
    );
  });

  it("keeps the anonymous truth boundary coarse and links to real product routes", () => {
    expect(dataSource).toContain("no vacancy coordinates");
    expect(dataSource).toContain(
      "no vacancy coordinates, employer identities or",
    );
    expect(commandSource).toContain("/jobs/${job.id}");
    expect(commandSource).toContain("/auth/signup");
    expect(commandSource).toContain("/company-need");
  });

  it("keeps automatic movement optional", () => {
    expect(commandSource).toContain("prefers-reduced-motion: reduce");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesSource).toContain('data-reduced-motion="true"');
  });
});
