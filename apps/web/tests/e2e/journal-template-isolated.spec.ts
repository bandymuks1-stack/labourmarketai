import { expect, test } from "@playwright/test";

import { BASE, isolatedStack, lit, onboard, signUp, sql, sqlExec, userId } from "./isolated-web-a-helpers";

/**
 * Register 2.36: a profession journal template prefills a worker's entry,
 * and the entry is saved as the worker's own (decision 0006,
 * lib/journal/journal-templates.ts), on the THROWAWAY local stack of
 * .github/workflows/signup-isolated.yml. Synthetic person only.
 *
 * The three seeded templates ship INACTIVE (migration 20260714180000), and
 * turning one on in production is the owner's decision. Here, in a database
 * that dies with the job, the one seeded step turns `construction_daily` on;
 * everything after is the product's own composer:
 *   T-1 the full composer offers the template inside "more options";
 *   T-2 choosing it puts the template's lines in the entry text, in the
 *       person's language, without saving anything;
 *   T-3 the person adds their own words and saves; the stored entry is theirs,
 *       with the template's structure in it.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const W = `template-worker-${RUN}@example.test`;
// No stated duration: the full form refuses to save an unconfirmed duration and
// opens its review step first (doctrine §7), which is not what this walk is about.
const OWN = `QA-SYNTHETIC template ${RUN}: tiled the bathroom floor`;
const SCAFFOLD_EN = ["Site / object:", "Work performed:", "Hours:"];

test("T-1..T-3. the full composer offers an active template, it prefills the entry, and the person saves it as their own", async ({ page }) => {
  await signUp(page, BASE, W);
  await onboard(page, "work", "Synthetic Template Worker");
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  const me = await userId(W);
  sqlExec(`update public.journal_profession_templates set active = true where slug = 'construction_daily'`);

  await page.goto(`${BASE}/en/dashboard/journal?compose=full`);
  const main = page.getByRole("main");
  await expect(main.getByTestId("journal-compose-full"), "the full composer is open").toBeVisible({ timeout: 60_000 });
  const more = main.getByTestId("journal-more-options");
  await expect(more).toBeAttached({ timeout: 30_000 });
  await more.locator(":scope > summary").click();
  await expect(more).toHaveAttribute("open", "");
  const option = more.getByTestId("journal-template-construction_daily");
  await expect(option, "T-1: the active template is offered").toBeVisible({ timeout: 30_000 });

  const text = main.getByTestId("journal-compose-full").locator("textarea").first();
  await expect(text).toBeVisible();
  const before = await text.inputValue();
  await option.click();
  await expect
    .poll(async () => (await text.inputValue()).length, { message: "T-2: the template prefilled the entry" })
    .toBeGreaterThan(before.length);
  const filled = await text.inputValue();
  for (const line of SCAFFOLD_EN) expect(filled, `T-2: "${line}" in the person's language`).toContain(line);
  expect(
    sql<{ n: number }>(`select count(*)::int as n from public.journal_entries e join public.workers w on w.id = e.worker_id where w.profile_id = ${lit(me)}`)[0]?.n,
    "T-2: choosing a template saves nothing",
  ).toBe(0);

  await text.fill(`${filled}\n${OWN}`);
  await main.getByTestId("journal-save-entry").first().click();
  await expect
    .poll(
      () =>
        sql<{ text: string }>(
          `select e.original_text as text from public.journal_entries e join public.workers w on w.id = e.worker_id
            where w.profile_id = ${lit(me)} and e.superseded_by is null`,
        ).map((r) => r.text),
      { message: "T-3: the entry is stored", timeout: 60_000 },
    )
    .toEqual([expect.stringContaining("Work performed:")]);
});
