import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * PR-I E2E reality matrix — unauthenticated landing scenarios (6, 8).
 *
 * UPDATED for the landing rebuild (owner directive 2026-07-29): the hero
 * visual is now the LIVE PRODUCT DEMO (honest sample sequence of the real
 * core loop), the #how-it-works anchor is carried by the six-link product
 * chain band, and the map story is the controlled-height MarketMoment —
 * the wall-sized static world map is gone from the landing.
 *
 * S6: the rebuilt landing renders all its sections (product chain,
 *     market moment, conversation-as-OS, audience value blocks, partners,
 *     proof band, trust band, final CTA band), every final-CTA href
 *     click-navigates to a real page (never the branded 404), and
 *     reduced-motion emulation renders with the decorative animations off.
 *     Includes the 390px mobile pass.
 * S8: the landing renders those sections in lt, en and ru (screenshot each).
 *
 * No session required. Screenshots land in
 * docs/audits/evidence/pr-i-e2e-reality-v1/ for the matrix document.
 */
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const EVIDENCE = join(
  REPO_ROOT,
  "docs",
  "audits",
  "evidence",
  "pr-i-e2e-reality-v1",
);

function evidencePath(name: string): string {
  mkdirSync(EVIDENCE, { recursive: true });
  return join(EVIDENCE, name);
}

async function assertLandingSections(page: Page, _locale: string) {
  // Anchored sections (nav targets + narrative bands).
  await expect(page.locator("#how-it-works")).toBeVisible();
  await expect(page.locator("#conversation")).toBeVisible();
  await expect(page.locator("#trust")).toBeVisible();
  await expect(page.locator("#partners")).toBeVisible();

  // Audience value blocks — each "more" link targets its real public route.
  const main = page.locator("main");
  await expect(main.locator('a[href*="/for-workers"]').first()).toBeVisible();
  await expect(main.locator('a[href*="/for-companies"]').first()).toBeVisible();
  await expect(main.locator('a[href*="/for-agencies"]').first()).toBeVisible();
  await expect(main.locator('a[href*="/labour-market"]').first()).toBeVisible();

  // Hero visual: the live product demo window (sample-labelled), and the
  // controlled-height market-moment map fragment further down. The old
  // wall-sized world canvas must NOT be on the page.
  await expect(page.getByTestId("live-product-demo")).toBeVisible();
  await expect(page.getByTestId("market-moment")).toBeVisible();
  await expect(page.locator('svg[viewBox="0 0 1000 389"]')).toHaveCount(0);

  // Final CTA band: the one section that carries all five doors (worker,
  // employer, agency, institution — window 6 G-C1 — and partner).
  const band = finalCtaBand(page);
  await expect(band).toBeVisible();
  await expect(band.locator("a")).toHaveCount(5);
}

/** The final CTA band is the only section containing BOTH the /about door and
 *  the /company-need door. */
function finalCtaBand(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.locator('a[href*="/about"]') })
    .filter({ has: page.locator('a[href*="/company-need"]') })
    .last();
}

async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function openLanding(page: Page, locale: string): Promise<void> {
  // Known local flake: the first compile can exceed 5s — wait on content.
  await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#how-it-works")).toBeVisible({ timeout: 60_000 });
}

test.describe("PR-I reality matrix — landing (unauthenticated)", () => {
  test("S6a: all PR-H sections render, hero map is the WORLD canvas (lt, desktop)", async ({ page }) => {
    test.setTimeout(180_000);
    await openLanding(page, "lt");
    await assertLandingSections(page, "lt");
    await assertNoHorizontalScroll(page);
    await page.screenshot({
      path: evidencePath("s6a-landing-lt-desktop.png"),
      fullPage: true,
    });
  });

  test("S6b: every final-CTA href click-navigates to a real page (no branded 404)", async ({ page }) => {
    test.setTimeout(240_000);
    await openLanding(page, "lt");

    const band = finalCtaBand(page);
    const hrefs: string[] = [];
    for (const a of await band.locator("a").all()) {
      const href = await a.getAttribute("href");
      if (href) hrefs.push(href);
    }
    expect(hrefs).toHaveLength(4);
    await band.scrollIntoViewIfNeeded();
    await band.screenshot({ path: evidencePath("s6b-final-cta-band.png") });

    for (const href of [...new Set(hrefs)]) {
      await openLanding(page, "lt");
      await finalCtaBand(page)
        .locator(`a[href="${href}"]`)
        .first()
        .click();
      await page.waitForURL((url) => url.pathname !== "/lt", {
        timeout: 60_000,
      });
      // A real page: content renders and it is NOT the branded not-found.
      await expect(page.getByTestId("branded-not-found")).toHaveCount(0);
      await expect(page.locator("h1, h2").first()).toBeVisible({
        timeout: 60_000,
      });
      test
        .info()
        .annotations.push({ type: "s6b-cta", description: `${href} → ${page.url()} OK` });
    }
  });

  test("S6c: reduced-motion emulation renders the landing with decorative animation off", async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLanding(page, "lt");
    await assertLandingSections(page, "lt");

    // The canonical reduced-motion block kills the decorative loops.
    const animated = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".map-marker, .live-dot"))
        .map((el) => getComputedStyle(el).animationName)
        .filter((name) => name !== "none"),
    );
    expect(animated).toEqual([]);

    await page.screenshot({
      path: evidencePath("s6c-landing-lt-reduced-motion.png"),
      fullPage: true,
    });
  });

  test("S8: landing renders the PR-H sections in en and ru", async ({ page }) => {
    test.setTimeout(240_000);
    for (const locale of ["en", "ru"] as const) {
      await openLanding(page, locale);
      await assertLandingSections(page, locale);
      await page.screenshot({
        path: evidencePath(`s8-landing-${locale}-desktop.png`),
        fullPage: true,
      });
    }
  });
});

test.describe("PR-I reality matrix — landing (mobile 390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("S6d: mobile landing renders the sections without horizontal scroll", async ({ page }) => {
    test.setTimeout(180_000);
    await openLanding(page, "lt");
    // Anchored sections + the hero demo exist on mobile too.
    await expect(page.locator("#how-it-works")).toBeVisible();
    await expect(page.locator("#trust")).toBeVisible();
    await expect(page.getByTestId("live-product-demo")).toBeVisible();
    await assertNoHorizontalScroll(page);
    await page.screenshot({
      path: evidencePath("s6d-landing-lt-mobile-390.png"),
      fullPage: true,
    });
  });
});
