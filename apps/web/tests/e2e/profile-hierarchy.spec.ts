import { test, expect, type Page } from "@playwright/test";

import { expectInViewport } from "./viewport";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * PROFILE — the page leads with the thing the page exists to edit.
 *
 * Measured before this change, on a 1280×900 viewport with the local worker
 * fixture: `/lt/dashboard/profile` was 5124 px — 5.7 screens. A worker met, in
 * order, the title row, the quick nav, the hub overview, their avatar, a
 * feature note, the trust block, and then FIVE CV detail editors — work
 * preferences (1028 px), languages, education, achievements, external
 * profiles — before reaching `#profile-edit`, the skills/about composer, at
 * y=3364. `#profile-edit` is the destination of SIX links from the hub
 * overview directly above it, including its single primary "complete your
 * profile" action: the page's own main call to action pointed 3.7 screens down
 * its own scroll.
 *
 * The five editors are filled in once and revisited rarely. They are all still
 * here, in the same order, with the same anchors — inside one disclosure. The
 * composer moved up to sit under the summary that links to it. Page height is
 * 2794 px.
 *
 * Since 2026-11-24 (decision 0034) every block is its own screen with its own
 * address (`?tab=`). This spec pins the tabs, the SURVIVAL of every editor and
 * the deep links: a link written before the split must still land on its
 * section, open and in view.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

const ROUTE = "/lt/dashboard/profile";

/**
 * `nonce` guarantees a FRESH document. Chrome restores `<details>` open state
 * through session history, so once a navigation has opened a disclosure every
 * later `goto` of the same URL re-opens it — and "is this collapsed by
 * default?" quietly becomes "did the previous visit leave it open?".
 */
async function open(page: Page, width: number, height: number, nonce = "") {
  await page.setViewportSize({ width, height });
  await page.goto(nonce ? `${ROUTE}?_=${nonce}` : ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("h1").first().waitFor();
}

/** Block that holds each section (decision 0034: one block per screen, `?tab=`). */
const TAB_OF: Record<string, string> = {
  "profile-edit": "edit",
  "cv-details": "details",
  "profile-identity": "details",
  "cv-availability": "details",
  "cv-languages": "details",
  capabilities: "skills",
  "candidate-skills": "skills",
  "profile-about": "about",
};

test.describe("the profile is one block per screen (decision 0034)", () => {
  test("the overview opens first; every other block is one tap away in the tab row", async ({ page }) => {
    await open(page, 1280, 900, "tabs");
    await expect(page.locator("[data-testid='page-quick-nav']")).toHaveCount(0);
    await expect(page.locator("main [data-testid='profile-hub-overview']")).toBeVisible();
    await expect(page.locator("main [data-testid='profile-tab-overview']")).toHaveAttribute("aria-current", "page");
    // Overview only: the other blocks are on their own addresses.
    for (const id of ["profile-edit", "cv-details", "capabilities", "profile-about"]) {
      await expect(page.locator(`main #${id}`), `#${id} is not on the overview`).toHaveCount(0);
    }
    // Organization history, when the account has any: a closed bar whose
    // summary line is readable without opening it.
    const history = page.locator("main #organization-history");
    if ((await history.count()) > 0) {
      await expect(history).toHaveJSProperty("open", false);
      await expect(history.locator("summary [data-testid^='organization-history-summary']")).toBeVisible();
    }
  });

  test("each tab shows its one block, open", async ({ page }) => {
    for (const [tab, id] of [
      ["edit", "profile-edit"],
      ["details", "cv-details"],
      ["skills", "capabilities"],
      ["about", "profile-about"],
    ] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${ROUTE}?tab=${tab}`, { waitUntil: "domcontentloaded" });
      await page.locator("h1").first().waitFor();
      await expect(page.locator(`main [data-testid='profile-tab-${tab}']`)).toHaveAttribute("aria-current", "page");
      await expect(page.locator(`main #${id}`), `?tab=${tab} shows #${id} open`).toHaveJSProperty("open", true);
      await expect(page.locator("main [data-testid='profile-hub-overview']"), `?tab=${tab} is not the overview`).toHaveCount(0);
    }
  });

  test("the CV detail editors are all still there", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${ROUTE}?tab=details`, { waitUntil: "domcontentloaded" });
    const disclosure = page.locator("main #cv-details");
    for (const id of ["#cv-availability", "#cv-languages"]) {
      await expect(disclosure.locator(id), `${id} survived`).toHaveCount(1);
    }
    const text = await disclosure.innerText();
    expect(text.trim().length, "the block carries real content").toBeGreaterThan(200);
  });

  test("an anchor written before the split lands on its tab, open and in view", async ({ page }) => {
    // `#cv-availability` is a readiness-step deep link from the hub overview;
    // `#capabilities` has six senders. The bare-page link moves the reader to
    // the section's tab and the section's own opener scrolls to it.
    for (const id of ["cv-details", "cv-availability", "cv-languages", "profile-identity", "candidate-skills", "profile-edit", "profile-about"]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${ROUTE}?_=${id}#${id}`, { waitUntil: "domcontentloaded" });
      await expect(page, `#${id} moves to its tab`).toHaveURL(new RegExp(`[?&]tab=${TAB_OF[id]}(&|#|$)`));
      // SCOPED TO `main`: React's streaming SSR briefly keeps a second,
      // buffered copy of the subtree outside it (`<div id="S:1">`).
      await expect(page.locator(`main #${id}`)).toBeVisible({ timeout: 30_000 });
      // A section near the end of a short tab cannot scroll to the top; it
      // must still be in view. The long details tab keeps the 200px bound.
      await expectInViewport(
        page,
        `main #${id}`,
        `#${id} is scrolled into view, not left below the fold`,
        TAB_OF[id] === "details" ? { maxTop: 200 } : {},
      );
    }
  });

  test("375 px: no sideways scroll; the tab row is a row of 44px targets", async ({ page }) => {
    await open(page, 375, 812, "m375");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal page scroll at 375 px").toBeLessThanOrEqual(0);
    for (const tab of ["overview", "edit", "details", "skills", "about"]) {
      const box = await page.locator(`main [data-testid='profile-tab-${tab}']`).boundingBox();
      expect(box, `${tab} tab rendered`).not.toBeNull();
      expect(box!.height, `${tab} tab is a 44px tap target`).toBeGreaterThanOrEqual(44);
    }
  });
});
