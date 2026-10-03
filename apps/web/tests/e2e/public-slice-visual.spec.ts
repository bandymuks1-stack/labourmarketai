import { expect, test } from "@playwright/test";

/**
 * PUBLIC ACQUISITION SLICE — visual regression baselines (premium convergence,
 * 2026-10-02). A deliberately small set: the hero of each acquisition page and
 * the signature transition's COMPLETE state, at the two widths that matter
 * (phone 375, desktop 1280). The homepage's own hero is a time-dependent
 * carousel, so only the slice's own sections (transition, two-door fork) are
 * pinned there.
 *
 * DETERMINISTIC. Reduced motion renders the transition in its complete state
 * and removes every timer. Opt-in (`VISUAL_REGRESSION=1`) because baselines
 * are platform-specific:
 *
 *   VISUAL_REGRESSION=1 E2E_NO_SERVER=1 E2E_BASE_URL=http://localhost:3000 \
 *     pnpm exec playwright test tests/e2e/public-slice-visual.spec.ts \
 *     --project=chromium --workers=1 --update-snapshots
 *
 * A diff is a prompt to LOOK, not to regenerate.
 */
test.skip(!process.env.VISUAL_REGRESSION, "visual regression is opt-in (VISUAL_REGRESSION=1)");
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Never bake the Next dev-overlay badge into a baseline.
  await page.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
});

const WIDTHS = [
  { name: "375", width: 375, height: 812 },
  { name: "1280", width: 1280, height: 800 },
] as const;

const TARGETS = [
  { path: "/en/for-workers", testid: "public-hero-workers", file: "workers-hero" },
  { path: "/en/for-workers", testid: "cinematic-story", file: "workers-story" },
  { path: "/en/for-companies", testid: "public-hero-companies", file: "companies-hero" },
  { path: "/en/for-companies", testid: "cinematic-story", file: "companies-story" },
  { path: "/en", testid: "cinematic-story", file: "home-story" },
  { path: "/en", testid: "home-sides", file: "home-sides" },
] as const;

for (const t of TARGETS) {
  for (const v of WIDTHS) {
    test(`${t.file} @${v.name} matches its baseline`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto(t.path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      const el = page.getByTestId(t.testid);
      await expect(el).toBeVisible({ timeout: 30_000 });
      await el.scrollIntoViewIfNeeded();
      await expect(el).toHaveScreenshot(`${t.file}-${v.name}.png`, {
        maxDiffPixelRatio: 0.015,
        animations: "disabled",
      });
    });
  }
}
