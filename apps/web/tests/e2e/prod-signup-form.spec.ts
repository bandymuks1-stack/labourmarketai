import { randomBytes } from "node:crypto";

import { test, expect } from "./prod-walk";
import { QA_MAILBOX_ADDRESS, assertSyntheticAddress, imapConfigured, nextUid, waitForMailLink } from "./prod-qa-imap";

/**
 * PRODUCTION — ONE REAL SIGN-UP THROUGH THE FORM (function register 1.1).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=signup-form),
 * dispatch only, never in the rotation. Every other production walk signs in
 * to an account the owner created; this is the ONE walk that creates an
 * account, so each dispatch is the owner's own decision. The workflow runs
 * `scripts/prod-qa-signup-form.ts --precheck` before it (stops when an account
 * with the address already exists) and `--cleanup` after it, pass or fail
 * (deletes the account this run created and fails the job if anything is left).
 *
 *   S-1  /en/auth/signup on a 390 px phone: the form takes the synthetic
 *        mailbox address and a random password and answers "check your e-mail";
 *   S-2  the confirmation mail really arrives in the QA mailbox (read-only)
 *        and its link, opened in the same browser, lands on onboarding;
 *   S-3  onboarding as a person who wants work, named QA-SYNTHETIC, country
 *        Lithuania, ends on the dashboard.
 *
 * It stops there on purpose. No discoverability consent, no journal entry and
 * no company role: those leave append-only or orphan rows. No profession is
 * picked (it is optional), so no profession row either. Analytics stays
 * refused (the walk's default consent seed), so no analytics event names the
 * account — such a row would block deleting it.
 *
 * Rows the walk creates: the auth user with its identity and session; one
 * `profiles`, one `workers`, one `engagement_contexts` row (by trigger at
 * sign-up); one `profile_roles` row (worker, at onboarding). All of them go
 * when the auth user is deleted (ON DELETE CASCADE).
 *
 * The password is random per run, held only in memory and never printed; the
 * mailed link carries a one-time code, so its URL is never put in an error.
 */
const ADDRESS = QA_MAILBOX_ADDRESS;
const ENABLED = process.env.PROD_QA_WALK === "1" && process.env.PROD_QA_SIGNUP_WALK === "1" && imapConfigured();
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with spec=signup-form and the QA mailbox secrets");
// One mail (up to 3 min) plus the form, the link and onboarding.
test.describe.configure({ mode: "serial", timeout: 420_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { width: 390, height: 844 };
const NAME = "QA-SYNTHETIC Sign-up walk";
// Anyone can send mail TO the synthetic address, so only an HTTPS link to this
// site or to its auth project is ever followed.
const TRUSTED_HOSTS = [process.env.E2E_BASE_URL, process.env.PROD_QA_SUPABASE_URL]
  .filter((v): v is string => Boolean(v))
  .map((v) => new URL(v).host);
const CONFIRM_LINK = (u: string) => {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  return url.protocol === "https:" && TRUSTED_HOSTS.includes(url.host) && /verify|callback|token/.test(u);
};
const password = () => `Qa-${randomBytes(18).toString("base64url")}!9`;

test("S-1..S-3 (1.1). a new person signs up through the form, confirms by the mailed link and onboards as a worker", async ({ browser }) => {
  assertSyntheticAddress(ADDRESS);
  // The link's one-time code is bound to the browser that signed up, so the
  // whole walk is one context.
  const ctx = await browser.newContext({ locale: "en-GB", viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  try {
    const since = await nextUid();

    await test.step("S-1. the form takes the address and answers: check your e-mail", async () => {
      await page.goto("/en/auth/signup");
      await page.locator('input[name="email"]').fill(ADDRESS);
      // A failed fill repeats the typed value in Playwright's call log, and
      // walk errors land in public artefacts: keep neither message nor cause.
      let filled = true;
      try {
        const secret = password();
        await page.locator('input[name="password"]').fill(secret);
        await page.locator('input[name="confirm_password"]').fill(secret);
      } catch {
        filled = false;
      }
      if (!filled) throw new Error("the sign-up password fields could not be filled (details withheld: they repeat the password)");
      await page.locator('form button[type="submit"]').first().click();
      await expect(page.getByTestId("signup-check-email"), "the form says a confirmation mail was sent").toBeVisible({ timeout: 60_000 });
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll, "the check-your-e-mail screen is wider than the phone").toBeLessThanOrEqual(inner + 1);
    });

    await test.step("S-2. the confirmation mail arrives and its link opens onboarding", async () => {
      const mail = await waitForMailLink(ADDRESS, since, CONFIRM_LINK);
      console.info(`[signup-form] confirmation mail after ${mail.seconds} s`);
      let opened = true;
      try {
        await page.goto(mail.link);
        await page.waitForURL(/\/(en|lt)\/onboarding/, { timeout: 60_000 });
      } catch {
        opened = false;
      }
      if (!opened) throw new Error("the confirmation link did not open onboarding (URL withheld: it carries a one-time code)");
    });

    await test.step("S-3. onboarding as a person who wants work ends on the dashboard", async () => {
      await page.getByTestId("onboarding-intent-work").click();
      await expect(page.getByTestId("onboarding-intent-work")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("onboarding-intents-continue").click();
      await page.getByTestId("onboarding-display-name").fill(NAME);
      await page.getByTestId("onboarding-country").click();
      await page.getByRole("option", { name: /^(Lithuania|Lietuva)$/ }).first().click();
      await page.getByTestId("onboarding-submit").click();
      await page.waitForURL(/\/(en|lt)\/dashboard(?:$|[/?#])/, { timeout: 60_000 });
      await expect(page.getByRole("main"), "the dashboard renders for the new worker").toBeVisible({ timeout: 30_000 });
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll, "the first dashboard is wider than the phone").toBeLessThanOrEqual(inner + 1);
    });
  } finally {
    // The clean-up step deletes the account, which ends every session of it;
    // the browser's own copy goes with the context.
    await ctx.close();
  }
});
