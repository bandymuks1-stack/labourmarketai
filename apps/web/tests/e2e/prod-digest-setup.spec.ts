import { test, expect, type Browser, type Locator, type Page } from "./prod-walk";
import { bearerOf, qaApi } from "./prod-qa-api";
import {
  INVITED_WALK_ENABLED,
  RUN,
  SLOT,
  assertSyntheticSession,
  expectNoSidewaysScroll as noSidewaysScroll,
  markSignedOut,
  myEmailConsents,
  myWorkerId,
  onboardAsWorker,
  openPhone,
  settle,
  switchEmailOn,
} from "./prod-qa-invited";

/**
 * PRODUCTION — THE WEEKLY DIGEST E-MAIL, PART 1 OF 2: SET-UP (journey J-15,
 * register row 5.9; owner 2026-11-02: the digest is its own check, proven by
 * a real scheduled send).
 *
 * The digest e-mail is sent by ONE path only: the Monday 07:00 UTC sweep
 * (ops/vps/labourmarket.cron → /api/cron/weekly-digest →
 * emitWeeklyDigestNotificationsForCron), for workers with a journal entry
 * created in the trailing 7 days, through the one notification dispatcher, to
 * people who switched e-mail on for the digest. A dashboard visit in that ISO
 * week BEFORE the sweep writes the week's in-app row without e-mail, and the
 * sweep then finds a duplicate and sends nothing. So the proof is split:
 *
 *   this part (dispatch Tue..Sun, the week BEFORE the Monday it is checked):
 *   S-0  it refuses to run on a Monday (UTC): a visit on the check day would
 *        spend that week's digest in-app only;
 *   S-1  390 px: onboarding as a person who wants work (no-op when done);
 *   S-2  390 px: e-mail switched on for the weekly digest in the account's
 *        notification settings — the consent row is stored;
 *   S-3  390 px: one synthetic journal entry recorded through the journal's
 *        own quick record — the row the sweep's audience is computed from;
 *   S-4  no console error and no 401/403 on the walk's signed-in pages;
 *   S-5  390 px: signed out through the account menu.
 *
 * NO ERASURE HERE, deliberately: the account must still exist on Monday.
 * prod-digest-check.spec.ts (spec=digest-check) reads the mail and erases the
 * account at its end. Signs in to the owner-created qa.invited@ account only;
 * only synthetic text (QA-SYNTHETIC); the log carries counts and kinds only.
 */
test.skip(!INVITED_WALK_ENABLED, "production walk: runs only in prod-qa-walk.yml with the owner-created synthetic account and the QA mailbox (owner D-4)");
test.describe.configure({ mode: "serial", timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const TAG = "digest-setup";
const NAME = "QA-SYNTHETIC Suvestinės darbuotojas";
const PROFESSION = "cleaner";
const ENTRY = `[QA-SYNTHETIC] Šiandien išvaliau 120 m² biuro patalpų, 4 val. (${RUN})`;
const inMain = (page: Page): Locator => page.getByRole("main");

const problems: string[] = [];
const open = (browser: Browser) => openPhone(browser, problems);
const expectNoSidewaysScroll = (page: Page, where: string) => noSidewaysScroll(page, where, TAG);

test("S-0. not on a Monday (UTC): a visit on the check day spends the digest in-app only", async () => {
  const day = new Date().getUTCDay();
  console.info(`[digest-setup] UTC weekday=${day}`);
  expect(day, "run digest-setup Tuesday..Sunday; digest-check runs on the Monday after 07:05 UTC").not.toBe(1);
  assertSyntheticSession();
});

test("S-1. 390 px: onboarding as a person who wants work", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  try {
    await onboardAsWorker(page, { name: NAME, professionQuery: "Valytoj", professionSlug: PROFESSION }, TAG);
  } finally {
    await ctx.close();
  }
  await myWorkerId();
});

test("S-2. 390 px: e-mail on for the weekly digest; the consent is stored", async ({ browser }) => {
  assertSyntheticSession();
  const { ctx, page } = await open(browser);
  try {
    await switchEmailOn(page, ["weekly_digest"], TAG);
  } finally {
    await ctx.close();
  }
  await expect
    .poll(myEmailConsents, { message: "explicit e-mail consent for the digest is stored", timeout: 30_000 })
    .toContain("weekly_digest");
});

test("S-3. 390 px: one journal entry through the journal's quick record", async ({ browser }) => {
  assertSyntheticSession();
  const t0 = new Date(Date.now() - 60_000).toISOString();
  const { ctx, page } = await open(browser);
  try {
    await page.goto("/lt/dashboard/journal");
    await settle(page);
    await inMain(page).getByTestId("journal-quick-record-text").fill(ENTRY);
    await inMain(page).getByTestId("journal-quick-record-understand").click();
    await expect(inMain(page).getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
    const done = inMain(page).getByTestId("worklog-done");
    const failed = inMain(page).getByTestId("worklog-error").or(inMain(page).getByTestId("worklog-blocked"));
    for (const id of ["worklog-save", "worklog-confirm"]) {
      if (await done.isVisible().catch(() => false)) break;
      const button = inMain(page).getByTestId(id);
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await expect(done.or(failed).or(inMain(page).getByTestId("worklog-confirm"))).toBeVisible({ timeout: 30_000 });
      }
    }
    await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
    expect(await failed.isVisible(), "the journal entry was refused").toBe(false);
    await expectNoSidewaysScroll(page, "journal, entry recorded (390)");
  } finally {
    await ctx.close();
  }
  const workerId = await myWorkerId();
  const r = await qaApi(
    `/rest/v1/journal_entries?select=id&worker_id=eq.${workerId}&deleted_at=is.null&created_at=gte.${encodeURIComponent(t0)}`,
    bearerOf(SLOT),
  );
  expect(r.status).toBe(200);
  const rows = (await r.json()) as unknown[];
  console.info(`[digest-setup] journal entries created by this walk=${rows.length}; the Monday sweep's audience is entries of the trailing 7 days`);
  expect(rows.length, "the entry is stored for the sweep to find").toBeGreaterThan(0);
});

test("S-4. no console error and no 401/403 on the walk's signed-in pages", async () => {
  console.info(`[digest-setup] problems seen=${problems.length}${problems.length ? `: ${[...new Set(problems)].join("; ")}` : ""}`);
  expect(problems, "signed-in pages are free of console errors and auth refusals").toEqual([]);
});

test("S-5. 390 px: signed out through the account menu; the account is kept for digest-check", async ({ browser }) => {
  const { ctx, page } = await open(browser);
  try {
    await page.goto("/lt/dashboard/account");
    await settle(page);
    await page.getByTestId("account-menu-trigger").filter({ visible: true }).first().click();
    await page.getByTestId("account-menu-signout").filter({ visible: true }).first().click();
    await page.waitForURL((u) => !/\/dashboard/.test(u.pathname), { timeout: 30_000 });
    markSignedOut();
    console.info(`[digest-setup] signed out, landed on ${new URL(page.url()).pathname}; the account stays until digest-check erases it`);
  } finally {
    await ctx.close();
  }
});
