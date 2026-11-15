import { expect, test } from "@playwright/test";

/**
 * ONE DOOR TO "BUILD YOUR PROFILE / CV" (owner P0 2026-11-15, F2 / F6).
 *
 * Public pages only, no account and no database: what a visitor can do
 * before signing up. Each "build your profile / CV" button opens sign-up
 * carrying the profile builder, so the account comes before any typing and
 * nothing typed is lost. The free-CV page carries the same path, and the
 * intake preview's account links carry it too. The step after sign-up (the
 * builder itself) is walked with a real account in signup-isolated (S-3d).
 * The menu's Create CV entry no longer promises a no-account page (F1).
 */

const DOOR = "/auth/signup?next=%2Fdashboard%2Fprofile";

const BUTTONS = [
  { route: "/work-opportunities", ctaId: "work_opportunities_profile" },
  { route: "/skills", ctaId: "skills_profile" },
  { route: "/professions", ctaId: "professions_profile" },
] as const;

for (const locale of ["lt", "en"] as const) {
  test.describe(`${locale}: the profile door`, () => {
    for (const { route, ctaId } of BUTTONS) {
      test(`${route}: the button opens sign-up with the profile builder as its return path`, async ({ page }) => {
        await page.goto(`/${locale}${route}`);
        const button = page.locator(`[data-cta-id="${ctaId}"]`);
        await expect(button).toBeVisible();
        await expect(button).toHaveAttribute("href", `/${locale}${DOOR}`);
        await button.click();
        await page.waitForURL((url) => url.pathname === `/${locale}/auth/signup`);
        expect(new URL(page.url()).searchParams.get("next"), "the return path survives the click").toBe("/dashboard/profile");
        await expect(page.locator('input[type="email"]'), "the account comes first, before any typing").toBeVisible();
      });
    }

    test("/create-cv: its CTAs carry the same return path (one door, not two)", async ({ page }) => {
      await page.goto(`/${locale}/create-cv`);
      const footer = page.locator('[data-cta-id="create_cv_footer"]');
      await expect(footer).toHaveAttribute("href", `/${locale}${DOOR}`);
    });

    test("the menu's Create CV entry opens the builder and is marked as needing an account", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/${locale}/pricing`);
      await page.getByTestId("intent-toggle-work").click();
      const entry = page.getByTestId("intent-link-work-createCv");
      await expect(entry).toBeVisible();
      await expect(entry).toHaveAttribute("href", `/${locale}/dashboard/profile`);
      await expect(entry.locator("svg"), "the sign-in mark an account destination carries").toHaveCount(1);
    });

    test("/worker-intake: the preview's sign-up and login both return to the profile builder", async ({ page }) => {
      await page.goto(`/${locale}/worker-intake`);
      const links = page.locator('[data-testid="intake-bridge"] a');
      await expect(links).toHaveCount(2);
      for (const href of await links.evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""))) {
        expect(new URL(href, "https://x.test").searchParams.get("next"), href).toBe("/dashboard/profile");
      }
      await expect(page.locator("h1").first(), "it registers nobody, so it is not called a registration").not.toContainText(/regist/i);
    });
  });
}
