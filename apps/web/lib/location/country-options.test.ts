import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_ISO_COUNTRIES } from "@/lib/location/country-model";
import { countryOptionsForLocale } from "@/lib/location/country-options";
import { ACTIVE_MARKETS } from "@/lib/taxonomy/work-categories";

describe("countryOptionsForLocale — a market list orders the list, it never shortens it (global-access rule 2026-09-22)", () => {
  it("offers every ISO country, active markets first, the rest alphabetically in the locale", () => {
    const en = countryOptionsForLocale("en");
    expect(en).toHaveLength(ALL_ISO_COUNTRIES.length);
    expect(new Set(en.map((o) => o.value)).size).toBe(ALL_ISO_COUNTRIES.length);
    const head = en.slice(0, ACTIVE_MARKETS.length).map((o) => o.value);
    expect(new Set(head)).toEqual(new Set(ACTIVE_MARKETS));
    const rest = en.slice(ACTIVE_MARKETS.length).map((o) => o.label);
    expect([...rest].sort(new Intl.Collator("en").compare)).toEqual(rest);
    // Vietnam, Ireland, India and the United States are all there, by name.
    for (const [code, name] of [["VN", "Vietnam"], ["IE", "Ireland"], ["IN", "India"], ["US", "United States"]]) {
      expect(en.find((o) => o.value === code)?.label).toBe(name);
    }
  });
  it("labels follow the locale", () => {
    const lt = countryOptionsForLocale("lt");
    expect(lt.find((o) => o.value === "VN")?.label).toBe("Vietnamas");
    expect(lt.find((o) => o.value === "DE")?.label).toBe("Vokietija");
  });
});

/**
 * Every country <select> in the product goes through the canonical options
 * (global-access closure 2026-09-22). MEASURED before this: the onboarding
 * wizard mapped ACTIVE_MARKETS (17) straight into <option>s, so a person in
 * Vietnam, Ireland, Saudi Arabia or the Philippines could not name their own
 * country at the first step of the product.
 */
describe("the onboarding country select offers the world, markets first", () => {
  const src = readFileSync(join(__dirname, "..", "..", "components", "app", "onboarding-wizard.tsx"), "utf8");

  it("renders countryOptionsForLocale(locale), never ACTIVE_MARKETS.map", () => {
    expect(src).toMatch(/import \{ countryOptionsForLocale \} from "@\/lib\/location\/country-options";/);
    expect(src).toMatch(/countryOptionsForLocale\(locale\)/);
    expect(src).toMatch(/\{countryOptions\.map\(\(o\) => \(/);
    expect(src).not.toMatch(/ACTIVE_MARKETS\.map\(/);
    expect(src).not.toMatch(/import \{ ACTIVE_MARKETS \}/);
  });

  it("VN / IE / SA / PH are choosable in every active locale, and the markets still lead", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const options = countryOptionsForLocale(locale);
      for (const code of ["VN", "IE", "SA", "PH"]) {
        expect(options.some((o) => o.value === code), `${locale}: ${code}`).toBe(true);
      }
      expect(options.length).toBe(ALL_ISO_COUNTRIES.length);
      const lead = new Set(options.slice(0, ACTIVE_MARKETS.length).map((o) => o.value));
      expect(lead).toEqual(new Set(ACTIVE_MARKETS));
    }
  });
});
