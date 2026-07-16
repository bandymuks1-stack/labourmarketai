import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Wagon 1 — Production Viewport and Readability Recovery: browser proof.
 *
 * Root cause fixed by the wagon: dashboard page ROOTS re-constrained
 * themselves to stock max-w-xl…4xl (448–896px) inside the healthy 1440px
 * shell, so most of the desktop viewport sat empty (owner screenshots).
 * This spec measures the REAL rendered width of the page-root element on
 * representative previously-narrow routes at 1920/1440, and asserts the
 * no-horizontal-overflow contract at 390 (mobile).
 *
 * AUTHENTICATED layer follows the repo convention (journal-confirm-loop):
 * runs against the LOCAL Supabase stack only via `pnpm e2e:local`
 * (dev-fixtures users). Skips cleanly without SUPABASE_TEST_URL.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const WORKER = { email: "dev.worker@local.test", password: "password" };
const MANAGER = { email: "dev.company@local.test", password: "password" };

// Previously-narrow routes (Wagon 1 diff) + their page-root locator.
// Roots without a testid are located as the direct child of the shell main.
const WORKER_ROUTES: ReadonlyArray<{ path: string; label: string }> = [
  { path: "/lt/dashboard/opportunities", label: "opportunities (was 896px)" },
  { path: "/lt/dashboard/projects", label: "projects (was 768px)" },
  { path: "/lt/dashboard/instructions", label: "instructions (was 672px)" },
  { path: "/lt/dashboard/gallery", label: "gallery (was 896px)" },
];
const MANAGER_ROUTES: ReadonlyArray<{ path: string; label: string }> = [
  { path: "/lt/dashboard/candidates", label: "candidates (was 896px)" },
  { path: "/lt/dashboard/projects", label: "projects manager (was 896px)" },
];

// max-w-content = 1200px; shell px-6/sm:px-12 padding eats some of it on
// smaller canvases. The defect band was ≤896px — anything ≥1000px proves
// the narrow column is gone without over-pinning exact pixel values.
const MIN_ROOT_WIDTH_DESKTOP = 1000;

async function loginAs(
  browser: Browser,
  creds: { email: string; password: string },
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  return page;
}

/** Rendered width of the page root (first element child of the shell main). */
async function pageRootWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const root = main?.firstElementChild as HTMLElement | null;
    return root ? Math.round(root.getBoundingClientRect().width) : 0;
  });
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
}

test.describe("Wagon 1 — authenticated viewport recovery", () => {
  test.skip(
    !HAS_TEST_SUPABASE,
    "SUPABASE_TEST_URL not configured — run via `pnpm e2e:local` (docs/TESTING.md)",
  );

  test("worker routes use the working width at 1920 and 1440, no overflow at 390", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(300_000);
    const page = await loginAs(browser, WORKER);

    for (const { path, label } of WORKER_ROUTES) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const w1920 = await pageRootWidth(page);
      expect
        .soft(w1920, `${label} root width @1920 (was ≤896px)`)
        .toBeGreaterThanOrEqual(MIN_ROOT_WIDTH_DESKTOP);

      await page.setViewportSize({ width: 1440, height: 900 });
      const w1440 = await pageRootWidth(page);
      expect
        .soft(w1440, `${label} root width @1440`)
        .toBeGreaterThanOrEqual(MIN_ROOT_WIDTH_DESKTOP);

      await page.setViewportSize({ width: 390, height: 844 });
      expect
        .soft(await hasHorizontalOverflow(page), `${label} overflow @390`)
        .toBe(false);

      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.screenshot({
        path: testInfo.outputPath(
          `wagon1-${path.replaceAll("/", "_")}-1920.png`,
        ),
        fullPage: false,
      });
    }
  });

  test("manager routes use the working width at 1920, no overflow at 390", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(300_000);
    const page = await loginAs(browser, MANAGER);

    for (const { path, label } of MANAGER_ROUTES) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const w = await pageRootWidth(page);
      expect
        .soft(w, `${label} root width @1920`)
        .toBeGreaterThanOrEqual(MIN_ROOT_WIDTH_DESKTOP);

      await page.setViewportSize({ width: 390, height: 844 });
      expect
        .soft(await hasHorizontalOverflow(page), `${label} overflow @390`)
        .toBe(false);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/lt/dashboard/candidates", {
      waitUntil: "domcontentloaded",
    });
    await page.screenshot({
      path: testInfo.outputPath("wagon1-candidates-1920.png"),
      fullPage: false,
    });
  });
});

test.describe("Wagon 1 — public surfaces (no test DB needed)", () => {
  test("login page keeps its intended centered form and no mobile overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/lt/auth/login", { waitUntil: "domcontentloaded" });
    // Auth stays a deliberate max-w-md (448px) centered form — Wagon 1
    // widens WORKING pages, not the login card.
    const w = await page.evaluate(() => {
      const main = document.querySelector("main");
      return main ? Math.round(main.getBoundingClientRect().width) : 0;
    });
    expect(w).toBeLessThanOrEqual(460);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(false);
  });
});
