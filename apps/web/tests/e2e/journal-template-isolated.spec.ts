import { expect, test } from "@playwright/test";

import { BASE, isolatedStack, lit, onboard, signIn, signUp, sql, sqlExec, userId } from "./isolated-web-a-helpers";

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
 *       with the template's structure in it;
 *   T-4 the entry reaches the person's Living CV (/cv, under their own
 *       session): the CV's "Journal entries" figure counts it, and the CV
 *       does NOT present it as confirmed — no manager-confirmed entry, no
 *       confirmed-work line, no confirmation proof row. That is the product's
 *       honest shape, not a gap: an entry with no organization and no
 *       confirmation is the person's own declaration (decision 0023 evidence
 *       states; lib/profile/trust-signals.ts counts own live entries once per
 *       correction chain). It states no duration, so it adds no hours either
 *       (SEP-7: never an invented hour), which is why the walk reads the
 *       entry count and not the recorded-hours line.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const W = `template-worker-${RUN}@example.test`;
// No stated duration: the full form refuses to save an unconfirmed duration and
// opens its review step first (doctrine §7), which is not what this walk is about.
/**
 * The run id in the person's own words carries LETTERS ONLY. `Date.now()` in
 * base 36 often holds a digit run followed by a unit letter — "mi8e945h",
 * "mi8hk31u", "mi8khl3d" — which the journal's one time reader correctly
 * reads as 945 hours, 31 hours ("uur") or 3 days (measured: 10 of 400 ids).
 * The composer then stops the save until the person reviews that duration,
 * which was the "intermittent" T-3 refusal: a property of the synthetic id,
 * not of the product.
 */
const RUN_WORD = RUN.replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]!);
const OWN = `QA-SYNTHETIC template ${RUN_WORD}: tiled the bathroom floor`;
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
  await expect(text, "T-3: the person's own words are in the entry before the save").toHaveValue(`${filled}\n${OWN}`);
  // Intermittent in CI (2 of ~9 runs, 2026-11-19): the entry was never stored
  // and nothing said why, so the walk names the outcome itself (pattern S-7):
  // the saved banner, the composer's own error, or a document load that would
  // mean the form submitted without the app. The refusal it then named was the
  // run id read as a duration (see RUN_WORD above).
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 300)));
  const documentLoads: string[] = [];
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documentLoads.push(`${r.method()} ${r.url().replace(BASE, "")}`);
  });
  await main.getByTestId("journal-save-entry").first().click();
  const saved = main.getByTestId("journal-saved-banner");
  const saveError = main.getByTestId("journal-save-error");
  await expect(saved.or(saveError), "T-3: the save answers on the page").toBeVisible({ timeout: 30_000 }).catch(async (cause) => {
    throw new Error(
      `T-3: neither the saved banner nor an error appeared; document loads after the click: ${JSON.stringify(documentLoads)}; ` +
        `page errors: ${JSON.stringify(pageErrors)}; url: ${page.url().replace(BASE, "")}`,
      { cause },
    );
  });
  if (await saveError.isVisible()) throw new Error(`T-3: the composer refused the save: ${await saveError.innerText()}`);
  expect(documentLoads, "T-3: the save stays in the app (no form submission by the browser)").toEqual([]);
  expect(pageErrors, "T-3: the save raises no client error").toEqual([]);
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

test("T-4. the saved entry reaches the person's Living CV as their own recorded work, not as confirmed work", async ({ page }) => {
  await signIn(page, BASE, W);
  await page.goto(`${BASE}/en/cv`);
  // Scoped to <main>: streaming can leave a hidden duplicate outside it.
  const main = page.getByRole("main");
  await expect(main.getByTestId("cv-skills"), "the CV renders").toBeAttached({ timeout: 60_000 });
  // A brand-new CV draws no figures at all (three zeros would read as a
  // result); the tiles appear only because the entry now counts.
  const summary = main.getByTestId("cv-summary");
  await expect(summary, "T-4: the CV shows figures once the entry exists").toBeVisible({ timeout: 30_000 });
  const tile = (label: string) => summary.locator("div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) });
  await expect(tile("Journal entries").locator("dd"), "T-4: the CV counts the template entry").toHaveText("1");
  // The same figure the database holds: one live entry of this person.
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.journal_entries e join public.workers w on w.id = e.worker_id
        where w.profile_id = ${lit(await userId(W))} and e.superseded_by is null`,
    )[0]?.n,
    "T-4: the CV figure is the stored entry",
  ).toBe(1);
  // Declared, never promoted: nobody confirmed it, and the CV says so.
  await expect(tile("Manager-confirmed entries").locator("dd"), "T-4: not counted as confirmed").toHaveText("0");
  await expect(main.getByTestId("cv-confirmed-work"), "T-4: no confirmed-work line").toHaveCount(0);
  await expect(main.getByTestId("cv-proof").locator("table"), "T-4: no confirmation proof row").toHaveCount(0);
});
