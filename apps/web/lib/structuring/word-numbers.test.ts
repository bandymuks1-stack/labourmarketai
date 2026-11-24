import { describe, expect, it } from "vitest";

import { findWordNumbers, parseWordNumber } from "./word-numbers";

describe("parseWordNumber — single tokens across the active locales", () => {
  it("LT nominative and the counted genitive both parse", () => {
    expect(parseWordNumber("dvi")).toBe(2);
    expect(parseWordNumber("keturi")).toBe(4);
    expect(parseWordNumber("keturios")).toBe(4);
    expect(parseWordNumber("keturių")).toBe(4); // genitive, with diacritic
    expect(parseWordNumber("keturiu")).toBe(4); // typed without diacritics
    expect(parseWordNumber("penkiolika")).toBe(15);
    expect(parseWordNumber("trisdešimt")).toBe(30);
  });

  it("EN and RU (incl. counted forms and ё-folding)", () => {
    expect(parseWordNumber("two")).toBe(2);
    expect(parseWordNumber("seventeen")).toBe(17);
    expect(parseWordNumber("ninety")).toBe(90);
    expect(parseWordNumber("две")).toBe(2);
    expect(parseWordNumber("четырёх")).toBe(4); // ё folds to е
    expect(parseWordNumber("четырех")).toBe(4);
    expect(parseWordNumber("пятьдесят")).toBe(50);
  });

  it("opportunistic NL/DE — unambiguous words only", () => {
    expect(parseWordNumber("twee")).toBe(2);
    expect(parseWordNumber("vijf")).toBe(5);
    expect(parseWordNumber("zwölf")).toBe(12);
    expect(parseWordNumber("zwanzig")).toBe(20);
    // Article-words must NOT read as numbers — that would fabricate counts.
    expect(parseWordNumber("een")).toBeNull();
    expect(parseWordNumber("ein")).toBeNull();
  });

  it("non-numbers stay null", () => {
    expect(parseWordNumber("")).toBeNull();
    expect(parseWordNumber("agurkai")).toBeNull();
    expect(parseWordNumber("darbuotojų")).toBeNull();
  });
});

describe("findWordNumbers — positions in the sentence", () => {
  it("finds inflected numbers with their token index", () => {
    const found = findWordNumbers("Mūsų įmonei kitą mėnesį trūks keturių suvirintojų");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ value: 4, raw: "keturių", tokenIndex: 5 });
  });

  it("finds several and keeps order", () => {
    const found = findWordNumbers("two welders and three painters");
    expect(found.map((f) => f.value)).toEqual([2, 3]);
  });

  it("a sentence without written numbers yields nothing", () => {
    expect(findWordNumbers("ieškau darbo Vokietijoje")).toEqual([]);
  });
});
