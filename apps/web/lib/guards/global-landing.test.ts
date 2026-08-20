import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { landingTreeFiles, landingTreeSource } from "./landing-composition";

/**
 * Production landing V1 guard (owner decision 2026-08-20).
 *
 * The platform architecture remains global. This acquisition surface tells
 * the approved Europe-first story while keeping precise public data confined
 * to the verified Sweden supply reader. Conceptual sector animation may not
 * claim city-level geography or local market totals.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");
const HOME_PAGE = "app/[locale]/page.tsx";
const COMMAND = "app/[locale]/live-market-review/live-market-command.tsx";
const STYLES = "app/[locale]/live-market-review/live-market-command.module.css";
const DATA = "lib/market/live-market-landing.ts";

describe("(a) the canonical homepage is the approved living market V1", () => {
  it("mounts the shared command surface with canonical SEO metadata", () => {
    const page = read(HOME_PAGE);
    expect(page).toContain("LiveMarketLanding");
    expect(page).toContain("buildPageMetadata");
    expect(page).not.toContain("HeroLiveDemo");
  });

  it("keeps the approved responsive cinematic image foundation", () => {
    const command = read(COMMAND);
    for (const asset of [
      "world-desktop.webp",
      "world-tablet.webp",
      "world-mobile.webp",
    ]) {
      expect(command).toContain(asset);
    }
    expect(command).not.toMatch(/<video|\.mp4|\.webm/i);
  });

  it("the landing composition resolves to the new root and shared command", () => {
    const files = landingTreeFiles(WEB_ROOT, 3);
    expect(files).toContain(HOME_PAGE);
    expect(files).toContain(COMMAND);
  });
});

describe("(b) Europe is primary while geography and numbers remain truthful", () => {
  it("pins the living European labour-market story", () => {
    const catalog = JSON.parse(read("messages/en.json")) as {
      livingMarketReview?: { tagline?: string };
    };
    expect(catalog.livingMarketReview?.tagline).toMatch(
      /living labour market of Europe/i,
    );
  });

  it("renders no named city markers in the conceptual activity layer", () => {
    const command = read(COMMAND);
    for (const city of [
      "Rotterdam",
      "Berlin",
      "Helsinki",
      "Paris",
      "Warsaw",
      "Milan",
      "Antwerp",
      "Bucharest",
      "Copenhagen",
      "Valencia",
    ]) {
      expect(command, city).not.toContain(city);
    }
    expect(command).toContain('data-layer="conceptual-sector-activity"');
  });

  it("confines real supply to the governed Sweden reader", () => {
    const command = read(COMMAND);
    const data = read(DATA);
    expect(command).toContain("labels.currentSupply");
    expect(command).toContain('of("SE")');
    expect(data).toContain("readPublicVacancySupplyCounts");
    expect(data).toContain("searchPublicVacancyPreviews");
    expect(data).toContain("no vacancy coordinates");
    expect(command).not.toMatch(/41[,.]272|7[,.]920|4[,.]289/);
  });
});

describe("(c) landing navigation and actions stay real", () => {
  const resolves = (href: string): boolean => {
    const clean = href.replace(/[#?].*$/, "").replace(/^\//, "");
    if (!clean) return existsSync(join(WEB_ROOT, HOME_PAGE));
    const bits = clean.split("/");
    return [
      join(WEB_ROOT, "app", "[locale]", ...bits, "page.tsx"),
      join(WEB_ROOT, "app", "[locale]", "(marketing)", ...bits, "page.tsx"),
    ].some((candidate) => existsSync(candidate));
  };

  it("worker, employer and login actions resolve to real routes", () => {
    const command = read(COMMAND);
    const hrefs = [...command.matchAll(/href="([^"]+)"/g)].map(
      (match) => match[1],
    );
    for (const href of hrefs.filter((value) => !value.includes("${"))) {
      expect(resolves(href), `dead landing link: ${href}`).toBe(true);
    }
  });

  it("the how-it-works link lands on the evidence sequence", () => {
    const command = read(COMMAND);
    expect(command).toContain('href="/#how-it-works"');
    expect(command).toContain('id="how-it-works"');
  });
});

describe("(d) landing motion is optional and page-owned", () => {
  it("honours reduced motion and pauses when the document is hidden", () => {
    const source = landingTreeSource(WEB_ROOT, 3);
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("visibilitychange");
    expect(read(STYLES)).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
