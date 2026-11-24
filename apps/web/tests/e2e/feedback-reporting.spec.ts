import { test, expect, type Page } from "@playwright/test";

/**
 * A TESTER MUST BE ABLE TO REPORT A PROBLEM — from the screen where it happens.
 *
 * Two defects made the in-app reporter useless, and neither was visible to the
 * existing guards:
 *
 *  1. UNREACHABLE. IA cleanup v2 (#11) reduced the control to a 36px,
 *     60%-opaque, icon-only glyph whose label lived in `title` / `aria-label`.
 *     Both reveal on HOVER, which a phone does not have. The owner could no
 *     longer find the reporting button; an external tester never found it.
 *  2. NON-FUNCTIONAL FOR EVERYONE WHO NEEDS IT. The server action wrote with
 *     `.insert(...).select("id").single()`. `RETURNING` is evaluated under the
 *     SELECT policy, and that policy is `is_admin()` — so for every ordinary
 *     user the statement was rejected ("new row violates row-level security
 *     policy") and the insert rolled back. Reporting worked for admins only.
 *
 * These cases assert what a tester experiences: the control is findable and
 * tappable, the report is ACCEPTED, and filing it does not cost them their
 * place in the app.
 *
 * Local stack only; skips cleanly without it.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;
const WORKER = { email: "dev.worker@local.test", password: "password" };

async function loginAsWorker(page: Page): Promise<void> {
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(WORKER.email);
  await page.locator('input[type="password"]').fill(WORKER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

const trigger = (page: Page) =>
  page.locator('[data-testid="language-feedback-open"]');

/**
 * Open the reporter the way a user does: the account menu, then the item.
 *
 * The control used to be a floating pill. It was findable, and it covered three
 * calendar cells at 412px — a floating trigger can only trade discoverability
 * against obstruction. It is a menu item now, so both hold at once.
 */
async function openFeedback(page: Page): Promise<void> {
  await page.locator('[data-testid="account-menu-trigger"]').click();
  await trigger(page).click();
}

test.describe("In-app problem reporting", () => {
  test.skip(!HAS_TEST_SUPABASE, "Needs the local Supabase stack (pnpm e2e:local).");
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("the report control is findable and tappable on a phone", async ({ page }) => {
    await loginAsWorker(page);
    await page.goto("/lt/dashboard/journal");

    // Reachable from the header on this route, in the same place as everywhere.
    const menu = page.locator('[data-testid="account-menu-trigger"]');
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.height).toBeGreaterThanOrEqual(44);
    expect(menuBox!.width).toBeGreaterThanOrEqual(44);

    await menu.click();
    const t = trigger(page);
    await expect(t).toBeVisible();

    // A LABEL THE USER CAN READ — not a hover-only tooltip.
    await expect(t).toHaveText(/\S{3,}/);

    // A REAL TOUCH TARGET (44px is the accessibility floor; it was 36px).
    const box = await t.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // Nothing is sitting on top of it: the browser must hit the control
    // itself at its own centre point.
    const ownsItsCentre = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="language-feedback-open"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el === top || el.contains(top);
    });
    expect(ownsItsCentre).toBe(true);
  });

  /**
   * THE OBSTRUCTION HALF OF THE SAME REQUIREMENT.
   *
   * The previous fix made the control findable by making it a labelled pill,
   * and measured — but accepted — that it then covered three calendar cells at
   * 412px. Discoverability and non-obstruction are BOTH requirements, so this
   * asserts the second one directly, at the width where it was measured
   * failing, by hit-testing the cells rather than looking at a screenshot.
   */
  test("no floating control covers the calendar at 412px", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await loginAsWorker(page);
    await page.goto("/lt/dashboard/planning?view=month");
    await expect(page.locator('[data-testid="planning-month"]')).toBeVisible();

    // Every rendered day cell must own its own centre point. A cell whose
    // centre hits something else is a cell the user cannot tap.
    //
    // EACH CELL IS SCROLLED INTO VIEW FIRST. `elementFromPoint` is
    // viewport-relative and returns null for anything below the fold, so
    // hit-testing the grid where it happens to sit reports every off-screen
    // cell as obstructed — which is what the first run of this test did. The
    // cells further down are exactly the ones a bottom-anchored control would
    // cover, so skipping them would have made the test useless in the one
    // region it exists to check.
    const covered = await page.evaluate(() => {
      const bad: string[] = [];
      for (const cell of document.querySelectorAll(
        '[data-testid^="planning-month-cell-"]',
      )) {
        cell.scrollIntoView({ block: "center" });
        const r = cell.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // Still not in view (page too short to centre it) — nothing to assert.
        if (cy < 0 || cy > window.innerHeight) continue;
        const top = document.elementFromPoint(cx, cy);
        if (!(cell === top || cell.contains(top))) {
          const blocker =
            top?.closest("[data-testid]")?.getAttribute("data-testid") ??
            top?.tagName ??
            "null";
          bad.push(`${cell.getAttribute("data-testid")} <- ${blocker}`);
        }
      }
      return bad;
    });
    expect(covered, "calendar cells obstructed by another control").toEqual([]);

    // And the reporter is still reachable on this very route.
    await page.locator('[data-testid="account-menu-trigger"]').click();
    await expect(trigger(page)).toBeVisible();
  });

  test("a non-admin's report is ACCEPTED, not refused by RLS", async ({ page }) => {
    await loginAsWorker(page);
    await page.goto("/lt/dashboard/journal");
    await openFeedback(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The context the developer needs is captured for the tester.
    await expect(dialog).toContainText("/dashboard/journal");
    await expect(dialog).toContainText("lt");

    await dialog.locator("textarea").last().fill("Žurnalo mygtukas neveikia (e2e).");
    await dialog.getByRole("button", { name: /Išsiųsti/ }).click();

    // THE REGRESSION: this used to read
    //   "Pranešimo išsiųsti nepavyko: new row violates row-level security policy"
    await expect(
      page.locator('[data-testid="language-feedback-success"]'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[data-testid="language-feedback-error"]'),
    ).toHaveCount(0);
  });

  test("reporting does not cost the tester their place in the app", async ({ page }) => {
    await loginAsWorker(page);
    await page.goto("/lt/dashboard/journal");
    const before = page.url();

    await openFeedback(page);
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").last().fill("Nesuprantu šio teksto (e2e).");
    await dialog.getByRole("button", { name: /Išsiųsti/ }).click();
    await expect(
      page.locator('[data-testid="language-feedback-success"]'),
    ).toBeVisible({ timeout: 15_000 });

    // Same route, and the surface behind the dialog is still the journal.
    expect(page.url()).toBe(before);
    await expect(page.getByText(/Darbo įrašai/).first()).toBeVisible();
  });

  test("an unsendable report cannot be submitted and never claims success", async ({
    page,
  }) => {
    await loginAsWorker(page);
    await page.goto("/lt/dashboard/journal");
    await openFeedback(page);
    const dialog = page.getByRole("dialog");

    // Below the 3-character minimum the send control stays disabled, so no
    // empty report can be filed — and nothing claims it was.
    await dialog.locator("textarea").last().fill("x");
    await expect(dialog.getByRole("button", { name: /Išsiųsti/ })).toBeDisabled();
    await expect(
      page.locator('[data-testid="language-feedback-success"]'),
    ).toHaveCount(0);
    // What the tester typed is still there to finish.
    await expect(dialog.locator("textarea").last()).toHaveValue("x");
  });
});
