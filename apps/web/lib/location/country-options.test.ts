import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_ISO_COUNTRIES } from "@/lib/location/country-model";
import {
  countryOptionMatches,
  countryOptionsForLocale,
} from "@/lib/location/country-options";
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
    expect(src).toMatch(/from "@\/lib\/location\/country-options"/);
    expect(src).toMatch(/countryOptionsForLocale\(locale\)/);
    // The control is the canonical dark listbox, fed the WHOLE option list.
    expect(src).toMatch(/options=\{countryOptions\}/);
    expect(src).not.toMatch(/ACTIVE_MARKETS\.map\(/);
    expect(src).not.toMatch(/import \{ ACTIVE_MARKETS \}/);
  });

  /**
   * SEARCHABLE, because 249 correct options are unreachable by scrolling
   * (owner direction 2026-09-27: a person in Germany could not find Vokietija
   * on production onboarding). The filter must not become a second, weaker
   * country model — it consults the canonical fold and the ONE resolver.
   */
  it("the field is searchable and the filter answers a partial localized name", () => {
    expect(src).toMatch(/searchable/);
    expect(src).toMatch(/match=\{countryOptionMatches\}/);
    expect(src).toMatch(/country_search_placeholder/);

    const lt = countryOptionsForLocale("lt");
    const de = lt.find((o) => o.value === "DE")!;
    // The owner's own acceptance example.
    expect(de.label).toBe("Vokietija");
    expect(countryOptionMatches(de, "Vok")).toBe(true);
    expect(countryOptionMatches(de, "vok")).toBe(true);
    expect(countryOptionMatches(de, "vokietija")).toBe(true);
    // The code and a complete name in ANOTHER product language still resolve,
    // through `resolveCountryCode` — no second alias table here.
    expect(countryOptionMatches(de, "DE")).toBe(true);
    expect(countryOptionMatches(de, "Germany")).toBe(true);
    expect(countryOptionMatches(de, "Deutschland")).toBe(true);
    // Diacritics are folded, so a person typing on a plain keyboard still
    // finds Čekija and Prancūzija.
    const cz = lt.find((o) => o.value === "CZ")!;
    expect(cz.label).toBe("Čekija");
    expect(countryOptionMatches(cz, "cek")).toBe(true);
    expect(countryOptionMatches(cz, "Čeki")).toBe(true);
    expect(countryOptionMatches(lt.find((o) => o.value === "FR")!, "prancuz")).toBe(true);
    // A word inside the name is findable, a bare substring is not a match.
    const us = countryOptionsForLocale("en").find((o) => o.value === "US")!;
    expect(countryOptionMatches(us, "States")).toBe(true);
    expect(countryOptionMatches(us, "nited")).toBe(false);
    // An empty query hides nothing.
    expect(countryOptionMatches(de, "  ")).toBe(true);
    // And it never invents a country: a place that is not one matches nothing.
    for (const option of lt) {
      expect(countryOptionMatches(option, "Hanojus"), option.value).toBe(false);
    }
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
