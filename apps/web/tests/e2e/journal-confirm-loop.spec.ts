import { test, expect, type Page, type Browser } from "@playwright/test";

/**
 * Work Journal closed loop, AUTHENTICATED (M1 §13) — the real flow that
 * user-reported bugs live in: worker logs in → creates a journal entry →
 * manager logs in → the entry appears in the review inbox → manager approves.
 *
 * Runs against the LOCAL Supabase stack only (never cloud): seeded users come
 * from supabase/dev-fixtures.sql, the env comes from `pnpm e2e:local` (see
 * docs/TESTING.md). Without SUPABASE_TEST_URL the suite skips cleanly, so CI
 * and machines without the local stack stay green.
 *
 * The whole loop runs twice — dark theme and light theme — because the app is
 * dark-default with a [data-theme="light"] override and visible defects can
 * be theme-specific (contrast, token gaps).
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const WORKER = { email: "dev.worker@local.test", password: "password" };
const MANAGER = { email: "dev.company@local.test", password: "password" };

type Theme = "dark" | "light";

async function loginAs(
  browser: Browser,
  creds: { email: string; password: string },
  theme: Theme,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // The app reads localStorage.theme in a head inline script and sets
  // documentElement.dataset.theme — seed it before any document loads.
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* storage may be unavailable in rare embeds — theme falls to dark */
    }
  }, theme);
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  // Dev-mode route compiles are slow on first hit — wait on DOM, not "load".
  await page.waitForURL(/\/dashboard/, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.dataset.theme ?? "dark"),
    )
    .toBe(theme);
  return page;
}

for (const theme of ["dark", "light"] as Theme[]) {
  test.describe(`Work Journal closed loop — ${theme} theme`, () => {
    test.skip(
      !HAS_TEST_SUPABASE,
      "SUPABASE_TEST_URL not configured — run via `pnpm e2e:local` against the local stack (docs/TESTING.md)",
    );

    test(`worker creates entry, manager sees and approves it (${theme})`, async ({
      browser,
    }, testInfo) => {
      // Dev-server first-compile of the dashboard/journal/inbox routes can
      // take tens of seconds each — give the full loop generous room.
      test.setTimeout(240_000);
      const entryText = `E2E plytelių klijavimas — ${theme} ${Date.now()}`;

      // ── Worker: log in, create a journal entry ────────────────────────
      const worker = await loginAs(browser, WORKER, theme);
      await worker.goto("/lt/dashboard/journal");
      // The composer renders only with an active worker engagement — its
      // absence means the fixtures are not applied, which we want to FAIL,
      // not skip.
      const textarea = worker.locator("#journal-composer textarea");
      await expect(textarea).toBeVisible({ timeout: 15_000 });
      await textarea.fill(entryText);
      await worker.getByTestId("journal-save-entry").click();
      await expect(worker.getByTestId("journal-saved-banner")).toBeVisible({
        timeout: 15_000,
      });
      await worker.goto("/lt/dashboard/journal");
      await expect(
        worker.getByTestId("journal-entries").getByText(entryText),
      ).toBeVisible();
      await worker.screenshot({
        path: testInfo.outputPath(`journal-${theme}.png`),
        fullPage: true,
      });

      // ── Manager: the entry is reviewable in the inbox ─────────────────
      const manager = await loginAs(browser, MANAGER, theme);
      await manager.goto("/lt/dashboard/inbox");
      const entryCard = manager
        .locator('li[data-testid^="inbox-entry-"]')
        .filter({ hasText: entryText });
      await expect(entryCard).toBeVisible({ timeout: 15_000 });

      // ── Manager: approve (a real human decision — §7) ─────────────────
      await entryCard
        .locator('button[data-testid^="journal-approve-entry-"]')
        .click();
      // Either the card shows its review result, or the route revalidates
      // and the now-confirmed entry leaves the reviewable list entirely —
      // both prove the decision landed.
      await expect
        .poll(
          async () => {
            if ((await entryCard.count()) === 0) return "left-inbox";
            const result = entryCard.locator(
              '[data-testid^="journal-review-result-"]',
            );
            return (await result.isVisible()) ? "result-shown" : "pending";
          },
          { timeout: 30_000 },
        )
        .not.toBe("pending");
      await manager.screenshot({
        path: testInfo.outputPath(`inbox-approved-${theme}.png`),
        fullPage: true,
      });

      // ── Worker: the approval is visible on the entry (ground truth) ───
      await worker.goto("/lt/dashboard/journal");
      const confirmedRow = worker
        .locator("#journal-entries li")
        .filter({ hasText: entryText });
      await expect(confirmedRow).toBeVisible();
      // The decision timeline on the entry must show the confirmed step —
      // colours never lie: this text appears only with a real approval row.
      await expect(confirmedRow).toContainText(/patvirtint/i, {
        timeout: 15_000,
      });
      await worker.screenshot({
        path: testInfo.outputPath(`journal-after-approve-${theme}.png`),
        fullPage: true,
      });

      await worker.context().close();
      await manager.context().close();
    });
  });
}
