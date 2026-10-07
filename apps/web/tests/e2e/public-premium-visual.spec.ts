import { expect, test } from "@playwright/test";

/**
 * PUBLIC PREMIUM SURFACES — visual regression baselines.
 *
 * `public-premium-surfaces.spec.ts` proves presence / no overflow / axe. THIS
 * spec proves the signature visuals still LOOK the way they were accepted:
 * `toHaveScreenshot` on the three signature elements, at two representative
 * widths (phone 375, desktop 1280) — deliberately a small, meaningful set, not
 * a brittle matrix.
 *
 * DETERMINISM. emulated `reducedMotion: "reduce"` freezes the lifecycle graph at its
 * complete state and removes the travelling marker, so nothing time-dependent
 * is captured. Only the component element is shot (no hero carousel, no market
 * numbers, no dates).
 *
 * OPT-IN. Baselines are platform-specific (Playwright suffixes them with the
 * OS), so this spec runs only when `VISUAL_REGRESSION=1`. Update intentionally:
 *
 *   VISUAL_REGRESSION=1 E2E_NO_SERVER=1 E2E_BASE_URL=https://labourmarket.ai \
 *     pnpm exec playwright test tests/e2e/public-premium-visual.spec.ts \
 *     --project=chromium --workers=1 --update-snapshots
 *
 * A diff is a prompt to LOOK, not to regenerate: review the attached
 * expected/actual/diff images before accepting a new baseline.
 */
test.skip(!process.env.VISUAL_REGRESSION, "visual regression is opt-in (VISUAL_REGRESSION=1)");
test.beforeEach(async ({ page }) => {
  // page.emulateMedia is reliable; the `test.use({ reducedMotion })` fixture option
  // did not take effect here and left the graph mid-animation.
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

const SIGNATURES = [
  { path: "/en/for-workers", testid: "work-lifecycle-workers", file: "workers-lifecycle" },
  { path: "/en/for-companies", testid: "work-lifecycle-companies", file: "companies-lifecycle" },
  { path: "/en", testid: "two-sides-lifecycle", file: "home-two-sides" },
] as const;

for (const s of SIGNATURES) {
  for (const v of WIDTHS) {
    test(`${s.file} @${v.name} matches its baseline`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto(s.path, { waitUntil: "load" });
      // The page streams in Suspense chunks; let it settle so the element we
      // measure is the final one (otherwise it can be swapped under us).
      await page.waitForLoadState("networkidle");
      // The graph is folded on the acquisition pages: open it before measuring.
      const fold = page.getByTestId("explore-steps");
      if (await fold.count()) {
        await fold.scrollIntoViewIfNeeded();
        await expect(async () => {
          if (!(await fold.evaluate((e) => (e as HTMLDetailsElement).open))) await fold.locator("summary").click();
          await expect(fold).toHaveJSProperty("open", true, { timeout: 1_000 });
        }).toPass({ timeout: 15_000 });
      }
      const el = page.getByTestId(s.testid);
      await expect(el).toBeVisible({ timeout: 30_000 });
      await el.scrollIntoViewIfNeeded();
      // Web fonts must be in before pixels are compared.
      await page.evaluate(() => document.fonts.ready);
      await expect(el).toHaveScreenshot(`${s.file}-${v.name}.png`, {
        maxDiffPixelRatio: 0.015,
        animations: "disabled",
      });
    });
  }
}
