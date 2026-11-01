import { randomBytes } from "node:crypto";

import { test, expect, type Browser, type Page } from "./prod-walk";

import { assertSyntheticAddress, imapConfigured, nextUid, waitForMailLink } from "./prod-qa-imap";

/**
 * PRODUCTION — A FORGOTTEN PASSWORD, PROVEN BY THE MAIL THAT REALLY ARRIVES
 * (function 1.3, journey J-16; owner decision D-4 option A, 2026-11-01).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=mail-reset), on a
 * 390 px phone, for ONE synthetic address whose mail lands in the owner's
 * synthetic QA mailbox. The mailbox is read through `prod-qa-imap.ts`
 * (read-only EXAMINE + BODY.PEEK, synthetic addresses only).
 *
 *   R-1  forgot password → the reset mail arrives in the QA mailbox → its link
 *        opens the new-password form → a fresh random password is saved →
 *        that password signs in;
 *   R-2  a second reset (after the auth mail cool-down) sets another random
 *        password: the R-1 password is now refused by auth, the new one works.
 *
 * The passwords are random per run, held only in memory and never printed.
 * Nothing else about the account changes.
 */
const ADDRESS = process.env.PROD_QA_MAIL_ADDRESS ?? "qa.worker+goal3@labourmarket.ai";
const ENABLED = process.env.PROD_QA_WALK === "1" && imapConfigured();
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with the QA mailbox secrets (owner D-4)");
// Two mails, each up to 3 min, plus the 65 s cool-down between them.
test.describe.configure({ mode: "serial", timeout: 420_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { width: 390, height: 844 };
const RESET_LINK = (u: string) => /verify|callback|recovery|reset-password|token/.test(u);
const password = () => `Qa-${randomBytes(18).toString("base64url")}!9`;

async function phone(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ locale: "lt-LT", viewport: PHONE, isMobile: true, hasTouch: true });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function signIn(page: Page, secret: string): Promise<number> {
  await page.goto("/lt/auth/login");
  await page.locator('input[name="email"]').fill(ADDRESS);
  await page.locator('input[name="password"]').fill(secret);
  const answer = page.waitForResponse((r) => r.url().includes("/auth/v1/token") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.locator('form button[type="submit"]').first().click();
  return (await answer).status();
}

/** forgot password → mail → link → new password saved. Returns the mail's delay. */
async function resetTo(page: Page, secret: string): Promise<number> {
  const since = await nextUid();
  await page.goto("/lt/auth/forgot-password");
  await page.locator('input[type="email"][name="email"]').fill(ADDRESS);
  await page.locator('form button[type="submit"]').first().click();
  const mail = await waitForMailLink(ADDRESS, since, RESET_LINK);
  await page.goto(mail.link);
  await page.waitForURL(/reset-password/, { timeout: 60_000 });
  await page.locator('input[name="password"]').fill(secret);
  await page.locator('input[name="confirm_password"]').fill(secret);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/lt\/(auth\/login|dashboard)/, { timeout: 60_000 });
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(scroll, "the page after the reset is wider than the phone").toBeLessThanOrEqual(inner + 1);
  await page.goto("/lt/auth/logout");
  return mail.seconds;
}

let first = "";

test("R-1 (1.3). forgot password on a phone: the mail arrives, its link sets a new password that signs in", async ({ browser }) => {
  assertSyntheticAddress(ADDRESS);
  const { page, close } = await phone(browser);
  try {
    first = password();
    const seconds = await resetTo(page, first);
    console.info(`[mail-reset] R-1 reset mail arrived after ~${seconds} s`);
    expect(await signIn(page, first), "the new password signs in").toBe(200);
    await page.goto("/lt/auth/logout");
  } finally {
    await close();
  }
});

test("R-2 (1.3). a second reset: the earlier password is refused, the new one works", async ({ browser }) => {
  test.skip(!first, "R-1 did not set a password");
  // Auth refuses a second recovery mail to the same person inside 60 s.
  await new Promise((ok) => setTimeout(ok, 65_000));
  const { page, close } = await phone(browser);
  try {
    const second = password();
    const seconds = await resetTo(page, second);
    console.info(`[mail-reset] R-2 reset mail arrived after ~${seconds} s`);
    expect(await signIn(page, first), "the earlier password is refused by auth").toBe(400);
    expect(await signIn(page, second), "the new password signs in").toBe(200);
    await page.goto("/lt/auth/logout");
  } finally {
    await close();
  }
});
