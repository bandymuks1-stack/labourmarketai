import { describe, expect, it } from "vitest";

import { industryLabel, type IndustryKey } from "./industry-glyph";

describe("industryLabel", () => {
  it("returns the Lithuanian label by default", () => {
    expect(industryLabel("construction")).toBe("Statyba");
    expect(industryLabel("trades")).toBe("Amatai");
    expect(industryLabel("manufacturing")).toBe("Gamyba");
  });

  it("returns the English label when locale='en' is passed", () => {
    expect(industryLabel("construction", "en")).toBe("Construction");
    expect(industryLabel("office", "en")).toBe("Office");
  });

  it("covers every IndustryKey in both locales", () => {
    const keys: IndustryKey[] = [
      "general",
      "construction",
      "trades",
      "manufacturing",
      "office",
      "other",
    ];
    for (const k of keys) {
      expect(industryLabel(k, "lt").length).toBeGreaterThan(0);
      expect(industryLabel(k, "en").length).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    expect(industryLabel("trades", "lt")).toBe(industryLabel("trades", "lt"));
    expect(industryLabel("trades", "en")).toBe(industryLabel("trades", "en"));
  });
});
