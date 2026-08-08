import { test, expect, type Page } from "@playwright/test";

/**
 * THE WORK JOURNAL MUST BE FILLABLE — the journey a real external tester could
 * not complete (mobile, Lithuanian, 2026-08-08).
 *
 * What the tester reported:
 *   "Po to darbų žurnalo negaliu pildyti paspaudus pildyti išmeta į pirmą
 *    puslapį."  (I can't fill the work journal — pressing fill throws me to
 *    the first page.)
 *   and, in chat: "O žurnalo neužpildysi?" → the assistant asked which day and
 *   how long they worked, and asking again returned the identical sentence.
 *
 * The two halves are one defect. `/dashboard/journal` deliberately has NO
 * composer (chat-first intake, owner audit §6.1), so its "record work" CTA
 * navigates to the chat — and the chat answered every journal REQUEST with the
 * clarify question, because a request carries no date and no hours and
 * `extractWorkLog` reports `hasSignal: false`. Chat is the journal's only
 * intake, so the journal could not be filled at all.
 *
 * WHY THESE ASSERTIONS AND NOT A STRING CHECK. Every earlier journal guard in
 * this repo could stay green while this bug was live: they assert that files,
 * keys and call sites exist. This spec asserts the two things the user needs —
 * that a REAL INPUT appears in response to a request, and that what was typed
 * is still there after a reload. Neither can pass while the clarify-loop is
 * back.
 *
 * Local stack only (dev fixtures + `pnpm e2e:local`), skips cleanly without it.
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

/** The chat composer — the only always-present text control on /dashboard. */
function composer(page: Page) {
  return page.getByPlaceholder(/Parašyk/i).first();
}

/** The work-log flow is OPEN when its date field is on screen. A sentence of
 *  assistant text is not the flow; this is the discriminator. */
function workLogDateField(page: Page) {
  return page.locator('input[type="date"]').first();
}

async function saveThroughConfirm(page: Page): Promise<void> {
  // preview -> explicit confirm: the first "Išsaugoti" shows "Patvirtinti
  // įrašą?", the second commits. Never auto-confirm in product code; the
  // test simply performs both human steps.
  for (let i = 0; i < 3; i++) {
    const save = page.getByRole("button", { name: /^Išsaugoti$/ }).last();
    if ((await save.count()) === 0) break;
    await save.click();
    await page.waitForTimeout(2_000);
    const stillConfirming = await page
      .getByText(/Patvirtinti įrašą/i)
      .count();
    if (stillConfirming === 0) break;
  }
}

test.describe("Work Journal — chat-first intake actually accepts an entry", () => {
  test.skip(
    !HAS_TEST_SUPABASE,
    "Needs the local Supabase stack (pnpm e2e:local).",
  );

  test("a journal REQUEST opens the work-log flow instead of re-asking", async ({
    page,
  }) => {
    await loginAsWorker(page);
    await page.goto("/lt/dashboard");
    await composer(page).fill("O žurnalo neužpildysi?");
    await composer(page).press("Enter");

    // THE regression: a real, fillable input must appear. Before the fix the
    // only response was the sentence "Kurią dieną ir kiek laiko dirbai?".
    await expect(workLogDateField(page)).toBeVisible({ timeout: 30_000 });
  });

  test("rephrasing the request does not return the same clarify sentence", async ({
    page,
  }) => {
    await loginAsWorker(page);
    await page.goto("/lt/dashboard");
    for (const phrase of ["Užpildyk darbo žurnalą", "įrašyk į darbo žurnalą"]) {
      await composer(page).fill(phrase);
      await composer(page).press("Enter");
      await expect(workLogDateField(page)).toBeVisible({ timeout: 30_000 });
    }
  });

  test("the journal page's own CTA lands IN the work-log flow, not on the greeting", async ({
    page,
  }) => {
    await loginAsWorker(page);
    await page.goto("/lt/dashboard/journal");
    await page.locator('[data-testid="journal-log-via-chat-cta"]').click();
    await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
    // Arriving on a generic greeting with no journal affordance is what the
    // tester experienced as being thrown back to the first page.
    await expect(workLogDateField(page)).toBeVisible({ timeout: 30_000 });
  });

  test("what the worker typed survives a reload (no silent data loss)", async ({
    page,
  }) => {
    const marker = `E2E-JOURNAL-${Date.now()}`;
    await loginAsWorker(page);
    await page.goto("/lt/dashboard");
    await composer(page).fill("Užpildyk darbo žurnalą");
    await composer(page).press("Enter");
    await expect(workLogDateField(page)).toBeVisible({ timeout: 30_000 });

    await workLogDateField(page).fill("2026-08-07");
    await page.locator('input[type="text"]').first().fill("Peleniškiai");
    await page
      .locator("textarea")
      .first()
      .fill(`Betonavau pamatus. ${marker}`);
    await saveThroughConfirm(page);

    // Reopen the journal from scratch — a full server round trip, not the
    // optimistic client state that produced the save.
    await page.goto("/lt/dashboard/journal");
    await expect(page.getByText(marker, { exact: false })).toBeVisible({
      timeout: 30_000,
    });
  });
});
