import { expect, test, type Page } from "@playwright/test";

/**
 * POPUPS STAY ON THE SCREEN (responsive sweep 2026-11-21).
 *
 * Every anchored menu — language, account, workspace, notifications, "More" —
 * goes through ONE component, `components/ui/anchored-overlay.tsx`. Measured on
 * the isolated stack before the fix, on a phone on its side (568 × 320) the
 * public language menu ran from y = 164 to 356 and the signed-in account menu
 * from 162 to 622: their last items were below the screen, and nothing could
 * scroll them up. The overlay now opens on the side with room, is never
 * taller than that room (it scrolls inside itself) and never past a side edge
 * (`lib/ui/overlay-placement.ts`, unit-tested there).
 *
 * This spec holds the public case; the signed-in menus, the dark listbox and
 * the command dialog are held by `phone-journeys-isolated.spec.ts`. Public
 * page, no session needed.
 */

async function openLanguageMenu(page: Page) {
  await page.goto("/en");
  const trigger = page.locator('header button[aria-haspopup="menu"]').first();
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  // A tap before hydration is a no-op; retry until the panel shows.
  const panel = page.locator("[data-overlay-root]").last();
  await expect(async () => {
    if (!(await panel.isVisible())) await trigger.click({ timeout: 3_000 });
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return panel;
}

/** The panel's box and whether its last link/button can be brought on screen and hit. */
async function fit(page: Page) {
  return page.locator("[data-overlay-root]").last().evaluate((el) => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const r = el.getBoundingClientRect();
    const items = [...el.querySelectorAll<HTMLElement>("a[href], button")].filter((x) => x.getBoundingClientRect().height > 0);
    const last = items.at(-1);
    let lastReachable = false;
    if (last) {
      last.scrollIntoView({ block: "nearest" });
      const q = last.getBoundingClientRect();
      const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      lastReachable = q.top >= 0 && q.bottom <= vh && !!hit && (last === hit || last.contains(hit));
    }
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw, vh, lastReachable, overflowY: getComputedStyle(el).overflowY };
  });
}

test.describe("language menu on a phone on its side (568 × 320)", () => {
  test.use({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true });

  test("stays inside the screen and its last language is reachable", async ({ page }) => {
    await openLanguageMenu(page);
    const f = await fit(page);
    expect(f.top).toBeGreaterThanOrEqual(0);
    expect(f.bottom).toBeLessThanOrEqual(f.vh);
    expect(f.left).toBeGreaterThanOrEqual(0);
    expect(f.right).toBeLessThanOrEqual(f.vw);
    expect(f.lastReachable).toBe(true);
  });
});

test.describe("language menu on a desktop (1280 × 800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("fits without scrolling, so it keeps its natural box", async ({ page }) => {
    await openLanguageMenu(page);
    const f = await fit(page);
    expect(f.bottom).toBeLessThanOrEqual(f.vh);
    expect(f.right).toBeLessThanOrEqual(f.vw);
    expect(f.overflowY).toBe("visible");
    expect(f.lastReachable).toBe(true);
  });
});

/**
 * THE PRICING PLAN LISTS FOLD (coordinator decision 2026-11-22). Each plan's
 * feature list opens behind its own "Includes · n" row; the plan's name,
 * access state and statement stay in view. No price or legal text changes.
 */
test.describe("pricing plan boundary on a phone (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("each plan's features fold behind one row and open complete", async ({ page }) => {
    await page.goto("/en/pricing");
    const boundary = page.getByTestId("plan-boundary");
    await expect(boundary).toBeVisible({ timeout: 30_000 });
    const folds = boundary.getByTestId("plan-boundary-features");
    expect(await folds.count(), "every listed plan folds its features").toBeGreaterThanOrEqual(3);
    const list = folds.first().locator('[data-features-from="plans-registry"]');
    await expect(list).toBeHidden();
    await folds.first().locator(":scope > summary").tap();
    await expect(list).toBeVisible();
    expect(await list.locator("li").count()).toBeGreaterThan(0);
  });
});
