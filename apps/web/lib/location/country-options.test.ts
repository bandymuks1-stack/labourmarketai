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
