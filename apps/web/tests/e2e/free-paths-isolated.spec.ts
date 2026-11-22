import { expect, test, type Browser, type Page } from "@playwright/test";

import { BASE, isolatedStack, lit, onboard, publishNeed, setUpCompany, signUp, sql, userId } from "./isolated-web-a-helpers";

/**
 * FREE CORE PATHS HAVE NO PAYWALL, and the paid plan is shown plainly (coordinator order
 * 2026-11-22, owner launch 2026-11-23), on a THROWAWAY local stack (.github/workflows/signup-isolated.yml).
 *
 * This stack runs with billing OFF, which is how every organization outside the production billing
 * pilot list runs (lib/billing/effective-entitlements.ts picks the billing state per organization).
 * The other free paths are already walked elsewhere and are not repeated here: sign-up
 * (signup-isolated), apply, hire and project (hiring-chain-isolated), offers to a need and messages
 * (journeys-coverage-isolated, phone-journeys-isolated). What no walk proved explicitly:
 *
 *   F-1 a new free company posts a FIRST, SECOND and THIRD need; each is accepted and stored, and no
 *       limit or payment message appears;
 *   F-2 /pricing shows the free plan, the paid plan with what it adds, says it cannot be bought yet
 *       and that prices are without VAT, offers no checkout and sends nobody to Stripe.
 *
 * Each runs at 1440 × 900 and on a 390 × 844 touch phone.
 */
test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const ACTIVE = "('submitted','in_review','needs_followup','approved')";
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  },
} as const;

async function fits(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const got = await page.evaluate(() => ({ scroll: document.body.scrollWidth, inner: document.documentElement.clientWidth }));
  expect(got.scroll - got.inner, `${where}: ${got.scroll - got.inner} px past the screen`).toBeLessThanOrEqual(1);
}

for (const [device, options] of Object.entries(DEVICES)) {
  test.describe(`free paths on ${device}`, () => {
    test(`F-1 (${device}). a free company posts a first, second and third need; each is stored and nothing asks for payment`, async ({ browser }: { browser: Browser }) => {
      const address = `freepaths.${device}.${RUN}@local.test`;
      const ctx = await browser.newContext({ ...options, timezoneId: "UTC" });
      const page = await ctx.newPage();
      await signUp(page, BASE, address);
      await onboard(page, "hire", `Synthetic Free Owner ${device} ${RUN}`);
      await setUpCompany(page, `QA-SYNTHETIC Free Co ${device} ${RUN}`);
      const owner = await userId(address);
      const org = sql<{ id: string }>(
        `select id from public.organizations where owner_profile_id = ${lit(owner)} and organization_type <> 'team'`,
      )[0]!.id;
      const stored = () =>
        sql<{ n: number }>(
          `select count(*)::int as n from public.customer_requests where status in ${ACTIVE} and organization_id = ${lit(org)}`,
        )[0]!.n;

      for (const [i, role] of ["Tiler", "Electrician", "Warehouse picker"].entries()) {
        // Leave the page first: the intake's address ends in a #fragment, and a same-document
        // navigation would keep the previous form's "sent" state.
        await page.goto(`${BASE}/en/dashboard`);
        await publishNeed(page, BASE, `${role} ${device} ${RUN}`, "LT");
        const main = page.getByRole("main");
        await expect(main.getByTestId("demand-open-need-limit"), `need ${i + 1}: no limit message`).toHaveCount(0);
        await expect(main, `need ${i + 1}: no payment wording`).not.toContainText(/upgrade|checkout|payment required|pay to/i);
        await expect.poll(stored, { message: `need ${i + 1} is stored`, timeout: 30_000 }).toBe(i + 1);
        if (device === "phone") await fits(page, `the needs page after need ${i + 1}`);
      }
      // A fresh load lists all three under the company.
      await page.goto(`${BASE}/en/dashboard/company/needs`);
      for (const role of ["Tiler", "Electrician", "Warehouse picker"]) {
        await expect(page.getByRole("main"), `${role} is listed after a reload`).toContainText(`${role} ${device} ${RUN}`, { timeout: 30_000 });
      }
      await ctx.close();
    });

    test(`F-2 (${device}). /pricing shows both plans plainly, says the paid one cannot be bought yet, and opens no checkout`, async ({ browser }) => {
      const ctx = await browser.newContext({ ...options, timezoneId: "UTC" });
      const page = await ctx.newPage();
      const stripe: string[] = [];
      page.on("request", (r) => {
        const host = new URL(r.url()).hostname;
        if (host === "stripe.com" || host.endsWith(".stripe.com")) stripe.push(r.url());
      });
      const res = await page.goto(`${BASE}/en/pricing`);
      expect(res?.status()).toBe(200);
      const free = page.getByTestId("pricing-plan-free");
      const paid = page.getByTestId("pricing-plan-business");
      await expect(free).toBeVisible({ timeout: 30_000 });
      await expect(paid).toBeVisible();
      await expect(page.getByRole("main"), "the hero says registration and posting are free").toContainText(
        "Registration is free for people and for organizations, and posting workforce needs is free.",
      );
      await expect(paid, "the paid plan says what it adds").toContainText(/No fixed limit on active positions/);
      await expect(paid, "and that nothing can be bought yet").toContainText("Online payment is not open yet");
      await expect(paid, "prices without VAT").toContainText("Prices are shown without VAT.");
      await expect(page.locator('a[href*="stripe.com"], form[action*="stripe"]'), "no link or form to Stripe").toHaveCount(0);
      await expect(page.getByRole("button", { name: /buy|subscribe|checkout|pay now/i }), "no purchase button").toHaveCount(0);
      if (device === "phone") await fits(page, "/pricing on a 390 px phone");
      await page.screenshot({ path: test.info().outputPath(`pricing-${device}.png`), fullPage: false });
      expect(stripe, "the page made no request to Stripe").toEqual([]);
      await ctx.close();
    });
  });
}
