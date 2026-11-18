/**
 * GUARD — a Living CV form returns to the PROFILE it was opened from.
 *
 * The add-work, add-language and add-education screens are hidden tabs of the
 * shell's Tabs navigator (`href: null`), which keeps the default back
 * behaviour, `firstRoute`. There `router.back()` lands on the FIRST tab
 * (Today), not on the profile: after a save, the person never saw the new row
 * (isolated Android run 44296003289: saved, then no CV re-read). Each form
 * navigates to the profile explicitly, as correct-entry already does for the
 * journal.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
const SHELL = "apps/mobile/app/(shell)";

describe("mobile hidden screens return where they were opened", () => {
  it("the shell tabs keep the default back behaviour (the reason for this guard)", () => {
    // If the shell ever sets backBehavior="history", this guard can be relaxed.
    expect(read(`${SHELL}/_layout.tsx`)).not.toMatch(/backBehavior\s*=\s*["']history["']/);
  });

  for (const screen of ["add-work", "add-language", "add-education"]) {
    it(`${screen} returns to the profile, never through router.back()`, () => {
      const src = read(`${SHELL}/${screen}.tsx`);
      expect(src).toMatch(/router\.navigate\("\/\(shell\)\/profile"\)/);
      expect(src).not.toMatch(/router\.back\(/);
    });
  }
});
