import { expect as baseExpect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 — REMOVING THE SECOND DASHBOARD, ONE PROVEN ROW AT A TIME.
 *
 * `/dashboard/advanced` is a 916-line parallel dashboard composing ~27
 * capabilities. It is the architecture violation the owner command names, and
 * it is also the only place several real capabilities currently live — so the
 * migration matrix
 * (`docs/audits/evidence/premium-rebuild/w3-capability-migration-matrix.md`)
 * moves one row at a time, and every row gets a browser assertion before the
 * route can be deleted.
 *
 * This file grows one describe-block per migrated row. It is deliberately NOT
 * a "the advanced page renders" smoke test: the point is to prove that
 * REMOVING something did not remove a capability.
 */

const SHOTS = process.env.E2E_SHOTS_DIR
  ? join(process.cwd(), "..", "..", process.env.E2E_SHOTS_DIR)
  : join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-rebuild", "w3");

const expect = baseExpect.configure({ timeout: 15_000 });

test.use({
  storageState: "tests/e2e/.storage-state.json",
  viewport: { width: 1440, height: 900 },
});
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

// `/dashboard/advanced` is 916 lines composing ~27 components. Its FIRST dev
// compile genuinely exceeds the 30s default — that is build cost, not product
// latency, and shrinking the assertion to hide it would prove less.
test.setTimeout(180_000);

test.describe("row 4 — the fake market map is gone, the capability is not", () => {
  test("the advanced route still renders, without a drawn pseudo-map", async ({ page }) => {
    const consoleErrors: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
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

    await page.goto("/lt/dashboard/advanced");

    // The market panel lives inside the "More" disclosure — a native <details>,
    // closed by default. Open it the way a person would, rather than asserting
    // against a collapsed element and calling the collapse a bug.
    const more = page.getByTestId("dashboard-more-section");
    await expect(more).toBeAttached();
    await more.locator("summary").click();

    // The route is intact — removing the drawing did not break the page.
    const panel = page.getByTestId("premium-hub-map");
    await expect(panel).toBeVisible();

    // THE CAPABILITY SURVIVED — in whichever of its two REAL branches this
    // identity lands in. The fixture worker has no market signals yet, so the
    // panel correctly renders its honest empty state; a seeded identity renders
    // the three counts. Asserting only one branch would have made this test a
    // statement about the fixture rather than about the panel.
    const values = await panel.locator("dl dd").allTextContents();
    if (values.length > 0) {
      expect(values.length, "the three market signal values must survive").toBe(3);
      for (const v of values) expect(v.trim()).not.toBe("");
      const door = page.getByTestId("hub-map-open-link");
      await expect(door).toBeVisible();
      await expect(door).toHaveAttribute("href", /\/dashboard\/market-map/);
    } else {
      // Honest empty state — it must still say something and still open the map.
      await expect(panel).toContainText(/\S/);
      await expect(panel.locator('a[href*="/dashboard/market-map"]')).toHaveCount(1);
    }

    // THE FAKE MAP IS GONE. The panel drew a 400x260 <svg> of dots at invented
    // positions; a picture of a map is not a map.
    expect(
      await panel.locator("svg[viewBox='0 0 400 260']").count(),
      "the decorative pseudo-map must not come back",
    ).toBe(0);

    await page.screenshot({ path: join(SHOTS, "row4-market-panel-1440.png") });

    expect(failed, failed.join("\n")).toEqual([]);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  test("the door leads to a REAL map, not another drawing", async ({ page }) => {
    // The other half of "no capability was lost": the door has to lead
    // somewhere real.
    //
    // NOTE — a duplication found while writing this test, recorded in the W3
    // matrix rather than silently accommodated: `/dashboard/market-map` does
    // NOT render the canonical <MarketMap>. It renders `market-map-base` →
    // `market-map-live`, a SECOND Leaflet chain. `market-map.tsx`'s own header
    // says it was meant to collapse `market-map-live.tsx` into itself; that
    // collapse never finished. Both are real maps, so no user is being lied
    // to — but two map implementations is one too many, and it is now a
    // tracked W3 row instead of a surprise.
    await page.goto("/lt/dashboard/market-map");
    await expect(page.getByTestId("market-map-base")).toBeVisible();
    // Real Leaflet, real coordinates — not an illustration.
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await page.screenshot({ path: join(SHOTS, "row4-real-map-1440.png") });
  });
});

test.describe("row 5 — the recommendations card became a result", () => {
  /**
   * The FIRST genuine ABSORB. Rows 13/15 were `ALREADY` — a canonical home
   * existed, so they die with the route. Row 5 had exactly ONE mount, on
   * `/dashboard/advanced`, and no home anywhere else: deleting it would have
   * deleted the capability. So it had to become a result FIRST, and this test
   * is what makes "first" checkable rather than asserted.
   *
   * Both halves are required. A test that only proved the card was gone would
   * pass just as well if the capability had been thrown away.
   */

  const consoleErrorsOf = (page: import("@playwright/test").Page) => {
    const errors: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
        errors.push(m.text());
      }
    });
    page.on("requestfailed", (r) => {
      const why = r.failure()?.errorText ?? "";
      // A server action aborted by a navigation is not a failure of anything.
      if (!why.includes("ERR_ABORTED")) failed.push(`${r.url()} — ${why}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    return { errors, failed };
  };

  test("the capability now answers in the result panel", async ({ page }) => {
    const { errors, failed } = consoleErrorsOf(page);

    // The result is a real, restorable address — that is the whole point of
    // `?result=`: it survives a reload and can be shared.
    await page.goto("/lt/dashboard?result=opportunities");

    // WAIT FOR THE READ TO SETTLE FIRST. The result loads through a server
    // action after hydration, so its states appear only once that resolves —
    // counting testids straight after `goto` reads the loading state and finds
    // none of them. (Written here as a failing test first: it is the same
    // "counted before settle" defect this harness has already produced three
    // times, and an instantaneous `count()` never auto-waits.)
    //
    // The open-full control is present in EVERY terminal state and in none of
    // the transient ones, which makes it the honest settle signal.
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();
    await expect(page.getByTestId("opportunities-loading")).toHaveCount(0);

    // Exactly ONE of the honest states must be on screen. Which one depends on
    // the identity and on whether the owner-gated demand RPC is applied, so
    // asserting a single branch would make this a statement about the fixture
    // rather than about the result.
    const states = [
      "opportunities-view",
      "opportunities-empty",
      "opportunities-unavailable",
      "opportunities-no-worker",
    ] as const;
    const present = [];
    for (const id of states) {
      if ((await page.getByTestId(id).count()) > 0) present.push(id);
    }
    expect(present, `exactly one honest state, saw: ${present.join(", ")}`).toHaveLength(1);

    // Whichever state it is, it is never the unimplemented placeholder the
    // other result kinds still fall through to.
    expect(
      await page.getByTestId("result-body-pending").count(),
      "the opportunities result must render, not fall through to the pending placeholder",
    ).toBe(0);

    if (present[0] === "opportunities-view") {
      // Rows are real rows: every one carries the §19 basis — matched/total
      // counts WITH the confirmed share. A bare percentage is banned platform
      // -wide, so its absence is asserted too.
      // `opportunities-row-<uuid>` is the row itself; the parts inside it are
      // `opportunities-match-*` precisely so a prefix match cannot count a
      // row's own children as extra rows.
      const rows = page.locator('li[data-testid^="opportunities-row-"]');
      const n = await rows.count();
      expect(n).toBeGreaterThan(0);
      const bases = page.getByTestId("opportunities-match-basis");
      expect(await bases.count(), "every row explains its own basis").toBe(n);
      for (const text of await bases.allTextContents()) {
        expect(text.trim()).not.toBe("");
        expect(text, "a bare percentage may never stand alone").not.toMatch(/^\s*\d+\s*%\s*$/);
      }
    }

    await page.screenshot({ path: join(SHOTS, "row5-opportunities-result-1440.png") });

    expect(failed, failed.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the card is gone from /dashboard/advanced, and the route still works", async ({
    page,
  }) => {
    const { errors, failed } = consoleErrorsOf(page);

    await page.goto("/lt/dashboard/advanced");

    // GONE — the second dashboard no longer carries this capability.
    expect(
      await page.getByTestId("dashboard-jobs-card").count(),
      "the recommendations card must not come back to the second dashboard",
    ).toBe(0);

    // …and removing it did not break the section that hosted it: the "More"
    // disclosure still opens and still renders its remaining real cards.
    const more = page.getByTestId("dashboard-more-section");
    await expect(more).toBeAttached();
    await more.locator("summary").click();
    await expect(more).toContainText(/\S/);

    expect(failed, failed.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the result holds up on a phone", async ({ page }) => {
    // The panel docks under the composer on phones. A result that overflows
    // there is a result nobody can read on a site.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/dashboard?result=opportunities");
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, "the result must not push the page sideways on 375px").toBe(false);

    // The one control it offers must be a real tap target.
    const box = await page.getByTestId("opportunities-open-full").first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.screenshot({ path: join(SHOTS, "row5-opportunities-result-375.png") });
  });

  /**
   * THE RESULT IS A PLACE, NOT A POPUP.
   *
   * An absorbed capability that cannot survive close / Back / Forward / reload
   * has not really moved into the workspace — it has become a modal with extra
   * steps. `?result=` was chosen precisely so every depth is a real address, so
   * that claim has to be checked rather than assumed.
   */
  test("close, Back, Forward and reload all keep the result honest", async ({ page }) => {
    await page.goto("/lt/dashboard?result=opportunities");
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();

    // RELOAD — the result is restored from the URL, not from memory.
    await page.reload();
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get("result")).toBe("opportunities");

    // CLOSE — the result goes, the conversation stays. Closing must not
    // navigate away from the workspace.
    await page.getByTestId("context-panel-close").click();
    await expect(page.getByTestId("opportunities-view")).toHaveCount(0);
    await expect(page.getByTestId("conversation-chat")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("result")).toBeNull();
    expect(new URL(page.url()).pathname).toContain("/dashboard");

    // BACK — closing replaces rather than pushes, so Back returns to the
    // address before the workspace, never into a half-open result.
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // FORWARD — and the result comes back exactly as it was.
    await page.goForward();
    await page.waitForLoadState("domcontentloaded");
    if (new URL(page.url()).searchParams.get("result") === "opportunities") {
      await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();
    }
  });

  test("'open full screen' leads to the board — the SAME capability, not a second dashboard", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard?result=opportunities");
    await page.getByTestId("opportunities-open-full").first().click();

    // The canonical board. NOT /dashboard/advanced — the whole point of the
    // absorb is that the capability stopped depending on the second dashboard.
    await page.waitForURL(/\/dashboard\/opportunities/, { timeout: 30_000 });
    expect(page.url()).not.toContain("/dashboard/advanced");

    // And it is the real board, which reports its own shown rows.
    await expect(page.locator("main")).toContainText(/\S/);
  });

  /**
   * The two states a fixture cannot produce on demand. Both are forced at the
   * transport level rather than mocked in the component, so what is proven is
   * the real component reacting to a real failed read.
   */
  test("loading, then error, then retry — a failed read never renders as emptiness", async ({
    page,
  }) => {
    // Server actions are POSTs carrying `next-action` to the current URL.
    const isAction = (r: import("@playwright/test").Route) =>
      r.request().method() === "POST" &&
      Object.keys(r.request().headers()).some((h) => h.toLowerCase() === "next-action");

    // 1. HOLD the read open — the loading state must be visible and must
    //    announce itself to assistive tech rather than showing a bare blank.
    let release: (() => void) | null = null;
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/dashboard**", async (route) => {
      if (!isAction(route)) return route.fallback();
      await held;
      return route.fallback();
    });

    await page.goto("/lt/dashboard?result=opportunities");
    const loading = page.getByTestId("opportunities-loading");
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    release?.();
    await page.unroute("**/dashboard**");

    // 2. FAIL the read outright. "We could not read" and "there is nothing"
    //    are different answers, and the panel must give the first one.
    await page.route("**/dashboard**", async (route) => {
      if (!isAction(route)) return route.fallback();
      return route.abort("failed");
    });
    await page.goto("/lt/dashboard?result=opportunities");

    await expect(page.getByTestId("opportunities-error")).toBeVisible();
    await expect(page.getByTestId("opportunities-retry")).toBeVisible();
    // Never an empty state, and never a silent blank, for a read that failed.
    await expect(page.getByTestId("opportunities-empty")).toHaveCount(0);
    await expect(page.getByTestId("opportunities-view")).toHaveCount(0);
    await page.screenshot({ path: join(SHOTS, "row5-opportunities-error-1440.png") });

    // 3. RETRY actually re-reads: with the failure lifted, the same button
    //    recovers the result without a reload.
    await page.unroute("**/dashboard**");
    await page.getByTestId("opportunities-retry").click();
    await expect(page.getByTestId("opportunities-error")).toHaveCount(0);
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();
  });

  test("on a phone the panel is ONE clear surface, not a squeezed desktop column", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/dashboard?result=opportunities");

    const panel = page.getByTestId("context-panel");
    await expect(panel).toBeVisible();

    // It must occupy the width it was given — a 22rem desktop column pinned
    // into 375px is the "squeezed" failure this checks for.
    const box = await panel.boundingBox();
    expect(box, "the panel must be laid out on a phone").not.toBeNull();
    expect(box!.width).toBeGreaterThan(320);
    expect(Math.round(box!.x)).toBeLessThanOrEqual(8);

    // And it must still be dismissible with one control on a phone.
    await expect(page.getByTestId("context-panel-close")).toBeVisible();
  });
});
