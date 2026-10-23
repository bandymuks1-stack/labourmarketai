import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "./prod-walk";

/**
 * PRODUCTION ROTA / SHIFT-PATTERN WALK (CAL-8, PR #2709) — the "Repeat"
 * controls of the ONE work plan form, used the way an employer uses them:
 *
 *   1. plan a WEEKLY rota (Mon / Wed / Fri for two weeks) for a roster worker;
 *   2. plan an N-ON / M-OFF rotation (2 on, 1 off for six days) for the SAME
 *      worker over the same first week — it lands on two of the weekly shift
 *      days, so the product must WARN (`planned_collides`) and still SAVE it
 *      (SEP-2: a collision is information, never a block);
 *   3. a fresh session still lists both plans with the stated pattern;
 *   4. the worker's own calendar shows the projected shift days — and only
 *      those: rest days carry no band — with the two rotas flagged where they
 *      meet;
 *   5. the employer cancels both through the plan list's own cancel control
 *      and the worker's calendar is empty of them again.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=rota-repeat) with
 * the synthetic cast:
 *   owner   qa.owner+multiw   — owns QA-SYNTHETIC Alfa, plans the rotas
 *   worker  qa.worker+multiw  — Vytas Darbininkas, employee of QA-SYNTHETIC Alfa
 *
 * Every write goes through the product's form and server actions; nothing is
 * seeded. Each plan's note carries the run id. Cancel is the product's own
 * path (a status change — the plan store never deletes, by design), and an
 * afterAll sweep cancels anything this run created if a step failed first.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN} rota`;
const NOTE_WEEKLY = `${TAG} savaitine`;
const NOTE_CYCLE = `${TAG} rotacija`;
/** Any rota-walk plan, of this or an interrupted earlier run. */
const ANY_ROTA_WALK = /QA-SYNTHETIC \S+ rota/;
const ALFA = "QA-SYNTHETIC Alfa";
const WORKER_NAME = /Vytas Darbininkas/;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

// The product's own Lithuanian copy, read from the locale file, so the walk
// asserts the words a person sees without a second copy of them.
const LT = JSON.parse(readFileSync(resolve(__dirname, "../../messages/lt.json"), "utf8")) as {
  workPlan: { outcome: Record<string, string>; repeat: Record<string, string> };
};

function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The first Monday at least 35 days ahead: the two-week rota ends by day 54,
 *  inside the plan list's 60-day horizon and away from the leave walk's days. */
function firstMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 35);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const M = firstMonday();
const day = (n: number) => plusDays(M, n);

// WEEKLY: Mon / Wed / Fri, M .. M+13 → shift days M, M+2, M+4, M+7, M+9, M+11.
const WEEKLY_END = day(13);
const WEEKLY_SHIFT = [0, 2, 4, 7, 9, 11];
// CYCLE: 2 on / 1 off from M (offset 0), M .. M+5 → runs [M, M+1] and [M+3, M+4].
// It meets the weekly rota on M and M+4 — the collision this walk provokes.
const CYCLE_END = day(5);
const CYCLE_RUN_STARTS = [0, 3];
const CYCLE_DAYS = [0, 1, 3, 4];

/** The weekday names the product prints (platform Intl, the route locale). */
function ltWeekdays(days: number[]): string {
  const fmt = new Intl.DateTimeFormat("lt", { weekday: "short", timeZone: "UTC" });
  return days.map((d) => fmt.format(new Date(Date.UTC(2024, 0, d)))).join(", ");
}
const WEEKLY_SUMMARY = LT.workPlan.repeat.summaryWeekly.replace("{days}", ltWeekdays([1, 3, 5]));
const CYCLE_SUMMARY = LT.workPlan.repeat.summaryCycle.replace("{on}", "2").replace("{off}", "1");

/** Plan ids this run created and has not yet cancelled. */
const created = new Map<string, string>(); // note → entry id

async function as(browser: Browser, slot: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function workspace(page: Page, orgName: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

async function openPlanning(page: Page): Promise<void> {
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/planning#work-plan");
  await expect(page.getByTestId("work-plan-section")).toBeVisible({ timeout: 30_000 });
}

const entryFor = (page: Page, note: string | RegExp) =>
  page.getByTestId("work-plan-entry").filter({ hasText: note });

/** Cancel every listed plan matching `note` through the list's own control. */
async function cancelAll(page: Page, note: string | RegExp): Promise<void> {
  for (let i = 0; i < 12 && (await entryFor(page, note).count()) > 0; i += 1) {
    const entry = entryFor(page, note).first();
    const id = ((await entry.getAttribute("id")) ?? "").replace(/^work-plan-/, "");
    await entry.getByTestId("work-plan-cancel").click();
    await expect(page.getByTestId("work-plan-notice")).toHaveAttribute("data-outcome", "cancelled", { timeout: 30_000 });
    for (const [k, v] of created) if (v === id) created.delete(k);
  }
  await expect(entryFor(page, note)).toHaveCount(0);
}

/**
 * Fill the plan form for the synthetic worker and choose a repeat mode. The
 * repeat radios are React state, so a click before hydration is lost: click
 * until the mode's own fields appear, then fill the rest.
 */
async function fillPlan(
  page: Page,
  opts: { start: string; end: string; note: string; mode: "weekly" | "cycle" },
): Promise<void> {
  const form = page.getByTestId("work-plan-form");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("work-plan-repeat"), "the Repeat controls are offered (CAL-8 provisioned)").toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const dependent = opts.mode === "weekly" ? page.getByTestId("work-plan-weekday-1") : page.getByTestId("work-plan-cycle-on");
  for (let i = 0; i < 10 && !(await dependent.isVisible()); i += 1) {
    // Via "none" each time: a radio a pre-hydration click already ticked fires
    // no change event on a second click, so React would never see the mode.
    await page.getByTestId("work-plan-repeat-none").click();
    await page.getByTestId(`work-plan-repeat-${opts.mode}`).click();
    await page.waitForTimeout(1_000);
  }
  await expect(dependent).toBeVisible();

  const worker = page.getByTestId("work-plan-worker");
  const value = await worker.locator("option", { hasText: WORKER_NAME }).first().getAttribute("value");
  expect(value, "Vytas is plannable in Alfa").toBeTruthy();
  await worker.selectOption(value!);
  await page.getByTestId("work-plan-start").fill(opts.start);
  await page.getByTestId("work-plan-end").fill(opts.end);
  await form.locator('input[name="start_time"]').fill("07:00");
  await form.locator('input[name="end_time"]').fill("15:00");
  await form.locator('input[name="note"]').fill(opts.note);

  if (opts.mode === "weekly") {
    // Monday–Friday are ticked by default; a Mon / Wed / Fri rota unticks Tue and Thu.
    await page.getByTestId("work-plan-weekday-2").uncheck();
    await page.getByTestId("work-plan-weekday-4").uncheck();
    for (const d of [1, 3, 5]) await expect(page.getByTestId(`work-plan-weekday-${d}`)).toBeChecked();
    for (const d of [2, 4, 6, 7]) await expect(page.getByTestId(`work-plan-weekday-${d}`)).not.toBeChecked();
  } else {
    await page.getByTestId("work-plan-cycle-on").fill("2");
    await page.getByTestId("work-plan-cycle-off").fill("1");
    await page.getByTestId("work-plan-cycle-offset").fill("0");
  }
  await expect(page.getByTestId(`work-plan-repeat-${opts.mode}`)).toBeChecked();
}

/** Submit, read the outcome notice, and capture the new entry's id. */
async function submitPlan(page: Page, note: string): Promise<string> {
  await page.getByTestId("work-plan-submit").click();
  const notice = page.getByTestId("work-plan-notice");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  const outcome = (await notice.getAttribute("data-outcome")) ?? "";
  console.info(`[rota] ${note}: outcome=${outcome} notice="${(await notice.innerText()).trim()}"`);
  return outcome;
}

async function captureEntry(page: Page, note: string): Promise<string> {
  const entry = entryFor(page, note);
  await expect(entry).toHaveCount(1, { timeout: 30_000 });
  const id = ((await entry.getAttribute("id")) ?? "").replace(/^work-plan-/, "");
  expect(id, "the saved plan has an id").toMatch(/^[0-9a-f-]{36}$/i);
  created.set(note, id);
  return id;
}

test.afterAll(async ({ browser }) => {
  // Safety net only: the last step cancels through the UI and empties `created`.
  if (!ENABLED || created.size === 0) return;
  const { page, close } = await as(browser, "owner");
  try {
    await openPlanning(page);
    await cancelAll(page, TAG);
    console.info(`[rota] afterAll cleanup ran; left uncancelled: ${created.size}`);
  } finally {
    await close();
  }
});

test("1. the employer plans a weekly Mon/Wed/Fri rota for two weeks", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  try {
    await openPlanning(page);
    // A rota-walk plan left behind by an interrupted earlier run is cancelled
    // first, through the same control, so it cannot pose as this run's rows.
    await cancelAll(page, ANY_ROTA_WALK);

    await fillPlan(page, { start: M, end: WEEKLY_END, note: NOTE_WEEKLY, mode: "weekly" });
    const outcome = await submitPlan(page, NOTE_WEEKLY);
    // The worker's other real commitments in production decide clear vs collides;
    // either way the plan is saved and the outcome is one of the saved ones.
    expect(["planned", "planned_collides", "planned_unknown"]).toContain(outcome);
    const id = await captureEntry(page, NOTE_WEEKLY);
    const entry = entryFor(page, NOTE_WEEKLY);
    await expect(entry.getByTestId("work-plan-pattern")).toHaveText(WEEKLY_SUMMARY);
    await expect(entry.getByTestId("work-plan-planned-badge")).toBeVisible();
    console.info(`[rota] weekly ${M}..${WEEKLY_END} id-suffix=${id.slice(-4)} pattern="${WEEKLY_SUMMARY}"`);
  } finally {
    await close();
  }
});

test("2. a 2-on/1-off rotation on the same worker collides — the product warns and still saves it", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  try {
    await openPlanning(page);
    await fillPlan(page, { start: M, end: CYCLE_END, note: NOTE_CYCLE, mode: "cycle" });
    const outcome = await submitPlan(page, NOTE_CYCLE);
    const notice = page.getByTestId("work-plan-notice");
    // The collision is a WARNING (role=status, warning copy), never a refusal.
    expect.soft(outcome, "the overlap with the weekly rota on its shift days is reported").toBe("planned_collides");
    await expect.soft(notice).toHaveText(LT.workPlan.outcome.planned_collides);
    await expect.soft(notice).toHaveAttribute("role", "status");
    // …and the plan is SAVED despite it.
    const id = await captureEntry(page, NOTE_CYCLE);
    await expect(entryFor(page, NOTE_CYCLE).getByTestId("work-plan-pattern")).toHaveText(CYCLE_SUMMARY);
    // The earlier weekly rota is untouched by the second save.
    await expect(entryFor(page, NOTE_WEEKLY)).toHaveCount(1);
    console.info(`[rota] cycle ${M}..${CYCLE_END} id-suffix=${id.slice(-4)} pattern="${CYCLE_SUMMARY}"`);
  } finally {
    await close();
  }
});

test("3. a fresh session after reload still lists both rotas with their stated pattern", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  try {
    await openPlanning(page);
    await page.reload();
    await expect(page.getByTestId("work-plan-list")).toBeVisible({ timeout: 30_000 });
    for (const [note, summary] of [
      [NOTE_WEEKLY, WEEKLY_SUMMARY],
      [NOTE_CYCLE, CYCLE_SUMMARY],
    ] as const) {
      const entry = entryFor(page, note);
      await expect(entry).toHaveCount(1);
      expect(((await entry.getAttribute("id")) ?? "").replace(/^work-plan-/, "")).toBe(created.get(note));
      await expect(entry.getByTestId("work-plan-pattern")).toHaveText(summary);
      await expect(entry).toContainText("07:00–15:00");
    }
  } finally {
    await close();
  }
});

test("4. the worker's calendar shows the shift days — and nothing on rest days", async ({ browser }) => {
  const W = created.get(NOTE_WEEKLY);
  const C = created.get(NOTE_CYCLE);
  expect(W && C, "both rotas were saved in steps 1–2").toBeTruthy();
  const { page, close } = await as(browser, "worker");
  try {
    for (const weekStart of [0, 7]) {
      await page.goto(`/lt/dashboard/planning?view=week&date=${day(weekStart)}`);
      await expect(page.getByTestId("planning-week-days")).toBeVisible({ timeout: 30_000 });
      for (let n = weekStart; n < weekStart + 7; n += 1) {
        const d = day(n);
        const cell = page.getByTestId(`planning-week-day-${d}`);
        await expect(cell, `day ${d} is drawn`).toBeVisible();
        const weekly = cell.locator(`[data-testid^="planning-week-plan-plan:${W}:"]`);
        const cycle = cell.locator(`[data-testid^="planning-week-plan-plan:${C}:"]`);
        if (WEEKLY_SHIFT.includes(n)) {
          // A weekly shift day is its own one-day run, keyed by its own date.
          await expect(cell.getByTestId(`planning-week-plan-plan:${W}:${d}`), `weekly shift on ${d}`).toBeVisible();
        } else {
          await expect(weekly, `no weekly band on rest day ${d}`).toHaveCount(0);
        }
        if (CYCLE_DAYS.includes(n)) {
          const runStart = day(CYCLE_RUN_STARTS.filter((s) => s <= n).at(-1)!);
          await expect(cell.getByTestId(`planning-week-plan-plan:${C}:${runStart}`), `rotation shift on ${d}`).toBeVisible();
        } else {
          await expect(cycle, `no rotation band on rest day ${d}`).toHaveCount(0);
        }
        // Where the two rotas meet, the calendar flags the clash on both bands.
        if (WEEKLY_SHIFT.includes(n) && CYCLE_DAYS.includes(n)) {
          const runStart = day(CYCLE_RUN_STARTS.filter((s) => s <= n).at(-1)!);
          await expect(cell.getByTestId(`planning-conflict-plan:${W}:${d}`), `clash flagged on ${d}`).toBeVisible();
          await expect(cell.getByTestId(`planning-conflict-plan:${C}:${runStart}`)).toBeVisible();
        }
      }
    }
    console.info(
      `[rota] calendar: weekly on ${WEEKLY_SHIFT.map(day).join(",")}; rotation on ${CYCLE_DAYS.map(day).join(",")}; clash on ${day(0)},${day(4)}`,
    );
  } finally {
    await close();
  }
});

test("5. the employer cancels both rotas and the worker's calendar is clear of them", async ({ browser }) => {
  const W = created.get(NOTE_WEEKLY);
  const C = created.get(NOTE_CYCLE);
  const owner = await as(browser, "owner");
  try {
    await openPlanning(owner.page);
    await cancelAll(owner.page, TAG);
    expect(created.size, "every plan this run created is cancelled").toBe(0);
  } finally {
    await owner.close();
  }

  const worker = await as(browser, "worker");
  try {
    await worker.page.goto(`/lt/dashboard/planning?view=week&date=${M}`);
    await expect(worker.page.getByTestId("planning-week-days")).toBeVisible({ timeout: 30_000 });
    await expect(worker.page.locator(`[data-testid^="planning-week-plan-plan:${W}:"]`)).toHaveCount(0);
    await expect(worker.page.locator(`[data-testid^="planning-week-plan-plan:${C}:"]`)).toHaveCount(0);
  } finally {
    await worker.close();
  }
});
