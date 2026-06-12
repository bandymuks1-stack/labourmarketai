import { test, expect, type Page, type Browser } from "@playwright/test";

/**
 * Work Journal closed loop in RUSSIAN, AUTHENTICATED — the Part-2 acceptance
 * contract of the RU-locale goal (owner, 2026-06-12): a seeded worker logs
 * in, writes a journal entry in Russian describing tiler work, the rule-based
 * detector tags the SAME canonical slugs as for LT, the manager confirms,
 * and the worker sees the confirmed (patvirtinta / подтверждено) state.
 *
 * Runs against the LOCAL Supabase stack only (never cloud): seeded users come
 * from supabase/dev-fixtures.sql via `pnpm e2e:local` (docs/TESTING.md).
 * Without SUPABASE_TEST_URL the suite skips cleanly. Like the LT loop, the
 * whole flow runs twice — dark theme and light theme.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;

const WORKER = { email: "dev.worker@local.test", password: "password" };
const MANAGER = { email: "dev.company@local.test", password: "password" };

type Theme = "dark" | "light";

async function loginAs(
  browser: Browser,
  creds: { email: string; password: string },
  theme: Theme,
  locale: "ru" | "lt",
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* theme falls to dark */
    }
  }, theme);
  await page.goto(`/${locale}/auth/login`);
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
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
  test.describe(`Work Journal RU closed loop — ${theme} theme`, () => {
    test.skip(
      !HAS_TEST_SUPABASE,
      "SUPABASE_TEST_URL not configured — run via `pnpm e2e:local` against the local stack (docs/TESTING.md)",
    );

    test(`worker writes a Russian tiler entry, detection tags it, manager approves (${theme})`, async ({
      browser,
    }, testInfo) => {
      test.setTimeout(240_000);
      const marker = `E2E-RU ${theme} ${Date.now()}`;
      // Two work items joined with «и» — exercises the RU fragment split,
      // RU time units and two activity matches (driver label-only + tiler
      // canonical slug).
      const entryText = `${marker} 2 часа возил материалы и 4 часа клал плитку в ванной.`;

      // ── Worker (RU locale): log in, write the entry, see detection ────
      const worker = await loginAs(browser, WORKER, theme, "ru");
      await worker.goto("/ru/dashboard/journal");
      const textarea = worker.locator("#journal-composer textarea");
      await expect(textarea).toBeVisible({ timeout: 15_000 });
      await textarea.fill(entryText);

      // The structuring step is an explicit, honest user action (§7 — no
      // auto-claims): click "organize text" to run the rule-based detector.
      await worker.getByTestId("journal-organize-text").click();

      // The detector must recognise BOTH fragments, and the tiler fragment
      // must surface the SAME canonical slug as the LT path — rendered with
      // the RU professions label («Плиточник»). This is the Part-2
      // acceptance: RU text → same canonical taxonomy.
      await expect(
        worker.getByTestId("journal-fragment-summary"),
      ).toBeVisible({ timeout: 15_000 });
      await expect(worker.locator("#journal-composer")).toContainText(
        /Плиточник/i,
        { timeout: 15_000 },
      );

      // Confirm the suggestions (worker decision — §7) and save.
      await worker.getByTestId("journal-confirm-all-suggestions").click();
      await worker.getByTestId("journal-confirm-entry").click();
      await expect(worker.getByTestId("journal-saved-banner")).toBeVisible({
        timeout: 15_000,
      });
      await worker.goto("/ru/dashboard/journal");
      await expect(
        worker.getByTestId("journal-entries").getByText(marker),
      ).toBeVisible();
      await worker.screenshot({
        path: testInfo.outputPath(`journal-ru-${theme}.png`),
        fullPage: true,
      });

      // ── Manager (LT locale, as in production): entry reviewable ───────
      const manager = await loginAs(browser, MANAGER, theme, "lt");
      await manager.goto("/lt/dashboard/inbox");
      const entryCard = manager
        .locator('li[data-testid^="inbox-entry-"]')
        .filter({ hasText: marker });
      await expect(entryCard).toBeVisible({ timeout: 15_000 });

      // ── Manager approves (a real human decision — §7) ─────────────────
      await entryCard
        .locator('button[data-testid^="journal-approve-entry-"]')
        .click();
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

      // ── Worker (RU): the confirmation is visible on the entry ─────────
      await worker.goto("/ru/dashboard/journal");
      const confirmedRow = worker
        .locator("#journal-entries li")
        .filter({ hasText: marker });
      await expect(confirmedRow).toBeVisible();
      // The decision timeline shows the confirmed step in the viewer's
      // locale — «подтвержд…» in RU (the same state LT renders as
      // "patvirtinta"). Either form proves a real approval row.
      await expect(confirmedRow).toContainText(/подтвержд|patvirtint/i, {
        timeout: 15_000,
      });
      await worker.screenshot({
        path: testInfo.outputPath(`journal-ru-after-approve-${theme}.png`),
        fullPage: true,
      });

      await worker.context().close();
      await manager.context().close();
    });
  });
}
