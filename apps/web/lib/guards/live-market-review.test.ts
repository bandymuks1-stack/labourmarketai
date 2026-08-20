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

  it("uses the approved cinematic raster foundation without the discarded map experiment", () => {
    expect(commandSource).toContain("world-desktop.webp");
    expect(commandSource).toContain("world-tablet.webp");
    expect(commandSource).toContain("world-mobile.webp");
    expect(commandSource).not.toContain("EUROPE_GEO");
    expect(commandSource).not.toContain('country.code === "SE"');
    expect(commandSource).not.toMatch(/<video|\.mp4|\.webm/i);
    expect(stylesSource).not.toMatch(/sweden|stockholm/i);
  });

  it("keeps the anonymous truth boundary coarse and links to real product routes", () => {
    expect(dataSource).toContain("no vacancy coordinates");
    expect(dataSource).toContain(
      "no vacancy coordinates, employer identities or",
    );
    expect(commandSource).toContain("/jobs/${activeProfession.jobs[0].id}");
    expect(commandSource).toContain("/jobs/${job.id}");
    expect(commandSource).toContain("/auth/signup");
    expect(commandSource).toContain("/company-need");
  });

  it("keeps automatic movement optional", () => {
    expect(commandSource).toContain("prefers-reduced-motion: reduce");
    expect(commandSource).toContain("visibilitychange");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesSource).toContain('data-reduced-motion="true"');
    expect(stylesSource).toContain('data-paused="true"');
  });

  it("shows Europe-wide profession activity and the complete evidence event", () => {
    for (const city of [
      "Rotterdam",
      "Berlin",
      "Helsinki",
      "Paris",
      "Milan",
      "Valencia",
    ]) {
      expect(commandSource).toContain(city);
    }
    for (const profession of [
      "electrician",
      "driver",
      "caregiver",
      "cook",
      "software_developer",
      "farm_worker",
    ]) {
      expect(dataSource).toContain(profession);
    }
    expect(pageSource).toContain("chain.steps.need.title");
    expect(pageSource).toContain("chain.steps.person.title");
    expect(pageSource).toContain("chain.steps.work.title");
    expect(pageSource).toContain("chain.steps.journal.title");
    expect(pageSource).toContain("evidenceVerifiedTitle");
    expect(pageSource).toContain("capabilityGrowsTitle");
    expect(pageSource).toContain("chain.steps.next.title");
    expect(commandSource).toContain("styles.entryBand");
    expect(commandSource).toContain("styles.opportunityStream");
  });
});
