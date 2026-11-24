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
  { path: "/en/for-workers", testid: "work-lifecycle-workers" },
  { path: "/en/for-companies", testid: "work-lifecycle-companies" },
  { path: "/en", testid: "two-sides-lifecycle" },
] as const;

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

  test("reduced motion: no auto-play — the record is present immediately and holds one stage", async ({ page }) => {
    await page.goto("/en/for-workers", { waitUntil: "load" });
    const record = page.getByTestId("work-lifecycle-workers-record");
    await expect(record).toBeVisible({ timeout: 30_000 });
    // Nothing is recorded on a public page, so the record is the chosen stage
    // only (owner order 2026-11-24, decisions 0032 / 0034); the rail names
    // all seven. Nothing is left to a timer.
    await expect(record.locator("li")).toHaveCount(1);
    await expect(record.locator('li[data-state="pending"]')).toHaveCount(0);
    await expect(page.getByTestId("work-lifecycle-workers-stages").locator("li")).toHaveCount(7);
  });

  test("keyboard: stages are buttons, Enter selects, selection is exposed (aria-pressed) and focus is visible", async ({ page }) => {
    await page.goto("/en/for-workers", { waitUntil: "load" });
    const work = page.getByTestId("work-lifecycle-workers-stage-work");
    await expect(work).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Tab"); // enter the page via keyboard so :focus-visible applies
    await work.focus();
    await page.keyboard.press("Enter");
    await expect(work).toHaveAttribute("aria-pressed", "true");
    // Selecting WORK puts that stage, and only it, in the record.
    const record = page.getByTestId("work-lifecycle-workers-record");
    await expect(record.locator("li")).toHaveCount(1);
    await expect(record.locator("li")).toContainText(/work/i);
    // Focus is visibly indicated (ring/outline), not left to the UA default alone.
    const ring = await work.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.outlineStyle !== "none" || s.boxShadow !== "none";
    });
    expect(ring, "visible focus indicator").toBe(true);
  });

  test("state is never colour alone: the chosen stage is exposed as pressed and named in the record", async ({ page }) => {
    await page.goto("/en/for-workers", { waitUntil: "load" });
    const project = page.getByTestId("work-lifecycle-workers-stage-project");
    await project.click();
    await expect(project).toHaveAttribute("aria-pressed", "true");
    const row = page.getByTestId("work-lifecycle-workers-record").locator("li");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/project/i);
    // No "not yet" rows on a public page.
    await expect(page.getByTestId("work-lifecycle-workers-record")).not.toContainText(/not yet/i);
  });

  test("the stages are an ordered list with a name, in lifecycle order", async ({ page }) => {
    await page.goto("/en/for-workers", { waitUntil: "load" });
    const list = page.getByTestId("work-lifecycle-workers-stages");
    await expect(list).toHaveAttribute("aria-label", /.+/);
    await expect(list.locator("button")).toHaveCount(7);
  });
});
