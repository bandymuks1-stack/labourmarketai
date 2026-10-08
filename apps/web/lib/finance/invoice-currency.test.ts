import { describe, expect, it } from "vitest";

import {
  ISO_4217_CODES,
  currencyExponent,
  formatMinor,
  isCurrencyShape,
  isKnownCurrency,
  minorToDecimalString,
  parseMajorToMinor,
} from "@/lib/finance/invoice-currency";
import { computeInvoiceTotals, lineNetCents, lineTaxCents } from "@/lib/finance/invoice-tax-model";

describe("currency neutrality (no EUR assumption)", () => {
  it("accepts only the ISO 4217 SHAPE: three uppercase letters", () => {
    for (const ok of ["EUR", "SEK", "NOK", "DKK", "PLN", "JPY", "KWD", "CHF"]) expect(isCurrencyShape(ok)).toBe(true);
    for (const bad of ["eur", "Eur", "EU", "EURO", " EUR", "E1R", "", null, undefined, 5]) expect(isCurrencyShape(bad)).toBe(false);
  });

  it("the app-side list is a full ISO list, not a short closed set", () => {
    expect(ISO_4217_CODES.length).toBeGreaterThan(140);
    for (const c of ["SEK", "NOK", "DKK", "PLN", "JPY", "KWD", "GBP", "USD", "CHF", "CZK", "HUF", "RON"]) expect(isKnownCurrency(c)).toBe(true);
    expect(isKnownCurrency("XXQ")).toBe(false);
    expect(new Set(ISO_4217_CODES).size).toBe(ISO_4217_CODES.length);
  });

  it("minor-unit exponents: JPY 0, KWD 3, SEK/NOK/PLN/EUR 2", () => {
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
    for (const c of ["SEK", "NOK", "PLN", "DKK", "EUR"]) expect(currencyExponent(c)).toBe(2);
  });

  it("decimal strings are exact per exponent", () => {
    expect(minorToDecimalString(15_000, "JPY")).toBe("15000");
    expect(minorToDecimalString(12_500, "KWD")).toBe("12.500");
    expect(minorToDecimalString(5, "KWD")).toBe("0.005");
    expect(minorToDecimalString(135_000, "SEK")).toBe("1350.00");
    expect(minorToDecimalString(7, "EUR")).toBe("0.07");
    expect(minorToDecimalString(-250, "PLN")).toBe("-2.50");
  });

  it("parsing refuses more decimals than the currency has", () => {
    expect(parseMajorToMinor("5000", "JPY")).toBe(5000);
    expect(parseMajorToMinor("5000.5", "JPY")).toBeNull();
    expect(parseMajorToMinor("12,500", "KWD")).toBe(12_500);
    expect(parseMajorToMinor("12.5005", "KWD")).toBeNull();
    expect(parseMajorToMinor("450", "SEK")).toBe(45_000);
    expect(parseMajorToMinor("450.123", "SEK")).toBeNull();
    expect(parseMajorToMinor("abc", "EUR")).toBeNull();
    expect(parseMajorToMinor("-1", "EUR")).toBeNull();
  });

  it("formatting uses the currency's own exponent (JPY shows no decimals, KWD three)", () => {
    expect(formatMinor(15_000, "JPY", "en")).toMatch(/15,000/);
    expect(formatMinor(15_000, "JPY", "en")).not.toMatch(/\./);
    expect(formatMinor(37_500, "KWD", "en")).toMatch(/37\.500/);
    expect(formatMinor(135_000, "SEK", "en")).toMatch(/1,350\.00/);
  });
});

describe("rounding is exponent-independent: it works on integer minor units", () => {
  it("3 h x rate, 25% tax, per currency (mirrors the database proof)", () => {
    const cases: Array<[string, number, number, number]> = [
      ["SEK", 45_000, 135_000, 33_750],
      ["NOK", 52_000, 156_000, 39_000],
      ["PLN", 18_000, 54_000, 13_500],
      ["JPY", 5_000, 15_000, 3_750],
      ["KWD", 12_500, 37_500, 9_375],
    ];
    for (const [, rate, net, tax] of cases) {
      expect(lineNetCents(3, rate)).toBe(net);
      expect(lineTaxCents(net, 25)).toBe(tax);
    }
  });

  it("a JPY half-unit rounds half away from zero in whole yen (no 2-decimal assumption)", () => {
    // 3 yen at 50% = 1.5 yen -> 2 yen; the same integer maths serves a 3-decimal currency
    expect(lineTaxCents(3, 50)).toBe(2);
    const jpy = computeInvoiceTotals([{ netCents: 15_001, treatment: "standard", ratePercent: 10 }]);
    expect(jpy.complete && jpy.taxCents).toBe(1_500); // 1500.1 -> 1500
    const kwd = computeInvoiceTotals([{ netCents: 12_345, treatment: "reduced", ratePercent: 5 }]);
    expect(kwd.complete && kwd.taxCents).toBe(617); // 617.25 -> 617 (0.617 KWD)
    const kwd2 = computeInvoiceTotals([{ netCents: 12_350, treatment: "reduced", ratePercent: 5 }]);
    expect(kwd2.complete && kwd2.taxCents).toBe(618); // 617.5 -> 618 (half away from zero)
  });
});
