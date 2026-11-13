import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE PUBLIC ENTRY (owner containment 2026-10-08).
 *
 * The sample-persona entry story (`LandingJourney` over "Rasa J.") was
 * removed: no named illustrative persona is presented on the real production
 * path. What stays pinned: the hero keeps its h1, its primary actions and the
 * working sentence entry.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const FOCUS = read("app/[locale]/focus-landing/focus-landing.tsx");

describe("landing entry", () => {
  it("the sample-persona story and its builder are gone", () => {
    expect(existsSync(join(ROOT, "components/marketing/landing-journey.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "lib/marketing/sample-journey.ts"))).toBe(false);
    const code = FOCUS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/<LandingJourney|buildSampleJourney/);
  });

  // 2026-11-12: the hero's "Start now" pair gave way to the goal navigator —
  // owner instruction 2026-11-12 ("Pirmame ekrane turi būti aiškus pasirinkimas, ką žmogus nori atlikti").
  // The h1 keeps the owner's words at a reading size; the choice follows it.
  it("the first screen is the question (the h1), the owner's line, and the working sentence entry", () => {
    // The h1 is the goal navigator's own heading; the owner's headline is the
    // one supporting line under the goals.
    expect(readFileSync(join(ROOT, "components/marketing/landing-intent-choice.tsx"), "utf8")).toContain(
      // Phones show all the goals as a grid (owner P0 2026-11-13).
      '<GoalNavigation headingLevel="h1" phoneLayout="grid" />',
    );
    expect(FOCUS).not.toMatch(/<h1\b/);
    expect(FOCUS).toContain('{tHero("headline")}');
    const body = FOCUS.slice(FOCUS.lastIndexOf("<NextIntlClientProvider"));
    expect(body.indexOf("<LandingIntentChoice />")).toBeGreaterThan(-1);
    expect(body.indexOf("<LandingIntentChoice />")).toBeLessThan(body.indexOf("{promise}"));
    expect(body.indexOf("{promise}")).toBeLessThan(body.indexOf("<PublicEntry"));
  });
});
