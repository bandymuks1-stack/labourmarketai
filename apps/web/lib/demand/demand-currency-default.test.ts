import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DEMAND_CURRENCY_OPTIONS, defaultCurrencyForCountry } from "./structured-demand-form";

/**
 * A Swedish company typed SEK amounts into a pay field that said EUR, because
 * the form always started on EUR (Swedish employer audit 2026-11-11, M-1).
 * The currency now starts as the country's own when the form offers it, and
 * only while no amount is typed: a visible default, never a conversion.
 */
describe("the need's pay currency follows its country", () => {
  it.each([
    ["SE", "SEK"],
    ["se", "SEK"],
    ["NO", "NOK"],
    ["DK", "DKK"],
    ["PL", "PLN"],
    ["LT", "EUR"],
    ["DE", "EUR"],
  ])("%s → %s", (country, currency) => {
    expect(defaultCurrencyForCountry(country)).toBe(currency);
  });

  it("a currency the form does not offer, or no country, leaves the form as it is", () => {
    expect(defaultCurrencyForCountry("GB")).toBeNull();
    expect(defaultCurrencyForCountry("")).toBeNull();
    expect(defaultCurrencyForCountry(null)).toBeNull();
    expect(defaultCurrencyForCountry("XX")).toBeNull();
  });

  it("the picker and the default read the ONE list, and the wizard never rewrites typed amounts", () => {
    const WEB = join(__dirname, "..", "..");
    const adv = readFileSync(join(WEB, "components", "app", "demand-advanced-sections.tsx"), "utf8");
    expect(adv).toContain("const CURRENCY_OPTIONS = DEMAND_CURRENCY_OPTIONS;");
    expect(DEMAND_CURRENCY_OPTIONS).toContain("SEK");
    const wizard = readFileSync(join(WEB, "components", "app", "demand-request-button.tsx"), "utf8");
    expect(wizard).toContain("const currency = defaultCurrencyForCountry(country);");
    expect(wizard).toContain("[prev.compMin, prev.compMax, prev.guaranteedBase, prev.perDiem].every((v) => v.trim() === \"\")");
  });
});
