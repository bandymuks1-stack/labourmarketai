import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Activation audit 2026-10-26: people who never finished onboarding restarted
 * the wizard about three times as often as those who did — a reload (pull to
 * refresh chained from the country list), a language switch or Back threw a
 * person who had reached step 2 back to step 1, because step, intents and
 * country lived only in React state. These pins keep the fix in place.
 */
const WEB = resolve(__dirname, "../..");
const wizard = readFileSync(resolve(WEB, "components/app/onboarding-wizard.tsx"), "utf8");
const listbox = readFileSync(resolve(WEB, "components/ui/DarkListbox.tsx"), "utf8");

describe("the onboarding wizard keeps its place", () => {
  it("keeps step, intents and country in this tab's sessionStorage — never the name", () => {
    expect(wizard).toMatch(/const ONBOARDING_DRAFT_KEY = "lm\.onboarding\.draft\.v1"/);
    expect(wizard).toMatch(/window\.sessionStorage\.setItem\(ONBOARDING_DRAFT_KEY/);
    expect(wizard).toMatch(/writeOnboardingDraft\(\{ step, intents: \[\.\.\.intents\], country \}\)/);
    expect(wizard).not.toMatch(/writeOnboardingDraft\(\{[^}]*displayName/);
  });

  it("restores once after hydration, only known intents and a listed country", () => {
    expect(wizard).toMatch(/FIRST_RUN_INTENTS as readonly string\[\]\)\.includes\(i\)/);
    expect(wizard).toMatch(/countryOptions\.some\(\(o\) => o\.value === draft\.country\)/);
  });

  it("every storage access is guarded (private mode must not break onboarding)", () => {
    const helpers = wizard.slice(wizard.indexOf("function readOnboardingDraft"), wizard.indexOf("/** Role cards"));
    expect((helpers.match(/try \{/g) ?? []).length).toBe(3);
  });

  it("forgets the draft when onboarding completes, on both success paths", () => {
    expect((wizard.match(/clearOnboardingDraft\(\);/g) ?? []).length).toBe(2);
  });

  it("step 2 opens at its own top", () => {
    expect(wizard).toMatch(/if \(step === 2\) window\.scrollTo\(\{ top: 0 \}\)/);
  });

  it("the listbox does not chain its scroll into the page (pull to refresh)", () => {
    expect(listbox).toMatch(/className="max-h-60 overflow-auto overscroll-contain"/);
  });
});
