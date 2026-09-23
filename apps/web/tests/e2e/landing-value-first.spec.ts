import { expect as baseExpect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * LANDING §22 — VALUE FIRST, ONE NEXT STEP, REAL JOBS (owner directives
 * 2026-09-23: landing §22 "fix the story, not CSS" and
 * PUBLIC_LANDING_REAL_JOB_DISCOVERY).
 *
 * What a person sees, measured in a real browser — the vitest guards pin the
 * source and the rendered markup; this pins the first screen:
 *
 *   · the h1 + sub + ONE primary action fit the first phone screen;
 *   · four example chips are mounted, the other six one tap away;
 *   · a looking-for-work reading offers the public board beside sign-up;
 *   · the real-jobs band, when the market reader answered, shows at most four
 *     cards, each a link to the ONE public detail route;
 *   · the page ends on the next step, and the LIVE/FOCUS label is readable.
 *
 * Public page, no session needed. Developer proof: not in the CI e2e subset
 * (whose MIN_EXPECTED floor is measured, not guessed).
 */

const SHOTS = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "landing-value-first");
const expect = baseExpect.configure({ timeout: 15_000 });

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test.describe("@375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the first screen states the value and offers one next step without scrolling", async ({ page }) => {
    await page.goto("/lt");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    const actions = page.locator('[data-testid="landing-actions"][data-surface="landing_hero"]');
    await expect(actions).toBeVisible();

    // The header folds its sign-up into the menu below 640px, so the hero's
    // own action is the phone's visible next step — it must be ON the first
    // screen, not below it.
    const box = await actions.locator("a").first().boundingBox();
    expect(box, "hero primary action box").not.toBeNull();
    expect(box!.y + box!.height, "hero primary action is below the first screen").toBeLessThanOrEqual(812);
    await expect(actions.locator("a").first()).toHaveAttribute("href", "/lt/auth/signup");

    await page.screenshot({ path: join(SHOTS, "lt-375-first-screen.png"), fullPage: false });
  });

  test("four chips by default; the other six mount on demand", async ({ page }) => {
    await page.goto("/lt");
    await expect(page.getByTestId("entry-example")).toHaveCount(4);
    const more = page.getByTestId("entry-more-examples");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await expect(page.getByTestId("entry-example")).toHaveCount(10);
    await expect(page.getByTestId("entry-more-examples")).toHaveCount(0);
    // Focus moved to the first newly mounted chip, not lost with the control.
    await expect(page.getByTestId("entry-example").nth(4)).toBeFocused();
  });

  test("a looking-for-work reading offers the public board beside sign-up", async ({ page }) => {
    await page.goto("/lt");
    // The second default chip is the looking-for-work sentence.
    await page.getByTestId("entry-example").nth(1).click();
    await expect(page.getByTestId("entry-understanding")).toBeVisible();
    await expect(page.getByTestId("entry-signup")).toBeVisible();
    const jobs = page.getByTestId("entry-jobs").locator("a");
    await expect(jobs).toBeVisible();
    await expect(jobs).toHaveAttribute("href", /\/jobs$/);
  });
});

test.describe("@1440px desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("real jobs come from the board, and the page ends on the next step", async ({ page }) => {
    await page.goto("/lt");

    const band = page.getByTestId("landing-open-jobs");
    if ((await band.count()) > 0) {
      // Omitted entirely when the market reader could not answer — so only a
      // PRESENT band is measured.
      const cards = band.getByTestId("landing-open-job");
      const n = await cards.count();
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(4);
      for (let i = 0; i < n; i += 1) {
        await expect(cards.nth(i).locator("a").first()).toHaveAttribute("href", /\/jobs\/[0-9a-f-]{36}$/);
      }
      await expect(page.getByTestId("landing-open-jobs-all")).toHaveAttribute("href", /\/jobs$/);
      await band.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(SHOTS, "lt-1440-open-jobs.png"), fullPage: false });
    }

    const close = page.getByTestId("landing-close");
    await close.scrollIntoViewIfNeeded();
    await expect(close).toBeVisible();
    await expect(close.getByTestId("landing-actions").locator("a")).toHaveCount(2);
    await expect(close.getByTestId("landing-actions")).toHaveAttribute("data-surface", "landing_close");

    // The LIVE/FOCUS label is at least the 12px floor (it was 7px).
    const px = await page
      .getByTestId("landing-mode-switcher")
      .locator("button")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px).toBeGreaterThanOrEqual(12);
  });
});
