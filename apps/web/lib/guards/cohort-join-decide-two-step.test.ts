import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * J-12 accept is two-step (accept → "Yes, accept and add to the group"). The
 * first version swapped a `type="button"` for a `type="submit"` in the same
 * position inside one <form>: React reused the clicked DOM node, the state flip
 * ran inside the click, and the browser's default action then SUBMITTED — the
 * first click accepted at once, and "Cancel" would have submitted a decline
 * (production walk 41603432961). This pins the fix: every button in the
 * decide form has its own key, and both toggles prevent the default.
 */
const src = readFileSync(join(process.cwd(), "components/app/institution-program-forms.tsx"), "utf8");
const start = src.indexOf("export function DecideJoinRequest(");
const decide = src.slice(start, src.indexOf("\nexport function", start + 1) > -1 ? src.indexOf("\nexport function", start + 1) : undefined);

describe("DecideJoinRequest two-step accept", () => {
  it("gives each of the four buttons its own key", () => {
    for (const key of ["accept", "accept-confirm", "accept-cancel", "decline"]) {
      expect(decide).toContain(`key="${key}"`);
    }
  });

  it("prevents the default on both toggles, so a toggle can never submit", () => {
    expect(decide).toMatch(/e\.preventDefault\(\);\s+setConfirming\(true\);/);
    expect(decide).toMatch(/e\.preventDefault\(\);\s+setConfirming\(false\);/);
  });

  it("only the confirm button submits an accept", () => {
    expect(decide.match(/value="accept"/g)).toHaveLength(1);
    const confirmAt = decide.indexOf('key="accept-confirm"');
    expect(decide.indexOf('value="accept"')).toBeGreaterThan(confirmAt);
  });
});
