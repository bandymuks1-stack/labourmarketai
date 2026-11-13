import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A person who joins through a staff invitation accepts it by submitting the
 * onboarding profile step, and that submit records that the review notice was
 * shown to them. So the notice has to be on the way to the button. On a phone
 * the submit is fixed to the bottom of the screen for everyone else (it used
 * to sit three screens down); for the invited person it must stay in the page
 * flow, directly under the notice. Review finding on #3316, 2026-11-13.
 */
const wizard = readFileSync(join(__dirname, "..", "..", "components", "app", "onboarding-wizard.tsx"), "utf8");

describe("onboarding: the staff-review notice is met before the submit", () => {
  it("the profile step knows when the notice is shown", () => {
    expect(wizard).toMatch(/const reviewNoticeShown = Boolean\(invitationToken && invitationReviewNotice\);/);
  });

  it("the notice is rendered before the action bar, in the page flow", () => {
    const notice = wizard.indexOf('testId="onboarding-review-notice"');
    const submit = wizard.indexOf('data-testid="onboarding-submit"');
    expect(notice).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(notice);
  });

  it("the submit bar is fixed to the screen only when no review notice is shown", () => {
    const bar = /className=\{cn\(\s*"flex flex-col gap-2",\s*!reviewNoticeShown &&\s*"fixed inset-x-0 bottom-0[^"]*sm:static[^"]*",\s*\)\}\s*data-testid="onboarding-action-bar"/;
    expect(wizard).toMatch(bar);
    // No unconditional fixed bar on the profile step: the only literal
    // `className="fixed …"` action bar is the role step's (no acceptance there).
    const unconditional = wizard.match(/<div className="fixed inset-x-0 bottom-0[^"]*" data-testid="onboarding-action-bar">/g) ?? [];
    expect(unconditional).toHaveLength(1);
  });
});
