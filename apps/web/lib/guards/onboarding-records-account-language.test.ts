import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE ACCOUNT LANGUAGE IS THE ONE THE PERSON ONBOARDED IN (audit 2026-10-20).
 * OAuth signups carry no locale, the signup trigger defaults to 'lt', the shell
 * upsert never overwrites and complete_onboarding does not write it — so a
 * person onboarded on /en was later redirected to /lt (locale-preference.ts
 * trusts profiles.locale once onboarded).
 */
const src = readFileSync(resolve(__dirname, "..", "auth", "actions.ts"), "utf8");

describe("onboarding records the account language", () => {
  it("after complete_onboarding succeeds, an ACTIVE locale from the form is written to the person's own row", () => {
    const rpc = src.indexOf('supabase.rpc("complete_onboarding"');
    const write = src.indexOf('.update({ locale: onboardedLocale })');
    expect(rpc).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(rpc);
    expect(src).toMatch(/\(activeLocales as readonly string\[\]\)\.includes\(onboardedLocale\)/);
    expect(src.slice(write, write + 200)).toMatch(/\.eq\("id", user\.id\)/);
  });
});
