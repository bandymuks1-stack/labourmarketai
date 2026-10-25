import { expect, test, type Page } from "@playwright/test";

/**
 * EVERY CONTROL ON A 390px PHONE IS REACHABLE — measured per element, not per
 * page.
 *
 * ## Why `authenticated-mobile-overflow.spec.ts` was not enough
 *
 * That spec measures `body.scrollWidth - clientWidth`: whether the PAGE can be
 * dragged sideways. The local UX review of 2026-10-24 found the worse failure
 * it cannot see. `html, body { overflow-x: hidden }` (globals.css) CLIPS an
 * over-wide box instead of letting the page scroll, so a card can render 816px
 * wide inside a 390px phone while the page reports zero overflow — and the
 * buttons, counts and arrows on its right half are simply gone:
 *
 *   /dashboard (worker home)   Today regions 816px — an implicit `auto` grid
 *                              column grew to a truncated line's min-content
 *   /dashboard/hours           620px once a day had an entry — same cause;
 *                              Save and the inputs went off-screen
 *   /projects/:id/operations   facts form 456px — two date inputs' intrinsic
 *                              width; the page also opened on the
 *                              organization's confirm pulse, not the project
 *   /cv (nl)                   "Dagboekregistraties" overflowed its stat tile
 *
 * So this asks the element-level question: does anything that is not inside a
 * deliberate horizontal scroller (`overflow-x: auto|scroll`) extend past the
 * right edge of the viewport?
 *
 * It also pins the planning outcome: after "Suplanuoti darbą" the
 * confirmation must be ON SCREEN, not ~3,100px below a page left at the top.
 *
 * Local stack only (`pnpm -C apps/web e2e:local`): it needs the fixture
 * sessions and writes ONE synthetic hour entry per run on the fixture company.
 */

const LOCAL = Boolean(process.env.E2E_LOCAL_STACK);
const PHONE = { width: 390, height: 844 };
const WORKER = "tests/e2e/.storage-state.worker.json";
const COMPANY = "tests/e2e/.storage-state.company.json";

type Offender = { tag: string; testid: string; text: string; right: number };

/** Boxes that end past the viewport's right edge outside a horizontal scroller. */
async function clippedPastRightEdge(page: Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") return true;
      }
      return false;
    };
    const found: (Offender & { el: Element })[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right <= vw + 1) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.visibility === "hidden") continue;
      // Next's streaming holder is `hidden`; nothing inside it is on screen.
      if (el.closest("[hidden]")) continue;
      if (inScroller(el)) continue;
      if (found.some((f) => f.el.contains(el))) continue;
      found.push({
        el,
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute("data-testid") ?? "",
        text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        right: Math.round(r.right),
      });
      if (found.length >= 8) break;
    }
    return found.map(({ el: _el, ...o }) => o);
  });
}

async function expectReachable(page: Page, path: string) {
  const offenders = await clippedPastRightEdge(page);
  expect(
    offenders,
    `${path}: boxes past the 390px edge (clipped, unreachable):\n${offenders
      .map((o) => `  <${o.tag}${o.testid ? ` data-testid=${o.testid}` : ""}> right=${o.right} "${o.text}"`)
      .join("\n")}`,
  ).toEqual([]);
}

test.describe("390px — worker surfaces keep every box inside the phone", () => {
  test.skip(!LOCAL, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({ storageState: WORKER, viewport: PHONE, isMobile: true, hasTouch: true });
  test.setTimeout(180_000);

  for (const path of ["/lt/dashboard", "/ru/dashboard", "/nl/cv", "/de/cv"]) {
    test(`${path} fits`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(
        (await page.evaluate("document.body.innerText.trim().length")) as number,
        `${path} rendered nothing`,
      ).toBeGreaterThan(200);
      await expectReachable(page, path);
    });
  }
});

test.describe("390px — company surfaces keep every box inside the phone", () => {
  test.skip(!LOCAL, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({ storageState: COMPANY, viewport: PHONE, isMobile: true, hasTouch: true });
  test.setTimeout(180_000);

  test("/dashboard/hours fits after a day gets a long entry", async ({ page }) => {
    await page.goto("/lt/dashboard/hours", { waitUntil: "networkidle" });
    const main = page.getByRole("main");
    const save = main.getByTestId("hours-save").first();
    test.skip(!(await save.isVisible().catch(() => false)), "fixture company has no work objects");
    const worker = main.getByTestId("hours-worker-select").first();
    const values = await worker
      .locator("option")
      .evaluateAll((ns) => ns.map((n) => (n as HTMLOptionElement).value).filter(Boolean));
    await worker.selectOption(values[0]);
    await main.getByTestId("hours-object-picker").first().locator('[data-testid^="hours-object-"]').first().click();
    await main.getByTestId("hours-input").first().fill("0.25");
    // One unbroken, long line — exactly what pushed the screen to 620px.
    await main
      .getByTestId("hours-note")
      .first()
      .fill(`e2e-layout-reach ${"ilgas-darbo-aprašymas-be-tarpų-".repeat(4)}${Date.now()}`);
    await save.click();
    await expect(page.locator('main [data-testid="hours-saved"], main [data-testid="hours-error"]').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(main.getByTestId("hours-entry").first()).toBeVisible();
    await expectReachable(page, "/lt/dashboard/hours");
    // Save is reachable, not merely present.
    const box = await save.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(PHONE.width);
  });

  test("project operations opens on the project and its facts form fits", async ({ page }) => {
    await page.goto("/lt/dashboard/projects", { waitUntil: "networkidle" });
    const href = await page
      .locator('main a[href*="/dashboard/projects/"]')
      .evaluateAll((as) =>
        as.map((a) => a.getAttribute("href") ?? "").find((h) => /\/projects\/[0-9a-f-]{36}/.test(h)) ?? null,
      );
    test.skip(!href, "fixture company has no project");
    const id = href!.match(/projects\/([0-9a-f-]{36})/)![1];
    const path = `/lt/dashboard/projects/${id}/operations`;
    await page.goto(path, { waitUntil: "networkidle" });
    const context = page.getByTestId("ops-project-context");
    await expect(context).toBeVisible();
    // The project leads; the organization-wide confirm pulse follows it.
    const order = await page.evaluate(() => {
      const ctx = document.querySelector('[data-testid="ops-project-context"]');
      const pulse = document.querySelector('[data-testid="arena-confirm-pulse"]');
      if (!ctx || !pulse) return "missing";
      return ctx.compareDocumentPosition(pulse) & Node.DOCUMENT_POSITION_FOLLOWING ? "project-first" : "pulse-first";
    });
    expect(["project-first", "missing"]).toContain(order);
    const ctxBox = await context.boundingBox();
    expect(ctxBox!.y, "the project is named above the fold").toBeLessThan(PHONE.height);
    await expectReachable(page, path);
  });

  test("planning outcome is brought on screen", async ({ page }) => {
    // The same URL the plan action redirects to, minus the hash: the reveal
    // must not depend on the browser honouring a fragment.
    await page.goto("/lt/dashboard/company/planning?plan=planned", { waitUntil: "networkidle" });
    const notice = page.getByTestId("work-plan-notice");
    test.skip(!(await notice.count()), "work plan not available on this fixture");
    await expect(notice).toBeInViewport({ timeout: 10_000 });
  });
});
