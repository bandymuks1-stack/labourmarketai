import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION — TEAM UTILISATION AND PLANNED VS ACTUAL (registry rows 3.18 and
 * 3.19, register CAL-9 / CAL-10; no production walk before 2026-10-25).
 *
 *   3.18 Utilisation (U-*) — /dashboard/company/planning, `roster-utilisation`
 *        (lib/planning/roster-utilisation.ts over lib/workforce/utilisation.ts).
 *        WHAT IT REALLY MEASURES, and what this walk therefore proves: the
 *        share of COMMITTED calendar days of the next 28 ("{committed} of
 *        {counted} worker-days") for the people on the company's projects. It
 *        is deliberately NOT recorded-hours ÷ capacity: the product records no
 *        person-side contracted hours, so a percentage would be a number
 *        invented in code (the register's CAL-9 note). The walk proves the
 *        figure moves with a real commitment the owner makes in the browser,
 *        never renders a percentage, says in words that it is not an FTE
 *        figure, and that a person whose commitments cannot be read is
 *        "not the same as free" — never a fake 0 %.
 *   3.19 Planned vs actual (P-*) — /dashboard/projects/<id>/operations, the
 *        stage panel's CAL-10 reading (lib/projects/learned-stage-duration.ts):
 *        three stages are planned for five days and really run (in progress →
 *        done) through the browser, and the line under each reads "took N d.
 *        (median of 3) · planned 5" — planned is never shown as actual, and the
 *        gap stays visible. Below three finished stages the line is withheld
 *        (no "typical" from two). NOT in the product: planned HOURS (a work plan
 *        or rota window) against journal hours — the operations board shows
 *        allocated / journaled / confirmed hours, none of them planned.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   owner    owns "QA-SYNTHETIC Alfa" — makes the commitment, runs the stages
 *   worker   Vytas, employee of Alfa — the person committed; refused check
 *   agency   another organization — refused check (the manager slot is an
 *            active manager of Alfa, so it cannot be the outsider)
 *
 * WHAT STAYS. The walk reuses project-execution's fixed synthetic project
 * ("QA-SYNTHETIC vykdymo projektas", created through the project form only
 * when missing) and sets its dates to today → +20 d., as that walk does.
 * `afterAll`, pass or fail, deletes every stage named `QA-SYNTHETIC <run> …`
 * and ends Vytas's assignment to the project if THIS run made it (a left-over
 * assignment makes every journal walk ask "which project?"). Nothing else is
 * written. Logs carry states and counts only, never a figure or a name.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const PROJECT = "QA-SYNTHETIC vykdymo projektas";
const MARK = `QA-SYNTHETIC ${RUN}`;
/** One name for the three stages: CAL-10 learns per (case-folded) stage name. */
const STAGE = `${MARK} plano ir fakto etapas`;
const WORKER_NAME = /Vytas/;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["owner", "worker", "agency"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = new Date();
/** The project window — inside the 28-day utilisation window. */
const START = iso(TODAY);
const END = iso(new Date(TODAY.getTime() + 20 * DAY));
/** A five-day stage plan (inclusive calendar days). */
const PLAN_END = iso(new Date(TODAY.getTime() + 4 * DAY));

async function as(
  browser: Browser,
  slot: string,
  opts: { locale?: "lt-LT" | "en-GB"; phone?: boolean } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: opts.locale ?? "lt-LT",
    ...(opts.phone ? PHONE : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/** The page content, never the streaming holder (prod-company-chain.spec.ts, #2729). */
const inMain = (page: Page): Locator => page.getByRole("main");

async function rendered(page: Page, label: string): Promise<void> {
  expect(/\/auth\/(login|sign-?in)/.test(page.url()), `${label}: bounced to sign-in`).toBe(false);
  await expect(page.getByTestId("error-boundary-message"), `${label}: error boundary`).toHaveCount(0);
  await expect(page.getByTestId("global-error-message"), `${label}: global error`).toHaveCount(0);
}

async function fitsPhone(page: Page, label: string): Promise<void> {
  const { doc, body, inner } = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(Math.max(doc, body), `${label}: wider than the phone (innerWidth ${inner})`).toBeLessThanOrEqual(inner + 1);
}

/** Make `orgName` the active workspace through the real header chip. */
async function useWorkspace(page: Page, orgName: string): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

/** A FRESH document of `path` (a real reload when the tab is already on it). */
async function fresh(page: Page, path: string): Promise<void> {
  const already = (() => {
    try {
      return new URL(page.url()).pathname === path;
    } catch {
      return false;
    }
  })();
  await page.goto(path);
  if (already) await page.reload();
}

const firstLine = (e: unknown) => ((e as Error).message ?? String(e)).split("\n")[0].slice(0, 160);

/** The owner's own project id by its synthetic title (own token, RLS-scoped read). */
async function projectIdByTitle(title: string): Promise<string | null> {
  const res = await qaApi(
    `/rest/v1/projects?select=id&title=eq.${encodeURIComponent(title)}&order=created_at.asc&limit=1`,
    bearerOf("owner"),
  );
  expect(res.status, "own projects answered").toBe(200);
  const rows = (await res.json()) as { id: string }[];
  return rows[0]?.id ?? null;
}

const ops = (id: string, locale = "lt") => `/${locale}/dashboard/projects/${id}/operations`;
const assignmentRow = (page: Page): Locator =>
  inMain(page)
    .getByTestId("project-assignments")
    .filter({ has: page.locator("p", { hasText: new RegExp(`^${PROJECT}(\\s·|$)`) }) })
    .first()
    .getByTestId("roster-worker-chip")
    .filter({ hasText: WORKER_NAME });

let workerId = "";
let workerProfileId = "";
let projectId = "";
let assignedHere = false;

test("U-0. the worker's own ids (own row, own token) and Alfa's walk project", async ({ browser }) => {
  const token = bearerOf("worker");
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id,profile_id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, "own worker row answered").toBe(200);
  const rows = (await res.json()) as { id: string; profile_id: string }[];
  expect(rows.length, "exactly one own worker row").toBe(1);
  workerId = rows[0].id;
  workerProfileId = rows[0].profile_id;

  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  if (!(await projectIdByTitle(PROJECT))) {
    await page.goto("/lt/dashboard/company/projects/new");
    await inMain(page).getByTestId("project-name-input").fill(PROJECT);
    await inMain(page).getByTestId("project-create-submit").click();
    const ok = inMain(page).getByTestId("project-context-created");
    const err = inMain(page).getByTestId("project-create-error");
    await expect(ok.or(err)).toBeVisible({ timeout: 30_000 });
    if (await err.isVisible()) throw new Error(`project not created: ${await err.getAttribute("data-code")}`);
  }
  projectId = (await projectIdByTitle(PROJECT)) ?? "";
  expect(projectId, "the walk project exists").toMatch(/^[0-9a-f-]{36}$/);
  // Dated, so a commitment on it can be placed on the calendar (an undated
  // project makes a person "partial": counted only as a floor).
  await fresh(page, ops(projectId));
  await rendered(page, "operations");
  const form = inMain(page).getByTestId("ops-manage-facts-form");
  await expect(form, "facts form (a completed project is read-only)").toBeVisible({ timeout: 30_000 });
  await form.getByTestId("ops-manage-facts-start").fill(START);
  await form.getByTestId("ops-manage-facts-end").fill(END);
  await form.getByTestId("ops-manage-facts-save").click();
  await expect(inMain(page).getByTestId("ops-notice-updated")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

// ═══════════════════════════════════════════════════ 3.18 utilisation (U)

type Utilisation = { present: boolean; committed: number | null; counted: number | null; text: string };

/** The utilisation section as the reader sees it, in either locale. */
async function utilisation(page: Page, locale: "lt" | "en"): Promise<Utilisation> {
  await fresh(page, `/${locale}/dashboard/company/planning`);
  await rendered(page, `planning (${locale})`);
  await expect(inMain(page).getByTestId("workforce-planning-page").first()).toBeVisible({ timeout: 60_000 });
  const section = inMain(page).getByTestId("roster-utilisation");
  if ((await section.count()) === 0) return { present: false, committed: null, counted: null, text: "" };
  const text = (await section.innerText()).replace(/\s+/g, " ");
  // Never a percentage: there is no capacity denominator to divide by.
  expect(text, "utilisation never renders a percentage").not.toMatch(/\d\s*%/);
  expect(text, "the line says it is not an FTE figure").toMatch(
    locale === "lt" ? /Sutartų valandų nefiksuojame, todėl tai nėra etatų rodiklis/ : /this is not an FTE figure/,
  );
  const days = section.getByTestId("roster-utilisation-days");
  if ((await days.count()) === 0) {
    // Nobody could be counted: the honest line, never "0 of N".
    await expect(section.getByTestId("roster-utilisation-uncounted")).toBeVisible();
    return { present: true, committed: null, counted: null, text };
  }
  const line = (await days.innerText()).replace(/\s+/g, " ");
  const m = (locale === "lt" ? /Užimta (\d+) iš (\d+) žmogaus dienų/ : /(\d+) of (\d+) worker-days committed/).exec(line);
  expect(m, "the committed-days line reads as committed / counted").not.toBeNull();
  const committed = Number(m![1]);
  const counted = Number(m![2]);
  expect(committed, "committed never exceeds what was counted").toBeLessThanOrEqual(counted);
  // A person who could not be read is said to be unknown, "not the same as free".
  if ((await section.getByTestId("roster-utilisation-unknown").count()) > 0) {
    await expect(section.getByTestId("roster-utilisation-unknown")).toContainText(
      locale === "lt" ? "Tai nėra tas pat, kas laisva" : "That is not the same as free",
    );
  }
  return { present: true, committed, counted, text };
}

let before: Utilisation | null = null;
let after: Utilisation | null = null;

test("U-1 (3.18). the owner commits Vytas to the dated project; the committed days move on a fresh load", async ({ browser }) => {
  test.skip(!projectId, "U-0 did not find the walk project");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  before = await utilisation(page, "lt");
  console.info(`[utilisation] before: present=${before.present} measured=${before.committed !== null}`);
  // ACT: the real assign form (the same one project-execution walks).
  await fresh(page, "/lt/dashboard/projects");
  if ((await assignmentRow(page).count()) === 0) {
    const form = inMain(page).getByTestId("project-assign");
    await expect(form, "the assign form (owner sees the roster)").toBeVisible({ timeout: 30_000 });
    await form.locator('select[name="project_id"]').selectOption(projectId);
    await form.getByTestId("assign-worker-select").selectOption(workerProfileId);
    await form.locator("#assign-worker-submit").click();
    assignedHere = true;
    await expect.poll(async () => {
      await fresh(page, "/lt/dashboard/projects");
      return assignmentRow(page).count();
    }, { timeout: 45_000, intervals: [3_000] }).toBe(1);
  } else {
    console.info("[utilisation] Vytas was already on the walk project (a previous walk's assignment)");
  }
  after = await utilisation(page, "lt");
  expect(after.present, "with a person on a project the utilisation section answers").toBe(true);
  expect(after.committed, "a dated assignment is measured, not unknown").not.toBeNull();
  expect(after.committed!, "the committed worker-days include the new commitment").toBeGreaterThan(0);
  if (assignedHere && before.committed !== null && before.counted === after.counted) {
    expect(after.committed!, "a 21-day commitment never lowers the committed days").toBeGreaterThanOrEqual(before.committed);
  }
  // The person is on the planning page's own commitment list (unless that
  // list itself says it could not be read — then it says so, by name).
  if ((await inMain(page).getByTestId("roster-commitments-unavailable").count()) > 0) {
    console.info("[utilisation] the commitment list answered 'could not be read'");
  } else await expect(
    inMain(page).locator(`[data-testid="roster-commitment-${workerId}"], [data-testid="roster-commitment-${workerProfileId}"]`).first(),
    "Vytas's commitment is listed",
  ).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("U-2 (3.18). the same reading in English and on a phone", async ({ browser }) => {
  test.skip(!after?.present, "U-1 did not produce a reading");
  {
    const { ctx, page } = await as(browser, "owner", { locale: "en-GB" });
    const en = await utilisation(page, "en");
    expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
    expect(en.present).toBe(true);
    expect(en.committed, "the English line reads the same committed days").toBe(after!.committed);
    expect(en.counted).toBe(after!.counted);
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "owner", { phone: true });
    const lt = await utilisation(page, "lt");
    expect(lt.present).toBe(true);
    await expect(inMain(page).getByTestId("roster-utilisation")).toBeVisible();
    await fitsPhone(page, "planning with utilisation");
    await ctx.close();
  }
});

test("U-3 (3.18). REFUSED: the employee and another organization never read Alfa's utilisation", async ({ browser }) => {
  {
    const { ctx, page } = await as(browser, "worker");
    await page.goto("/lt/dashboard/company/planning");
    await expect(page.getByTestId("roster-utilisation"), "an employee has no company planning view").toHaveCount(0);
    await expect(page.locator(`[data-testid="roster-commitment-${workerId}"]`)).toHaveCount(0);
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "agency");
    await page.goto("/lt/dashboard/company/planning");
    await expect(
      page.locator(`[data-testid="roster-commitment-${workerId}"], [data-testid="roster-commitment-${workerProfileId}"]`),
      "another organization does not see Alfa's person",
    ).toHaveCount(0);
    await expect(page.locator(`[data-testid="roster-timeline-row-${workerId}"], [data-testid="roster-timeline-row-${workerProfileId}"]`)).toHaveCount(0);
    await ctx.close();
  }
});

// ═════════════════════════════════════════════ 3.19 planned vs actual (P)

const stageRows = (page: Page): Locator => inMain(page).getByTestId("project-stage-row").filter({ hasText: STAGE });
const withStatus = (page: Page, status: string): Locator =>
  stageRows(page).filter({ has: page.locator(`[data-testid="project-stage-status-badge"][data-status="${status}"]`) });

async function panel(page: Page, locale = "lt"): Promise<Locator> {
  await fresh(page, ops(projectId, locale));
  await rendered(page, `operations (${locale})`);
  const p = inMain(page).getByTestId("project-stages-panel");
  await expect(p).toBeVisible({ timeout: 30_000 });
  await expect(inMain(page).getByTestId("project-stages-preapply")).toHaveCount(0);
  return p;
}

/** Move the first stage of this run in `from` to `to` through its own select; persists across a fresh load. */
async function advance(page: Page, from: string, to: string): Promise<void> {
  await panel(page);
  const row = withStatus(page, from).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const doneBefore = await withStatus(page, to).count();
  await row.getByTestId("project-stage-status-select").selectOption(to);
  await expect(inMain(page).getByTestId("project-stages-msg")).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      await panel(page);
      return withStatus(page, to).count();
    }, { timeout: 45_000, intervals: [3_000] })
    .toBe(doneBefore + 1);
}

let stagesRun = 0;

test("P-1 (3.19). three stages are planned for five days, and each really runs — started, then finished", async ({ browser }) => {
  test.skip(!projectId, "U-0 did not find the walk project");
  test.setTimeout(480_000);
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  for (let i = 0; i < 3; i += 1) {
    const p = await panel(page);
    await p.getByTestId("project-stage-name").fill(STAGE);
    await p.getByTestId("project-stage-planned-start").fill(START);
    await p.getByTestId("project-stage-planned-end").fill(PLAN_END);
    await p.getByTestId("project-stage-add").click();
    await expect(p.getByTestId("project-stages-msg")).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => {
      await panel(page);
      return stageRows(page).count();
    }, { timeout: 45_000, intervals: [3_000] }).toBe(i + 1);
  }
  // The plan is the plan: every row shows its planned band, none of them a
  // learned line yet (no stage of this name has finished).
  await panel(page);
  await expect(stageRows(page)).toHaveCount(3);
  for (const row of await stageRows(page).all()) {
    await expect(row).toContainText(`${START} → ${PLAN_END}`);
    await expect(row.getByTestId("stage-learned-duration"), "no reading before any stage of this name finished").toHaveCount(0);
  }
  // ACT: each stage starts (actual start recorded) and finishes (actual end).
  for (let i = 0; i < 3; i += 1) {
    await advance(page, "planned", "in_progress");
    await advance(page, "in_progress", "done");
    stagesRun += 1;
    if (stagesRun === 2) {
      // Sparse evidence stays sparse: two finished stages give no "typical".
      await panel(page);
      await expect(stageRows(page).getByTestId("stage-learned-duration"), "no reading from two observations").toHaveCount(0);
    }
  }
  await ctx.close();
});

/** "took N d. (median of 3) · planned 5" — the actual and the plan side by side, never merged. */
function plannedVsActual(text: string, locale: "lt" | "en"): { actual: number; count: number; planned: number } {
  const re =
    locale === "lt"
      ? /truko (\d+) d\. \(mediana iš (\d+)\) · planuota (\d+)/
      : /took (\d+) days \(median of (\d+)\) · planned (\d+)/;
  const m = re.exec(text.replace(/\s+/g, " "));
  expect(m, `the ${locale} planned-vs-actual line reads actual, count and plan`).not.toBeNull();
  return { actual: Number(m![1]), count: Number(m![2]), planned: Number(m![3]) };
}

test("P-2 (3.19). on a fresh load each stage reads what it really took against what was planned — the gap shows", async ({ browser }) => {
  test.skip(stagesRun < 3, "P-1 did not finish three stages");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await panel(page);
  await expect(withStatus(page, "done")).toHaveCount(3);
  for (const row of await stageRows(page).all()) {
    const line = row.getByTestId("stage-learned-duration");
    await expect(line, "the planned-vs-actual reading renders beside the plan").toBeVisible({ timeout: 30_000 });
    const r = plannedVsActual(await line.innerText(), "lt");
    expect(r.count, "exactly this run's three finished stages").toBe(3);
    expect(r.planned, "the plan is the five planned days, not the actual").toBe(5);
    expect(r.actual, "the actual is the measured run (started and finished today)").toBeLessThan(r.planned);
    // The planned band is still shown as the plan, unchanged by the actual.
    await expect(row).toContainText(`${START} → ${PLAN_END}`);
  }
  await ctx.close();
});

test("P-3 (3.19). the same reading in English and on a phone", async ({ browser }) => {
  test.skip(stagesRun < 3, "P-1 did not finish three stages");
  {
    const { ctx, page } = await as(browser, "owner", { locale: "en-GB" });
    await panel(page, "en");
    expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
    const line = stageRows(page).first().getByTestId("stage-learned-duration");
    await expect(line).toBeVisible({ timeout: 30_000 });
    const r = plannedVsActual(await line.innerText(), "en");
    expect(r).toMatchObject({ count: 3, planned: 5 });
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "owner", { phone: true });
    await panel(page);
    await expect(stageRows(page).first().getByTestId("stage-learned-duration")).toBeVisible({ timeout: 30_000 });
    await fitsPhone(page, "operations board with the stage panel");
    await ctx.close();
  }
});

test("P-4 (3.19). REFUSED: another organization and the employee never read the board's planned vs actual", async ({ browser }) => {
  test.skip(!projectId, "U-0 did not find the walk project");
  {
    const { ctx, page } = await as(browser, "agency");
    await page.goto(ops(projectId));
    await expect(inMain(page).getByTestId("ops-not-authorized"), "another organization is refused the board").toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("stage-learned-duration")).toHaveCount(0);
    await expect(page.getByText(STAGE)).toHaveCount(0);
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "worker");
    await page.goto(ops(projectId));
    await expect(page.getByTestId("project-stages-panel"), "the employee is not given the manager's board").toHaveCount(0);
    await expect(page.getByTestId("stage-learned-duration")).toHaveCount(0);
    await ctx.close();
  }
});

// ══════════════════════════════════════════════════ cleanup, pass or fail

test.afterAll(async ({ browser }) => {
  test.setTimeout(300_000);
  if (!projectId) return;
  const { ctx, page } = await as(browser, "owner");
  try {
    await useWorkspace(page, ALFA);
    let removed = 0;
    for (let i = 0; i < 6; i += 1) {
      try {
        await panel(page);
        const row = stageRows(page).first();
        if ((await row.count()) === 0) break;
        await row.getByTestId("project-stage-delete").click();
        await expect(inMain(page).getByTestId("project-stages-msg")).toBeVisible({ timeout: 30_000 });
        removed += 1;
      } catch (e) {
        console.info(`[cleanup] stage delete did not complete: ${firstLine(e)}`);
        break;
      }
    }
    console.info(`[cleanup] stages removed=${removed}`);
    if (assignedHere) {
      try {
        await fresh(page, "/lt/dashboard/projects");
        const row = assignmentRow(page);
        if ((await row.count()) > 0) {
          await row.locator("button").last().click();
          await expect.poll(async () => {
            await fresh(page, "/lt/dashboard/projects");
            return assignmentRow(page).count();
          }, { timeout: 45_000, intervals: [3_000] }).toBe(0);
        }
        console.info("[cleanup] the assignment this run made was ended");
      } catch (e) {
        console.info(`[cleanup] assignment end did not complete: ${firstLine(e)}`);
      }
    }
  } finally {
    await ctx.close();
  }
});
