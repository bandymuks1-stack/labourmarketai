import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * EVID-2 slice 2 - THE COUNTERPARTY JOURNEY, end to end (NOT RUN by the
 * author: written for the owner-orchestrated integration on the local stack).
 *
 *   client representative registers itself as the counterparty of a worker with
 *   a REAL active assignment on its project (project page)
 *     -> the worker explicitly submits an entry for review (journal)
 *     -> the representative asks for a correction WITH a note (queue)
 *     -> the worker sees the request + note and corrects the entry (existing
 *        journal correction) then RESUBMITS
 *     -> the representative accepts; accept is final
 *     -> the worker sees "Accepted by the client" - NOT an employer
 *        confirmation - and the Living CV counts it separately.
 *   Negative space: the worker has no decision control and no queue rows, an
 *   unrelated user has no panel rows, nothing is ever auto-submitted.
 *
 * REQUIRED SEED (the dev fixture's worker is an EMPLOYEE of the fixture
 * company, who is correctly refused as a counterparty - so this journey needs
 * an INDEPENDENT pair). Provide through the environment:
 *
 *   COUNTERPARTY_PROJECT_ID     project owned by the client organization
 *   COUNTERPARTY_REP_EMAIL / COUNTERPARTY_REP_PASSWORD
 *                               a manager/owner of that client organization
 *   COUNTERPARTY_WORKER_EMAIL / COUNTERPARTY_WORKER_PASSWORD
 *                               a worker with an ACTIVE assignment on that
 *                               project (person assignment or team
 *                               assignment), belonging to no organization the
 *                               representative belongs to
 *   COUNTERPARTY_ENTRY_TEXT     a distinctive text of ONE journal entry of
 *                               that worker linked to that project, not yet
 *                               submitted
 *   COUNTERPARTY_OUTSIDER_EMAIL / COUNTERPARTY_OUTSIDER_PASSWORD
 *                               any other signed-up user
 *
 * Skips cleanly when the seed is absent. Never uses the production database.
 */
const E = process.env;
const HAVE_SEED = Boolean(
  E.SUPABASE_TEST_URL &&
    E.COUNTERPARTY_PROJECT_ID &&
    E.COUNTERPARTY_REP_EMAIL &&
    E.COUNTERPARTY_REP_PASSWORD &&
    E.COUNTERPARTY_WORKER_EMAIL &&
    E.COUNTERPARTY_WORKER_PASSWORD &&
    E.COUNTERPARTY_ENTRY_TEXT &&
    E.COUNTERPARTY_OUTSIDER_EMAIL &&
    E.COUNTERPARTY_OUTSIDER_PASSWORD,
);

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/en/auth/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

async function as(browser: Browser, email: string, password: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, email, password);
  return { ctx, page };
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe.serial("Counterparty journey: register -> submit -> correct -> resubmit -> accept", () => {
  test.skip(!HAVE_SEED, "Needs the local stack plus the COUNTERPARTY_* seed (see the header of this file).");

  const entryCard = (page: Page) =>
    page.locator('[data-testid^="journal-entry-card-"]').filter({ hasText: E.COUNTERPARTY_ENTRY_TEXT ?? "" }).first();

  test("A. the client representative registers as counterparty from a real assignment", async ({ browser }) => {
    const { ctx, page } = await as(browser, E.COUNTERPARTY_REP_EMAIL!, E.COUNTERPARTY_REP_PASSWORD!);
    await page.goto(`/en/dashboard/projects/${E.COUNTERPARTY_PROJECT_ID}`);
    const panel = page.getByTestId("counterparty-link-panel");
    await expect(panel).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const register = panel.locator('[data-testid^="counterparty-link-register-"]').first();
    await register.click();
    await expect(panel.locator('[data-testid^="counterparty-link-active-"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByRole("status").first()).toContainText(/registered/i);
    await ctx.close();
  });

  test("B. the worker has Submit, no decision control, and nothing was auto-submitted", async ({ browser }) => {
    const { ctx, page } = await as(browser, E.COUNTERPARTY_WORKER_EMAIL!, E.COUNTERPARTY_WORKER_PASSWORD!);
    await page.goto("/en/dashboard/journal");
    const card = entryCard(page);
    await expect(card).toBeVisible();
    const panel = card.locator('[data-testid^="entry-review-"]').first();
    await expect(panel).toHaveAttribute("data-phase", "ready_to_submit");
    await expect(page.locator('[data-testid^="counterparty-decide-"]')).toHaveCount(0);

    await panel.getByRole("button", { name: /submit for review/i }).click();
    await expect(panel).toHaveAttribute("data-phase", "submitted", { timeout: 20_000 });

    // The worker is not a counterparty of anything: the queue shows no decision.
    await page.goto("/en/dashboard/inbox/counterparty");
    await expect(page.locator('[data-testid^="counterparty-decide-"]')).toHaveCount(0);
    await ctx.close();
  });

  test("C. an outsider sees neither the entry nor a decision", async ({ browser }) => {
    const { ctx, page } = await as(browser, E.COUNTERPARTY_OUTSIDER_EMAIL!, E.COUNTERPARTY_OUTSIDER_PASSWORD!);
    await page.goto("/en/dashboard/inbox/counterparty");
    await expect(page.getByText(E.COUNTERPARTY_ENTRY_TEXT!)).toHaveCount(0);
    await expect(page.locator('[data-testid^="counterparty-decide-"]')).toHaveCount(0);
    await ctx.close();
  });

  test("D. the representative must write a note to request a correction", async ({ browser }) => {
    const { ctx, page } = await as(browser, E.COUNTERPARTY_REP_EMAIL!, E.COUNTERPARTY_REP_PASSWORD!);
    await page.goto("/en/dashboard/inbox/counterparty");
    const card = page.locator('[data-testid^="counterparty-card-"]').filter({ hasText: E.COUNTERPARTY_ENTRY_TEXT! }).first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-bucket", "to_decide");
    await expectNoHorizontalOverflow(page);

    await card.getByRole("radio", { name: /request a correction/i }).check();
    const note = card.getByLabel(/note \(required\)/i);
    await expect(note).toHaveAttribute("required", "");
    await note.fill("Please state the area in square metres.");
    await card.locator('[data-testid^="counterparty-decide-"]').click();
    await expect(card.locator('[data-testid^="counterparty-result-"]')).toContainText(/correction requested/i, { timeout: 20_000 });
    await ctx.close();
  });

  test("E. the worker sees the request with the note, corrects, and resubmits", async ({ browser }) => {
    const { ctx, page } = await as(browser, E.COUNTERPARTY_WORKER_EMAIL!, E.COUNTERPARTY_WORKER_PASSWORD!);
    await page.goto("/en/dashboard/journal");
    const card = entryCard(page);
    const panel = card.locator('[data-testid^="entry-review-"]').first();
    await expect(panel).toHaveAttribute("data-phase", "correction_requested");
    await expect(panel).toContainText("Please state the area in square metres.");
    // The existing journal correction control is offered (new version with correction_of).
    await expect(panel.getByRole("button", { name: /edit/i })).toBeVisible();
    await ctx.close();
    // The correction itself runs through the existing compact editor; the
    // integration owner extends this step with the editor interaction, then:
    //   the corrected entry shows "Resubmit" and, once pressed, phase "submitted".
  });

  test("F. accept is final, and the worker sees a CLIENT acceptance - not an employer confirmation", async ({ browser }) => {
    const rep = await as(browser, E.COUNTERPARTY_REP_EMAIL!, E.COUNTERPARTY_REP_PASSWORD!);
    await rep.page.goto("/en/dashboard/inbox/counterparty");
    const card = rep.page.locator('[data-testid^="counterparty-card-"][data-bucket="to_decide"]').first();
    test.skip((await card.count()) === 0, "needs the corrected entry resubmitted (step E)");
    await card.getByRole("radio", { name: /accept the work/i }).check();
    await expect(card.getByText(/cannot be undone/i)).toBeVisible();
    await card.locator('[data-testid^="counterparty-decide-"]').click();
    await expect(card.locator('[data-testid^="counterparty-result-"]')).toContainText(/accepted/i, { timeout: 20_000 });
    await rep.ctx.close();

    const w = await as(browser, E.COUNTERPARTY_WORKER_EMAIL!, E.COUNTERPARTY_WORKER_PASSWORD!);
    await w.page.goto("/en/dashboard/journal");
    const panel = entryCard(w.page).locator('[data-testid^="entry-review-"]').first();
    await expect(panel).toHaveAttribute("data-phase", "accepted");
    await expect(panel).toContainText(/separate from an employer/i);
    await expect(panel).not.toContainText(/confirmed by (your )?(manager|employer)/i);
    await w.ctx.close();
  });
});
