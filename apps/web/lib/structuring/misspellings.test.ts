import { describe, it, expect } from "vitest";
import { applyMisspellings, COMMON_MISSPELLINGS } from "./misspellings";
import { foldText } from "./normalize";
import { recognizeNewSkillSuggestions } from "./new-skill-suggestions";

describe("applyMisspellings — curated short-typo correction", () => {
  it("corrects a known misspelling as a whole token", () => {
    const { text, corrected } = applyMisspellings(foldText("dirbau kasinike"));
    expect(corrected).toBe(true);
    expect(text).toContain("kasininkas");
  });

  it("leaves clean text untouched", () => {
    const { text, corrected } = applyMisspellings(foldText("dirbau kasininku"));
    expect(corrected).toBe(false);
    expect(text).toBe(foldText("dirbau kasininku"));
  });

  it("never rewrites a substring inside an unrelated longer word", () => {
    // "padaveja" is a misspelling key; ensure it only fires as a whole token,
    // not inside another word.
    const { corrected } = applyMisspellings(foldText("padavejavimas"));
    expect(corrected).toBe(false);
  });

  it("does not 'correct' unrelated common words (no false positives)", () => {
    for (const w of [
      "kabinetas",
      "valdytojas",
      "buhalterija",
      "kurinys",
      "padalinys",
      "programa",
    ]) {
      const { corrected } = applyMisspellings(foldText(w));
      expect(corrected, `must not correct "${w}"`).toBe(false);
    }
  });

  it("improves a short-typo case the ≥6-char fuzzy tier would miss", () => {
    // "kasinike" (8 chars but a SHORT-stem typo) → cashier via correction.
    const out = recognizeNewSkillSuggestions("vakar dirbau kasinike");
    const cashier = out.find((s) => s.slug === "cashier");
    expect(cashier).toBeTruthy();
    // Correction-derived hits are demoted to medium confidence.
    expect(cashier!.confidence).toBe("medium");
  });

  it("every map value folds to itself (corrections are already canonical)", () => {
    for (const [, right] of COMMON_MISSPELLINGS) {
      expect(foldText(right)).toBe(right);
    }
  });
});
