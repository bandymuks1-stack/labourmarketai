import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE PUBLIC HEADER'S CONTROL ROW MEETS THE PRODUCT'S 44px TOUCH FLOOR.
 *
 * Measured in a real browser at 375px on `/lt` (mobile sweep, 2026-08-09), the
 * public header row held three sibling controls at three different sizes:
 *
 *   | control                        | before | after |
 *   |--------------------------------|--------|-------|
 *   | mobile disclosure button       | 44x44  | 44x44 |  already pinned
 *   | theme toggle                   | 36x36  | 44x44 |
 *   | locale switcher trigger        | 78x30  | 78x44 |
 *   | locale switcher menu rows      | 109x30 | 109x44|
 *
 * The disclosure button was already held at `h-11 w-11` by
 * `mobile-marketing-nav.test.ts`, and its panel rows at `min-h-11` — so the
 * floor was never in doubt for this row. Two of its three controls simply
 * never had it applied. That is the same defect class as
 * `docs/acceptance/REQUIREMENT_DRIFT_AUDIT.md` D-19 (36px account-menu rows),
 * and the locale menu rows at 30px were under even that.
 *
 * WHY A SEPARATE GUARD, AND WHY IT ASSERTS THE ROW AND NOT THE COMPONENTS.
 * `W7_S2_PROFILE_ACCESSIBILITY.md` §6 records the standing judgement that the
 * floor is applied AT THE CALL SITE, not by resizing a shared primitive. So
 * the durable assertion is not "this file contains h-11" — it is "every
 * control the public header mounts clears the floor". A fourth control added
 * to that row tomorrow is the regression this is written to catch, so the
 * mounted set is re-derived from `site-nav.tsx` rather than hard-coded.
 *
 * DELIBERATELY NOT COVERED — these stay under 44px on purpose:
 *   - inline text links inside prose (WCAG 2.2 SC 2.5.8 exempts a link inline
 *     in a sentence, and the repo has never required otherwise);
 *   - third-party map attribution (Leaflet / OpenStreetMap), which is not ours
 *     to size;
 *   - `.sr-only` and collapsed-menu items, which are 0x0 or 1x1 by design.
 */

const REPO_ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(REPO_ROOT, p), "utf8");

const navSrc = read("components/layouts/site-nav.tsx");
const themeSrc = read("components/ui/theme-toggle-icon.tsx");
const localeSrc = read("components/marketing/locale-switcher.tsx");

/** The interactive components the public header actually mounts. */
const MOUNTED = ["ThemeToggleIcon", "LocaleSwitcher", "MobileNavMenu"] as const;

describe("public header touch floor", () => {
  it("the header still mounts exactly the control set this guard covers", () => {
    // If this fails, a control was added to or removed from the header row and
    // the floor below must be extended to it — not the assertion relaxed.
    for (const c of MOUNTED) expect(navSrc).toContain(`<${c}`);
  });

  it("the theme toggle's default hit box is 44px (h-11 w-11)", () => {
    expect(themeSrc).toMatch(/\bh-11 w-11\b/);
    // The old value must be gone, not merely joined by the new one.
    expect(themeSrc).not.toMatch(/\bh-9 w-9\b/);
  });

  it("the theme toggle is mounted with its default sizing, not an override", () => {
    // A `className` prop replaces the default entirely, so an override at the
    // call site would silently undo the floor above.
    const mount = navSrc.slice(navSrc.indexOf("<ThemeToggleIcon"));
    const tag = mount.slice(0, mount.indexOf("/>") + 2);
    expect(tag).not.toMatch(/className=/);
  });

  it("the locale switcher trigger carries the floor", () => {
    const trigger = localeSrc.slice(
      localeSrc.indexOf("aria-haspopup=\"menu\""),
      localeSrc.indexOf("<Globe"),
    );
    expect(trigger).toMatch(/min-h-11/);
  });

  it("the locale switcher's open menu rows carry the floor", () => {
    const menu = localeSrc.slice(localeSrc.indexOf('role="menu"'));
    expect(menu).toMatch(/min-h-11/);
  });

  it("keeps the existing visual design — padding and shape unchanged", () => {
    // The floor is a MINIMUM. It must not become a licence to restyle the
    // public header; only the hit box was allowed to change.
    expect(localeSrc).toMatch(/rounded-full border border-ink-500/);
    expect(localeSrc).toMatch(/px-3 py-1\.5/);
    expect(themeSrc).toMatch(/rounded-control border border-ink-500/);
  });
});
