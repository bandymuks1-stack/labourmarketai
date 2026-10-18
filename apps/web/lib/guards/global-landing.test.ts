import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { landingTreeFiles, landingTreeSource } from "./landing-composition";

/**
 * Production landing guard (owner decision 2026-08-20; one arm since the
 * owner withdrew the LIVE presentation, 2026-09-30).
 *
 * The platform architecture remains global. The acquisition surface keeps
 * precise public data confined to the governed supply reader, claims no city
 * geography it does not have, links only to real routes, and owns its motion
 * (reduced motion honoured, the living-worker story resting off screen). The
 * LIVE scene's own pins (its cinematic world images, its conceptual activity
 * layer and its links) left with the scene.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");
const HOME_PAGE = "app/[locale]/page.tsx";
const FOCUS = "app/[locale]/focus-landing/focus-landing.tsx";
const DATA = "lib/market/live-market-landing.ts";

describe("(a) the canonical homepage", () => {
  it("builds canonical SEO metadata for the one landing URL", () => {
    const page = read(HOME_PAGE);
    expect(page).toContain("buildPageMetadata");
    expect(page).toContain('buildPageMetadata({ locale, path: "" })');
  });

  it("the landing composition resolves to the root and its one landing tree", () => {
    const files = landingTreeFiles(WEB_ROOT, 3);
    expect(files).toContain(HOME_PAGE);
    expect(files).toContain(FOCUS);
    expect(files.some((f) => f.includes("live-market-review"))).toBe(false);
  });
});

describe("(b) geography and numbers remain truthful", () => {
  it("names no city the public data cannot place", () => {
    const source = landingTreeSource(WEB_ROOT, 3);
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
      expect(source, city).not.toContain(city);
    }
  });

  it("confines real supply to the governed reader", () => {
    const source = landingTreeSource(WEB_ROOT, 3);
    const data = read(DATA);
    expect(data).toContain("readPublicVacancySupplyCounts");
    expect(data).toContain("searchPublicVacancyPreviews");
    expect(data).toContain("no vacancy coordinates");
    expect(source).not.toMatch(/41[,.]272|7[,.]920|4[,.]289/);
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

  it("every literal landing link resolves to a real route", () => {
    const source = landingTreeSource(WEB_ROOT, 3);
    const hrefs = [...source.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1]!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs.filter((value) => !value.includes("${"))) {
      expect(resolves(href), `dead landing link: ${href}`).toBe(true);
    }
  });

  it("keeps the how-it-works anchor the navigation links to", () => {
    expect(read(FOCUS)).toContain('id="how-it-works"');
  });
});

describe("(d) landing motion is optional and page-owned", () => {
  it("honours reduced motion and rests the story when it is not on screen", () => {
    const hero = read("components/marketing/living-worker-hero.tsx");
    expect(hero).toContain("prefers-reduced-motion: reduce");
    expect(hero).toContain("IntersectionObserver");
    expect(read("app/globals.css")).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
