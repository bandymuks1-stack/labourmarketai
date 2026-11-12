import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { PUBLIC_INTENT_IDS, goalHref } from "@/lib/navigation/public-intents";

/**
 * THE LANDING'S FIRST SCREEN IS THE CHOICE (owner priority 2026-11-12).
 *
 *  1. the six intent cards render in the hero, directly under the promise and
 *     BEFORE the primary pair — a first visitor sees the choice first;
 *  2. the cards are the header's own six (one list) in the one card rail;
 *     a card opens the goal's level-2 view, whose cards are the functions
 *     themselves — two actions from the home screen to the start of a function;
 *  3. nothing earlier owner orders put on the first screen was removed.
 */

const APP_ROOT = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const landing = read("app/[locale]/focus-landing/focus-landing.tsx");
const choice = read("components/marketing/landing-intent-choice.tsx");

describe("the choice is on the first screen", () => {
  it("mounts once, inside the promise, right under the headline and before the primary pair", () => {
    expect(landing.match(/<LandingIntentChoice \/>/g)).toHaveLength(1);
    const headline = landing.indexOf('{tHero("headline")}');
    const cards = landing.indexOf("<LandingIntentChoice />");
    const sub = landing.indexOf('{tHero("sub")}');
    const pair = landing.indexOf('<LandingPrimaryActions locale={locale} surface="landing_hero" />');
    expect(headline).toBeGreaterThan(-1);
    expect(cards).toBeGreaterThan(headline);
    expect(sub).toBeGreaterThan(cards);
    expect(pair).toBeGreaterThan(sub);
  });

  it("keeps what earlier owner orders put there", () => {
    expect(landing).toMatch(/<LandingThreeWays \/>/);
    expect(landing).toMatch(/<LandingRequestDoors locale=\{locale\} \/>/);
    expect(landing).toMatch(/<PublicEntry/);
  });
});

describe("one navigation system, three levels", () => {
  const rail = read("components/navigation/goal-rail.tsx");
  const page = read("app/[locale]/(marketing)/start/[goal]/page.tsx");

  it("level 1 is the header's six goals in the ONE card rail, each opening its own view", () => {
    expect(choice).toMatch(/<GoalRail \/>/);
    expect(rail).toMatch(/PUBLIC_INTENTS\.map\(/);
    expect(rail).toMatch(/href: goalHref\(intent\.id\)/);
    expect(rail.match(/<AreaSwitcher\b/g)).toHaveLength(2);
    expect(rail).not.toMatch(/href[=:]\s*["'`]\//);
    expect(rail).toMatch(/getTranslations\("siteNav"\)/);
  });

  it("every goal has a level-2 view, statically, and unknown goals are a 404", () => {
    expect(PUBLIC_INTENT_IDS.map((id) => goalHref(id))).toEqual(
      PUBLIC_INTENT_IDS.map((id) => `/start/${id}`),
    );
    expect(page).toMatch(/PUBLIC_INTENT_IDS\.map\(\(goal\) => \(\{ goal \}\)\)/);
    expect(page).toMatch(/export const dynamicParams = false;/);
    expect(page).toMatch(/if \(!isPublicIntentId\(goal\)\) notFound\(\);/);
  });

  it("level 2 shows only that goal's functions, each card the function itself", () => {
    expect(page).toMatch(/<GoalFunctionRail intent=\{intent\} \/>/);
    expect(rail).toMatch(/intent\.links\.map\(\(link\) => \(\{[\s\S]{0,120}href: link\.href/);
  });

  it("level 3 is never the only way in: search and view-all sit beside the catalogue", () => {
    expect(page).toMatch(/intent\.id === "work" && \(/);
    expect(page).toMatch(/<form action=\{`\/\$\{locale\}\/jobs`\} method="get"/);
    expect(page).toMatch(/<ProfessionCarousel \/>/);
    expect(page).toMatch(/data-testid="goal-view-all"/);
  });

  it("history is clear: a named way back, the active goal marked, a real URL", () => {
    expect(page).toMatch(/data-testid="goal-back"/);
    expect(page).toMatch(/<GoalRail \/>/);
    // The rail marks the card whose area holds the current path.
    expect(read("components/app/area-switcher.tsx")).toMatch(/aria-current=\{isHere \? "page" : undefined\}/);
  });

  it("the public sitemap lists the six goal views", () => {
    expect(read("app/sitemap.ts")).toMatch(/"\/start\/work"/);
  });
});
