import { test, expect, type Page } from "@playwright/test";

/**
 * Production UX Root-Cause Repair v2 — browser proof (F1–F16).
 *
 * PUBLIC layer (always runs, secret-free): theme toggle visibility, theme
 * continuity across every active locale in BOTH directions, and the mobile
 * viewport overflow contract on the public pages.
 *
 * AUTHENTICATED layer: follows the repo convention (auth.spec.ts) — skips
 * unless SUPABASE_TEST_URL points at the LOCAL test stack, so `pnpm e2e`
 * stays green without secrets. The authenticated F-flows (member profile,
 * role-aware project views, safe map edit, readiness collapse, notification
 * empty state) were additionally proven manually against the dev server —
 * see docs/launch/production-ux-root-cause-audit-v2.md.
 */

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.dataset.theme = t;
  }, theme);
}

async function currentTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.dataset.theme ?? null);
}

test.describe("F1 — public theme toggle + locale-independent theme", () => {
  test("public header shows the theme toggle on desktop and mobile", async ({
    page,
  }) => {
    await page.goto("/lt");
    await expect(page.getByTestId("public-theme-toggle")).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.getByTestId("public-theme-toggle")).toBeVisible();
  });

  test("the toggle flips and persists the theme", async ({ page }) => {
    await page.goto("/lt");
    const before = await currentTheme(page);
    await page.getByTestId("public-theme-toggle").click();
    const after = await currentTheme(page);
    expect(after).not.toBe(before);
    await page.reload();
    expect(await currentTheme(page)).toBe(after);
  });

  test("public LIGHT LT → EN stays light", async ({ page }) => {
    await page.goto("/lt");
    await setTheme(page, "light");
    // Header switcher (the footer carries a second one).
    await page
      .getByRole("banner")
      .getByRole("button", { name: /Lietuvių|Kalba/ })
      .click();
    await page.getByRole("menuitem").filter({ hasText: "English" }).click();
    await page.waitForURL(/\/en/);
    expect(await currentTheme(page)).toBe("light");
  });

  test("public DARK LT → EN → RU → NL → DE stays dark", async ({ page }) => {
    await page.goto("/lt");
    await setTheme(page, "dark");
    for (const locale of ["en", "ru", "nl", "de"]) {
      await page.goto(`/${locale}`);
      expect(await currentTheme(page), `dark must survive /${locale}`).toBe(
        "dark",
      );
    }
  });

  test("LIGHT survives a direct visit to every active locale", async ({
    page,
  }) => {
    await page.goto("/lt");
    await setTheme(page, "light");
    for (const locale of ACTIVE_LOCALES) {
      await page.goto(`/${locale}`);
      expect(await currentTheme(page), `light must survive /${locale}`).toBe(
        "light",
      );
    }
  });
});

test.describe("F16 — mobile viewports do not overflow (public)", () => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ]) {
    test(`/lt has no horizontal overflow at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/lt");
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, "horizontal overflow px").toBeLessThanOrEqual(1);
    });
  }
});

// ── Authenticated layer — local test stack only (repo convention) ──────────

test.describe("authenticated F-flows (local stack only)", () => {
  test.beforeEach(() => {
    test.skip(
      !HAS_TEST_SUPABASE,
      "SUPABASE_TEST_URL not configured — see docs/TESTING.md",
    );
  });

  test("F14/F15 — calendar + network are reachable through the primary nav", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("bottom-nav-planning")).toBeVisible();
    await expect(page.getByTestId("bottom-nav-network")).toBeVisible();
  });

  test("F4 — notification empty state has no placeholder copy", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard");
    await page.getByRole("button", { name: /pranešimai|notifications/i }).click();
    const empty = page.getByTestId("notification-empty-state");
    if (await empty.isVisible()) {
      await expect(empty).not.toContainText(/placeholder|rezervavimo/i);
    }
  });

  test("F6 — suggest-structure never replaces the app with an error shell", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/profile");
    const textarea = page.locator("textarea").nth(1);
    await textarea.fill("Programuoju ir vadovauju komandai statybose.");
    await page.getByRole("button", { name: "Pasiūlykite struktūrą" }).click();
    // Either suggestions or the inline recoverable error — never a dead app.
    await expect(
      page
        .getByTestId("profile-text-flow-extract-error")
        .or(page.locator('[data-testid^="profile-text-flow"]').first()),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /Application error/i,
    );
  });
});
