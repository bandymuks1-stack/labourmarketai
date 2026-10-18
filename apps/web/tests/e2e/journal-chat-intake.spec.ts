import { test, expect, type Page } from "@playwright/test";

import { chooseWorkContextIfAsked } from "./worklog-context";

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
  //
  // It WAITS FOR EACH STEP instead of sleeping a fixed 2 s. The old loop
  // read "no confirm prompt after 2 s" as "already saved" and stopped, so on
  // a loaded machine (the prompt arriving at 2.5 s) nothing was committed and
  // the read-back later failed as if the entry had been lost (isolated run
  // 2026-10-16: no row in journal_entries for that marker).
  const save = () => page.getByRole("button", { name: /^Išsaugoti$/ }).last();
  const confirmStep = page.getByText(/Patvirtinti įrašą/i);
  const done = page.locator('[data-testid="worklog-done"]');
  await save().click();
  await expect(confirmStep.or(done).first()).toBeVisible({ timeout: 30_000 });
  if (!(await done.isVisible())) await save().click();
  await expect(done, "the work-log save never reached its saved state").toBeVisible({
    timeout: 30_000,
  });
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
    // The form pins the entry to a context and, when the worker holds more
    // than one that legitimately fits, refuses to guess. Answer it.
    await chooseWorkContextIfAsked(page);
    await saveThroughConfirm(page);

    /**
     * Reopen the journal from scratch — a full server round trip, not the
     * optimistic client state that produced the save — ON THE DAY WORKED.
     *
     * The entry above is deliberately BACK-DATED to 2026-08-07 ("yesterday's
     * shift logged tonight" is the ordinary case). Since #2256 (owner launch
     * order 2026-10-10 §7) the journal's default view is ONE day — the most
     * recent one — and history is the calendar: pick a date, see that date.
     * A back-dated entry is therefore not in the DOM of the bare
     * `/dashboard/journal` at all whenever any newer day exists (the fixtures
     * hold 2026-08-14 and 2026-08-20). Asserting it there reported "real data
     * loss" while the row sat in `journal_entries`, unsuperseded — a stale
     * expectation, not a product defect.
     *
     * What the test means is asserted on the product's own day navigation:
     *   1. the text SURVIVED the round trip at all (no silent data loss), and
     *   2. it is genuinely REACHABLE and visible on the day it was worked.
     * Both are independent of which days the fixtures happen to hold.
     */
    await page.goto("/lt/dashboard/journal?date=2026-08-07");
    const saved = page.getByText(marker, { exact: false });
    await expect(
      saved,
      "the entry did not survive the reload at all — real data loss",
    ).toBeAttached({ timeout: 30_000 });

    await page.goto("/lt/dashboard/journal?date=2026-08-07#journal-entries");
    await expect(
      page.getByText(marker, { exact: false }),
      "the entry exists but is not reachable on the day it was worked",
    ).toBeVisible({ timeout: 30_000 });
  });
});
