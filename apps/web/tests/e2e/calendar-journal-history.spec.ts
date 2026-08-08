import { test, expect, type Page } from "@playwright/test";

/**
 * D-13 — A WORKER MUST BE ABLE TO SEE WHICH PAST DAYS THEY HAVE FILLED.
 *
 * The tester's primary calendar request was a calendar that shows which days
 * are filled. Three separate defects stood between them and that, and none of
 * them broke a single existing test:
 *
 *  1. THE READ ASKED THE WRONG COLUMN. The projection places an entry on its
 *     own `work_date`, but the query bounded on `created_at`. Logging Monday's
 *     shift on Friday is normal, and "I am filling in last month now" is what
 *     the Work Journal invites — so an entry worked in June and typed in August
 *     was never READ while looking at June. The day rendered empty. Nothing
 *     errored; the row simply was not in the result set.
 *  2. THE TWO SURFACES DISAGREED ABOUT THE DAY. The calendar moved to
 *     `work_date` while the journal page still grouped by `created_at`, so the
 *     journal's own "open in calendar" link pointed at a day the calendar had
 *     just moved the entry off.
 *  3. A COUNT CANNOT ANSWER THE QUESTION. A day with one booking and a day with
 *     one journal entry both rendered "1".
 *
 * WHY THIS SPEC IS SHAPED LIKE THIS. Every one of those could stay green under
 * a test that asserts a route renders, a key exists, or a component is mounted.
 * So this drives the real journey — write an entry for a real past day, then go
 * looking for it the way a person would — and asserts what the person must be
 * able to SEE.
 *
 * THE DATE IS DELIBERATELY TWO MONTHS BACK. One month back is not enough to
 * prove defect 1: a month grid runs Monday-to-Sunday across 6 weeks, so last
 * month's grid usually still overlaps today, and the old `created_at` bound
 * would have caught the row by accident. Two months back puts today outside the
 * visible range entirely, so the entry can ONLY appear if the read asks about
 * the day worked.
 *
 * Local stack only; skips cleanly without it.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;
const WORKER = { email: "dev.worker@local.test", password: "password" };

async function loginAsWorker(page: Page): Promise<void> {
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(WORKER.email);
  await page.locator('input[type="password"]').fill(WORKER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

/** The 15th of the month two months before today, as a plain UTC day. */
function pastWorkDay(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 15));
  return d.toISOString().slice(0, 10);
}

const composer = (page: Page) => page.getByPlaceholder(/Parašyk/i).first();
const dateField = (page: Page) => page.locator('input[type="date"]').first();

async function saveThroughConfirm(page: Page): Promise<void> {
  // preview -> explicit confirm: the first "Išsaugoti" shows "Patvirtinti
  // įrašą?", the second commits. Never auto-confirm in product code; the test
  // simply performs both human steps.
  for (let i = 0; i < 3; i++) {
    const save = page.getByRole("button", { name: /^Išsaugoti$/ }).last();
    if ((await save.count()) === 0) break;
    await save.click();
    await page.waitForTimeout(2_000);
    if ((await page.getByText(/Patvirtinti įrašą/i).count()) === 0) break;
  }
}

test.describe("Calendar — a past journal day is visible and reachable", () => {
  test.skip(!HAS_TEST_SUPABASE, "Needs the local Supabase stack (pnpm e2e:local).");
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("an entry logged for a past day is findable on the calendar and opens with its real content", async ({
    page,
  }) => {
    const workDay = pastWorkDay();
    const site = "Peleniskiai";
    const marker = `E2E-CAL-${Date.now()}`;

    await loginAsWorker(page);

    // ── record work FOR A PAST DAY (chat is the journal's only intake) ──────
    // Opened by ASKING, which is the path that carries the engagement context
    // the save needs. Arriving on `?intent=log-work` renders the same fields
    // but the first run of this spec produced no row at all from it — so the
    // journey is driven the way the working intake spec drives it, rather than
    // asserting against a flow that looks right and saves nothing.
    await page.goto("/lt/dashboard");
    await composer(page).fill("Užpildyk darbo žurnalą");
    await composer(page).press("Enter");
    await expect(dateField(page)).toBeVisible({ timeout: 30_000 });
    await dateField(page).fill(workDay);
    await page.locator('input[type="text"]').first().fill(site);
    await page.locator("textarea").first().fill(`Betonavau pamatus. ${marker}`);
    await saveThroughConfirm(page);

    // ── the month the work HAPPENED in — today is outside this grid ─────────
    await page.goto(`/lt/dashboard/planning?view=month&date=${workDay}`);
    await expect(page.locator('[data-testid="planning-month"]')).toBeVisible();

    // THE REGRESSION, DIRECTLY: the day carries a JOURNAL mark, not merely a
    // count. Before the fix the entry was not even read for this range.
    await expect(
      page.locator(`[data-testid="planning-month-journal-${workDay}"]`),
    ).toBeVisible();

    // The legend is what makes the mark mean something to a reader.
    await expect(page.locator('[data-testid="planning-month-legend"]')).toBeVisible();

    // ── open the day and read what was recorded ─────────────────────────────
    await page.locator(`[data-testid="planning-month-cell-${workDay}"]`).click();
    await page.waitForURL(new RegExp(`view=day.*date=${workDay}`), { timeout: 30_000 });
    const dayView = page.locator('[data-testid="planning-day-view"]');
    await expect(dayView).toBeVisible();
    await expect(dayView).toContainText(marker);
    // The real site name — this is the follow-up read that used to name a
    // column that does not exist and silently returned nothing.
    await expect(dayView).toContainText(site);

    // ── the same day survives a reload ──────────────────────────────────────
    await page.reload();
    await expect(page.locator('[data-testid="planning-day-view"]')).toContainText(
      marker,
    );

    // ── and the journal agrees about WHICH DAY it was ───────────────────────
    // The journal grouped by `created_at` while the calendar used `work_date`,
    // so its own day chip pointed at today and its "open in calendar" link
    // landed on an empty day. Both surfaces resolve the day the same way now.
    await page.goto(`/lt/dashboard/journal?date=${workDay}`);
    await expect(page.getByText(marker, { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.locator(`[data-testid="journal-day-nav-${workDay}"]`),
    ).toBeVisible();
  });

  test("the forward-only agenda offers a way into past days", async ({ page }) => {
    // The default view is forward-only by design, which left "which days have I
    // already filled?" unanswerable from the landing view — the note about
    // hidden past items was a dead end rather than a door.
    await loginAsWorker(page);
    await page.goto("/lt/dashboard/planning");
    const link = page.locator('[data-testid="planning-past-link"]');
    await expect(link).toBeVisible();

    // It is a real touch target, like every other control in this toolbar.
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await link.click();
    await page.waitForURL(/view=month/, { timeout: 30_000 });
    await expect(page.locator('[data-testid="planning-month"]')).toBeVisible();
  });

  test("every calendar toolbar control meets the 44px touch minimum", async ({
    page,
  }) => {
    // An external tester measured these at 36px. Measured in a REAL browser at
    // the real widths, not read off the source — a class can be present and
    // still be overridden by whatever wins the cascade.
    await loginAsWorker(page);

    for (const width of [320, 360, 375, 390, 412]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/lt/dashboard/planning?view=month");
      await expect(page.locator('[data-testid="planning-views"]')).toBeVisible();

      const tooSmall = await page.evaluate(() => {
        const bad: string[] = [];
        const sel = [
          '[data-testid="planning-views"] a',
          '[data-testid="planning-date-nav"] a',
          '[data-testid="planning-date-nav"] button',
          '[data-testid="planning-date-nav"] input[type="date"]',
          '[data-testid="planning-filters"] a',
        ].join(",");
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.height < 44) {
            bad.push(
              `${el.getAttribute("data-testid") ?? el.tagName}:${Math.round(r.height)}`,
            );
          }
        }
        return bad;
      });
      expect(tooSmall, `controls under 44px at ${width}px`).toEqual([]);

      // The page must not scroll sideways at any of these widths either.
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
