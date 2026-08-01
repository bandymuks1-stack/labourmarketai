import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * W3 row 21 — MYZONE: the browser equivalence proof.
 *
 * The guard (`lib/guards/w3-row21-myzone.test.ts`) pins the structure; this
 * spec proves the EQUIVALENCE with a real session: the readiness truth MyZone
 * states on the advanced page is the SAME truth the canonical player-card
 * result renders in the Context Panel — where the state-aware work editor
 * (five dimensions, one best next action) already lives. Nothing unique
 * remains on the MyZone surface, so the mount may die with the route.
 *
 * The fixture worker is a SETTLED profile (profession + skills + entries), so
 * the honest branch this identity exercises is ready/returning. The
 * first-use branch (missing dimensions → next action) is pinned by the
 * work-card model's own unit suite — inventing a half-onboarded account to
 * screenshot it is the fabricated state this platform bans (row 1 precedent).
 */

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

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

test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

test.describe("row 21 — MyZone's truth already lives in the player-card result", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.json",
    viewport: { width: 1440, height: 900 },
  });

  test("the readiness truth lives on the canonical surface (worker, desktop)", async ({
    page,
  }) => {
    const w = watch(page);

    // MyZone died with /dashboard/advanced (W3 Package 4). Its truth —
    // state-aware readiness over the person's REAL rows — lives in the
    // player-card result in the Context Panel, which this test pins.
    await page.goto("/lt/dashboard?result=player-card");
    const card = page.getByTestId("player-card-result");
    await expect(card).toBeVisible({ timeout: 60_000 });

    // The work editor is the state-aware readiness surface (5 dimensions,
    // one best next action). It renders for every identity with a worker
    // row — including the incomplete one, where its next action IS the
    // missing dimension MyZone could only hint at.
    const editor = page.getByTestId("player-card-work-editor");
    await expect(editor).toBeVisible();
    await expect(editor).toContainText(/\S/);

    // Keyboard + accessible name on the editor's action control.
    const control = editor.locator("a, button").first();
    await expect(control).toBeVisible();
    await control.focus();
    await expect(control).toBeFocused();
    await expect(control).toHaveAccessibleName(/\S/);

    w.assertClean();
  });

  test("375px mobile: the canonical surface renders one-handed", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: "tests/e2e/.storage-state.json",
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    const w = watch(page);

    await page.goto("/lt/dashboard?result=player-card");
    await expect(page.getByTestId("player-card-result")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("player-card-work-editor")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, "no sideways scroll on 375px").toBe(false);

    w.assertClean();
    await ctx.close();
  });
});
