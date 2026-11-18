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
 *   · the page ends on the next step.
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
    // The V2 first screen: the goal cards are the next step, and the phone's
    // sign-up row sits under them — both ON the first screen, not below it.
    const rail = page.getByTestId("goal-rail");
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box, "goal cards box").not.toBeNull();
    expect(box!.y + box!.height, "goal cards end below the first screen").toBeLessThanOrEqual(812);
    const signup = page.getByTestId("landing-signup");
    await expect(signup).toBeVisible();
    const sb = await signup.boundingBox();
    expect(sb!.y + sb!.height, "sign-up row is below the first screen").toBeLessThanOrEqual(812);

    await page.screenshot({ path: join(SHOTS, "lt-375-first-screen.png"), fullPage: false });
  });

  test("no example chips on the landing: the goals are the choice", async ({ page }) => {
    // Landing V3 (owner, 2026-11-13): the chips repeated the goals. The
    // component's chip sets are still covered by its guard.
    await page.goto("/lt");
    await expect(page.getByTestId("entry-input")).toBeVisible();
    await expect(page.getByTestId("entry-example")).toHaveCount(0);
    await expect(page.getByTestId("entry-more-examples")).toHaveCount(0);
  });

  test("a looking-for-work reading offers the public board beside sign-up", async ({ page }) => {
    await page.goto("/lt");
    await page.getByTestId("entry-input").fill("Ieškau darbo Norvegijoje");
    await page.getByTestId("entry-submit").click();
    await expect(page.getByTestId("entry-understanding")).toBeVisible();
    await expect(page.getByTestId("entry-signup")).toBeVisible();
    const jobs = page.getByTestId("entry-jobs").locator("a");
    await expect(jobs).toBeVisible();
    await expect(jobs).toHaveAttribute("href", /\/jobs$/);
  });
});

test.describe("@1440px desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("market figures are printed once, with real adverts or the link to the search", async ({ page }) => {
    await page.goto("/lt");

    const market = page.getByTestId("landing-market-facts");
    await expect(market).toBeVisible();
    // The counts are in this block or nowhere: never inside the sentence box.
    await expect(page.getByTestId("entry-numbers")).toHaveCount(0);
    const line = page.getByTestId("landing-market-line");
    if ((await line.count()) > 0) {
      await expect(page.getByTestId("landing-market-source")).toContainText("LabourMarket.ai");
      await expect(page.getByTestId("landing-market-none")).toHaveCount(0);
    } else {
      // The canonical reader could not answer: the page says so, and shows
      // no number at all.
      await expect(page.getByTestId("landing-market-none")).toBeVisible();
      await expect(market).not.toContainText(/\d{3}/);
    }

    const band = page.getByTestId("landing-open-jobs");
    if ((await band.count()) > 0) {
      const cards = band.getByTestId("landing-open-job");
      const n = await cards.count();
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(3);
      for (let i = 0; i < n; i += 1) {
        await expect(cards.nth(i).locator("a").first()).toHaveAttribute("href", /\/jobs\/[0-9a-f-]{36}$/);
      }
      await expect(page.getByTestId("landing-open-jobs-all")).toHaveAttribute("href", /\/jobs$/);
      await expect(page.getByTestId("landing-market-search")).toHaveCount(0);
      await band.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(SHOTS, "lt-1440-open-jobs.png"), fullPage: false });
    } else {
      // No live adverts: the link to the search, never a placeholder advert.
      await expect(page.getByTestId("landing-market-search")).toHaveAttribute("href", /\/jobs$/);
    }

    // The page ends on "How it works" and the short footer — no second or
    // third start button.
    await expect(page.getByTestId("landing-how")).toBeVisible();
    await expect(page.getByTestId("landing-close")).toHaveCount(0);
    await expect(page.getByTestId("site-footer-compact")).toBeVisible();
    await expect(page.getByTestId("footer-entity-disclosure")).toBeVisible();
    await expect(page.getByTestId("footer-copyright")).toBeVisible();
  });
});
