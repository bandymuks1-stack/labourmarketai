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

  it("the hero keeps its h1, its primary actions and the working sentence entry", () => {
    expect(FOCUS).toMatch(/<h1 className="font-display text-4xl/);
    expect(FOCUS).toContain('surface="landing_hero"');
    expect(FOCUS).toContain("<PublicEntry");
  });
});
