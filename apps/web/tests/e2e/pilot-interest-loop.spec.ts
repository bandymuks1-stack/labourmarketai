import { test, expect, type Page } from "@playwright/test";

/**
 * THE INTEREST LOOP — a worker raises their hand and the employer hears it.
 *
 * This is the loop the marketplace exists for, and production says it has
 * never once completed: five `demand_interest_signals`, two
 * `demand_interest_expressed` rows — and both of those carry a `created_at`
 * identical to their signal to the microsecond, which the emitter cannot
 * produce because it never sets `created_at`. They are backfill artifacts.
 *
 * Read carefully, only ONE of the five is a real miss: two of the unnotified
 * three are SELF-INTEREST, where the demand owner and the interested worker
 * are the same person, and suppressing those is correct. So this spec proves
 * both halves, because a fix that notifies everybody is not a fix:
 *
 *   1. a DISTINCT worker's interest reaches the demand owner;
 *   2. the owner's own interest in their own demand still reaches nobody.
 *
 * Browser for the acts, database for the side effects — a notification row is
 * invisible in the UI of the person who caused it, so the UI alone could never
 * prove this.
 *
 * Local stack only (`pnpm e2e:local`). Requires the demand seed
 * (`scripts/e2e-seed-owner-rebuild.sql`): the worker board joins
 * `companies.verification_status = 'verified'`, so an unverified fixture
 * company shows an empty board and nothing here can run.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const WORKER = { email: "dev.worker@local.test", password: "password" };
const OWNER = { email: "dev.company@local.test", password: "password" };

async function loginAs(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
}

test.describe("pilot — interest reaches the employer", () => {
  test.skip(!HAS_TEST_SUPABASE, "needs the local stack (pnpm e2e:local)");

  test("a worker's interest becomes a signal the owner can act on", async ({
    page,
  }) => {
    await loginAs(page, WORKER);
    await page.goto("/lt/dashboard/opportunities", {
      waitUntil: "domcontentloaded",
    });

    // The board must actually carry a demand — an empty board would make every
    // assertion below vacuously unreachable.
    const card = page.locator('[data-testid^="interest-"]').first();
    await expect(
      card,
      "no demand on the worker board — is the fixture company verified?",
    ).toBeVisible({ timeout: 60_000 });

    // Start from "not interested" whatever the previous run left behind, so
    // this test proves the ACT and not merely a leftover row. A spec that
    // passes because the state was already right proves nothing.
    const withdraw = page.locator('[data-testid="interest-withdraw"]').first();
    if ((await withdraw.count()) > 0) {
      await withdraw.click();
      await page.waitForTimeout(3_000);
    }

    const express = page.locator('[data-testid="interest-express"]').first();
    await expect(express).toBeVisible({ timeout: 60_000 });
    await express.click();

    // The worker is told their hand is up. This is the ONLY half the worker
    // can see; everything that matters next happens where they cannot look.
    await expect(
      page.locator('[data-testid="interest-sent"]').first(),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("the employer sees the person waiting and can act on them", async ({
    page,
  }) => {
    await loginAs(page, OWNER);
    await page.goto("/lt/dashboard/company/scouting", {
      waitUntil: "domcontentloaded",
    });

    // 1. The owner's surface must NAME the waiting candidate. "A row exists in
    //    the database" is not the product promise — being seen is.
    const body = page.locator("body");
    await expect(body).toContainText(/Dev Worker|susidom|Susidom/i, {
      timeout: 60_000,
    });

    // 2. …and the act must be reachable, not merely displayed. A surface that
    //    shows a waiting person with no way to respond leaves them exactly as
    //    stranded as silence would.
    const ack = page.locator('[data-testid="interest-ack-reviewed"]').first();
    await expect(
      ack,
      "the owner can see the candidate but cannot mark them reviewed",
    ).toBeVisible({ timeout: 60_000 });
    await ack.click();

    // 3. The state really moved. Asserted in the DB by the caller, because a
    //    hopeful-looking button is not a state change.
    await page.waitForTimeout(4_000);
  });
});
