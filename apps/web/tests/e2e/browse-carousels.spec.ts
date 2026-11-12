import { expect as baseExpect, test } from "@playwright/test";

/**
 * PUBLIC BROWSE CAROUSELS in a real browser (owner P0 2026-11-12).
 * Public pages, no session needed.
 *
 *   · the profession row on /jobs: arrows move it, ← → move it from the
 *     keyboard, a card opens the board filtered to that profession;
 *   · the function row on /for-workers: a card opens a page that answers;
 *   · 320px and 1440px: nothing escapes the viewport;
 *   · prefers-reduced-motion: cards carry no rotation.
 */

const expect = baseExpect.configure({ timeout: 15_000 });

async function pageOverflow(page: import("@playwright/test").Page, testId: string) {
  return page.evaluate((id) => {
    const vw = window.innerWidth;
    const root = document.querySelector(`[data-testid="${id}"]`);
    if (!root) return ["missing"];
    const r = root.getBoundingClientRect();
    return r.right > vw + 0.5 || r.left < -0.5 ? [`${Math.round(r.left)}..${Math.round(r.right)} vw=${vw}`] : [];
  }, testId);
}

for (const width of [320, 768, 1440] as const) {
  test.describe(`@${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("profession row: keyboard moves it and a card filters the board", async ({ page }) => {
      await page.goto("/en/jobs");
      const row = page.getByTestId("profession-carousel");
      await expect(row).toBeVisible();
      expect(await pageOverflow(page, "profession-carousel")).toEqual([]);

      const first = row.locator("a[data-area-index='0']");
      await first.focus();
      await expect(first).toHaveAttribute("data-selected", "true");
      await page.keyboard.press("ArrowRight");
      const second = row.locator("a[data-area-index='1']");
      await expect(second).toBeFocused();
      await expect(second).toHaveAttribute("data-selected", "true");

      const href = await second.getAttribute("href");
      expect(href).toMatch(/\/en\/jobs\?profession=[a-z_]+$/);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/en\/jobs\?profession=[a-z_]+/);
      // The filtered board no longer repeats the row.
      await expect(page.getByTestId("profession-carousel")).toHaveCount(0);
    });

    test("function row: a card opens a page that answers", async ({ page }) => {
      await page.goto("/en/for-workers");
      const row = page.getByTestId("function-carousel");
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeVisible();
      expect(await pageOverflow(page, "function-carousel")).toEqual([]);
      const card = page.getByTestId("function-card-jobs");
      const [response] = await Promise.all([page.waitForNavigation(), card.click()]);
      expect(response?.status() ?? 200).toBeLessThan(400);
      await expect(page).toHaveURL(/\/en\/jobs$/);
    });
  });
}

test.describe("desktop arrows", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test("the next arrow advances the selection", async ({ page }) => {
    await page.goto("/en/jobs");
    const row = page.getByTestId("profession-carousel");
    await row.getByTestId("area-switcher-next").click();
    await expect(row.locator("a[data-area-index='1']")).toHaveAttribute("data-selected", "true");
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  test("cards do not rotate", async ({ page }) => {
    await page.goto("/en/jobs");
    const li = page.getByTestId("profession-carousel").locator("li").nth(1);
    const transform = await li.evaluate((el) => getComputedStyle(el).transform);
    // A pure translation: matrix(1, 0, 0, 1, x, 0) — no 3D matrix, no rotation.
    expect(transform).toMatch(/^matrix\(1, 0, 0, 1, /);
  });
});
