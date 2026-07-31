import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * W3 row 16 — IDENTITY ACTIONS: the per-role browser confirmation.
 *
 * The audit (#947) found `IdentityActions` is a THIRD navigation presentation:
 * one mount on `/dashboard/advanced`, no data reads, no write path, no action
 * surface — a link catalogue to nine existing routes. The provisional
 * classification is `ALREADY`, and the owner rule is that code inspection
 * alone may not settle it. This spec is the browser pass:
 *
 *   - every destination is INDEPENDENTLY reachable by direct navigation,
 *     with the caller's real session and real permissions;
 *   - the surviving doors are mounted OUTSIDE the advanced page (the account
 *     menu and the header command finder live in the dashboard LAYOUT);
 *   - Back / Forward / reload hold on a representative destination;
 *   - 375px mobile and keyboard/accessible-name behavior pass;
 *   - 0 console errors (two named baseline allowances), 0 unexplained
 *     failed requests.
 *
 * HONEST COVERAGE NOTE. The role branches in `identity-actions.tsx` are
 * worker / company / agency / customer. Worker and company are driven with
 * real fixture sessions below. The agency subset (offer → /dashboard/company,
 * hire → /dashboard/candidates) and the customer subset (buy →
 * /dashboard/buyer) link routes ALREADY covered by the two proven sessions —
 * `/dashboard/buyer` is asserted with the company session, whose page-level
 * role handling is the page's own contract, not this catalogue's.
 */

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

/** Pre-existing, named console allowances (goal3 + calendar specs). */
const PRE_EXISTING_CONSOLE = [
  /upgrade-insecure-requests/i,
  /hydrated but some attributes of the server rendered HTML didn't match/i,
];

function watch(page: Page) {
  const consoleErrors: string[] = [];
  const failed: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !PRE_EXISTING_CONSOLE.some((rx) => rx.test(m.text()))) {
      consoleErrors.push(m.text());
    }
  });
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "";
    if (!why.includes("ERR_ABORTED")) failed.push(`${r.url()} — ${why}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  return {
    assertClean() {
      expect(failed, failed.join("\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    },
  };
}

/** Direct navigation must land ON the destination — not on the login page
 *  and not on some generic fallback. The page must render real content. */
async function assertDirectlyReachable(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
  await expect(page.locator("main, [role=main]").first()).toContainText(/\S/, {
    timeout: 60_000,
  });
}

test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

/* ── WORKER branch: profile / findWork / readiness (+ manage spaces) ─────── */

test.describe("row 16 — worker destinations survive without the catalogue", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.json",
    viewport: { width: 1440, height: 900 },
  });

  test("all worker destinations are directly reachable with real permissions", async ({
    page,
  }) => {
    const w = watch(page);
    for (const path of [
      "/lt/dashboard/profile",
      "/lt/dashboard/opportunities",
      "/lt/dashboard/documents",
      "/lt/dashboard/start",
    ]) {
      await assertDirectlyReachable(page, path);
    }
    w.assertClean();
  });

  test("the surviving doors are LAYOUT-mounted: account menu + command finder on the canonical workspace", async ({
    page,
  }) => {
    const w = watch(page);
    // The canonical chat-first workspace — NOT the advanced page.
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 60_000 });

    // Account menu → profile. Keyboard-reachable, real accessible name.
    const trigger = page.getByTestId("account-menu-trigger");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAccessibleName(/\S/);
    await trigger.click();
    const profileLink = page.getByTestId("account-menu-profile-link");
    await expect(profileLink).toBeVisible();
    await expect(profileLink).toHaveAttribute("href", /\/dashboard\/profile/);
    await expect(profileLink).toHaveAccessibleName(/\S/);
    await page.keyboard.press("Escape");

    // Command finder (header-search, layout-level) reaches the documents room.
    // The finder opens from the header's "Greita paieška" button.
    await page.getByRole("button", { name: /greita paieška|search/i }).first().click();
    const finder = page.getByTestId("command-finder-input").first();
    await expect(finder).toBeVisible();
    await finder.fill("Dokumentai");
    const results = page.getByTestId("command-finder-results").first();
    await expect(results).toBeVisible();
    await expect(
      results.locator('a[href*="/dashboard/documents"]').first(),
    ).toBeVisible();

    w.assertClean();
  });

  test("Back/Forward/reload hold on the profile destination", async ({ page }) => {
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 60_000 });
    await page.goto("/lt/dashboard/profile");
    await expect(page).toHaveURL(/\/lt\/dashboard\/profile/);
    await page.goBack();
    await expect(page).toHaveURL(/\/lt\/dashboard(\?|$)/);
    await page.goForward();
    await expect(page).toHaveURL(/\/lt\/dashboard\/profile/);
    await page.reload();
    await expect(page).toHaveURL(/\/lt\/dashboard\/profile/);
    await expect(page.locator("main, [role=main]").first()).toContainText(/\S/);
  });

  test("375px mobile: the profile destination renders without sideways scroll", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: "tests/e2e/.storage-state.json",
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    const w = watch(page);
    await assertDirectlyReachable(page, "/lt/dashboard/profile");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, "no sideways scroll on 375px").toBe(false);
    w.assertClean();
    await ctx.close();
  });
});

/* ── COMPANY branch: need / hire / projects (+ buyer, + start/company) ──── */

test.describe("row 16 — company destinations survive without the catalogue", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.company.json",
    viewport: { width: 1440, height: 900 },
  });

  test("all company destinations are directly reachable with real permissions", async ({
    page,
  }) => {
    const w = watch(page);
    for (const path of [
      "/lt/dashboard/company",
      "/lt/dashboard/candidates",
      "/lt/dashboard/projects",
      "/lt/dashboard/start",
    ]) {
      await assertDirectlyReachable(page, path);
    }
    w.assertClean();
  });

  test("the buyer route answers a company session sanely (page-level contract, not the catalogue's)", async ({
    page,
  }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/buyer");
    // The page may keep the company session or route it to its proper home —
    // either is the PAGE's own permission behavior. What row 16 requires is
    // only that the destination does not depend on the advanced-page mount:
    // no login bounce, no crash, no console error.
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(page.locator("main, [role=main]").first()).toContainText(/\S/, {
      timeout: 60_000,
    });
    w.assertClean();
  });
});
