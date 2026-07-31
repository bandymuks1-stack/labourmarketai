import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * W3 rows 19 / 14 — RETURN TO CHAT: the browser proof.
 *
 * The audit found no new component is owed:
 *
 *   row 19 (status strip)  — the strip's chips are the SPINE, which the
 *     layout-mounted bell already presents (proven for bookings in the
 *     rows 11/12 pass); its two extra doors survive layout-level — the bell
 *     panel's "view all" opens /dashboard/activity, and the primary nav
 *     carries the calendar tab.
 *   row 14 (chain actions) — a role-aware link card whose destinations
 *     (journal / company#team / inbox) all keep doors outside the advanced
 *     page.
 *
 * The ONE return-to-workspace primitive is the primary navigation's home
 * entry (`/dashboard`), mounted in the LAYOUT on desktop and mobile. This
 * spec proves the loop: detail route → home entry → the canonical chat-first
 * workspace, with the documented result-state rule (navigating home is a
 * FRESH workspace; a `?result=` deep link is how state is carried).
 */

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

const PRE_EXISTING_CONSOLE = [
  /upgrade-insecure-requests/i,
  /hydrated but some attributes of the server rendered HTML didn't match/i,
  // Pre-existing dev-only defect on /dashboard/journal, reproducible on the
  // baseline (this slice changes no journal rendering; keying the two
  // top-level children was tried and did not silence it — the real keyless
  // array is deeper). Named narrowly so the allowance covers exactly this
  // warning and nothing else; tracked for its own fix.
  /unique "key" prop[\s\S]*JournalEntryRow/,
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

test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

test.describe("rows 19/14 — the return loop and the surviving doors", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.json",
    viewport: { width: 1440, height: 900 },
  });

  test("mobile: detail route → nav home → the canonical chat workspace", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: "tests/e2e/.storage-state.json",
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    const w = watch(page);

    // A legitimate detail route (row 14's worker destination).
    await page.goto("/lt/dashboard/journal");
    await expect(page).toHaveURL(/\/lt\/dashboard\/journal/);

    // THE one return primitive: the shell's home entry. The journal renders
    // the simple chrome, whose header carries the "Pokalbis" link; the
    // advanced chrome's bottom nav carries the same `/dashboard` entry — one
    // destination either way.
    const home = page
      .getByRole("link", { name: /pokalbis/i })
      .or(page.getByTestId("bottom-nav-overview"))
      .first();
    await expect(home).toBeVisible({ timeout: 60_000 });
    await home.click();
    await expect(page).toHaveURL(/\/lt\/dashboard(\?|$)/);
    await expect(page.getByTestId("conversation-chat")).toBeVisible({
      timeout: 60_000,
    });

    w.assertClean();
    await ctx.close();
  });

  test("row 19's extra doors survive layout-level: bell view-all → activity", async ({
    page,
  }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/journal");
    await expect(page).toHaveURL(/\/lt\/dashboard\/journal/);

    await page.getByRole("button", { name: /pranešimai|notifications/i }).click();
    const viewAll = page
      .locator('a[data-testid="notification-panel-view-all"]:visible')
      .first();
    await expect(viewAll).toBeVisible();
    await expect(viewAll).toHaveAttribute("href", /\/dashboard\/activity/);
    await viewAll.click();
    await expect(page).toHaveURL(/\/lt\/dashboard\/activity/, { timeout: 60_000 });

    w.assertClean();
  });

  test("the result-state rule: a deep link carries state; going home is a fresh workspace", async ({
    page,
  }) => {
    // Deep link IN — the result renders.
    await page.goto("/lt/dashboard?result=calendar");
    await expect(
      page.getByTestId("calendar-result").or(page.getByTestId("calendar-result-empty")).first(),
    ).toBeVisible({ timeout: 60_000 });

    // Detail route, then HOME. Home is the fresh workspace — the result
    // param is intentionally not resurrected; `?result=` deep links and
    // browser Back are how state returns. (Back itself was proven in the
    // calendar-result spec.)
    await page.goto("/lt/dashboard/journal");
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).searchParams.get("result")).toBeNull();
  });
});

test.describe("row 14 — the company chain destinations survive", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.company.json",
    viewport: { width: 1440, height: 900 },
  });

  test("inbox is directly reachable with the company session", async ({ page }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/inbox");
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(page).toHaveURL(/\/lt\/dashboard\/inbox/);
    await expect(page.locator("main, [role=main]").first()).toContainText(/\S/, {
      timeout: 60_000,
    });
    w.assertClean();
  });
});
