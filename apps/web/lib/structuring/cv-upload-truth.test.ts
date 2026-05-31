import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 7 — CV upload / read-back truth.
 *
 * Audit conclusion (verified): the CV upload is a scaffold that stores NOTHING
 * (no storage column, no DB write) and `extractCv` throws "not implemented" —
 * no skills are read from a CV. The visible copy must therefore be honest:
 *   - it must not claim the CV is uploaded/stored or that skills are extracted;
 *   - it must state extraction is not active and point to the real paths
 *     (manual entry / journal);
 *   - it must not leak internal milestone jargon ("M2") into the user copy.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("CV upload component renders honest, non-overpromising status", () => {
  const src = read("components/app/cv-import-upload.tsx");
  it("still stores nothing (no upload/insert/fetch in the scaffold)", () => {
    expect(src).not.toMatch(/storage\.from|\.upload\(|\.insert\(|fetch\(/);
  });
  it("renders the not-active + add-manually + not-saved status lines", () => {
    expect(src).toMatch(/t\("importComingSoon"\)/);
    expect(src).toMatch(/t\("importAddManually"\)/);
    expect(src).toMatch(/t\("importNotSaved"/);
  });
});

describe("CV extraction is genuinely not implemented (no fake extraction)", () => {
  it("extractCv throws rather than returning fabricated data", () => {
    const src = read("lib/cv/extract.ts");
    expect(src).toMatch(/throw new Error/);
  });
});

describe("CV import copy is honest in both locales", () => {
  for (const locale of ["lt", "en"] as const) {
    const skills = (JSON.parse(read(`messages/${locale}.json`)) as { skills: Record<string, string> })
      .skills;
    it(`${locale} has the honest extraction + manual-path keys`, () => {
      for (const k of ["importPrompt", "importComingSoon", "importAddManually", "importNotSaved"]) {
        expect(skills[k], `${locale} skills.${k}`).toBeTruthy();
      }
    });
    it(`${locale} status copy does not leak internal "M2" jargon`, () => {
      expect(skills.importComingSoon).not.toMatch(/\bM2\b/);
    });
    it(`${locale} does not claim the CV is already uploaded/stored or skills extracted`, () => {
      // "not saved/stored" wording is fine; a bare positive "uploaded/stored"
      // claim is not. importNotSaved explicitly states it is NOT stored.
      expect(skills.importNotSaved.toLowerCase()).toMatch(/neįkelt|neišsaug|isn't uploaded|not.*stored/);
    });
  }
});
