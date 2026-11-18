import { test, expect, type Browser, type Page } from "./prod-walk";
import { waitForMailLink } from "./prod-qa-imap";
import {
  ADDRESS,
  APP_HOST,
  INVITED_WALK_ENABLED,
  assertSyntheticSession,
  deleteOwnAccount as deleteAccountOnPhone,
  deleteOwnAccountByApi,
  expectNoSidewaysScroll as noSidewaysScroll,
  myEmailConsents,
  myEvents,
  openPhone,
  settle,
} from "./prod-qa-invited";

/**
 * PRODUCTION — THE WEEKLY DIGEST E-MAIL, PART 2 OF 2: THE MONDAY CHECK
 * (journey J-15, register row 5.9). Part 1 is prod-digest-setup.spec.ts.
 *
 * Dispatch on the Monday after digest-setup, AFTER 07:05 UTC, and do not sign
 * in to the account that day before the check: the 07:00 UTC sweep must be the
 * first to write the week's digest, because only the sweep sends e-mail.
 *
 *   D-0  API, before any page is opened: it is Monday after 07:05 UTC; the
 *        e-mail consent is still stored; this ISO week's digest row exists
 *        with focus "journal" and was written at/after 07:00 UTC today — the
 *        sweep's own shape (the read-time emitter never writes that focus);
 *   D-1  the digest e-mail is in the QA mailbox (received today) with a link
 *        to this site's work journal;
 *   D-2  390 px, signed in: the mailed link opens the person's journal — no
 *        sideways scroll;
 *   D-3  no console error and no 401/403 on the walk's signed-in pages;
 *   D-4  clean-up: the account deletion is requested and confirmed on the
 *        privacy page; afterAll repeats it on any later failure. Dispatched
 *        on the wrong day or hour, D-0 fails and NOTHING is erased.
 *
 * The send ledger (reserve_email_send_v1) holds hashed recipients and is
 * service-role only: this walk cannot read it, so the mail itself is the
 * proof of the send. The log carries counts, kinds, times and paths only.
 */
test.skip(!INVITED_WALK_ENABLED, "production walk: runs only in prod-qa-walk.yml with the owner-created synthetic account and the QA mailbox (owner D-4)");
test.describe.configure({ mode: "serial", timeout: 420_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const TAG = "digest-check";
/** The sweep runs Mondays 07:00 UTC (ops/vps/labourmarket.cron). */
const SWEEP_HOUR_UTC = 7;

/** Only an HTTPS link to this site's own work journal is ever followed. */
const JOURNAL_LINK = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.host === APP_HOST && /^\/[a-z]{2}\/dashboard\/journal$/i.test(url.pathname);
  } catch {
    return false;
  }
};

const problems: string[] = [];
const open = (browser: Browser) => openPhone(browser, problems);
const expectNoSidewaysScroll = (page: Page, where: string) => noSidewaysScroll(page, where, TAG);
const deleteOwnAccount = (browser: Browser) => deleteAccountOnPhone(browser, problems, TAG);

function sweepStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SWEEP_HOUR_UTC));
}

const shared: { journalPath?: string } = {};
/** Set once D-0 confirmed the day and hour. Dispatched on the wrong day, the
 *  walk fails WITHOUT erasing: the account digest-setup prepared stays for
 *  the right Monday. */
let checkDay = false;

test("D-0. API: Monday after the sweep; consent kept; this week's digest row is the sweep's (focus journal)", async () => {
  assertSyntheticSession();
  const now = new Date();
  const start = sweepStart(now);
  console.info(`[digest-check] UTC weekday=${now.getUTCDay()} minutes after the sweep=${Math.round((now.getTime() - start.getTime()) / 60_000)}`);
  expect(now.getUTCDay(), "digest-check runs on a Monday (UTC)").toBe(1);
  expect(now.getTime() - start.getTime(), "digest-check runs after 07:05 UTC").toBeGreaterThanOrEqual(5 * 60_000);
  checkDay = true;

  expect(await myEmailConsents(), "the digest e-mail consent from digest-setup is still stored").toContain("weekly_digest");

  const digests = await myEvents("weekly_digest");
  const thisWeek = digests.filter((d) => Date.parse(d.created_at) >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const focus = thisWeek.map((d) => String(d.metadata?.focus ?? "none"));
  const minute = thisWeek[0] ? new Date(thisWeek[0].created_at).toISOString().slice(11, 16) : "-";
  console.info(`[digest-check] digest rows this week=${thisWeek.length} focus=${focus.join(",") || "-"} written at ${minute} UTC`);
  expect(thisWeek, "exactly one digest this ISO week").toHaveLength(1);
  expect(focus[0], "the sweep wrote it (a visit before the sweep would have written another focus, without e-mail)").toBe("journal");
  expect(Date.parse(thisWeek[0].created_at), "written by the 07:00 UTC sweep").toBeGreaterThanOrEqual(start.getTime());
});

test("D-1. the digest e-mail is in the QA mailbox with a link to the work journal", async () => {
  const mail = await waitForMailLink(ADDRESS, 1, JOURNAL_LINK, 300_000, sweepStart());
  shared.journalPath = new URL(mail.link).pathname;
  console.info(`[digest-check] digest e-mail found after ~${mail.seconds} s; link path=${shared.journalPath}`);
});

test("D-2. 390 px, signed in: the mailed link opens the person's journal", async ({ browser }) => {
  expect(shared.journalPath, "D-1 found the digest e-mail").toBeTruthy();
  const { ctx, page } = await open(browser);
  try {
    const res = await page.goto(shared.journalPath!);
    await settle(page);
    const landed = new URL(page.url()).pathname;
    console.info(`[digest-check] status=${res?.status()} landed on the journal=${landed === shared.journalPath}`);
    expect(res?.status(), "the journal answers").toBe(200);
    expect(landed, "the link lands on the journal, not a sign-in wall").toBe(shared.journalPath);
    await expect(page.getByRole("main").getByTestId("journal-quick-record-text")).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page, "journal from the digest e-mail (390)");
  } finally {
    await ctx.close();
  }
});

test("D-3. no console error and no 401/403 on the walk's signed-in pages", async () => {
  console.info(`[digest-check] problems seen=${problems.length}${problems.length ? `: ${[...new Set(problems)].join("; ")}` : ""}`);
  expect(problems, "signed-in pages are free of console errors and auth refusals").toEqual([]);
});

let deletionConfirmed = false;

test("D-4. clean-up: the account is deleted through the privacy page", async ({ browser }) => {
  deletionConfirmed = await deleteOwnAccount(browser);
  expect(deletionConfirmed, "the walk's sign-in is older than the confirmation window").toBe(true);
  console.info("[digest-check] D-4 account deletion requested and confirmed; the erasure runner removes the account");
});

// A serial suite skips D-4 after any earlier failure, so the clean-up is also
// done here — always, once D-0 confirmed it is the check day.
test.afterAll(async ({ browser }) => {
  if (deletionConfirmed) return;
  if (!checkDay) {
    console.info("[digest-check] not the check day/hour: nothing read, the account is kept for the right Monday");
    return;
  }
  test.setTimeout(180_000);
  try {
    deletionConfirmed = await deleteOwnAccount(browser);
  } catch {
    deletionConfirmed = false;
  }
  if (deletionConfirmed) {
    console.info("[digest-check] clean-up: account deletion confirmed on the privacy page");
    return;
  }
  try {
    const outcome = await deleteOwnAccountByApi();
    deletionConfirmed = outcome === "confirmed";
    console.info(`[digest-check] clean-up through the privacy functions: ${outcome}`);
  } catch {
    console.info("[digest-check] clean-up: the account deletion could not be requested; the owner confirms it by hand");
  }
});
