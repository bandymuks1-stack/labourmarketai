import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * THE LANDING'S FIRST SCREEN IS THE CHOICE (owner priority 2026-11-12).
 *
 *  1. the six intent cards render in the hero, directly under the promise and
 *     BEFORE the primary pair — a first visitor sees the choice first;
 *  2. the cards are the header's own six (one list), each ONE link to the
 *     intent's first destination — no intermediate page, no second literal;
 *  3. nothing earlier owner orders put on the first screen was removed.
 */

const APP_ROOT = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const landing = read("app/[locale]/focus-landing/focus-landing.tsx");
const choice = read("components/marketing/landing-intent-choice.tsx");

describe("the choice is on the first screen", () => {
  it("mounts once, inside the promise, after the sub and before the primary pair", () => {
    expect(landing.match(/<LandingIntentChoice \/>/g)).toHaveLength(1);
    const sub = landing.indexOf('{tHero("sub")}');
    const cards = landing.indexOf("<LandingIntentChoice />");
    const pair = landing.indexOf('<LandingPrimaryActions locale={locale} surface="landing_hero" />');
    expect(sub).toBeGreaterThan(-1);
    expect(cards).toBeGreaterThan(sub);
    expect(pair).toBeGreaterThan(cards);
  });

  it("keeps what earlier owner orders put there", () => {
    expect(landing).toMatch(/<LandingThreeWays \/>/);
    expect(landing).toMatch(/<LandingRequestDoors locale=\{locale\} \/>/);
    expect(landing).toMatch(/<PublicEntry/);
  });
});

describe("the cards are the header's six, one link each", () => {
  it("built from PUBLIC_INTENTS and each card is the intent's first destination", () => {
    expect(choice).toMatch(/PUBLIC_INTENTS\.map\(/);
    expect(choice).toMatch(/href=\{primaryHref\(intent\)\}/);
    expect(choice).not.toMatch(/href[=:]\s*["'`]\//);
  });

  it("labels are the header's labels (siteNav), not a second vocabulary", () => {
    expect(choice).toMatch(/getTranslations\("siteNav"\)/);
    expect(choice).toMatch(/t\(`intents\.\$\{intent\.id\}\.title`\)/);
  });

  it("two columns on a phone so all six fit; cards are comfortable touch targets", () => {
    expect(choice).toMatch(/grid-cols-2[^"]*sm:grid-cols-3/);
    expect(choice).toMatch(/min-h-\[4\.5rem\]/);
    expect(choice).toMatch(/motion-reduce:transition-none/);
  });
});
