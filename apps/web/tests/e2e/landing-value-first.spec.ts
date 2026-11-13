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

  test("two example chips on the landing, one for each side, and nothing more to open", async ({ page }) => {
    // Owner P0 2026-11-13: less noise on the first screen. The component's
    // standard set (four chips, the rest on demand) is still covered by its
    // guard; the landing mounts the short set.
    await page.goto("/lt");
    await expect(page.getByTestId("entry-example")).toHaveCount(2);
    await expect(page.getByTestId("entry-more-examples")).toHaveCount(0);
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

  });
});
