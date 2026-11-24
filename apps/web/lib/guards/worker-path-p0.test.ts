import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Worker path walk, 2026-11-24 (sign-up → onboarding → journal → Living CV → find work → invitation).
 * Two defects it found, pinned here:
 *   1. The invitation "Accept" button was 28 px tall on a phone; a thumb needs 44 px (min-h-11).
 *   2. The journal told a worker with only a personal space that "the organization's owner must switch
 *      review on": there is no owner to ask (decision 0032, noise). It shows only with an organization context.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");

describe("worker path P0 (2026-11-24)", () => {
  it("the invitation accept button is thumb-sized on a phone", () => {
    const src = read("components/app/worker-invitations.tsx");
    const button = src.slice(src.indexOf("<button"), src.indexOf("worker-invitation-accept-"));
    expect(button).toMatch(/\bmin-h-11\b/);
  });

  it("the 'owner must switch review on' note needs an organization context", () => {
    const src = read("app/[locale]/dashboard/journal/page.tsx");
    expect(src).toMatch(/anyOrganizationContext && !anyReviewEnabled && \(\s*<p[\s\S]{0,200}journal-review-not-enabled-note/);
    expect(src).toMatch(/const anyOrganizationContext = \(ecRows \?\? \[\]\)\.some\(/);
  });
});
