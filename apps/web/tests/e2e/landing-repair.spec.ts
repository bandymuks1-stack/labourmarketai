import { expect as baseExpect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * LANDING REPAIR — the defects the premium-rebuild audit found, proven fixed in
 * a real browser.
 *
 * Three of them were invisible to every existing test because the guards that
 * should have caught them were asserting the SHAPE of `page.tsx` rather than
 * what the landing renders. When the page was recomposed into section
 * components, those guards went red for the wrong reason and stopped covering
 * anything real — so two dead anchors and a silent submit sat on the public
 * landing behind four red lights that everyone had learned to ignore.
 *
 * Public pages, no session needed.
 */

/**
 * Where the screenshots land. Overridable so the SAME spec can prove the fix
 * locally and again in production without one run overwriting the other's
 * evidence — the master command requires every artefact to declare its proof
 * level, and two runs writing to one directory would make that impossible.
 *
 *   E2E_SHOTS_DIR=docs/audits/evidence/premium-rebuild/production-landing
 */
const SHOTS = process.env.E2E_SHOTS_DIR
  ? join(process.cwd(), "..", "..", process.env.E2E_SHOTS_DIR)
  : join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-rebuild-w1");
const expect = baseExpect.configure({ timeout: 15_000 });

test.use({ viewport: { width: 1440, height: 900 } });
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("the hero's ask is not a silent submit", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
      consoleErrors.push(m.text());
    }
  });

  await page.goto("/lt");
  const submit = page.getByTestId("hero-ask-submit");
  await expect(submit).toBeVisible();

  // The hero auto-plays once on mount; wait for it to settle so the assertion
  // below is about OUR submit and not the intro.
  await expect(submit).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });

  await page.getByTestId("hero-ask-input").fill("ieškau elektriko Rotterdame");
  await submit.click();

  // BUSY IS VISIBLE AND ANNOUNCED — the defect was that neither was true.
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("hero-ask-pending")).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "hero-ask-busy-1440.png") });

  // …and it comes back when the answer lands, so "busy" means something.
  await expect(submit).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(page.getByTestId("hero-ask-pending")).toHaveCount(0);

  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("an unanswerable question is announced, not swallowed", async ({ page }) => {
  await page.goto("/lt");
  const submit = page.getByTestId("hero-ask-submit");
  await expect(submit).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });

  await page.getByTestId("hero-ask-input").fill("zzzz qqqq vvvv");
  await submit.click();

  const unmatched = page.getByTestId("hero-unmatched");
  await expect(unmatched).toBeVisible();
  // A result the visitor cannot have announced to them is a silent submit.
  await expect(unmatched).toHaveAttribute("role", "status");
  await page.screenshot({ path: join(SHOTS, "hero-unmatched-1440.png") });
});

test("every public nav item goes somewhere real", async ({ page }) => {
  await page.goto("/lt");

  // The dead item is gone.
  await expect(page.getByRole("link", { name: "Partneriams" })).toHaveCount(0);

  // …and the one remaining landing anchor actually lands.
  const how = page.getByRole("link", { name: "Kaip veikia" }).first();
  await expect(how).toBeVisible();
  await how.click();
  await expect(page).toHaveURL(/#how-it-works/);

  const target = page.locator("#how-it-works");
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport();
  await page.screenshot({ path: join(SHOTS, "how-it-works-anchor-1440.png") });
});

test("the two real entries are reachable from the landing", async ({ page }) => {
  await page.goto("/lt");
  // Scoped to the landing's own CTA band — the header has its own controls.
  const hrefs = await page.locator('a[href*="/auth/signup"], a[href*="/company-need"]').evaluateAll(
    (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")),
  );
  expect(hrefs.some((h) => h?.includes("/auth/signup"))).toBe(true);
  expect(hrefs.some((h) => h?.includes("/company-need"))).toBe(true);

  // …and they resolve, rather than 404.
  for (const path of ["/lt/auth/signup", "/lt/company-need"]) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} must not be an error`).toBeLessThan(400);
  }
});
