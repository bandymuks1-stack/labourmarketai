import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION PROJECT EXECUTION — owner areas 5 (projects, objects, tasks) and
 * 7 (calendar, planning, hours): the rows the functional registry still holds
 * as IMPLEMENTED_UNVERIFIED or PARTIAL, walked as one company's real chain.
 *
 *   project → dates → stage → task → worker assigned → a clash kept knowingly
 *   (override receipt) → readiness → defect → handover note → budget line →
 *   a site's hours on the project board → the worker's own planner shows it →
 *   the operations report downloads, and nobody else can download it.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   owner    owns "QA-SYNTHETIC Alfa" — runs the chain
 *   worker   Vytas Darbininkas, employee of Alfa — the person assigned
 *   manager  runs "QA-SYNTHETIC Gama" — another organization, must read nothing
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=project-execution)
 * with minted sessions. Every write is what a person does in the browser; the
 * API calls READ with the caller's own token (own worker row, own projects, the
 * receipt the owner may read). Failure messages carry counts and states only.
 *
 * Idempotent: the two projects and the site have fixed synthetic names and are
 * reused; stages, tasks, defects and budget lines the run adds are removed or
 * closed at the end, and both assignments are ended, so a rerun starts clean.
 * The handover note (append-only by design) and the override receipt
 * (immutable by design, idempotent per assignment + clash) stay as evidence.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const PROJECT_A = "QA-SYNTHETIC vykdymo projektas";
const PROJECT_B = "QA-SYNTHETIC vykdymo projektas B";
const SITE_A = "QA-SYNTHETIC vykdymo objektas";
const MARK = `QA-SYNTHETIC ${RUN}`;
const WORKER_NAME = /Vytas/;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["worker", "owner", "manager", "agency"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = new Date();
/** The project window: today → +20 days, so the worker's forward-only agenda shows it. */
const START = iso(TODAY);
const END = iso(new Date(TODAY.getTime() + 20 * 86_400_000));

async function as(browser: Browser, slot: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { ctx, page: await ctx.newPage() };
}

/**
 * The page content, never the streaming holder. Dashboard pages stream through
 * a hidden `<div id="S:n">` whose reveal is rAF-driven; in a never-painting
 * headless tab that hidden copy sits outside <main> beside the rendered one,
 * so a bare testid fails strict mode at once and a count reads double
 * (project-execution 40081437313 E-11 `hours-worker-select`, and its cleanup
 * `toHaveCount(0)`; calendar-journal-history.spec.ts). Strict inside <main>
 * still fails if a page really renders something twice.
 */
const inMain = (page: Page): Locator => page.getByRole("main");

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

/** A page that rendered, for a person who is signed in, without an error boundary. */
async function rendered(page: Page, label: string): Promise<void> {
  expect(/\/auth\/(login|sign-?in)/.test(page.url()), `${label}: bounced to sign-in`).toBe(false);
  await expect(page.getByTestId("error-boundary-message"), `${label}: error boundary`).toHaveCount(0);
  await expect(page.getByTestId("global-error-message"), `${label}: global error`).toHaveCount(0);
}

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

/** The first number in a chip's text ("Paskirstyta: 1,5 val." → 1.5). */
function hoursIn(text: string): number {
  const m = text.split(":").slice(1).join(":").match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(",", ".")) : Number.NaN;
}

const ops = (id: string) => `/lt/dashboard/projects/${id}/operations`;
const assignmentRow = (page: Page, title: string): Locator =>
  page
    .getByTestId("project-assignments")
    .filter({ has: page.locator("p", { hasText: new RegExp(`^${title}(\\s·|$)`) }) })
    .first()
    .getByTestId("roster-worker-chip")
    .filter({ hasText: WORKER_NAME });

let workerId = "";
let workerProfileId = "";
let projectA = "";
let projectB = "";

test("E-0. the worker's own ids (own row, own token)", async () => {
  const token = bearerOf("worker");
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id,profile_id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, "own worker row answered").toBe(200);
  const rows = (await res.json()) as { id: string; profile_id: string }[];
  expect(rows.length, "exactly one own worker row").toBe(1);
  workerId = rows[0].id;
  workerProfileId = rows[0].profile_id;
});

test("E-1 (3.2). Alfa has its two walk projects — created through the project form when missing", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  for (const title of [PROJECT_A, PROJECT_B]) {
    if (await projectIdByTitle(title)) continue;
    await page.goto("/lt/dashboard/company/projects/new");
    await inMain(page).getByTestId("project-name-input").fill(title);
    await inMain(page).getByTestId("project-create-submit").click();
    const ok = inMain(page).getByTestId("project-context-created");
    const err = inMain(page).getByTestId("project-create-error");
    await expect(ok.or(err)).toBeVisible({ timeout: 30_000 });
    if (await err.isVisible()) throw new Error(`project not created: ${await err.getAttribute("data-code")}`);
  }
  projectA = (await projectIdByTitle(PROJECT_A)) ?? "";
  projectB = (await projectIdByTitle(PROJECT_B)) ?? "";
  expect(projectA, "project A exists").toMatch(/^[0-9a-f-]{36}$/);
  expect(projectB, "project B exists").toMatch(/^[0-9a-f-]{36}$/);
  await ctx.close();
});

test("E-2 (3.13). both projects get the same dates on their operations board", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  for (const id of [projectA, projectB]) {
    await page.goto(ops(id));
    await rendered(page, "operations");
    const form = inMain(page).getByTestId("ops-manage-facts-form");
    await expect(form, "facts form (a completed project is read-only)").toBeVisible({ timeout: 30_000 });
    await form.getByTestId("ops-manage-facts-start").fill(START);
    await form.getByTestId("ops-manage-facts-end").fill(END);
    await form.getByTestId("ops-manage-facts-save").click();
    await expect(inMain(page).getByTestId("ops-notice-updated")).toBeVisible({ timeout: 30_000 });
    await page.goto(ops(id));
    await expect(inMain(page).getByTestId("ops-centre-dates")).toContainText(START.slice(0, 4), { timeout: 30_000 });
  }
  await ctx.close();
});

const STAGE = `${MARK} etapas`;

test("E-3 (3.4). a stage is added to project A and its status persists", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto(ops(projectA));
  const panel = inMain(page).getByTestId("project-stages-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(inMain(page).getByTestId("project-stages-preapply")).toHaveCount(0);
  await panel.getByTestId("project-stage-name").fill(STAGE);
  await panel.getByTestId("project-stage-planned-start").fill(START);
  await panel.getByTestId("project-stage-planned-end").fill(END);
  await panel.getByTestId("project-stage-add").click();
  await expect(panel.getByTestId("project-stages-msg")).toBeVisible({ timeout: 30_000 });

  await page.goto(ops(projectA));
  const row = inMain(page).getByTestId("project-stage-row").filter({ hasText: STAGE });
  await expect(row, "the stage persists").toHaveCount(1, { timeout: 30_000 });
  await row.getByTestId("project-stage-status-select").selectOption("in_progress");
  await expect(inMain(page).getByTestId("project-stages-msg")).toBeVisible({ timeout: 30_000 });
  await page.goto(ops(projectA));
  await expect(
    inMain(page).getByTestId("project-stage-row").filter({ hasText: STAGE }).getByTestId("project-stage-status-select"),
    "the status change persists",
  ).toHaveValue("in_progress", { timeout: 30_000 });
  await ctx.close();
});

const TASK = `${MARK} užduotis`;

test("E-4 (3.5). a task on project A is created, started and completed", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto(`/lt/dashboard/tasks?project=${projectA}&create=1`);
  await expect(inMain(page).getByTestId("tasks-unavailable")).toHaveCount(0);
  const form = inMain(page).getByTestId("tasks-create");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.locator('input[name="title"]').fill(TASK);
  await inMain(page).getByTestId("tasks-create-submit").click();
  await expect(inMain(page).getByTestId("tasks-notice-created")).toBeVisible({ timeout: 30_000 });

  // THIS run's card, by its own title line. A card's text also holds the
  // "parent task" picker, whose <option>s list every other task of the
  // project — so `hasText: TASK` matched the OLDEST card that offers this
  // task as a parent (10-23 run 39968362991 started and completed the 10-22
  // task instead of its own; run 40051762490 then met that task done, with no
  // start control). Scoped to <main> (hidden streaming copy) and exactly one.
  const card = page
    .getByRole("main")
    .locator('[data-testid^="task-card-"]')
    .filter({ has: page.locator("p", { hasText: TASK }) });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await expect(card).toBeVisible();
  const taskId = ((await card.getAttribute("data-testid")) ?? "").replace(/^task-card-/, "");
  expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
  for (const action of ["start", "complete"]) {
    await inMain(page).getByTestId(`task-action-${action}-${taskId}`).click();
    await expect(inMain(page).getByTestId("tasks-notice-updated")).toBeVisible({ timeout: 30_000 });
  }
  // Done work leaves the open list; it is still there behind "closed".
  await page.goto(`/lt/dashboard/tasks?project=${projectA}`);
  const closed = inMain(page).getByTestId("tasks-closed-toggle");
  if (await closed.isVisible().catch(() => false)) await closed.click();
  // Scoped to <main> after a fresh load (hidden streaming copy, see org-roster).
  await expect(page.getByRole("main").getByTestId(`task-card-${taskId}`), "the completed task persists").toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

async function assign(page: Page, projectId: string): Promise<void> {
  await page.goto("/lt/dashboard/projects");
  const form = inMain(page).getByTestId("project-assign");
  await expect(form, "the assign form (owner sees the roster)").toBeVisible({ timeout: 30_000 });
  await form.locator('select[name="project_id"]').selectOption(projectId);
  await form.getByTestId("assign-worker-select").selectOption(workerProfileId);
  await form.locator("#assign-worker-submit").click();
}

test("E-5 (3.6). the worker is assigned to project A, and it persists", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await assign(page, projectA);
  await page.waitForTimeout(2_000);
  await page.goto("/lt/dashboard/projects");
  await expect(assignmentRow(page, PROJECT_A), "Vytas is on project A").toHaveCount(1, { timeout: 30_000 });
  await ctx.close();
});

test("E-6 (3.17). on project B the clash with A is shown, kept knowingly, and leaves a receipt", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await assign(page, projectB);
  // The pre-save check renders the SAME notice above the button (advisory, no
  // reason picker); the post-save notice is the one with the reason picker, so
  // that is the signal the assignment was written and the clash measured.
  const reason = inMain(page).getByTestId("assign-reservation-reason");
  const shown = await reason
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) {
    const collides = await inMain(page).getByTestId("assign-reservation-collides").count();
    const unknown = await inMain(page).getByTestId("assign-reservation-unknown").count();
    const done = await inMain(page).getByTestId("assign-worker-done").count();
    throw new Error(`no post-save clash notice on B (collides=${collides} unknown=${unknown} done=${done})`);
  }
  await expect(inMain(page).getByTestId("assign-reservation-collides").last()).toBeVisible();
  await reason.selectOption("agreed_with_worker");
  await inMain(page).getByTestId("assign-reservation-keep").last().click();
  const decided = inMain(page).getByTestId("assign-reservation-decided");
  const failed = inMain(page).getByTestId("assign-reservation-keep-failed");
  await expect(decided.or(failed)).toBeVisible({ timeout: 30_000 });
  expect(await failed.isVisible(), "the keep decision was recorded").toBe(false);

  // The receipt exists and the owner (who manages B) can read it.
  const res = await qaApi(
    `/rest/v1/commitment_override_receipts?select=id,reason_code&project_id=eq.${projectB}&worker_id=eq.${workerId}`,
    bearerOf("owner"),
  );
  expect(res.status, "receipts answered").toBe(200);
  const rows = (await res.json()) as { id: string; reason_code: string | null }[];
  expect(rows.length, "at least one override receipt on B for this worker").toBeGreaterThan(0);
  await ctx.close();
});

test("E-7 (3.9). the worker's readiness checklist on project A exists and persists", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto(ops(projectA));
  const card = inMain(page).getByTestId("ops-worker-card").filter({ hasText: WORKER_NAME }).first();
  await expect(card, "Vytas has a card on the board").toBeVisible({ timeout: 30_000 });
  const seed = card.getByTestId("ops-checklist-seed");
  if (await seed.isVisible().catch(() => false)) {
    await seed.click();
    await page.waitForTimeout(2_000);
  }
  await page.goto(ops(projectA));
  const items = page
    .getByTestId("ops-worker-card")
    .filter({ hasText: WORKER_NAME })
    .first()
    .getByTestId("ops-item-status-select");
  await expect.poll(() => items.count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(inMain(page).getByTestId("ops-centre-readiness")).toBeVisible();
  await ctx.close();
});

const DEFECT = `${MARK} defektas`;

test("E-8 (3.10). a defect is reported, acknowledged, and then removed", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto(ops(projectA));
  const panel = inMain(page).getByTestId("project-defects-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId("defects-preapply")).toHaveCount(0);
  await panel.getByTestId("defect-description").fill(DEFECT);
  await panel.getByTestId("defect-report").click();
  await expect(panel.getByTestId("defects-msg")).toBeVisible({ timeout: 30_000 });

  await page.goto(ops(projectA));
  const row = inMain(page).getByTestId("defect-row").filter({ hasText: DEFECT });
  await expect(row, "the defect persists").toHaveCount(1, { timeout: 30_000 });
  await row.getByTestId("defect-status").selectOption("acknowledged");
  await expect(inMain(page).getByTestId("defects-msg")).toBeVisible({ timeout: 30_000 });
  await page.goto(ops(projectA));
  await expect(inMain(page).getByTestId("defect-row").filter({ hasText: DEFECT }).getByTestId("defect-status")).toHaveValue(
    "acknowledged",
    { timeout: 30_000 },
  );
  // Cleanup: the walk's own defect leaves the project.
  await inMain(page).getByTestId("defect-row").filter({ hasText: DEFECT }).getByTestId("defect-delete").click();
  await page.waitForTimeout(2_000);
  await page.goto(ops(projectA));
  await expect(inMain(page).getByTestId("defect-row").filter({ hasText: DEFECT })).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("E-9 (3.11). a handover note is recorded on the passport and persists", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto(ops(projectA));
  const panel = inMain(page).getByTestId("handover-passport-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId("handover-passport-preapply")).toHaveCount(0);
  const type = panel.getByTestId("handover-entry-type");
  if (await type.isVisible().catch(() => false)) await type.selectOption("note");
  await panel.getByTestId("handover-entry-body").fill(`${MARK} perdavimo pastaba`);
  await panel.getByTestId("handover-entry-submit").click();
  await expect(panel.getByTestId("handover-passport-msg")).toBeVisible({ timeout: 30_000 });
  await page.goto(ops(projectA));
  await expect(inMain(page).getByTestId("handover-entries")).toContainText(MARK, { timeout: 30_000 });
  await ctx.close();
});

test("E-10 (3.12). a budget line gives the project a baseline, and is removed again", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto(ops(projectA));
  const panel = inMain(page).getByTestId("project-economics-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId("economics-preapply")).toHaveCount(0);
  await panel.getByTestId("economics-category").selectOption("materials");
  await panel.getByTestId("economics-amount").fill("100");
  await panel.getByTestId("economics-save").click();
  await expect(panel.getByTestId("economics-msg")).toBeVisible({ timeout: 30_000 });
  await page.goto(ops(projectA));
  await expect(inMain(page).getByTestId("economics-line").first(), "the line persists").toBeVisible({ timeout: 30_000 });
  await expect(inMain(page).getByTestId("economics-baseline")).toBeVisible();
  // The actual is the viewer-scoped ledger figure or says it is unknown — both
  // are honest; it must render.
  await expect(inMain(page).getByTestId("economics-actual")).toBeVisible();
  // Cleanup: every line on this synthetic project goes.
  for (let i = 0; i < 10 && (await inMain(page).getByTestId("economics-delete").count()) > 0; i++) {
    await inMain(page).getByTestId("economics-delete").first().click();
    await page.waitForTimeout(2_000);
    await page.goto(ops(projectA));
  }
  await expect(inMain(page).getByTestId("economics-line")).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("E-11 (3.3 / 2.23). a site of project A records the worker's hours, and the project board counts them", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);

  // The site, linked to project A (reused across runs).
  await page.goto("/lt/dashboard/projects#company-locations");
  const rowA = inMain(page).getByTestId("work-object-row").filter({ hasText: SITE_A });
  const form = inMain(page).getByTestId("work-object-add-form");
  await expect(form).toBeVisible({ timeout: 30_000 });
  if ((await rowA.count()) === 0) {
    await form.locator('input[name="name"]').fill(SITE_A);
    await form.locator('select[name="projectId"]').selectOption(projectA);
    await form.getByTestId("work-object-add-submit").click();
    await expect(inMain(page).getByTestId("work-object-row").filter({ hasText: SITE_A }).first()).toBeVisible({ timeout: 30_000 });
  }
  await expect(
    inMain(page).getByTestId("work-object-row").filter({ hasText: SITE_A }).first(),
    "the site names its project",
  ).toContainText(PROJECT_A);

  await page.goto(ops(projectA));
  const chip = inMain(page).getByTestId("ops-centre-hours-allocated");
  await expect(chip).toBeVisible({ timeout: 30_000 });
  const before = hoursIn(await chip.innerText());
  expect(Number.isFinite(before), "the board measured the organization's hours (not unavailable)").toBe(true);

  await page.goto("/lt/dashboard/hours");
  await inMain(page).getByTestId("hours-worker-select").selectOption(workerId);
  await inMain(page).getByTestId("hours-object-picker").locator('[data-testid^="hours-object-"]', { hasText: SITE_A }).first().click();
  await inMain(page).getByTestId("hours-input").fill("0.5");
  await inMain(page).getByTestId("hours-note").fill(`${MARK} projektas`);
  await inMain(page).getByTestId("hours-save").click();
  const saved = inMain(page).getByTestId("hours-saved");
  const error = inMain(page).getByTestId("hours-error");
  await expect(saved.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`hours not saved: ${await error.innerText()}`);

  await page.goto(ops(projectA));
  await expect
    .poll(async () => hoursIn(await inMain(page).getByTestId("ops-centre-hours-allocated").innerText()), { timeout: 30_000 })
    .toBeCloseTo(before + 0.5, 2);
  await ctx.close();
});

test("E-12 (5.11 / 3.14). the assigned worker sees project A on their own project page and planner", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  const res = await page.goto(`/lt/dashboard/projects/${projectA}`);
  expect(res?.status() ?? 0, "project page answered").toBeLessThan(500);
  await rendered(page, "worker project page");
  await expect(page.locator("body")).toContainText(PROJECT_A, { timeout: 30_000 });

  await page.goto("/lt/dashboard/planning?view=agenda");
  await rendered(page, "worker planner");
  await expect(
    page.locator(`[data-testid="planning-item-project:${projectA}"]`).first(),
    "the dated assignment is on the worker's agenda",
  ).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("E-13 (3.13). the operations report downloads for the owner and for nobody else", async ({ browser }) => {
  const url = `/lt/dashboard/projects/${projectA}/operations/report`;
  {
    const { ctx, page } = await as(browser, "owner");
    await useWorkspace(page, ALFA);
    await page.goto(ops(projectA));
    await expect(inMain(page).getByTestId("ops-csv-link")).toBeVisible({ timeout: 30_000 });
    const res = await ctx.request.get(url);
    expect(res.status(), "owner gets the report").toBe(200);
    expect(res.headers()["content-type"] ?? "").toMatch(/text\/csv/);
    expect(res.headers()["content-disposition"] ?? "").toMatch(/attachment; filename="operations-.+\.csv"/);
    const lines = (await res.text()).trimEnd().split("\r\n");
    expect(lines[0].startsWith("worker_name,"), "the header row").toBe(true);
    expect(lines.length, "at least the assigned worker's row").toBeGreaterThan(1);
    await ctx.close();
  }
  {
    // Another organization: the agency slot, which belongs to no Alfa
    // workspace. NOT the manager slot — qa.manager+multiw has been an active
    // MANAGER of Alfa since 2026-08-06 (multi-workspace cast), so its 200 was
    // a member reading its own organization (run 39968362991), not a leak.
    const { ctx } = await as(browser, "agency");
    const res = await ctx.request.get(url);
    expect([403, 404], `another organization is refused (got ${res.status()})`).toContain(res.status());
    await ctx.close();
  }
  {
    const ctx = await browser.newContext();
    const res = await ctx.request.get(url, { maxRedirects: 0 });
    expect([401, 302, 307], `an anonymous caller is refused (got ${res.status()})`).toContain(res.status());
    await ctx.close();
  }
});

/**
 * The run's own leftovers, through the owner's real controls: this run's stage
 * on project A, and the worker's assignments on both walk projects. Shared by
 * E-14 (which asserts it) and `afterAll` (which runs it when a red step
 * stopped the serial walk before E-14). Run 39968362991 stopped at E-13 and
 * left the worker on A and B; with three active projects every journal walk
 * of that worker is then asked "which project?" (`projectPromptFor` → ask),
 * which is how sectors-languages 40048799023 and journal-confirm 40069162731
 * went red on a question they did not answer.
 */
async function cleanUp(page: Page): Promise<void> {
  await useWorkspace(page, ALFA);
  if (projectA) {
    await page.goto(ops(projectA));
    const stage = inMain(page).getByTestId("project-stage-row").filter({ hasText: STAGE });
    if ((await stage.count()) > 0) {
      await stage.getByTestId("project-stage-delete").click();
      await page.waitForTimeout(2_000);
      await page.goto(ops(projectA));
    }
    await expect(inMain(page).getByTestId("project-stage-row").filter({ hasText: STAGE })).toHaveCount(0, { timeout: 30_000 });
  }

  for (const title of [PROJECT_B, PROJECT_A]) {
    await page.goto("/lt/dashboard/projects");
    const row = assignmentRow(page, title);
    if ((await row.count()) === 0) continue;
    await row.locator("button").last().click();
    await page.waitForTimeout(2_000);
  }
  await page.goto("/lt/dashboard/projects");
  for (const title of [PROJECT_A, PROJECT_B]) {
    await expect(assignmentRow(page, title), `Vytas is no longer on ${title === PROJECT_A ? "A" : "B"}`).toHaveCount(0, {
      timeout: 30_000,
    });
  }
}

let cleanedUp = false;

test("E-14. cleanup: the stage goes, the task stays closed, both assignments end", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await cleanUp(page);
  cleanedUp = true;
  await ctx.close();
});

// A red step stops a serial walk before E-14; the leftovers must still go
// (company-chain #2699 pattern). Own budget: the default 30 s hook timeout is
// less than one page round trip on a cold origin. Logged, never thrown over
// the result.
test.afterAll(async ({ browser }) => {
  if (cleanedUp || !ENABLED) return;
  test.setTimeout(180_000);
  const { ctx, page } = await as(browser, "owner");
  try {
    await cleanUp(page);
    console.info("[cleanup] stage and assignments: removed after a red step");
  } catch (e) {
    console.info(`[cleanup] stage and assignments: NOT removed (${(e as Error).message.split("\n")[0].slice(0, 160)})`);
  } finally {
    await ctx.close();
  }
});
