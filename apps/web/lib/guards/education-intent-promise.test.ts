import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * THE EDUCATION SIGN-UP CHOICE PROMISES ONLY WHAT EXISTS.
 *
 * An institution invites learners, runs programmes and cohorts, reviews their
 * practice and reads their results. It has no door that places a learner into
 * an internship or a job: the employer invites the intern directly (owner
 * decision, recorded in docs/qa/PRODUCTION_ACCEPTANCE_MATRIX.md). The
 * onboarding role picker once said the institution "connects them to
 * internships and jobs"; this pins the corrected promise in every locale.
 */
const ROOT = join(__dirname, "..", "..");

function educationDesc(locale: string): string {
  const messages = JSON.parse(
    readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"),
  );
  return messages.auth.onboarding.rolePicker.intent.education.desc as string;
}

describe("education intent — no placement promise", () => {
  it("English names the institution's real actions, not placement", () => {
    const desc = educationDesc("en");
    expect(desc).not.toMatch(/internship|job/i);
    expect(desc).toMatch(/programme/i);
  });

  it.each(activeLocales.map((l) => [l]))("%s has its own corrected line", (locale) => {
    const desc = educationDesc(locale);
    expect(desc.length).toBeGreaterThan(0);
    if (locale !== "en") expect(desc).not.toBe(educationDesc("en"));
    expect(desc).not.toMatch(/internships and jobs|praktikų ir darbų|Praktika und Jobs/i);
  });
});
