import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_ISO_COUNTRIES } from "@/lib/location/country-model";
import {
  countryOptionsForLocale,
  filterCountryOptions,
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
    expect(src).toMatch(/filter=\{filterCountryOptions\}/);
    expect(src).toMatch(/country_search_placeholder/);

    const lt = countryOptionsForLocale("lt");
    const only = (q: string) => filterCountryOptions(lt, q).map((o) => o.value);
    // The owner's own acceptance example.
    expect(lt.find((o) => o.value === "DE")?.label).toBe("Vokietija");
    expect(only("Vok")).toEqual(["DE"]);
    expect(only("vok")).toEqual(["DE"]);
    expect(only("vokietija")).toEqual(["DE"]);
    // Diacritics are folded, so a person typing on a plain keyboard still
    // finds Čekija and Prancūzija.
    expect(lt.find((o) => o.value === "CZ")?.label).toBe("Čekija");
    expect(only("cek")).toEqual(["CZ"]);
    expect(only("Čeki")).toEqual(["CZ"]);
    // The French overseas territories legitimately share that prefix
    // ("Prancūzijos Gviana", "Prancūzijos Polinezija"), so this is a
    // containment check, not an equality one — the filter narrows, it does
    // not decide.
    expect(only("prancuz")).toContain("FR");
    expect(only("prancuzija")).toEqual(["FR"]);
    // A word inside the name is findable; a bare substring is not a match.
    const en = countryOptionsForLocale("en");
    expect(filterCountryOptions(en, "States").map((o) => o.value)).toContain("US");
    expect(filterCountryOptions(en, "nited")).toEqual([]);
    // An empty query hides nothing.
    expect(filterCountryOptions(lt, "  ")).toHaveLength(lt.length);
    // And it never invents a country: a place that is not one matches nothing.
    expect(filterCountryOptions(lt, "Hanojus")).toEqual([]);
  });

  /**
   * CODEX P2 ON #1878 — the exactly-named country must LEAD, because the
   * control commits the first row on Enter. Measured before the fix: the
   * options are ordered active markets first, alphabetically, so in English
   * Denmark sits above Germany; "DE" matched Denmark by label prefix and
   * Germany by ISO code, and Enter saved DK. "Guinea" saved GQ.
   */
  it("an exact code, name or alias leads its prefix neighbours", () => {
    const en = countryOptionsForLocale("en");
    const order = (q: string) => filterCountryOptions(en, q).map((o) => o.value);

    // The reported case, in both directions: Denmark is still offered.
    expect(en.findIndex((o) => o.value === "DK")).toBeLessThan(
      en.findIndex((o) => o.value === "DE"),
    );
    expect(order("DE")[0]).toBe("DE");
    expect(order("DE")).toContain("DK");
    expect(order("de")[0]).toBe("DE");

    // The second reported case: "Guinea" is not even ambiguous.
    expect(order("Guinea")[0]).toBe("GN");
    expect(order("Guinea")).toContain("GQ");

    // A complete name and a documented alias resolve the same way.
    expect(order("Germany")[0]).toBe("DE");
    expect(order("Deutschland")[0]).toBe("DE");
    expect(order("UK")[0]).toBe("GB");
    expect(order("Viet Nam")[0]).toBe("VN");

    // On a Lithuanian screen too — the resolver reads all 21 product languages.
    const lt = countryOptionsForLocale("lt");
    expect(filterCountryOptions(lt, "Germany")[0]?.value).toBe("DE");
    expect(filterCountryOptions(lt, "DE")[0]?.value).toBe("DE");

    // A partial query has no exact answer, so the canonical order stands.
    expect(filterCountryOptions(lt, "Vok").map((o) => o.value)).toEqual(["DE"]);
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
