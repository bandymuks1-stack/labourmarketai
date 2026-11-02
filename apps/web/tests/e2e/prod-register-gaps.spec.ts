import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "./prod-walk";

/**
 * REGISTER GAPS — production proof for function-register rows that had no
 * walk of their own (2026-11-01 reconciliation). Dispatch only; one run is
 * three small checks, each named by its register row:
 *
 *   G-1 (6.18)  the waitlist takes a REAL submit and keeps it: one synthetic
 *               address is sent from the plan card, then sent again — the
 *               second answer is "already on the list", which only a stored
 *               row can produce (the table's unique e-mail constraint). Anon
 *               only, no mail is sent by this path. Skipped honestly when the
 *               plan cards offer the account instead (billing on).
 *   G-2 (9.18)  the public JSON APIs answer as designed: /api/health and the
 *               public claims contract are open JSON; the signed-in search API
 *               refuses an anonymous caller and answers JSON to a signed-in one.
 *   G-3 (2.36)  the profession journal templates: when the worker's FULL
 *               composer (?compose=full), with its "more options" disclosure opened, shows the template picker, picking one prefills the entry
 *               (nothing is saved). When no template is active for that worker
 *               the run records that fact — the seeds ship inactive and are
 *               activated by the owner — and the row stays unproven.
 *   G-4 (3.34)  the project forecast: the organization owner opens one of
 *               its own projects and the forecast panel beside the course is
 *               READ (ok / too little evidence / nothing open — never
 *               "unavailable") and labelled a forecast, not a fact. Read only.
 *
 * Synthetic data only: the waitlist address is a reserved example.com
 * address tagged with this run id; no person's data is read or written.
 */

const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string | null, locale: "lt-LT" | "en-GB" = "lt-LT"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...(slot ? { storageState: state(slot) } : {}), locale });
  return { ctx, page: await ctx.newPage() };
}

test("G-1 (6.18). the waitlist keeps a real submit: the same address the second time is already on the list", async ({ browser }) => {
  const { ctx, page } = await as(browser, null, "en-GB");
  await page.goto("/en/pricing");
  const card = page.getByTestId("pricing-plan-business");
  await expect(card, "the business plan card renders").toBeVisible({ timeout: 30_000 });
  const billingOn = (await page.getByTestId("pricing-cta-business").count()) > 0;
  test.skip(billingOn, "billing is on: the plan card offers the account, not the waitlist");

  // Unique per workflow ATTEMPT: a re-run keeps GITHUB_RUN_ID, and an address
  // an earlier attempt stored would answer "duplicate" on the first submit.
  const email = `qa.synthetic.waitlist+${RUN}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}@example.com`;
  const submit = async (): Promise<string> => {
    await card.getByRole("button").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog, "the waitlist dialog opens").toBeVisible();
    await dialog.locator('input[type="email"]').fill(email);
    const answer = page.waitForResponse((r) => r.url().endsWith("/api/waitlist") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Notify me" }).click();
    const res = await answer;
    expect(res.status(), "the waitlist answered").toBe(200);
    const body = (await res.json()) as { ok?: boolean; duplicate?: boolean };
    expect(body.ok, "the waitlist accepted the address").toBe(true);
    const title = body.duplicate ? "You're already on the list" : "Thanks!";
    await expect(dialog.getByText(title), "the dialog says what happened").toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(dialog).toBeHidden();
    return body.duplicate ? "duplicate" : "stored";
  };

  expect(await submit(), "a new address is stored").toBe("stored");
  expect(await submit(), "the same address again is already there — the row persisted").toBe("duplicate");
  console.log(`[waitlist] run ${RUN}: stored, then duplicate`);
  await ctx.close();
});

test("G-2 (9.18). the public JSON APIs answer as designed, anonymous and signed in", async ({ browser, playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const health = await anon.get("/api/health");
  expect(health.status(), "/api/health is public").toBe(200);
  expect(health.headers()["content-type"] ?? "").toMatch(/application\/json/);

  const claims = await anon.get("/api/public/claims/v1");
  expect(claims.status(), "the public claims contract is public").toBe(200);
  expect(claims.headers()["content-type"] ?? "").toMatch(/application\/json/);
  expect(typeof (await claims.json()), "it is a JSON document").toBe("object");

  const anonSearch = await anon.get("/api/dashboard-search?q=plyt");
  expect(anonSearch.status(), "the signed-in search API refuses an anonymous caller").toBe(401);
  await anon.dispose();

  const { ctx } = await as(browser, "worker");
  const search = await ctx.request.get("/api/dashboard-search?q=plyt");
  expect(search.status(), "the signed-in search API answers a signed-in worker").toBe(200);
  expect(search.headers()["content-type"] ?? "").toMatch(/application\/json/);
  console.log(`[api] health 200, claims 200, search anon ${anonSearch.status()} / worker ${search.status()}`);
  await ctx.close();
});

test("G-3 (2.36). a profession journal template prefills the entry when one is active for the worker", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  // Templates belong to the FULL composer (the "detaliau" door); the default
  // journal page is the compact quick record and never shows them.
  await page.goto("/lt/dashboard/journal?compose=full");
  await expect(page.getByRole("main"), "the journal renders").toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("journal-compose-full"), "the full composer is open").toBeVisible({ timeout: 30_000 });
  // The picker lives inside the composer's closed "more options" disclosure.
  // It is server data, so its presence in the DOM is the answer; the
  // disclosure is opened so a template can be clicked. (isVisible() would not
  // wait — it returns at once whatever its timeout says.)
  const more = page.getByTestId("journal-more-options");
  await expect(more, "the composer's more-options disclosure renders").toBeAttached({ timeout: 30_000 });
  // Direct child only: a nested examples disclosure has its own summary.
  await more.locator(":scope > summary").click();
  await expect(more, "the disclosure opened").toHaveAttribute("open", "");
  const picker = more.getByTestId("journal-template-picker");
  const shown = (await picker.count()) > 0;
  if (!shown) {
    console.log("[templates] no active journal template for this worker — 2.36 stays unproven (seeds ship inactive)");
    test.info().annotations.push({ type: "unproven", description: "no active journal template in production for the QA worker" });
    await ctx.close();
    return;
  }
  const first = picker.locator('[data-testid^="journal-template-"]').first();
  const slug = (await first.getAttribute("data-testid"))?.replace("journal-template-", "") ?? "?";
  const text = page.locator("textarea").first();
  const before = (await text.inputValue()).length;
  await first.click();
  await expect.poll(async () => (await text.inputValue()).length, { message: "the template prefilled the entry" }).toBeGreaterThan(before);
  console.log(`[templates] template ${slug} prefilled the entry (not saved)`);
  await ctx.close();
});

test("G-4 (3.34). the owner reads a project forecast beside the course, labelled a forecast", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await page.goto("/lt/dashboard/projects");
  await expect(page.getByTestId("company-ops-projects"), "the organization's projects render").toBeVisible({ timeout: 30_000 });
  // Any link to one of the organization's projects (its page or its board).
  const hrefs = await page
    .getByRole("main")
    .locator("a[href*=\"/dashboard/projects/\"]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const id = hrefs.map((h) => /\/dashboard\/projects\/([0-9a-f-]{36})(?:\/operations)?(?:[?#].*)?$/.exec(h)?.[1]).find(Boolean);
  expect(id, "at least one of the owner's own projects is linked").toBeTruthy();
  const res = await page.goto(`/lt/dashboard/projects/${id}`);
  expect(res?.status() ?? 0, "the project page answered").toBeLessThan(500);
  const panel = page.getByRole("main").getByTestId("project-forecast");
  await expect(panel, "the forecast panel renders for the project's manager").toBeVisible({ timeout: 30_000 });
  const state = await panel.getAttribute("data-state");
  console.log(`[forecast] owner project forecast state: ${state}`);
  expect(["ok", "insufficient_data", "not_applicable"], `the forecast was read in production (got ${state})`).toContain(state);
  await expect(panel.getByTestId("project-forecast-note"), "labelled a forecast, not a fact").toBeVisible();
  await ctx.close();
});
