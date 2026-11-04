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
    expect(src).toContain("confidence: CvProposalConfidence | null;");
    // Null only for the line the parser read into nothing.
    expect(src.match(/confidence=\{null\}/g)).toHaveLength(1);
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

/**
 * NOTHING THE PERSON WROTE SILENTLY DISAPPEARS (owner 2026-11-04, UF-3). A line
 * the parser read into nothing is shown; the person places it through the SAME
 * confirm actions, or discards it. Nothing saves without their click.
 */
describe("the CV review offers the lines it could not place", () => {
  it("each line is placed by choice, through the existing confirm actions", () => {
    const src = read(REVIEW);
    expect(src).toContain('nameKey="unplaced"');
    expect(src).toContain('confirmDisabled={target === ""}');
    const save = src.slice(src.indexOf("function saveUnplaced"), src.indexOf("function mergeProposals"));
    for (const action of [
      "confirmCvWorkHistoryAction",
      "confirmCvEducationAction",
      "confirmCvCertificateAction",
      "confirmCvAchievementAction",
    ]) {
      expect(save, action).toContain(action);
    }
    // A placed line claims no period: none was read.
    expect(save).toContain("startYear: null");
  });

  for (const l of ["lt", "en", "ru", "nl", "de", "pl"]) {
    it(`${l}: the copy exists`, () => {
      const m = JSON.parse(read(`messages/${l}.json`)) as {
        cvImport: { groups: Record<string, string>; unplacedHint: string; placeAs: string };
      };
      expect(m.cvImport.groups.unplaced).toBeTruthy();
      expect(m.cvImport.unplacedHint).toBeTruthy();
      expect(m.cvImport.placeAs).toBeTruthy();
    });
  }
});

/**
 * THE PERSON CORRECTS BEFORE IT IS SAVED (owner 2026-11-04, UF-3). Every row that
 * holds free words can be corrected, and what is saved is the corrected value,
 * through the same confirm action. Nothing is saved by typing.
 */
describe("the CV review lets the person correct a proposal before saving", () => {
  it("each confirm goes through the correction rules, not the raw proposal", () => {
    const src = read(REVIEW);
    for (const rule of ["workHistoryInput(w,", "educationInput(e,", "certificateInput(c,", "achievementInput(a,", "editedText(line,"]) {
      expect(src, rule).toContain(rule);
    }
    expect(src).not.toMatch(/confirmCvWorkHistoryAction\(\{\s*title: w\.title/);
    expect(src).not.toMatch(/confirmCvEducationAction\(\{\s*institution: e\.institution/);
  });

  it("typing only changes the draft; saving is still the one click", () => {
    const src = read(REVIEW);
    const panel = src.slice(src.indexOf("cv-import-fields-"), src.indexOf('s.state === "conflict"'));
    expect(panel).toContain("setEdit(itemKey, f.name, e.target.value)");
    expect(panel).not.toMatch(/\brun\(|confirmCv/);
  });

  for (const l of ["lt", "en", "ru", "nl", "de", "pl"]) {
    it(`${l}: the correction copy exists`, () => {
      const m = JSON.parse(read(`messages/${l}.json`)) as { cvImport: Record<string, unknown> };
      for (const k of ["edit", "editDone", "fieldTitle", "fieldText", "fieldInstitution", "fieldProgram", "fieldKind", "fieldStart", "fieldEnd", "fieldYear", "dateHint"]) {
        expect(m.cvImport[k], k).toBeTruthy();
      }
    });
  }
});
