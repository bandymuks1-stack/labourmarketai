import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION IN-APP NOTIFICATIONS — owner area 10 (registry rows 5.6, 5.10).
 *
 * A stored event reaches the person in the app, takes them to the thing it is
 * about, and its read state persists — on the desktop bell, on the phone
 * sheet and in the activity centre:
 *
 *   N-1  the worker raises a hand on Gama's need (the act that lets Gama write);
 *   N-2  Gama opens the thread with that person and sends one message;
 *   N-3  the worker's bell shows a stored "new message" row for THAT thread,
 *        with no "switch role" detour, and the row opens the thread;
 *   N-4  after a fresh load the row is read — the read marker persisted;
 *   N-5  the activity centre lists the same stored event, as read;
 *   N-6  on the phone, the sheet offers "mark all read" and every stored row
 *        is read after a fresh load;
 *   N-7  Gama, working as the company, is never asked to switch to the worker
 *        role on an organization-side stored row.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   worker   qa.worker+multiw — raises the hand, receives the message
 *   manager  runs "QA-SYNTHETIC Gama" — owns the need's candidate list, writes
 *
 * Every step is what a person does in the browser. The one API call reads the
 * worker's OWN row with the worker's own token, to know which candidate card
 * is theirs; it writes nothing. Failure messages carry counts and states only,
 * never a company name or message text from a real customer (public log).
 * Idempotent: a rerun withdraws and raises the hand again and reuses the same
 * deduped thread; the message is marked QA-SYNTHETIC with the run id.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const GAMA = "QA-SYNTHETIC Gama";
const MSG = `QA-SYNTHETIC ${RUN} notification walk`;
const ORG_SIDE = [
  "event_demand_interest_expressed",
  "event_booking_accepted",
  "event_booking_declined",
  "event_document_ack_completed",
];
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["worker", "manager"].every((s) => existsSync(state(s)));
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

/** The visible rows of the open bell (desktop popover or phone sheet). */
const rows = (page: Page): Locator => page.locator('[data-testid="notification-row"]:visible');

/**
 * Open the bell on a dashboard page and wait for the streamed spine to fill it.
 * The rows hydrate after first paint, so an empty first look is retried with a
 * fresh load rather than read as "no notifications".
 */
async function openBell(page: Page, path: string, want: (p: Page) => Locator): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto(path);
    const bell = page.locator('[data-testid="notification-bell"]:visible').first();
    await expect(bell).toBeVisible({ timeout: 30_000 });
    // Give the streamed spine its chance before the first click.
    await page.waitForTimeout(3_000);
    await bell.click();
    const found = await expect
      .poll(() => want(page).count(), { timeout: 30_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    if (found) return true;
  }
  return false;
}

let workerId = "";
let requestId = "";
let conversationId = "";

test("N-0. the worker's own worker id (own row, own token)", async () => {
  const token = bearerOf("worker");
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, "own worker row answered").toBe(200);
  const own = (await res.json()) as { id: string }[];
  expect(own.length, "exactly one own worker row").toBe(1);
  workerId = own[0].id;
});

test("N-1. the worker raises a hand on Gama's need", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/opportunities?view=all");
  await expect(page.getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
  const cards = page
    .locator('li[id^="opp-"]')
    .filter({ has: page.getByTestId("opportunity-company").filter({ hasText: GAMA }) })
    .filter({ has: page.locator('[data-testid^="interest-"]') });
  await expect.poll(() => cards.count(), { timeout: 60_000 }).toBeGreaterThan(0);
  const card = cards.first();
  requestId = ((await card.getAttribute("id")) ?? "").replace(/^opp-/, "");
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
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

test("N-2. Gama opens the thread with that person and sends one message", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const ack = page.getByTestId(`interest-ack-${workerId}`);
  await expect(ack).toBeVisible({ timeout: 60_000 });
  await ack.getByTestId("interest-ack-contacted").click();
  await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
  conversationId = (page.url().match(/\/dashboard\/communication\/([0-9a-f-]{36})/) ?? [])[1] ?? "";
  expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);
  const input = page.getByTestId("communication-composer-input");
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(MSG);
  await input.locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  const sent = await expect(input).toHaveValue("", { timeout: 30_000 }).then(() => true, () => false);
  if (!sent) {
    const why = await page.getByTestId("communication-composer-error").innerText().catch(() => "(no error shown)");
    throw new Error(`Gama's message was not sent: ${why}`);
  }
  await expect(page.locator("main")).toContainText(MSG, { timeout: 30_000 });
  await ctx.close();
});

/** The worker's stored "new message" row for THIS thread. */
const threadRow = (page: Page): Locator =>
  rows(page)
    .filter({ has: page.locator(`a[href*="/dashboard/communication/${conversationId}"]`) })
    .and(page.locator('[data-notification-type="event_message_received"][data-durable="true"]'));

test("N-3. the worker's bell shows the stored message row, with no role detour, and it opens the thread", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  const found = await openBell(page, "/lt/dashboard/activity", threadRow);
  if (!found) {
    const all = await rows(page).count();
    const durable = await rows(page).and(page.locator('[data-durable="true"]')).count();
    console.info(`N-3 diagnostics: rows=${all} durable=${durable}`);
  }
  expect(found, "a stored message row for the thread is in the worker's bell").toBe(true);
  const row = threadRow(page).first();
  // Messages reach either side: the row follows the active role, so the
  // worker working as a worker is never told to switch first.
  await expect(row.getByTestId("notification-switch-role")).toHaveCount(0);
  await row.locator(`a[href*="/dashboard/communication/${conversationId}"]`).click();
  await page.waitForURL(new RegExp(`/dashboard/communication/${conversationId}`), { timeout: 60_000 });
  await expect(page.locator("main")).toContainText(MSG, { timeout: 30_000 });
  await ctx.close();
});

test("N-4. after a fresh load the row is read — the marker persisted", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  expect(await openBell(page, "/lt/dashboard/activity", threadRow), "the row is still listed").toBe(true);
  await expect(threadRow(page).first()).toHaveAttribute("data-read", "true", { timeout: 30_000 });
  await ctx.close();
});

test("N-5. the activity centre lists the same stored event, as read", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/activity");
  await expect(page.getByTestId("activity-stored-events")).toBeVisible({ timeout: 60_000 });
  const stored = page
    .locator('[data-testid^="activity-stored-event-"][data-event-type="event_message_received"]')
    .and(page.locator(`[href*="/dashboard/communication/${conversationId}"]`));
  await expect.poll(() => stored.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(stored.first()).toHaveAttribute("data-read", "true");
  await ctx.close();
});

test("N-6. on the phone the sheet offers 'mark all read', and every stored row stays read", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker", true);
  const durable = (p: Page) => rows(p).and(p.locator('[data-durable="true"]'));
  expect(await openBell(page, "/lt/dashboard/activity", durable), "the phone sheet lists stored rows").toBe(true);
  const markAll = page.locator('[data-testid="notification-mark-all-read"]:visible');
  await expect(markAll).toHaveCount(1);
  await markAll.click();
  await expect(durable(page).and(page.locator('[data-read="false"]'))).toHaveCount(0, { timeout: 30_000 });
  // The persist is a fire-and-forget server action: give it time to land
  // before the fresh load that proves it.
  await page.waitForTimeout(5_000);
  // Persistence: a fresh load of the sheet shows no unread stored row.
  expect(await openBell(page, "/lt/dashboard/activity", durable)).toBe(true);
  await expect(durable(page).and(page.locator('[data-read="false"]'))).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("N-7. Gama working as the company is never asked to switch to worker on an organization-side row", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  // The bell may be empty for Gama — that is a true state, not a failure; the
  // rule is checked on every organization-side stored row that IS there.
  const opened = await openBell(page, "/lt/dashboard/activity", rows);
  console.info(`N-7: bell rows present=${opened}`);
  let orgSide = 0;
  for (const type of ORG_SIDE) {
    const typed = rows(page).and(page.locator(`[data-durable="true"][data-notification-type="${type}"]`));
    const n = await typed.count();
    orgSide += n;
    for (let i = 0; i < n; i++) {
      await expect(typed.nth(i).getByTestId("notification-switch-role")).toHaveCount(0);
    }
  }
  console.info(`N-7: organization-side stored rows checked=${orgSide}`);
  await ctx.close();
});
