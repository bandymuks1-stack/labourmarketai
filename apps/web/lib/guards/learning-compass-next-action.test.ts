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
