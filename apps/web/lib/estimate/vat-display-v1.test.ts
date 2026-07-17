import { describe, expect, it } from "vitest";
import { computeVatDisplay, parseVatPercentInput } from "./vat-display-v1";

describe("VAT display — only when explicitly entered", () => {
  it("null / undefined / NaN / out-of-range → no VAT lines at all", () => {
    expect(computeVatDisplay(1000, null)).toBeNull();
    expect(computeVatDisplay(1000, undefined)).toBeNull();
    expect(computeVatDisplay(1000, Number.NaN)).toBeNull();
    expect(computeVatDisplay(1000, -1)).toBeNull();
    expect(computeVatDisplay(1000, 101)).toBeNull();
  });
  it("an entered rate produces net / vat / gross deterministically", () => {
    const v = computeVatDisplay(1000, 21);
    expect(v).toEqual({
      vatPercent: 21,
      netTotal: 1000,
      vatAmount: 210,
      grossTotal: 1210,
    });
  });
  it("an explicitly entered 0 % is displayed (reverse charge), not invented", () => {
    const v = computeVatDisplay(500, 0);
    expect(v).toEqual({ vatPercent: 0, netTotal: 500, vatAmount: 0, grossTotal: 500 });
  });
  it("rounds to cents", () => {
    const v = computeVatDisplay(99.99, 21);
    expect(v?.vatAmount).toBe(21);
    expect(v?.grossTotal).toBe(120.99);
  });
});

describe("VAT input parsing — empty means NOT entered", () => {
  it("empty / whitespace → null", () => {
    expect(parseVatPercentInput("")).toBeNull();
    expect(parseVatPercentInput("   ")).toBeNull();
  });
  it("accepts comma decimals; garbage stays null", () => {
    expect(parseVatPercentInput("21")).toBe(21);
    expect(parseVatPercentInput("9,5")).toBe(9.5);
    expect(parseVatPercentInput("abc")).toBeNull();
  });
});
