import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * DOCUMENTS — the page called "My documents" leads with the documents.
 *
 * Measured before this change, 1280×900, local worker fixture: the inventory
 * was the EIGHTH block, at y=910 — a full screen below the fold. Above it sat
 * the attention strip, a disclaimer, the work-proof exports (252 px), an
 * acknowledgement inbox, a training register and the agency-consent toggle.
 * None of those is a document.
 *
 * All of them are still on the page, in the same order, with the same props —
 * they now FOLLOW the inventory. They deliberately stay outside the
 * `inv.kind === "ok"` branch: a worker whose inventory is unreadable or
 * unmigrated must still reach their exports, their training register and the
 * consent toggle that decides what their agency can see.
 *
 * This spec pins the order and the survival. It also pins `#training`, because
 * the move is what makes that anchor load-bearing: the training save action
 * redirects to `?trn=…#training`, and measurement showed the browser never
 * acted on that hash at all (`window.scrollY` still 0 after four seconds). The
 * link only looked alive while the section sat above the fold.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

const ROUTE = "/lt/dashboard/documents";

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

const AFTER = [
  "[data-testid='documents-reports-exports']",
  "[data-testid='training-register']",
  "[data-testid='docs-consent']",
];

test.describe("the documents lead the documents page", () => {
  test("the inventory precedes every non-document block, at every width", async ({
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

      const list = await topOf(page, "[data-testid='documents-list']");
      expect(list, `${label}: the inventory is missing`).not.toBeNull();

      for (const sel of AFTER) {
        const top = await topOf(page, sel);
        if (top === null) continue; // a block may not render for this fixture
        expect(list!, `${label}: inventory must precede ${sel}`).toBeLessThan(top);
      }
    }
  });

  test("the inventory is reachable without a screen of scrolling", async ({
    page,
  }) => {
    await open(page, 1280, 900, "reach");
    const list = await topOf(page, "[data-testid='documents-list']");
    expect(list).not.toBeNull();
    // It was at y=910 — one full screen down. The attention strip and the
    // disclaimer are the only things that may precede it.
    expect(list!).toBeLessThan(600);
  });

  test("nothing was dropped in the move", async ({ page }) => {
    await open(page, 1280, 900, "survival");
    for (const sel of [
      "[data-testid='documents-list']",
      "[data-testid='documents-reports-exports']",
      "[data-testid='training-register']",
      "[data-testid='docs-consent']",
      "[data-testid='documents-guidance']",
    ]) {
      await expect(page.locator(sel).first(), `${sel} survived`).toHaveCount(1);
    }
  });

  test("the training save flow's #training anchor actually scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // The exact URL lib/training/training-actions.ts redirects to.
    await page.goto(`${ROUTE}?trn=saved#training`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("h1").first().waitFor();
    await expect(page.locator("#training")).toHaveCount(1);
    // The scroll happens on a rAF after the element exists, so poll rather
    // than sample once. It used to stay at 0 forever, which no wait fixes.
    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: "the page actually moved — it used to stay at 0",
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
    const box = await page.locator("#training").first().boundingBox();
    expect(box, "#training exists").not.toBeNull();
    expect(
      box!.y,
      "#training is scrolled into view, not left below the fold",
    ).toBeLessThan(900);
  });
});
