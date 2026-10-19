import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION COMPANY CHAIN — the three company-path steps the Product Master
 * Map still held as CODE_READY (2026-10-19):
 *
 *   4.11 Candidates — a company opens a need and sees the person who raised a hand on it;
 *   4.16 Contact    — it contacts that person, and the person sees they were contacted;
 *   3.33 Hours      — the company AND the agency each record a day's hours for
 *                     their worker on a site (the agency path's one open step).
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   worker   qa.worker+multiw — Vytas Darbininkas, employee of Alfa
 *   manager  runs "QA-SYNTHETIC Gama" — the need the worker raises a hand on
 *   owner    owns "QA-SYNTHETIC Alfa" — records Vytas's hours (company)
 *   agency   runs "QA-SYNTHETIC Agentūra" — records hours for its roster worker (agency)
 *
 * Every step is what a person does in the browser. The one API call reads the
 * worker's OWN row with the worker's own token, to know which candidate card
 * is theirs; it writes nothing. Failure messages carry counts and states only.
 * Idempotent: a rerun withdraws and raises the hand again, reuses the site.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const AGENCY = "QA-SYNTHETIC Agentūra";
const GAMA = "QA-SYNTHETIC Gama";
const SITE = "QA-SYNTHETIC objektas";
const NOTE = `QA-SYNTHETIC ${RUN}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["worker", "manager", "owner", "agency"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string, mobile = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: "lt-LT",
    ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/** Make `orgName` the active workspace through the real header chip. */
async function useWorkspace(page: Page, orgName: string): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

let workerId = "";
let requestId = "";

test("C-0. the worker's own worker id (own row, own token)", async () => {
  const token = bearerOf("worker");
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, "own worker row answered").toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.length, "exactly one own worker row").toBe(1);
  workerId = rows[0].id;
});

test("C-1. the worker raises a hand on Gama's need from the opportunities board", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  // The pristine page is the worker's PERSONAL first view (owner addendum
  // 2026-10-09); the whole board, with every need's card, is `?view=all`.
  await page.goto("/lt/dashboard/opportunities?view=all");
  await expect(page.getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
  const cards = page
    .locator('li[id^="opp-"]')
    .filter({ has: page.getByTestId("opportunity-company").filter({ hasText: GAMA }) })
    .filter({ has: page.locator('[data-testid^="interest-"]') });
  const n = await cards.count();
  expect(n, `the worker's board shows ${n} of Gama's needs`).toBeGreaterThan(0);
  const card = cards.first();
  requestId = ((await card.getAttribute("id")) ?? "").replace(/^opp-/, "");
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

  // Start from "not interested", so this run proves the ACT, not a leftover row.
  const withdraw = card.getByTestId("interest-withdraw");
  if (await withdraw.isVisible().catch(() => false)) {
    await withdraw.click();
    await expect(card.getByTestId("interest-express")).toBeVisible({ timeout: 30_000 });
  }
  await card.getByTestId("interest-express").click();
  await expect(card.getByTestId("interest-sent")).toHaveAttribute("data-interest-status", "interested", {
    timeout: 30_000,
  });
  await ctx.close();
});

test("C-2 (4.11). Gama opens its need and sees the person who raised a hand", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const candidate = page.getByTestId(`scout-candidate-${workerId}`);
  await expect(candidate, "the hand-raiser is in Gama's candidate list").toBeVisible({ timeout: 60_000 });
  await expect(candidate.getByTestId(`scout-interest-${workerId}`)).toBeVisible();
  await expect(candidate.getByTestId(`interest-ack-${workerId}`)).toHaveAttribute("data-interest-status", "interested");
  await ctx.close();
});

test("C-3 (4.16). Gama contacts them: a real thread opens", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const ack = page.getByTestId(`interest-ack-${workerId}`);
  await expect(ack).toBeVisible({ timeout: 60_000 });
  await ack.getByTestId("interest-ack-contacted").click();
  await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await ctx.close();
});

test("C-4 (4.16). the worker sees they were contacted, on the phone", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker", true);
  await page.goto("/lt/dashboard/opportunities?view=all");
  const card = page.locator(`li[id="opp-${requestId}"]`);
  await expect(card.getByTestId("interest-sent")).toHaveAttribute("data-interest-status", "contacted", {
    timeout: 60_000,
  });
  await expect(card.getByTestId("interest-contacted-link")).toBeVisible();
  await ctx.close();
});

/** 3.33 for one workspace: a site exists (the no-sites door adds one), then a day's hours persist. */
async function siteReady(page: Page, org: string): Promise<void> {
  await useWorkspace(page, org);
  await page.goto("/lt/dashboard/hours");
  const noSites = page.getByTestId("hours-state-no-objects");
  const picker = page.getByTestId("hours-object-picker");
  await expect(noSites.or(picker)).toBeVisible({ timeout: 60_000 });
  if (await noSites.isVisible()) {
    console.info(`[hours] ${org}: no site yet, following the page's own door`);
    await page.getByTestId("hours-no-objects-add-site").click();
    await page.waitForURL(/\/dashboard\/projects/, { timeout: 60_000 });
    const form = page.getByTestId("work-object-add-form");
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.locator('input[name="name"]').fill(SITE);
    await form.getByTestId("work-object-add-submit").click();
    await expect(page.getByTestId("work-object-row").filter({ hasText: SITE }).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.goto("/lt/dashboard/hours");
  }
  await expect(picker).toBeVisible({ timeout: 60_000 });
}

async function recordHours(page: Page, org: string, note: string): Promise<void> {
  await useWorkspace(page, org);
  await page.goto("/lt/dashboard/hours");
  await page.getByTestId("hours-worker-select").selectOption(workerId);
  await page.getByTestId("hours-object-picker").locator('[data-testid^="hours-object-"]').first().click();
  await page.getByTestId("hours-input").fill("1.5");
  await page.getByTestId("hours-note").fill(note);
  await page.getByTestId("hours-save").click();
  const saved = page.getByTestId("hours-saved");
  const error = page.getByTestId("hours-error");
  await expect(saved.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`hours not saved in ${org}: ${await error.innerText()}`);
  // Persistence: a fresh load of the day lists the entry.
  await page.goto("/lt/dashboard/hours");
  await expect(page.getByTestId("hours-entry").filter({ hasText: note })).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByTestId("hours-day-total")).toBeVisible();
}

for (const { slot, org, label } of [
  { slot: "owner", org: ALFA, label: "Alfa (company)" },
  { slot: "agency", org: AGENCY, label: "the agency" },
]) {
  test(`H-1 (3.33). ${label} has a site to record hours against`, async ({ browser }) => {
    const { ctx, page } = await as(browser, slot);
    await siteReady(page, org);
    await ctx.close();
  });

  test(`H-2 (3.33). ${label} records today's hours for its worker, and they persist`, async ({ browser }) => {
    const { ctx, page } = await as(browser, slot);
    await recordHours(page, org, `${NOTE} ${slot}`);
    await ctx.close();
  });
}
