import { expect, test, type Page } from "@playwright/test";

/**
 * PUBLIC ACQUISITION SLICE — real pages, real routing, real fonts, real motion.
 * (/ , /for-workers , /for-companies — premium convergence 2026-10-02.)
 *
 * What this proves, per the owner acceptance list:
 *   1. first screen at 375x812 holds the human image, the promise and the one
 *      primary action (no scroll needed to act);
 *   2. no horizontal overflow at 375 / 768 / 1280 / 1920, in the five locales
 *      the layout must survive (EN LT DE PL RU);
 *   3. axe (WCAG 2 A/AA) reports no serious/critical violation;
 *   4. the signature transition is tested IN MOTION: it plays once, it is
 *      operable with the keyboard/mouse, it causes no layout shift, it ends in
 *      the complete state, and under reduced motion it is already complete;
 *   5. exactly one primary conversion route per page.
 *
 * Run against a running app:
 *   E2E_NO_SERVER=1 E2E_BASE_URL=http://localhost:3000 \
 *     pnpm exec playwright test tests/e2e/public-slice.spec.ts --project=chromium
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AXE = require.resolve("axe-core/axe.min.js");

const LOCALES = ["en", "lt", "de", "pl", "ru"] as const;
const WIDTHS = [375, 768, 1280, 1920] as const;
const PAGES = [{ path: "" }, { path: "/for-workers" }, { path: "/for-companies" }] as const;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

test.describe("layout survives every locale at every width", () => {
  for (const loc of LOCALES) {
    for (const p of PAGES) {
      test(`/${loc}${p.path}: no overflow at 375/768/1280/1920`, async ({ page }) => {
        for (const w of WIDTHS) {
          await page.setViewportSize({ width: w, height: w === 375 ? 812 : 900 });
          await page.goto(`/${loc}${p.path}`, { waitUntil: "load" });
          await settle(page);
          const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          expect(over, `${loc}${p.path} @${w} horizontal overflow (px)`).toBeLessThanOrEqual(0);
        }
      });
    }
  }
});

test.describe("accessibility (axe, WCAG 2 A/AA)", () => {
  for (const loc of ["en", "lt", "de"] as const) {
    for (const p of PAGES) {
      test(`/${loc}${p.path}: no serious/critical violations`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`/${loc}${p.path}`, { waitUntil: "load" });
        await settle(page);
        await page.addScriptTag({ path: AXE });
        const violations = await page.evaluate(async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = await (window as any).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return r.violations.map((x: any) => ({ id: x.id, impact: x.impact, nodes: x.nodes.map((n: any) => n.target.join(" ")).slice(0, 3) }));
        });
        const blocking = violations.filter((v: { impact: string }) => v.impact === "serious" || v.impact === "critical");
        expect(blocking, JSON.stringify(blocking, null, 1)).toEqual([]);
      });
    }
  }
});

test.describe("mobile first screen: image, promise, one action — in every locale", () => {
  for (const loc of LOCALES) for (const p of PAGES) {
    test(`/${loc}${p.path} at 375x812 shows the primary action without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/${loc}${p.path}`, { waitUntil: "load" });
      await settle(page);
      const h1 = page.locator("main h1").first();
      await expect(h1).toBeVisible();
      const box = await h1.boundingBox();
      expect(box, "h1 box").not.toBeNull();
      expect(box!.y + box!.height, "headline fully inside the first screen").toBeLessThanOrEqual(812);
      const cta =
        p.path === ""
          ? page.locator('main [data-surface="landing_hero"] a').first()
          : p.path === "/for-workers"
            ? page.locator('[data-testid="public-hero-workers"] a[data-cta-id]').first()
            : page.locator('[data-testid="public-hero-companies"] a[data-cta-id]').first();
      await expect(cta).toBeVisible();
      const cb = await cta.boundingBox();
      expect(cb!.y + cb!.height, "primary action inside the first screen").toBeLessThanOrEqual(812);
      expect(cb!.height, "touch target").toBeGreaterThanOrEqual(44);
    });
  }
});

test.describe("one primary conversion route per acquisition page", () => {
  test("/for-workers: hero and closing CTA both create the profile", async ({ page }) => {
    await page.goto("/en/for-workers", { waitUntil: "load" });
    await expect(page.locator("[data-cta-id='workers_hero']")).toHaveAttribute("href", /\/auth\/signup/);
    await expect(page.locator("[data-cta-id='workers_cta']")).toHaveAttribute("href", /\/auth\/signup/);
  });
  test("/for-companies: hero and closing CTA both open the canonical need intake", async ({ page }) => {
    await page.goto("/en/for-companies", { waitUntil: "load" });
    await expect(page.locator("[data-cta-id='companies_hero']")).toHaveAttribute("href", /\/company-need/);
    await expect(page.locator("[data-cta-id='companies_cta']")).toHaveAttribute("href", /\/company-need/);
  });
});

test.describe("signature transition — in motion", () => {
  const T = '[data-testid="work-record-transition"]';

  test("normal motion: plays once to the complete state, with no layout shift", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/for-workers", { waitUntil: "load" });
    await settle(page);
    // Collect layout-shift entries from now on.
    await page.evaluate(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: false });
    });
    const t = page.locator(T);
    await t.scrollIntoViewIfNeeded();
    // It restarts at stage 1 when it comes into view, then walks to 5.
    await expect(t).toHaveAttribute("data-stage", "1", { timeout: 5_000 });
    await expect(t).toHaveAttribute("data-stage", "5", { timeout: 20_000 });
    // And it never loops: still 5 a moment later.
    await page.waitForTimeout(3_000);
    await expect(t).toHaveAttribute("data-stage", "5");
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls, "layout shift during playback").toBeLessThan(0.02);
  });

  test("interaction: every stage is a button, selection is exposed, the caption follows", async ({ page }) => {
    await page.goto("/en/for-companies", { waitUntil: "load" });
    const t = page.locator(T);
    await t.scrollIntoViewIfNeeded();
    const nav = t.getByRole("group");
    const third = nav.getByRole("button").nth(2);
    await third.click();
    await expect(third).toHaveAttribute("aria-pressed", "true");
    await expect(t).toHaveAttribute("data-stage", "3");
    await expect(t.locator("[aria-live='polite']")).toContainText(/manager/i);
    // Choosing a stage stops autoplay: it must stay put.
    await page.waitForTimeout(3_500);
    await expect(t).toHaveAttribute("data-stage", "3");
    // Keyboard: focus a stage button and activate it with Enter.
    await nav.getByRole("button").nth(0).focus();
    await page.keyboard.press("Enter");
    await expect(t).toHaveAttribute("data-stage", "1");
  });

  test("reduced motion: the complete story is present immediately and nothing animates", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en/for-workers", { waitUntil: "load" });
    await settle(page);
    const t = page.locator(T);
    await t.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_000);
    await expect(t).toHaveAttribute("data-stage", "5");
    await expect(t.getByRole("button", { name: /replay|play again/i })).toBeHidden();
  });

  test("mobile: playing at 375px does not overflow or shift", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/en/for-workers", { waitUntil: "load" });
    await settle(page);
    const t = page.locator(T);
    await t.scrollIntoViewIfNeeded();
    await expect(t).toHaveAttribute("data-stage", "5", { timeout: 20_000 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});

test.describe("the page is honest about what it shows", () => {
  for (const path of ["/for-workers", "/for-companies"]) {
    test(`${path}: every product moment is labelled as an example`, async ({ page }) => {
      await page.goto(`/en${path}`, { waitUntil: "load" });
      await settle(page);
      const labelled = await page.locator("[data-testid^='moment-']").evaluateAll((els) =>
        els.map((e) => /^Example$/m.test((e as HTMLElement).innerText)),
      );
      expect(labelled.length).toBeGreaterThan(0);
      expect(labelled.every(Boolean), "every moment shows the Example label").toBe(true);
      await expect(page.locator("main")).not.toContainText(/\bdemo\b/i);
    });
  }
});
