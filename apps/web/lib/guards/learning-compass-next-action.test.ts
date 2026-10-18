import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LEARNING -> NEXT ACTION. A recommendation row is a door to a real surface and
 * nothing else: it never applies, contacts, edits a skill or creates evidence,
 * and never prints or links a request id.
 */
const ROOT = join(__dirname, "..", "..");
const SECTION = readFileSync(join(ROOT, "components/app/learning-compass-section.tsx"), "utf8");

describe("the compass recommendation action", () => {
  it("each row renders the action derived by the ONE model function", () => {
    expect(SECTION).toMatch(/recommendationNextAction\(r\)/);
    expect(SECTION).toMatch(/data-testid="compass-recommendation-action"/);
  });

  it("it is navigation only - no server action, no apply/contact, no request id in the link", () => {
    const at = SECTION.indexOf("recommendationNextAction(r)");
    const block = SECTION.slice(at, at + 1600);
    expect(block).not.toMatch(/requestId/);
    expect(block).not.toMatch(/(?<![-w])action=|formAction|"use server"|onClick/);
    expect(block).toMatch(/\/dashboard\/opportunities\?profession=/);
    expect(block).toMatch(/\/dashboard\/journal/);
    expect(block).toMatch(/\/dashboard\/profile#profile-edit/);
  });
});

describe("compass data sources are labelled and linked distinctly", () => {
  it("the cohort imported-jobs count links to the public /jobs board via importedJobsHref", () => {
    expect(SECTION).toMatch(/importedJobsHref\(c\.targetProfessionSlug\)/);
    expect(SECTION).toMatch(/data-testid=\{`compass-cohort-jobs-/);
  });
  it("'What fits you now' states it is platform requests; copy exists in every active locale", () => {
    expect(SECTION).toMatch(/compass-fits-source/);
    for (const l of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const lc = JSON.parse(readFileSync(join(ROOT, `messages/${l}.json`), "utf8")).learningCompass;
      for (const k of ["cohortDemand", "cohortDemandOpen", "fitsSource", "openBoard"]) {
        expect(typeof lc[k], `${l}.${k}`).toBe("string");
      }
      expect(JSON.stringify(lc)).not.toMatch(/demo/i);
    }
  });
});
