import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP = process.cwd();
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const REVIEW = "components/app/cv-import-section-review.tsx";

/**
 * THE PERSON SEES HOW SURE THE READING IS (owner 2026-11-04, CV import, UF-3).
 * The parser computes a confidence for every proposal; it was never shown, so a
 * guess and a clearly stated fact looked the same at the moment of confirming.
 * It describes the READING of the CV, never the fact: nothing here may read as
 * verified or confirmed (decision 0023 keeps those evidence states apart).
 */
describe("the CV review shows the parser's confidence", () => {
  it("every kind of proposal passes its own confidence to the row", () => {
    const src = read(REVIEW);
    for (const v of ["w", "e", "l", "c", "a", "merged.salary", "h"]) {
      expect(src, v).toContain(`confidence={${v}.confidence}`);
    }
    // Required on the row, so a new proposal kind cannot leave it out.
    expect(src).toContain("confidence: CvProposalConfidence;");
  });

  it("the row says it in words", () => {
    const src = read(REVIEW);
    expect(src).toContain("t(`confidence.${confidence}`)");
    expect(src).toContain("data-confidence={confidence}");
  });

  for (const l of ["lt", "en", "ru", "nl", "de", "pl"]) {
    it(`${l}: three levels, about the reading, no verification claim`, () => {
      const m = JSON.parse(read(`messages/${l}.json`)) as {
        cvImport: { confidence: Record<string, string> };
      };
      const c = m.cvImport.confidence;
      expect(Object.keys(c).sort()).toEqual(["high", "low", "medium"]);
      expect(Object.values(c).join(" ")).not.toMatch(
        /verified|confirmed|patvirtint|patikrinta|подтвержд|проверено|geverifieerd|bevestigd|verifiziert|bestätigt|zweryfikowan|potwierdzon/i,
      );
    });
  }
});
