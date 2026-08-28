import { test, expect, type Page } from "@playwright/test";
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
 * This spec pins the ORDER and the SURVIVAL, because presence was never the
 * problem: `getBoundingClientRect().top` for the order, and opening the
 * disclosure for the survival. It also pins the deep links, since collapsing a
 * section that other surfaces link INTO is exactly how a live link becomes a
 * closed grey bar.
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

/** Document-space top of the first match, or null when absent. */
async function topOf(page: Page, selector: string): Promise<number | null> {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return null;
  return el.evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
}

test.describe("the profile leads with what it exists to edit", () => {
  test("the composer precedes the CV detail editors, at every width", async ({
    page,
  }) => {
    for (const [w, h] of [
      [1920, 1080],
      [1440, 900],
      [1280, 800],
      [768, 1024],
      [375, 812],
    ] as const) {
      await open(page, w, h, `w${w}`);
      const label = `@${w}`;

      const composer = await topOf(page, "#profile-edit");
      expect(composer, `${label}: #profile-edit missing`).not.toBeNull();

      const details = await topOf(page, "#cv-details");
      expect(details, `${label}: #cv-details missing`).not.toBeNull();
      expect(
        composer!,
        `${label}: the composer must precede the CV detail disclosure`,
      ).toBeLessThan(details!);

      // The summary the composer belongs under still comes first.
      const hub = await topOf(page, "[data-testid='profile-hub-overview']");
      if (hub !== null) {
        expect(hub, `${label}: the hub overview leads`).toBeLessThan(composer!);
      }
    }
  });

  test("the composer is reachable without a long scroll", async ({ page }) => {
    await open(page, 1280, 900, "reach");
    const composer = await topOf(page, "#profile-edit");
    expect(composer).not.toBeNull();
    // It was at y=3364 (3.7 screens). One screen of summary above it is the
    // budget; two would mean the page had drifted back to a warehouse.
    expect(composer!).toBeLessThan(1800);
  });

  test("the CV detail editors are collapsed by default and all still there", async ({
    page,
  }) => {
    await open(page, 1280, 900, "collapsed");
    const disclosure = page.locator("#cv-details");
    await expect(disclosure).toHaveJSProperty("open", false);

    await disclosure.locator("summary").click();
    await expect(disclosure).toHaveJSProperty("open", true);

    // Every editor that used to stand open on the page is still on the page.
    for (const id of ["#cv-availability", "#cv-languages"]) {
      await expect(disclosure.locator(id), `${id} survived`).toHaveCount(1);
    }
    const text = await disclosure.innerText();
    expect(text.trim().length, "the disclosure carries real content").toBeGreaterThan(200);
  });

  test("deep links into a collapsed section still land on it", async ({
    page,
  }) => {
    // `#cv-availability` is a readiness-step deep link from the hub overview.
    // Collapsing its section without this would turn a live link into a closed
    // grey bar — the defect DetailsHashOpener exists to prevent.
    for (const id of ["cv-details", "cv-availability", "cv-languages"]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${ROUTE}?_=${id}#${id}`, { waitUntil: "domcontentloaded" });
      await page.locator("h1").first().waitFor();
      await expect(page.locator("#cv-details")).toHaveJSProperty("open", true);
      const box = await page.locator(`#${id}`).first().boundingBox();
      expect(box, `#${id} has a box`).not.toBeNull();
      expect(
        box!.y,
        `#${id} is scrolled into view, not left below the fold`,
      ).toBeLessThan(900);
    }
  });

  test("the quick nav offers the collapsed section", async ({ page }) => {
    await open(page, 1280, 900, "quicknav");
    const nav = page.locator("[data-testid='page-quick-nav']");
    await expect(nav.locator("a[href='#cv-details']")).toHaveCount(1);
    await expect(nav.locator("a[href='#profile-edit']")).toHaveCount(1);
  });
});
