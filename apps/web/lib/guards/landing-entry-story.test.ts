import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FROZEN_LANDING_FILES, FROZEN_LANDING_NAMESPACES } from "./landing-freeze";

/**
 * THE PUBLIC ENTRY STORY (owner decision 2026-09-29: landing freeze lifted
 * for the entry hero only). Pins what that permission was conditional on:
 *  - the story is SAMPLE copy over the landing's existing sample persona —
 *    no read, no production fact, and it says "sample" on every step;
 *  - it is told with the PRODUCT's own components (no parallel landing set);
 *  - motion never runs under prefers-reduced-motion and every step is
 *    reachable by hand;
 *  - the working sentence entry and the primary actions stay in the hero;
 *  - the new hero is frozen with the rest of the landing (the new floor).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const STORY = read("components/marketing/landing-journey.tsx");
const DATA = read("lib/marketing/sample-journey.ts");
const FOCUS = read("app/[locale]/focus-landing/focus-landing.tsx");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("landing entry story", () => {
  it("is sample copy over the existing sample persona — it reads nothing", () => {
    expect(DATA).toMatch(/buildSampleWorkerPlayerCard\(/);
    expect(code(DATA)).not.toMatch(/createClient|supabase|fetch\(|\.from\(|cookies\(|headers\(/);
    expect(code(STORY)).not.toMatch(/createClient|supabase|fetch\(/);
    expect(STORY).toContain("{journey.sampleLabel}");
  });

  it("uses the product's own pieces, not a landing copy of them", () => {
    for (const imp of [
      'from "@/components/app/player-card/identity-stage"',
      'from "@/components/app/provenance/provenance-edge"',
      'from "@/components/app/player-card/skill-evidence-chart"',
      'from "@/components/app/workspace/week-strip"',
    ]) {
      expect(STORY).toContain(imp);
    }
  });

  it("motion respects reduced motion and every step is reachable by hand", () => {
    expect(STORY).toMatch(/prefers-reduced-motion: reduce/);
    expect(STORY).toMatch(/setPlaying\(!reduce\)/);
    expect(STORY).toContain("landing-journey-step-${s.key}");
  });

  it("the hero keeps its h1, its primary actions and the working sentence entry", () => {
    expect(FOCUS).toMatch(/<h1 className="font-display text-4xl/);
    expect(FOCUS).toContain('surface="landing_hero"');
    expect(FOCUS).toMatch(/<LandingJourney journey=\{journey\} \/>[\s\S]{0,200}<PublicEntry/);
  });

  it("the new entry is frozen with the landing (the new floor)", () => {
    expect(FROZEN_LANDING_FILES).toContain("components/marketing/landing-journey.tsx");
    expect(FROZEN_LANDING_FILES).toContain("lib/marketing/sample-journey.ts");
    expect(FROZEN_LANDING_NAMESPACES).toContain("landingJourney");
  });
});
