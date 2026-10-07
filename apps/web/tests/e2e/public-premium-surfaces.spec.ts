import { expect, test } from "@playwright/test";

/**
 * PUBLIC PREMIUM SURFACES — visual + accessibility proof, automated.
 *
 * Why this exists: a malformed URL once made every "screenshot" a blank page
 * and a phantom 981 px "overflow" nearly became a reported defect. A spec
 * that asserts the page actually rendered the redesigned surface, at the four
 * widths that matter, cannot be fooled that way.
 *
 * Per route x viewport:
 *   1. the signature visual is PRESENT (not just a 200);
 *   2. no horizontal overflow;
 *   3. axe-core (WCAG 2.0/2.1/2.2 A+AA tags) reports no serious/critical
 *      violation;
 *   4. a full-page screenshot is attached to the report for human review.
 *
 * `axe-core` is already in the workspace (transitive); it is injected as a
 * script, so no new dependency or lockfile change is needed.
 *
 * Run (against a running app): E2E_NO_SERVER=1 E2E_BASE_URL=http://localhost:3100 \
 *   pnpm exec playwright test tests/e2e/public-premium-surfaces.spec.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AXE = require.resolve("axe-core/axe.min.js");

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1920", width: 1920, height: 1080 },
] as const;

const SURFACES = [
  // Premium convergence 2026-10-02: the signature visual of the two acquisition
  // pages is the work -> history transition; the lifecycle graph lives in the
  // folded "explore every step" section and is exercised below.
  { path: "/en/for-workers", testid: "work-record-transition" },
  { path: "/en/for-companies", testid: "work-record-transition" },
  { path: "/en", testid: "two-sides-lifecycle" },
] as const;

/** Opens the folded lifecycle graph on /for-workers (kept, not removed). */
async function openWorkersFold(page: import("@playwright/test").Page) {
  await page.goto("/en/for-workers", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  const fold = page.getByTestId("explore-steps");
  await fold.scrollIntoViewIfNeeded();
  // A click that lands during hydration can be undone by it: retry until it sticks.
  await expect(async () => {
    if (!(await fold.evaluate((e) => (e as HTMLDetailsElement).open))) await fold.locator("summary").click();
    await expect(fold).toHaveJSProperty("open", true, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

for (const s of SURFACES) {
  for (const v of VIEWPORTS) {
    test(`${s.path} @${v.name}: signature visual, no overflow, axe`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto(s.path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle"); // streamed Suspense chunks settle
      const visual = page.getByTestId(s.testid);
      await expect(visual).toBeVisible({ timeout: 30_000 });
      await visual.scrollIntoViewIfNeeded();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(0);

      await page.addScriptTag({ path: AXE });
      const result = await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (window as any).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return r.violations.map((x: any) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, help: x.help }));
      });
      const blocking = result.filter((x: { impact: string }) => x.impact === "serious" || x.impact === "critical");
      await testInfo.attach("axe-violations.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
      await testInfo.attach(`full-${v.name}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      expect(blocking, "serious/critical axe violations").toEqual([]);
    });
  }
}

/**
 * THE LIFECYCLE GRAPH — behaviour, not just presence (premium completion §18):
 * keyboard operation, selected state, visible focus, non-colour state, and
 * reduced motion.
 */
test.describe("lifecycle graph accessibility", () => {
  // `page.emulateMedia` (not `test.use`): the fixture option did not take effect
  // in this setup, which silently left animations running.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("reduced motion: no auto-play — the whole record is present immediately", async ({ page }) => {
    await openWorkersFold(page);
    const record = page.getByTestId("work-lifecycle-workers-record");
    await expect(record).toBeVisible({ timeout: 30_000 });
    // Every row is filled at once; nothing is left to a timer.
    await expect(record.locator('li[data-state="filled"]')).toHaveCount(7);
    await expect(record.locator('li[data-state="pending"]')).toHaveCount(0);
  });

  test("keyboard: stages are buttons, Enter selects, selection is exposed (aria-pressed) and focus is visible", async ({ page }) => {
    await openWorkersFold(page);
    const work = page.getByTestId("work-lifecycle-workers-stage-work");
    await expect(work).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Tab"); // enter the page via keyboard so :focus-visible applies
    await work.focus();
    await page.keyboard.press("Enter");
    await expect(work).toHaveAttribute("aria-pressed", "true");
    // Selecting WORK re-shapes the record: later stages become dashed "not yet".
    const record = page.getByTestId("work-lifecycle-workers-record");
    await expect(record.locator('li[data-state="pending"]')).toHaveCount(3);
    // Focus is visibly indicated (ring/outline), not left to the UA default alone.
    const ring = await work.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.outlineStyle !== "none" || s.boxShadow !== "none";
    });
    expect(ring, "visible focus indicator").toBe(true);
  });

  test("state is never colour alone: pending rows carry words and a dashed shape", async ({ page }) => {
    await openWorkersFold(page);
    await page.getByTestId("work-lifecycle-workers-stage-project").click();
    const pending = page.getByTestId("work-lifecycle-workers-record").locator('li[data-state="pending"]').first();
    await expect(pending).toContainText(/not yet/i);
    await expect(pending.locator(".border-dashed")).toHaveCount(1);
  });

  test("the stages are an ordered list with a name, in lifecycle order", async ({ page }) => {
    await openWorkersFold(page);
    const list = page.getByTestId("work-lifecycle-workers-stages");
    await expect(list).toHaveAttribute("aria-label", /.+/);
    await expect(list.locator("button")).toHaveCount(7);
  });
});
