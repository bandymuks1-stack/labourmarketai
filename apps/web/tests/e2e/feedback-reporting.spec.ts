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

test.describe("In-app problem reporting", () => {
  test.skip(!HAS_TEST_SUPABASE, "Needs the local Supabase stack (pnpm e2e:local).");
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("the report control is findable and tappable on a phone", async ({ page }) => {
    await loginAsWorker(page);
    await page.goto("/lt/dashboard/journal");
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

  test("a non-admin's report is ACCEPTED, not refused by RLS", async ({ page }) => {
    await loginAsWorker(page);
    await page.goto("/lt/dashboard/journal");
    await trigger(page).click();

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

    await trigger(page).click();
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
    await trigger(page).click();
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
