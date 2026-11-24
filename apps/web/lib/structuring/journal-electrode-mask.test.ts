import { describe, expect, it } from "vitest";
import { recognizeSkills } from "./skill-recognition";

/**
 * Lane D (journal recogniser, 2026-09-06): "Virinau elektrodu…" yielded
 * `electrical-install` — the `elektr` stem inside the welding ELECTRODE. The
 * same guard that masks power tools masks the electrode; the arc-welding
 * phrase needles carry the colloquial "virinau elektrodu" (safe only WITH the
 * electrode beside it — "virinau vandenį" is boiling).
 */
describe("the welding electrode is not electrical installation", () => {
  it("'Virinau elektrodu vamzdžius' → arc welding + pipefitting, never electrical-install", () => {
    const slugs = recognizeSkills("Virinau elektrodu vamzdžius").map((s) => s.slug);
    expect(slugs).not.toContain("electrical-install");
    expect(slugs).toContain("arc-welding");
  });

  it.each(["Suvirinau elektrodais rėmą", "Варил электродом трубы", "Welded the frame with electrodes"])(
    "electrode without electrical work: %s",
    (sentence) => {
      expect(recognizeSkills(sentence).map((s) => s.slug)).not.toContain("electrical-install");
    },
  );

  it("real electrical work beside an electrode keeps the electrician", () => {
    expect(recognizeSkills("Keičiau rozetes ir naudojau elektrodus").map((s) => s.slug)).toContain(
      "electrical-install",
    );
  });

  it("'Klojau pamatus' has no taxonomy slug — recognises nothing rather than guessing", () => {
    // Recorded, not fixed: the taxonomy holds concrete-pouring / earthworks
    // but no foundation-laying skill; a needle would invent one.
    expect(recognizeSkills("Klojau pamatus")).toEqual([]);
  });
});
