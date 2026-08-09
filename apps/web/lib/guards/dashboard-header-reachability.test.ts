import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE DASHBOARD HEADER'S CONTROLS STAY REACHABLE FROM THE md BREAKPOINT UP.
 *
 * Measured in a real browser at 768px on /lt/dashboard/activity (mobile
 * sweep, 2026-08-09), the header row rendered like this:
 *
 *   brand              0px wide   — squeezed out of existence
 *   workspace chip     0px wide
 *   dashboard tabs   492px        — flex-shrink:1 but `min-width:auto`
 *   control cluster  386px at x612..999, `shrink-0`
 *
 * The row therefore measured 999px inside a 768px viewport, and because
 * `html`/`body` carry `overflow-x: hidden` the page could not be scrolled
 * sideways: `window.scrollX` stayed 0. The account-menu trigger sat entirely
 * off-screen at x955..999, which means LOGOUT and the report-a-problem entry
 * point (the account menu is that flow's ONLY entry — see
 * `components/app/language-feedback-widget.tsx`) were unreachable on every
 * viewport from 768px to about 999px. Tablets and small laptops.
 *
 * It went unreported because `document.documentElement.scrollWidth` read
 * exactly 768 the whole time. `document.body.scrollWidth` read 999.
 *
 * THE FIX IS ONE CLASS, AND IT IS EASY TO DELETE BY ACCIDENT.
 * `min-w-0` releases the flex item's automatic minimum size so the tab strip
 * can shrink (492px -> 141px), which hands the row back the 231px the control
 * cluster needed. `overflow-x-auto` is what makes that safe: without it the
 * tabs merely spill out of their shortened box and over the controls instead
 * of scrolling — and an admin session renders one extra tab, so the spill is
 * not hypothetical.
 *
 * Guarding the CLASS STRING is deliberate. A browser assertion would be
 * better evidence, but this repo's guards are source-level and run without a
 * server; `docs/audits/W7_S2_PROFILE_ACCESSIBILITY.md` §6 sets the precedent
 * that layout floors are pinned at the call site. Both classes are asserted
 * on the same mount so removing either one fails.
 */

const REPO_ROOT = resolve(__dirname, "../..");
const layoutSrc = readFileSync(
  resolve(REPO_ROOT, "app/[locale]/dashboard/layout.tsx"),
  "utf8",
);

/** The `<DashboardTabs ... />` mount in the dashboard header, as written. */
function tabsMount(): string {
  const start = layoutSrc.indexOf("<DashboardTabs");
  expect(start, "the dashboard header no longer mounts <DashboardTabs>").toBeGreaterThan(-1);
  return layoutSrc.slice(start, layoutSrc.indexOf("/>", start) + 2);
}

describe("dashboard header reachability", () => {
  it("the tab strip can shrink — min-w-0 on the mount", () => {
    expect(
      tabsMount(),
      "Without `min-w-0` the tab strip is floored at its max-content width " +
        "(492px measured) and pushes the account menu — the only logout and " +
        "report-a-problem entry point — off-screen from 768px to ~999px. " +
        "`html` is overflow-x:hidden, so the user cannot scroll to it.",
    ).toMatch(/\bmin-w-0\b/);
  });

  it("the tab strip scrolls rather than spilling over the controls", () => {
    expect(
      tabsMount(),
      "`min-w-0` without `overflow-x-auto` lets the tabs render outside their " +
        "shortened box and cover the header controls instead of scrolling.",
    ).toMatch(/\boverflow-x-auto\b/);
  });

  it("the control cluster is still the shrink-0 anchor it was", () => {
    // The fix deliberately did NOT touch the cluster: making IT shrink would
    // squeeze 44px controls below the touch floor instead of fixing the row.
    // If this changes, the reasoning above no longer describes the layout.
    expect(layoutSrc).toMatch(/ml-auto flex shrink-0 items-center/);
  });

  it("the tabs remain hidden below the md breakpoint", () => {
    // Below md the tabs are replaced by the bottom nav; if they ever render
    // on a phone the row is over-constrained again, at a much smaller width.
    expect(tabsMount()).toMatch(/\bhidden\b/);
    expect(tabsMount()).toMatch(/\bmd:flex\b/);
  });
});
