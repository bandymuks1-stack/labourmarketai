import { describe, expect, it } from "vitest";
import {
  formatLtCount,
  ltPlural,
  LT_DAY_FORMS,
  LT_HOUR_FORMS,
  LT_MINUTE_FORMS,
} from "./lt-plural";

/**
 * Journal compact edit UX (P0-G): "1 valandos" is broken Lithuanian. This
 * table pins the standard LT plural rules the pure helper implements:
 *   n%10===1 && n%100!==11                      → singular
 *   n%10∈2..9 && !(n%100∈11..19)                → paucal
 *   else                                        → genitive plural
 */

describe("ltPlural — hours table", () => {
  const cases: Array<[number, string]> = [
    [0, "valandų"],
    [1, "valanda"],
    [2, "valandos"],
    [5, "valandos"],
    [9, "valandos"],
    [10, "valandų"],
    [11, "valandų"],
    [12, "valandų"],
    [19, "valandų"],
    [20, "valandų"],
    [21, "valanda"],
    [22, "valandos"],
    [30, "valandų"],
    [101, "valanda"],
    [102, "valandos"],
    [110, "valandų"],
    [111, "valandų"],
    [121, "valanda"],
  ];
  for (const [n, expected] of cases) {
    it(`${n} → ${expected}`, () => {
      expect(ltPlural(n, LT_HOUR_FORMS)).toBe(expected);
    });
  }
});

describe("ltPlural — minutes table", () => {
  const cases: Array<[number, string]> = [
    [1, "minutė"],
    [2, "minutės"],
    [10, "minučių"],
    [11, "minučių"],
    [21, "minutė"],
    [45, "minutės"],
  ];
  for (const [n, expected] of cases) {
    it(`${n} → ${expected}`, () => {
      expect(ltPlural(n, LT_MINUTE_FORMS)).toBe(expected);
    });
  }
});

describe("ltPlural — edge cases", () => {
  it("fractions read as the paucal form (1,5 valandos)", () => {
    expect(ltPlural(1.5, LT_HOUR_FORMS)).toBe("valandos");
    expect(ltPlural(0.5, LT_HOUR_FORMS)).toBe("valandos");
  });
  it("non-finite degrades to the genitive form", () => {
    expect(ltPlural(Number.NaN, LT_DAY_FORMS)).toBe("dienų");
  });
});

describe("formatLtCount", () => {
  it("renders integer counts verbatim", () => {
    expect(formatLtCount(1, LT_HOUR_FORMS)).toBe("1 valanda");
    expect(formatLtCount(2, LT_HOUR_FORMS)).toBe("2 valandos");
    expect(formatLtCount(10, LT_HOUR_FORMS)).toBe("10 valandų");
  });
  it("renders fractions with the LT decimal comma", () => {
    expect(formatLtCount(1.5, LT_HOUR_FORMS)).toBe("1,5 valandos");
  });
});
