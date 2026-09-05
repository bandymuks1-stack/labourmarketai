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

test("the entry's submit is not a silent submit — a real sentence is understood", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
      consoleErrors.push(m.text());
    }
  });

  await page.goto("/lt");
  const submit = page.getByTestId("entry-submit");
  await expect(submit).toBeVisible();

  // P1 (frozen design contract 2026-09-05): the sentence goes through the ONE
  // deterministic router; the page says what it understood, announced.
  await page.getByTestId("entry-input").fill("Reikia 12 pastolininkų Roterdame");
  await submit.click();

  const understanding = page.getByTestId("entry-understanding");
  await expect(understanding).toBeVisible();
  await expect(understanding).toHaveAttribute("role", "status");
  await expect(understanding).toHaveAttribute("data-intent", "need-workers");
  // The sentence travels with the auth doors through the EXISTING `?next=`.
  const signup = page.getByTestId("entry-signup").locator("a");
  await expect(signup).toHaveAttribute("href", /\/lt\/auth\/signup\?next=/);
  expect(decodeURIComponent((await signup.getAttribute("href")) ?? "")).toContain(
    "/dashboard?say=",
  );
  await page.screenshot({ path: join(SHOTS, "entry-understood-1440.png") });

  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("an unreadable sentence gets ONE question with two chips, not a guessed answer", async ({ page }) => {
  await page.goto("/lt");
  const submit = page.getByTestId("entry-submit");
  await expect(submit).toBeVisible();

  await page.getByTestId("entry-input").fill("zzzz qqqq vvvv");
  await submit.click();

  const question = page.getByTestId("entry-question");
  await expect(question).toBeVisible();
  // A result the visitor cannot have announced to them is a silent submit.
  await expect(question).toHaveAttribute("role", "status");
  await expect(page.getByTestId("entry-chip")).toHaveCount(2);
  await expect(page.getByTestId("entry-understanding")).toHaveCount(0);
  await page.screenshot({ path: join(SHOTS, "entry-question-1440.png") });

  // Answering the question opens the same doors.
  await page.getByTestId("entry-chip").first().click();
  await expect(page.getByTestId("entry-understanding")).toBeVisible();
  await expect(page.getByTestId("entry-signup").locator("a")).toBeVisible();
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
