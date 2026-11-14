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
    // (The bar hands itself to the height measurement through `ref`; that is the only
    // other attribute it may carry.)
    const unconditional = wizard.match(/<div className="fixed inset-x-0 bottom-0[^"]*" data-testid="onboarding-action-bar"(?: ref=\{setActionBar\})?>/g) ?? [];
    expect(unconditional).toHaveLength(1);
    // Every literal fixed bar in the file is one of the two above: nothing fixed slips in beside them.
    expect(wizard.match(/"fixed inset-x-0 bottom-0/g) ?? []).toHaveLength(2);
  });

  it("the space reserved for the bar is the bar's measured height, and none is reserved beside a review notice", () => {
    // Measured, with a fallback for the first paint only — not a fixed guess.
    expect(wizard).toMatch(/pb-\[var\(--onboarding-bar,8rem\)\] sm:pb-0/);
    expect(wizard).toMatch(/!reviewNoticeShown && "pb-\[var\(--onboarding-bar,9rem\)\] sm:pb-0"/);
    expect(wizard).toMatch(/new ResizeObserver\(measure\)/);
    // With the notice shown the submit is in the page flow, so no space is reserved for a bar.
    expect(wizard).toMatch(/style=\{reviewNoticeShown \? undefined : barReserve\}/);
    expect(wizard).not.toMatch(/\bpb-3[26] sm:pb-0/);
  });

  it("a focused field is moved clear of the bar only while the bar is fixed", () => {
    expect(wizard).toMatch(/getComputedStyle\(actionBar\)\.position !== "fixed"\) return;/);
    expect(wizard.match(/onFocus=\{keepFocusClearOfBar\}/g) ?? []).toHaveLength(2);
  });

  it("the hint under the disabled Continue has its own sentence in every language", () => {
    expect(wizard).toMatch(/data-testid="onboarding-continue-hint">\s*\{t\("role_step_hint"\)\}/);
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const catalog = readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8");
      expect(catalog.match(/"role_step_hint": "[^"]{10,}"/g) ?? [], locale).toHaveLength(1);
    }
  });
});
