import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE PUBLIC FOOTER'S LINKS MEET THE 44px TOUCH FLOOR (#3322, 2026-11-14).
 *
 * Measured on production build 940b0f97 at 375/390 px: the full footer held 15
 * links 20 px tall in every public page, the largest group of under-32 px
 * targets on /lt/jobs, /lt/for-companies, /lt/for-agencies and /lt/pricing.
 * The compact footer already used `min-h-11`; the full one did not.
 *
 * Applied at the call site (W7_S2_PROFILE_ACCESSIBILITY.md §6): every link in
 * the footer takes its class from one of the two footer link constants, and
 * both carry `min-h-11`. A new link written with a bare class string is the
 * regression this catches. Inline links inside prose stay exempt (WCAG 2.5.8).
 */
const src = readFileSync(resolve(__dirname, "../../components/layouts/site-footer.tsx"), "utf8");

describe("Guard: public footer links clear the 44px touch floor", () => {
  it("both footer link constants carry min-h-11 and centre their text", () => {
    for (const name of ["link", "footerLink"]) {
      const m = src.match(new RegExp(`const ${name} =\\s*"([^"]+)"`));
      expect(m, `const ${name} missing`).not.toBeNull();
      expect(m![1]).toMatch(/\bmin-h-11\b/);
      expect(m![1]).toMatch(/\binline-flex\b/);
      expect(m![1]).toMatch(/\bitems-center\b/);
    }
  });

  it("every <Link>/<a> in the footer uses one of those constants", () => {
    const tags = src.match(/<(?:Link|a)\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(10);
    for (const tag of tags) {
      expect(tag, tag).toMatch(/className=\{(?:link|footerLink)\}/);
    }
  });
});
