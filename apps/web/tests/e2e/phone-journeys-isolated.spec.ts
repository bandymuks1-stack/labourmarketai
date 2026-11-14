import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import {
  BASE,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  setUpCompany,
  signIn,
  signUp,
  sql,
  userId,
  verifyCompanyAsLocalAdmin,
} from "./isolated-web-a-helpers";

/**
 * A SIGNED-IN PERSON ON A PHONE, at 375 and at 390 px, on a THROWAWAY LOCAL Supabase stack
 * (.github/workflows/signup-isolated.yml). Owner 2026-11-14: "Patikrinti prisijungusio naudotojo
 * profilį, CV, darbo paiešką, kandidatavimą ir susirašinėjimą. Tikrinti 375 ir 390 px pločiu."
 *
 * For each width, first at a desktop (setup, not the walk): a company signs up, posts a need and is verified by the
 * local operator, so the need reaches the worker board.
 *
 * Then, for EACH phone — 375 × 667 and 390 × 844, touch, a phone's user agent — a new worker:
 *   M-1 PROFILE  opens their profile from the avatar menu and saves a public headline (stored);
 *   M-2 CV       opens the Living CV from the avatar menu and switches it to the EU format;
 *   M-3 SEARCH   finds the company's need on the work board and opens its details;
 *   M-4 APPLY    expresses interest in it (the interest row is stored);
 *   M-5 MESSAGES writes to the employer from that application; the company answers from ITS phone;
 *                the worker reaches the thread through the phone's area sheet and reads the answer.
 *
 * M-2 runs LAST in each group (first run 2026-11-14: the CV page stopped answering at 375 px), so a
 * CV fault cannot hide search, applying and messages; if it stops answering again, the step says
 * whether the same CV answers at a desktop width.
 *
 * On every page the walk also asserts that nothing scrolls sideways (the page is never wider than
 * the phone). Controls are TAPPED, not clicked. Outcomes are read back from the local database —
 * the page saying "done" is not the proof. It refuses to run anywhere but the local stack (owner
 * decision 2026-10-28: no synthetic accounts in production). Result class: PASS_CI_ONLY.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
// One worker runs this file in order (playwright.config: E2E_LOCAL_STACK → workers 1). Each phone is
// its own serial group, so a failure at 375 px does not hide the 390 px walk.
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const email = (who: string) => `phone.${who}.${RUN}@local.test`;

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const PHONES = [
  { name: "375", viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 },
  { name: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
] as const;

async function onPhone(
  browser: Browser,
  phone: (typeof PHONES)[number],
  storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    viewport: phone.viewport,
    deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: USER_AGENT,
    timezoneId: "UTC",
  });
  const page = await ctx.newPage();
  watch(page);
  return { ctx, page };
}

/** What the page said while the walk was on it: uncaught errors, console errors, dialogs. */
const heard = new WeakMap<Page, string[]>();
function watch(page: Page): void {
  const notes: string[] = [];
  heard.set(page, notes);
  page.on("pageerror", (e) => notes.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") notes.push(`console: ${m.text().slice(0, 200)}`);
  });
  // A dialog blocks the page; it is recorded and dismissed, and the step that met it fails below.
  page.on("dialog", (d) => {
    notes.push(`dialog: ${d.type()} ${d.message().slice(0, 120)}`);
    void d.dismiss().catch(() => {});
  });
}

/**
 * One sign-in per person per run: later steps reuse that browser session (cookies and storage do
 * not depend on the screen). The local auth server limits sign-ins per IP, and every walk in this
 * job shares one stack.
 */
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function signedInOnPhone(browser: Browser, phone: (typeof PHONES)[number], address: string): Promise<{ ctx: BrowserContext; page: Page; done: () => Promise<void> }> {
  const saved = sessions.get(address);
  const { ctx, page } = await onPhone(browser, phone, saved);
  if (saved) {
    await page.goto(`${BASE}/en/dashboard`);
    await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  } else {
    await signIn(page, BASE, address);
  }
  return {
    ctx,
    page,
    done: async () => {
      sessions.set(address, await ctx.storageState());
      await ctx.close();
    },
  };
}

/** The page answers within 20 s; if not, say so with what the page reported, instead of hanging. */
async function answers(page: Page): Promise<{ scroll: number; inner: number } | null> {
  return Promise.race([
    page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })),
    new Promise<null>((r) => setTimeout(() => r(null), 20_000)),
  ]);
}

/** The page is never wider than the phone: nothing scrolls sideways. */
async function fitsTheScreen(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const got = await answers(page);
  const notes = (heard.get(page) ?? []).join(" | ") || "none";
  if (got === null) throw new Error(`${where}: the page stopped answering for 20 s (busy main thread or an open dialog). The page reported: ${notes}`);
  expect(notes.includes("dialog:"), `${where}: no dialog opened (${notes})`).toBe(false);
  expect(got.scroll, `${where}: the page is ${got.scroll} px wide on a ${got.inner} px screen`).toBeLessThanOrEqual(got.inner + 1);
}

/** Tap until the expected result shows: a tap before hydration is a silent no-op. */
async function tapUntil(target: Locator, result: Locator, timeout = 60_000): Promise<void> {
  await expect(async () => {
    if (!(await result.isVisible().catch(() => false))) await target.tap({ timeout: 5_000 });
    await expect(result).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout });
}

/** The avatar menu: the phone's door to the profile and the CV. */
async function accountMenu(page: Page, link: "account-menu-profile-link" | "account-menu-cv-link"): Promise<void> {
  const target = page.getByTestId(link);
  await tapUntil(page.getByTestId("account-menu-trigger"), target);
  await target.tap();
}

for (const phone of PHONES) {
  // Each width is self-contained: Playwright replaces the worker process after a failure, so
  // nothing a group needs may live in another group's module state (Codex P2).
  const COMPANY = email(`company${phone.name}`);
  const COMPANY_ORG = `Synthetic Phone Builders ${phone.name} ${RUN}`;
  const NEED_ROLE = `Phone walk tiler ${phone.name} ${RUN}`;
  const shared: { companyId: string; needId: string } = { companyId: "", needId: "" };
  const worker = email(`worker${phone.name}`);
  const workerName = `Synthetic Phone Worker ${phone.name} ${RUN}`;
  const headline = `Tiler and waterproofer ${phone.name} ${RUN}`;
  const message = `Hello from a ${phone.name} px phone ${RUN}`;
  const answer = `Answer to the ${phone.name} px phone ${RUN}`;
  /** profileId is the auth/profile id; workerId is `workers.id`, which interest rows reference. */
  const s: { profileId: string; workerId: string; conversationId: string } = { profileId: "", workerId: "", conversationId: "" };

  test.describe(`at ${phone.viewport.width} × ${phone.viewport.height}`, () => {
    test.describe.configure({ mode: "serial" });
    test(`M-0 (${phone.name}). setup at a desktop: a verified company posts a need`, async ({ browser }) => {
      const ctx = await browser.newContext({ timezoneId: "UTC" });
      const page = await ctx.newPage();
      await signUp(page, BASE, COMPANY);
      await onboard(page, "hire", `Synthetic Phone Owner ${phone.name} ${RUN}`);
      await setUpCompany(page, COMPANY_ORG);
      await publishNeed(page, BASE, NEED_ROLE, "LT");
      sessions.set(COMPANY, await ctx.storageState());
      await ctx.close();
      shared.companyId = await verifyCompanyAsLocalAdmin(COMPANY, email(`admin${phone.name}`));
      const owner = await userId(COMPANY);
      const needs = sql<{ id: string }>(
        `select id from public.customer_requests where (title = ${lit(NEED_ROLE)} or role_or_work_type = ${lit(NEED_ROLE)}) and profile_id = ${lit(owner)}`,
      );
      expect(needs, "the need is stored once").toHaveLength(1);
      shared.needId = needs[0]!.id;
    });

    test(`M-1 (${phone.name}). a new worker opens their profile from the avatar menu and saves a public headline`, async ({ browser }) => {
      const { ctx, page } = await onPhone(browser, phone);
      await signUp(page, BASE, worker);
      await onboard(page, "work", workerName);
      await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
      s.profileId = await userId(worker);
      await fitsTheScreen(page, "the worker's home");

      await accountMenu(page, "account-menu-profile-link");
      await page.waitForURL(/\/en\/dashboard\/profile/, { timeout: 30_000 });
      await expect(page.getByTestId("profile-destinations")).toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the profile");
      // The public summary sits in the collapsed CV details; its hash opens them.
      await page.goto(`${BASE}/en/dashboard/profile#profile-public-summary`);
      await page.reload();
      const section = page.getByTestId("profile-public-summary");
      await expect(section).toBeVisible({ timeout: 30_000 });
      await section.getByTestId("profile-public-headline").fill(headline);
      await section.getByTestId("profile-public-summary-save").tap();
      await expect(section.getByTestId("profile-public-summary-saved"), "the headline is saved").toBeVisible({ timeout: 30_000 });
      const rows = sql<{ id: string; headline: string | null }>(`select id, headline from public.workers where profile_id = ${lit(s.profileId)}`);
      expect(rows.map((r) => r.headline), "the headline is stored on the worker").toEqual([headline]);
      s.workerId = rows[0]!.id;
      sessions.set(worker, await ctx.storageState());
      await ctx.close();
    });

    test(`M-3 (${phone.name}). the worker finds the company's need on the work board and opens its details`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, worker);
      await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      await expect(page.getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
      await fitsTheScreen(page, "the work board");
      const card = page.locator(`li[id="opp-${shared.needId}"]`).first();
      await expect(card, "the verified company's need is on the board").toBeVisible({ timeout: 60_000 });
      await expect(card).toContainText(NEED_ROLE);
      // The testid is on the disclosure's wrapper; the toggle and aria-expanded are on its button.
      const toggle = card.getByTestId("opportunity-details").locator("button[aria-expanded]").first();
      await toggle.tap();
      await expect(toggle, "its details open").toHaveAttribute("aria-expanded", "true", { timeout: 30_000 });
      const region = await toggle.getAttribute("aria-controls");
      if (region) await expect(card.locator(`[id="${region}"]`), "the details region is shown").toBeVisible();
      await fitsTheScreen(page, "the work board with a need's details open");
      await done();
    });

    test(`M-4 (${phone.name}). the worker applies: interest in the need is expressed and stored`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, worker);
      await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      const card = page.locator(`li[id="opp-${shared.needId}"]`).first();
      await expect(card).toBeVisible({ timeout: 60_000 });
      const box = card.getByTestId(`interest-${shared.needId}`);
      await tapUntil(box.getByTestId("interest-express"), box.getByTestId("interest-sent"));
      await expect(box.getByTestId("interest-contact-employer"), "the way to write to the employer opens").toBeVisible({ timeout: 30_000 });
      const rows = sql<{ status: string }>(
        `select status from public.demand_interest_signals where request_id = ${lit(shared.needId)} and worker_id = ${lit(s.workerId)}`,
      );
      expect(rows.map((r) => r.status), "one interest row, interested").toEqual(["interested"]);
      await done();
    });

    test(`M-5 (${phone.name}). messages: the worker writes from the application, the company answers from its phone, the worker reads it`, async ({ browser }) => {
      // The worker writes to the employer from their application.
      const w = await signedInOnPhone(browser, phone, worker);
      await w.page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      const box = w.page.locator(`li[id="opp-${shared.needId}"]`).first().getByTestId(`interest-${shared.needId}`);
      await expect(box.getByTestId("interest-contact-employer")).toBeVisible({ timeout: 60_000 });
      await box.getByTestId("interest-contact-employer").tap();
      await w.page.waitForURL(/\/en\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      s.conversationId = /\/communication\/([0-9a-f-]{36})/.exec(w.page.url())![1]!;
      await fitsTheScreen(w.page, "the worker's new thread");
      await w.page.getByTestId("communication-composer-input").fill(message);
      await w.page.getByRole("button", { name: "Send", exact: true }).tap();
      await expect(w.page.locator('[data-testid^="message-text-"]', { hasText: message }), "the message shows in the thread").toBeVisible({
        timeout: 30_000,
      });
      await w.done();
      await expect
        .poll(
          () =>
            sql<{ body: string }>(
              `select body from public.conversation_messages where conversation_id = ${lit(s.conversationId)} and author_id = ${lit(s.profileId)}`,
            ).map((r) => r.body),
          { message: "the worker's message is stored in that conversation", timeout: 30_000 },
        )
        .toEqual([message]);

      // The company finds the thread in its messages, on its own phone, and answers.
      const c = await signedInOnPhone(browser, phone, COMPANY);
      await c.page.goto(`${BASE}/en/dashboard/communication`);
      const row = c.page.getByTestId(`conversation-row-${s.conversationId}`);
      await expect(row, "the thread is in the company's messages").toBeVisible({ timeout: 60_000 });
      await fitsTheScreen(c.page, "the company's messages");
      await row.tap();
      await c.page.waitForURL(new RegExp(`/communication/${s.conversationId}`), { timeout: 30_000 });
      await expect(c.page.locator('[data-testid^="message-text-"]', { hasText: message }), "the company reads the worker's message").toBeVisible({
        timeout: 30_000,
      });
      await c.page.getByTestId("communication-composer-input").fill(answer);
      await c.page.getByRole("button", { name: "Send", exact: true }).tap();
      await expect(c.page.locator('[data-testid^="message-text-"]', { hasText: answer })).toBeVisible({ timeout: 30_000 });
      await c.done();

      // The worker reaches messages through the phone's area sheet (the desktop nav is hidden) and reads it.
      const w2 = await signedInOnPhone(browser, phone, worker);
      const sheetItem = w2.page.getByTestId("header-nav-sheet-communication");
      await tapUntil(w2.page.getByTestId("header-nav-sheet-trigger"), sheetItem);
      await sheetItem.tap();
      await w2.page.waitForURL(/\/en\/dashboard\/communication/, { timeout: 30_000 });
      const mine = w2.page.getByTestId(`conversation-row-${s.conversationId}`);
      await expect(mine).toBeVisible({ timeout: 60_000 });
      await mine.tap();
      await expect(w2.page.locator('[data-testid^="message-text-"]', { hasText: answer }), "the worker reads the company's answer").toBeVisible({
        timeout: 30_000,
      });
      await fitsTheScreen(w2.page, "the worker's thread with the answer");
      await w2.done();
    });
    test(`M-2 (${phone.name}). the worker opens the Living CV from the avatar menu and switches it to the EU format`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, worker);
      await accountMenu(page, "account-menu-cv-link");
      await page.waitForURL(/\/en\/cv/, { timeout: 30_000 });
      await expect(page.getByTestId("cv-back-link")).toBeVisible({ timeout: 30_000 });
      try {
        await fitsTheScreen(page, "the Living CV");
      } catch (phoneError) {
        // Is it the phone, or this CV? The same session opens the same page at a desktop width.
        const desk = await browser.newContext({ storageState: await page.context().storageState(), timezoneId: "UTC" });
        const dp = await desk.newPage();
        watch(dp);
        await dp.goto(`${BASE}/en/cv`);
        await dp.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        const atDesk = await answers(dp);
        await desk.close();
        await page.context().close();
        throw new Error(`${(phoneError as Error).message}\nThe same CV at 1280 × 720: ${atDesk === null ? "ALSO stops answering" : "answers"}.`);
      }
      await page.getByTestId("cv-template-eu").tap();
      await page.waitForURL(/template=eu/, { timeout: 30_000 });
      await expect(page.getByTestId("cv-eu-format"), "the EU-format CV renders").toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the EU-format CV");
      await done();
    });
  });
}
