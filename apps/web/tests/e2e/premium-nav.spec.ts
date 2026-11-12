import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * PREMIUM NAVIGATION — the six public intents, proven in a real browser
 * (owner P0 2026-11-12). Public pages, no session needed.
 *
 *   desktop (1024, 1280, 1440): the mega-menu opens from the keyboard, shows
 *     all six intents, Tab walks its links, Escape closes it and returns focus,
 *     and following a link navigates to a page that answers (not a 404);
 *   mobile (320, 375, 768): the hamburger shows the same six intents, each
 *     expands to its links, nothing in the header escapes the viewport, every
 *     row is a 44px target, and a link navigates.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
const MIN_TOUCH_PX = 43.5;
const INTENTS = ["work", "workers", "services", "orders", "partners", "agencies"] as const;

async function headerOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: string[] = [];
    document.querySelectorAll("header *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5)) {
        out.push(`${el.tagName.toLowerCase()} [${Math.round(r.left)}..${Math.round(r.right)}] vw=${vw}`);
      }
    });
    return out;
  });
}

for (const width of [1024, 1280, 1440] as const) {
  test.describe(`desktop mega-menu @${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("opens from the keyboard, shows six intents, closes on Escape", async ({ page }) => {
      await page.goto("/en/pricing");
      expect(await headerOverflow(page), "closed header overflow").toEqual([]);

      const toggle = page.getByTestId("intent-menu-toggle");
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByTestId("mobile-nav-toggle")).toBeHidden();

      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      const panel = page.getByTestId("intent-menu-panel");
      await expect(panel).toBeVisible();
      for (const id of INTENTS) {
        await expect(page.getByTestId(`intent-column-${id}`)).toBeVisible();
      }

      // Tab moves INTO the panel: the first destination of the first intent.
      await page.keyboard.press("Tab");
      await expect(page.getByTestId("intent-link-work-jobs")).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(toggle).toBeFocused();
    });

    test("a destination navigates to a page that answers", async ({ page }) => {
      await page.goto("/en/pricing");
      await page.getByTestId("intent-menu-toggle").click();
      const link = page.getByTestId("intent-link-workers-companyNeed");
      await expect(link).toHaveAttribute("href", /\/company-need$/);
      const [response] = await Promise.all([
        page.waitForNavigation(),
        link.click(),
      ]);
      expect(response?.status() ?? 200).toBeLessThan(400);
      await expect(page).toHaveURL(/\/company-need$/);
      await expect(page.getByTestId("intent-menu-panel")).toHaveCount(0);
    });
  });
}

for (const width of [320, 375, 768] as const) {
  test.describe(`mobile menu @${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("the hamburger carries the six intents and their links", async ({ page }) => {
      await page.goto("/lt/pricing");
      await expect(page.getByTestId("intent-menu-toggle")).toBeHidden();

      await page.getByTestId("mobile-nav-toggle").click();
      await expect(page.getByTestId("mobile-nav-intents")).toBeVisible();
      expect(await headerOverflow(page), "open header overflow").toEqual([]);

      for (const id of INTENTS) {
        const t = page.getByTestId(`mobile-intent-toggle-${id}`);
        await expect(t).toBeVisible();
        const box = await t.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      }

      const work = page.getByTestId("mobile-intent-toggle-work");
      await work.click();
      await expect(work).toHaveAttribute("aria-expanded", "true");
      const jobs = page.getByTestId("mobile-intent-link-work-jobs");
      await expect(jobs).toBeVisible();
      expect((await jobs.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      expect(await headerOverflow(page), "expanded header overflow").toEqual([]);

      await jobs.click();
      await expect(page).toHaveURL(/\/lt\/jobs/);
      await expect(page.getByTestId("mobile-nav-menu")).toHaveCount(0);
    });

    test("Escape closes the panel and returns focus", async ({ page }) => {
      await page.goto("/lt/pricing");
      const toggle = page.getByTestId("mobile-nav-toggle");
      await toggle.click();
      await page.getByTestId("mobile-intent-toggle-services").focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByTestId("mobile-intent-link-services-myServices"),
      ).toHaveAttribute("href", /\/dashboard\/services$/);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("mobile-nav-menu")).toHaveCount(0);
      await expect(toggle).toBeFocused();
    });
  });
}
