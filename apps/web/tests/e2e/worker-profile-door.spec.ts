import { expect, test } from "@playwright/test";

/**
 * WHAT A WORKER TYPES BEFORE SIGN-UP IS KEPT (owner P0 2026-11-15, F2).
 *
 * Public pages only, no account and no database: the steps a visitor takes
 * before signing up. The "build your profile / CV" buttons open the intake
 * (no sign-up before typing); what is typed there is kept in this tab only; the
 * intake's sign-up and login return to the profile builder. The step after
 * sign-up (the builder's composer holding the typed text) is walked with a
 * real account in signup-isolated (S-3d).
 */

const BUTTONS = ["/work-opportunities", "/skills", "/professions"] as const;
const DRAFT_KEY = "lm.workerIntakeDraft.v2";

for (const locale of ["lt", "en"] as const) {
  test.describe(`${locale}: the worker intake`, () => {
    for (const route of BUTTONS) {
      test(`${route}: "build your profile / CV" opens the intake, not sign-up`, async ({ page }) => {
        await page.goto(`/${locale}${route}`);
        const button = page.locator(`a[href="/${locale}/worker-intake"]`).first();
        await expect(button).toBeVisible();
        await button.click();
        await page.waitForURL((url) => url.pathname === `/${locale}/worker-intake`);
        await expect(page.getByTestId("worker-intake-form")).toBeVisible();
      });
    }

    test("what is typed is kept in this tab only, without an account", async ({ page }) => {
      await page.goto(`/${locale}/worker-intake`);
      const form = page.getByTestId("worker-intake-form");
      await form.locator('input[name="full_name"]').fill("Synthetic Intake Person");
      await form.locator('textarea[name="comment"]').fill("Tiling, six years");
      const kept = await page.evaluate((k) => sessionStorage.getItem(k), DRAFT_KEY);
      expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY), "never in shared storage before sign-up").toBeNull();
      const text = (JSON.parse(kept ?? "{}") as { text?: string }).text ?? "";
      expect(text).toContain("Synthetic Intake Person");
      expect(text).toContain("Tiling, six years");
      await page.reload();
      const again = await page.evaluate((k) => sessionStorage.getItem(k), DRAFT_KEY);
      expect(again, "a reload keeps it").toBe(kept);
    });

    for (const route of ["/for-workers", "/work-abroad"] as const) {
      test(`${route}: its sign-up returns to the profile builder (F6, one door)`, async ({ page }) => {
        await page.goto(`/${locale}${route}`);
        const links = page.locator('main a[href*="/auth/signup"]');
        await expect(links.first()).toBeAttached();
        for (const href of await links.evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""))) {
          expect(new URL(href, "https://x.test").searchParams.get("next"), href).toBe("/dashboard/profile");
        }
      });
    }

    test("its sign-up and login return to the profile builder; it is not called a registration", async ({ page }) => {
      await page.goto(`/${locale}/worker-intake`);
      const links = page.locator('[data-testid="intake-bridge"] a');
      await expect(links).toHaveCount(2);
      for (const href of await links.evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""))) {
        expect(new URL(href, "https://x.test").searchParams.get("next"), href).toBe("/dashboard/profile");
      }
      await expect(page.locator("h1").first()).not.toContainText(/regist/i);
    });
  });
}
