import { describe, expect, it } from "vitest";

import { cardModeFromText } from "./card-mode-from-text";

describe("cardModeFromText — which lens of the SAME card a sentence asks for", () => {
  const cases: [string, string][] = [
    // the owner's own examples (2026-09-29 §20)
    ["Kokie mano įgūdžiai patvirtinti?", "skills"],
    ["Parodyk mano darbo istoriją", "history"],
    ["Parodyk mano kortelę", "identity"],
    ["Kokios mano profesijos nurodytos?", "identity"],
    // each lens, several languages
    ["Kur dirbau anksčiau?", "history"],
    ["Kur dirbu dabar?", "work"],
    ["Kiek valandų užfiksuota?", "work"],
    ["Parodyk mano įrašus kortelėje", "evidence"],
    ["Kur galiu eiti toliau?", "next"],
    ["show my skills", "skills"],
    ["show my card history", "history"],
    ["what are my next opportunities", "next"],
    ["покажи мои навыки", "skills"],
    ["zeig meine Fähigkeiten", "skills"],
    ["toon mijn vaardigheden", "skills"],
    ["pokaż moje umiejętności", "skills"],
    ["pokaż moją kartę", "identity"],
  ];
  for (const [text, mode] of cases) {
    it(`"${text}" → ${mode}`, () => {
      expect(cardModeFromText(text)).toBe(mode);
    });
  }

  it("nothing / unclear → identity, the whole card (a guess never hides anything)", () => {
    expect(cardModeFromText(null)).toBe("identity");
    expect(cardModeFromText("")).toBe("identity");
    expect(cardModeFromText("mano kortelė")).toBe("identity");
  });
});
