import { test, expect, type Page } from "@playwright/test";

/**
 * EDUCATION PILOT — an institution can say what it is.
 *
 * Before `organization_roles` (migration 20260827050000) this was impossible
 * to express: `organizations.organization_type` was ONE closed value —
 * company | agency | team | other — so an education institution's only options
 * were to call itself a company or not exist. And for a while after the table
 * shipped it was still impossible to REACH: the capability was storable and no
 * screen could set it.
 *
 * This walks the flow an institution administrator actually gets:
 *
 *   open the organization page
 *     → "What does your organization do?"
 *     → tick what applies (more than one)
 *     → save
 *     → it is settled, and it is still settled after a reload
 *
 * WHAT IT ALSO PROVES, and what makes it worth a browser rather than a unit
 * test: the administrator never meets a database word. No `training_provider`,
 * no `role_slug`. If the screen ever regressed to rendering the stored value,
 * this fails.
 *
 * Local stack only (`pnpm e2e:local`).
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const OWNER = { email: "dev.company@local.test", password: "password" };

async function loginAsOwner(page: Page): Promise<void> {
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(OWNER.email);
  await page.locator('input[type="password"]').fill(OWNER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
}

test.describe("education pilot — the institution declares what it does", () => {
  test.skip(!HAS_TEST_SUPABASE, "needs the local stack (pnpm e2e:local)");

  test("an organization declares education AND employment, in plain language", async ({
    page,
  }) => {
    await loginAsOwner(page);
    await page.goto("/lt/dashboard/company", { waitUntil: "domcontentloaded" });

    const card = page.locator('[data-testid="org-capabilities-card"]');
    await expect(
      card,
      "the organization has no capability question — is it mirrored to an organizations row?",
    ).toBeVisible({ timeout: 60_000 });

    // The question is asked in the reader's own language, not in schema.
    await expect(card).toContainText("Ką veikia jūsų organizacija?");
    await expect(
      card,
      "a raw database identifier reached the screen",
    ).not.toContainText(/training_provider|workforce_provider|role_slug/);

    // MANY capabilities at once — the whole point of the model. A vocational
    // school both trains people and employs them, and the old single column
    // could never say both.
    const education = page.locator(
      '[data-testid="org-capability-checkbox-training_provider"]',
    );
    const employment = page.locator(
      '[data-testid="org-capability-checkbox-employer"]',
    );

    // The fixture company was backfilled as an employer, so employment may
    // already be settled. Tick only what is genuinely still on offer.
    let ticked = 0;
    if ((await education.count()) > 0) {
      await education.check();
      ticked++;
    }
    if ((await employment.count()) > 0) {
      await employment.check();
      ticked++;
    }

    // RE-RUNNABLE. On a fresh stack nothing is declared yet and both are
    // ticked, which is what proves the ACT. On a re-run against the same
    // database they are already settled and there is nothing left to tick —
    // so the save is skipped rather than clicking a disabled button and
    // calling the resulting nothing a pass. The outcome assertions below run
    // either way, because what must be true afterwards is the same.
    if (ticked > 0) {
      await page.locator('[data-testid="org-capabilities-save"]').click();
      await expect(
        page.locator('[data-testid="org-capabilities-saved"]'),
      ).toBeVisible({ timeout: 60_000 });
    }

    // A FULL server round trip — the claim must survive, not just render.
    await page.goto("/lt/dashboard/company", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(
        '[data-testid="org-capability-settled-training_provider"]',
      ),
      "the education capability did not survive a reload",
    ).toBeVisible({ timeout: 60_000 });

    // Settled means settled: it is no longer offered as a tickable choice,
    // because the write path cannot revoke it and a control that cannot be
    // turned off must not look like one.
    await expect(
      page.locator(
        '[data-testid="org-capability-checkbox-training_provider"]',
      ),
    ).toHaveCount(0);
  });
});
