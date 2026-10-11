import { describe, expect, it } from "vitest";

import { structureValueStatement } from "./value-statement";

/**
 * An employer's need, typed in three of the six ACTIVE locales.
 *
 * Measured in a real browser walk (2026-10-11): a Dutch owner wrote
 * "We hebben 3 lassers (MIG/MAG) nodig in Rotterdam vanaf 2 november voor
 * 6 weken" and the need form opened with the ROLE and the HEADCOUNT empty —
 * and German / Polish sentences did the same, while the LT / EN / RU
 * equivalents filled both. The trade, the count and the "we need" verb must
 * survive every language the product speaks.
 */
const TODAY = "2026-10-11";

describe("need sentences in NL / DE / PL fill role, count and axis", () => {
  const cases = [
    { text: "We hebben 3 lassers (MIG/MAG) nodig in Rotterdam vanaf 2 november voor 6 weken", workType: "welder", n: 3, country: "NL" },
    { text: "Wir brauchen 3 Schweißer in Hamburg ab 2. November für 6 Wochen", workType: "welder", n: 3, country: "DE" },
    { text: "Potrzebujemy 3 spawaczy w Gdańsku od 2 listopada na 6 tygodni", workType: "welder", n: 3, country: "PL" },
    { text: "We zoeken 2 verzorgenden in Utrecht", workType: "care_assistant", n: 2, country: "NL" },
    { text: "Wir suchen 4 Fliesenleger in Berlin", workType: "tiler", n: 4, country: "DE" },
    { text: "Szukamy 5 murarzy w Warszawie", workType: "mason", n: 5, country: "PL" },
    { text: "Нам нужно 3 сварщика в Осло на 2 месяца", workType: "welder", n: 3, country: "NO" },
  ] as const;

  for (const c of cases) {
    it(c.text, () => {
      const v = structureValueStatement(c.text, TODAY);
      expect(v.workType).toBe(c.workType);
      expect(v.headcount).toBe(c.n);
      expect(v.country).toBe(c.country);
    });
  }

  it("a Lithuanian 'koks' (what) never reads as a cook", () => {
    expect(structureValueStatement("Koks atlyginimas suvirintojams?", TODAY).workType).toBe("welder");
  });
});
