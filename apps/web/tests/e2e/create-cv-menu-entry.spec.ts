import { expect, test } from "@playwright/test";

/**
 * THE MENU'S "CREATE A FREE CV" TELLS THE TRUTH ABOUT THE ACCOUNT (owner P0
 * 2026-11-15, F1).
 *
 * The audit: the menu marked "Create a free CV" (`/create-cv`) "no account
 * needed", yet that page's only action is sign-up. The entry now goes where
 * that sign-up leads, the profile builder, and is marked as needing an
 * account. A signed-out visitor is offered sign-up first (N3, 2026-11-16),
 * with the builder kept as `next`; a signed-in person goes straight there.
 * Public pages only, no account and no database. A signed-out visitor who
 * follows the entry is sent to sign in with `?next=` kept by the middleware
 * (guarded in `lib/guards/auth-middleware-session.test.ts`); here the sign-in
 * page is checked to keep that destination on its sign-up link.
 */

const BUILDER = "/dashboard/profile";

for (const locale of ["lt", "en"] as const) {
  test.describe(`${locale}: the menu's Create a free CV entry`, () => {
    test("signed out, it opens sign-up that returns to the profile builder (N3)", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/${locale}/work-opportunities`);
      await page.getByTestId("intent-toggle-work").click();
      const panel = page.getByTestId("intent-column-work");
      await expect(panel).toBeVisible();
      const entry = page.getByTestId("intent-link-work-createCv");
      await expect(entry).toHaveAttribute("href", `/${locale}/auth/signup?next=${encodeURIComponent(BUILDER)}`);
      await expect(entry.locator("svg"), "carries the account mark").toHaveCount(1);
      await expect(panel.locator(`a[href="/${locale}/create-cv"]`)).toHaveCount(0);
    });

    test("the sign-in it leads to keeps the destination on its sign-up link", async ({ page }) => {
      await page.goto(`/${locale}/auth/login?next=${encodeURIComponent(BUILDER)}`);
      const signup = page.locator(`a[href*="/auth/signup"]`).first();
      await expect(signup).toBeAttached();
      const href = (await signup.getAttribute("href")) ?? "";
      expect(new URL(href, "https://x.test").searchParams.get("next"), href).toContain(BUILDER);
    });
  });
}
