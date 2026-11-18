import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { PROD_QA_MANAGER_EMAIL } from "../../lib/testing/prod-qa-guard";

/**
 * PRODUCTION — A COMPANY'S GOVERNANCE REGISTERS (registry rows that had no
 * production walk, 2026-10-25). Every step is what a person does in the
 * browser; every assertion is what they see after a fresh load.
 *
 *   3.25 Management decisions + reviews — Alfa's owner opens a decision, puts
 *        a draft right, sends it to the management team through Alfa's own
 *        approval template, the approver approves it in the approvals inbox,
 *        and the owner records what was decided; read back in Russian and on
 *        a phone. An employee and another organization see none of it (D-*).
 *   11.8 Training & certification register — Alfa's owner adds a course and
 *        assigns it to its employee; the employee completes it on the phone;
 *        the owner sees it completed; another organization and an unassigned
 *        worker see none of it; the course is retired (T-*).
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   owner    qa.owner+multiw   — owns "QA-SYNTHETIC Alfa" (also the approver:
 *                                Alfa's template asks an owner/admin)
 *   worker   qa.worker+multiw  — engaged by Alfa, NOT a member: the decisions
 *                                "employee sees none of it" check (D-*)
 *   worker2  qa.worker+goal3   — not assigned (forbidden check)
 *   manager  qa.manager+multiw — runs "QA-SYNTHETIC Gama" (forbidden checks) and is
 *                                an active MANAGER member of Alfa: the trainee.
 *                                `assign_training_v1` assigns only active members
 *                                of the course's organization; an engagement is
 *                                not a membership (run 40296167812: invalid_assignee).
 *
 * WHAT STAYS. Neither register deletes: a decision is a governance record
 * (this run's ends "recorded", tagged `QA-SYNTHETIC <run>`), and a course is
 * retired, never removed (its assignment stays as the employee's history).
 * `afterAll`, pass or fail, withdraws a decision request still waiting in the
 * approvals chain and retires every still-active course labelled
 * `QA-SYNTHETIC kursas`. Failure messages carry states and notices only.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const ALFA = "QA-SYNTHETIC Alfa";
const GAMA = "QA-SYNTHETIC Gama";
const TAG = `QA-SYNTHETIC ${RUN}`;
/** Alfa's published approval template — the same one prod-documents-approvals keeps. */
// Its OWN template: decisions offer only `management_decision` templates
// (lib/decisions/decisions.ts), and prod-documents-approvals keeps a
// `generic_request` template under the old shared name (run 40195373623 D-2).
const TEMPLATE = "QA-SYNTHETIC sprendimų patvirtinimas";
const DECISION = `${TAG} sprendimas dėl įrankių`;
const DECISION_EDITED = `${TAG} sprendimas dėl įrankių nuomos`;
const RESULT = `${TAG}: nuomojamės, ne perkame`;
const COURSE_PREFIX = "QA-SYNTHETIC kursas";
const COURSE = `${COURSE_PREFIX} ${RUN}`;
const BETA = "QA-SYNTHETIC Beta";
/** T-4b: the synthetic register document whose file becomes the certificate (archived in afterAll). */
const CERT_DOC = `${TAG} kurso pažymėjimas`;
/** A minimal one-page PDF: the certificate file, synthetic. */
const CERT_PDF = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
    "",
  ].join(String.fromCharCode(10)),
);
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["owner", "worker", "worker2", "manager"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(
  browser: Browser,
  slot: string,
  opts: { locale?: "lt-LT" | "ru-RU"; phone?: boolean } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: opts.locale ?? "lt-LT",
    ...(opts.phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
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

/**
 * Submit a native server-action form and wait for its redirect notice, so a
 * reload never races the write. Only the notices in `ok` pass; anything else
 * fails the step by its name.
 */
async function act(page: Page, control: Locator, param: string, ok: readonly string[]): Promise<string> {
  await control.click();
  // "commit": the notice is in the address as soon as the redirect lands; the
  // page behind it is re-read by the next step anyway.
  await page.waitForURL(new RegExp(`[?&]${param}=`), { timeout: 60_000, waitUntil: "commit" });
  const notice = new URL(page.url()).searchParams.get(param) ?? "";
  expect(ok, `the ${param} action answered "${notice}"`).toContain(notice);
  return notice;
}

const firstLine = (e: unknown) => ((e as Error).message ?? String(e)).split("\n")[0].slice(0, 160);
const dayFromToday = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// ═════════════════════════════════════════════ 3.25 management decisions (D)

/** Alfa's decisions section (Alfa is the active workspace). */
async function decisions(page: Page, locale = "lt"): Promise<Locator> {
  await page.goto(`/${locale}/dashboard/network?area=decisions`);
  await rendered(page, `decisions (${locale})`);
  const section = inMain(page).getByTestId("management-decisions");
  await expect(section, "the decisions area answers").toBeVisible({ timeout: 30_000 });
  return section;
}

const decisionRow = (section: Locator) => section.getByTestId("decision-row").filter({ hasText: RUN });

let decisionCreated = false;
let decisionSubmitted = false;
let decisionApproved = false;

test("D-1 (3.25). Alfa's owner opens a decision and puts the draft right", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  let section = await decisions(page);
  test.skip(
    (await section.getByTestId("decisions-not-available").count()) > 0,
    "the management-decisions layer is not installed in production (honest absence)",
  );
  // ACT: the create form (the one whose agenda is required; draft edits are not).
  const create = section.locator("form").filter({ has: page.locator('textarea[name="agenda"][required]') }).first();
  await create.locator('input[name="title"]').fill(DECISION);
  await create.locator('textarea[name="agenda"]').fill(`${TAG}: ar pirkti ar nuomotis pastolius objektui? Sintetinis sprendimas.`);
  await create.locator('input[name="deadline"]').fill(dayFromToday(14));
  await act(page, create.getByRole("button"), "dec", ["created"]);
  decisionCreated = true;
  section = await decisions(page);
  await expect(decisionRow(section), "exactly one decision of this run").toHaveCount(1, { timeout: 30_000 });
  await expect(decisionRow(section)).toContainText(DECISION);
  // ACT: correct the draft's title through its own edit form.
  const edit = decisionRow(section).getByTestId("decision-edit");
  await edit.locator("summary").click();
  await edit.locator('input[name="title"]').fill(DECISION_EDITED);
  await act(page, edit.getByTestId("decision-edit-save"), "dec", ["updated"]);
  section = await decisions(page);
  await expect(decisionRow(section), "the corrected title persists").toContainText(DECISION_EDITED, { timeout: 30_000 });
  await ctx.close();
});

/** Alfa keeps a published approval template (created once, like prod-documents-approvals A-1). */
async function ensureTemplate(page: Page): Promise<void> {
  await page.goto("/lt/dashboard/network?area=approvals");
  await expect(inMain(page).getByTestId("approvals-admin")).toBeVisible({ timeout: 30_000 });
  let template = page.locator('[data-testid^="approvals-template-"]', { hasText: TEMPLATE }).first();
  if (!(await template.isVisible().catch(() => false))) {
    console.info("[decisions] creating the synthetic approval template once");
    const create = inMain(page).getByTestId("approvals-create-template");
    await create.locator("summary").click();
    const org = create.locator('select[name="organizationId"]');
    const value = await org.locator("option", { hasText: ALFA }).first().getAttribute("value");
    expect(value, "Alfa is one of the organizations the owner governs").toBeTruthy();
    await org.selectOption(value!);
    await create.locator('select[name="contextEntityType"]').selectOption("management_decision");
    await create.locator('input[name="name"]').fill(TEMPLATE);
    await create.locator('input[name="step1Name"]').fill("QA-SYNTHETIC vadovo patvirtinimas");
    await act(page, inMain(page).getByTestId("approvals-create-template-submit"), "wf", ["created", "already_exists"]);
    await page.goto("/lt/dashboard/network?area=approvals");
    template = page.locator('[data-testid^="approvals-template-"]', { hasText: TEMPLATE }).first();
    await expect(template).toBeVisible({ timeout: 30_000 });
  }
  const publish = template.locator('[data-testid^="approvals-publish-"]');
  if (await publish.isVisible().catch(() => false)) {
    await publish.click();
    await page.waitForURL(/[?&]wf=/, { timeout: 30_000 });
  }
}

test("D-2 (3.25). the owner sends the decision to the management team through Alfa's approval template", async ({ browser }) => {
  test.skip(!decisionCreated, "D-1 did not open this run's decision");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await ensureTemplate(page);
  const section = await decisions(page);
  const row = decisionRow(section);
  const select = row.locator('select[name="definitionId"]');
  await expect(select, "the draft offers Alfa's approval templates").toBeVisible({ timeout: 30_000 });
  const value = await select.locator("option", { hasText: TEMPLATE }).first().getAttribute("value");
  expect(value, "Alfa's template is offered").toBeTruthy();
  await select.selectOption(value!);
  const submit = row.locator("form").filter({ has: page.locator('select[name="definitionId"]') }).getByRole("button");
  await act(page, submit, "dec", ["submitted"]);
  decisionSubmitted = true;
  // Persistence: the decision is no longer a draft (no edit, no submit form).
  const again = decisionRow(await decisions(page));
  await expect(again.getByTestId("decision-edit")).toHaveCount(0, { timeout: 30_000 });
  await expect(again.locator('select[name="definitionId"]')).toHaveCount(0);
  await ctx.close();
});

test("D-3 (3.25). the approver approves it in the approvals inbox; the decision reads approved", async ({ browser }) => {
  test.skip(!decisionSubmitted, "D-2 did not submit the decision");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/network?area=approvals");
  const item = inMain(page).locator('[data-testid^="approvals-inbox-"]', { hasText: DECISION_EDITED }).first();
  await expect(item, "the decision reached the approver's inbox").toBeVisible({ timeout: 30_000 });
  const instanceId = ((await item.getAttribute("data-testid")) ?? "").replace(/^approvals-inbox-/, "");
  expect(instanceId).toMatch(/^[0-9a-f-]{36}$/);
  await act(page, item.getByTestId(`approvals-approve-${instanceId}`), "wf", ["approved"]);
  decisionApproved = true;
  // The register reads the chain's truth on its next load: the result form opens.
  await expect
    .poll(
      async () => decisionRow(await decisions(page)).locator('textarea[name="decisionResult"]').count(),
      { timeout: 45_000, intervals: [3_000] },
    )
    .toBe(1);
  await ctx.close();
});

test("D-4 (3.25). the owner records what was decided; it persists, in Russian and on the phone", async ({ browser }) => {
  test.skip(!decisionApproved, "D-3 did not approve the decision");
  {
    const { ctx, page } = await as(browser, "owner");
    await useWorkspace(page, ALFA);
    const row = decisionRow(await decisions(page));
    await row.locator('textarea[name="decisionResult"]').fill(RESULT);
    await act(page, row.locator("form").filter({ has: page.locator('textarea[name="decisionResult"]') }).getByRole("button"), "dec", [
      "recorded",
    ]);
    await expect(decisionRow(await decisions(page)).getByTestId("decision-result")).toContainText(RESULT, { timeout: 30_000 });
    await ctx.close();
  }
  {
    // Locale pass: the same record, read in Russian.
    const { ctx, page } = await as(browser, "owner", { locale: "ru-RU" });
    const section = await decisions(page, "ru");
    expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("ru");
    await expect(decisionRow(section).getByTestId("decision-result")).toContainText(RESULT, { timeout: 30_000 });
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "owner", { phone: true });
    const section = await decisions(page);
    await expect(decisionRow(section).getByTestId("decision-result")).toBeVisible({ timeout: 30_000 });
    await fitsPhone(page, "decisions");
    await ctx.close();
  }
});

test("D-5 (3.25). an employee and another organization see none of Alfa's decisions", async ({ browser }) => {
  test.skip(!decisionCreated, "D-1 did not open this run's decision");
  const seesNothing = async (page: Page, slot: string) => {
    await page.goto("/lt/dashboard/network?area=decisions");
    await rendered(page, `decisions (${slot})`);
    await expect(page.getByTestId("decision-row").filter({ hasText: RUN }), `${slot} sees no row of Alfa's decision`).toHaveCount(0);
    await expect(page.getByText(RESULT)).toHaveCount(0);
  };
  {
    // Alfa's own employee: a decision is the management's record, not the staff's.
    const { ctx, page } = await as(browser, "worker");
    await seesNothing(page, "worker");
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "manager");
    await useWorkspace(page, GAMA);
    await seesNothing(page, "manager (Gama)");
    await ctx.close();
  }
});

// ═══════════════════════════════════════ 11.8 training & certification (T)

/** The documents page's training register (the active workspace's). */
async function register(page: Page): Promise<Locator> {
  await page.goto("/lt/dashboard/documents#training");
  await rendered(page, "documents");
  const reg = inMain(page).getByTestId("training-register");
  await expect(reg, "the training register answers").toBeVisible({ timeout: 30_000 });
  return reg;
}

const programRow = (reg: Locator, title: string) => reg.getByTestId("training-program-row").filter({ hasText: title });

let courseCreated = false;
let courseAssigned = false;
let courseCompleted = false;
let certDocCreated = false;
let certificateAttached = false;

test("T-1 (11.8). Alfa's owner adds a course to the organization's register", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  let reg = await register(page);
  test.skip((await reg.getByTestId("training-not-available").count()) > 0, "the training layer is not installed in production (honest absence)");
  const org = reg.getByTestId("training-org");
  // The add-a-course form follows the reader's AUTHORITY
  // (`getTrainingAuthority()` — the predicates create_training_program_v1
  // enforces), so the owner sees it even on an empty register.
  await expect(org, "the organization half of the register, with its add-a-course form").toBeVisible({ timeout: 30_000 });
  const create = org.locator("form").filter({ hasNot: page.locator('input[name="programId"]') }).first();
  await create.locator('input[name="title"]').fill(COURSE);
  await create.locator('textarea[name="description"]').fill(`${TAG}: sintetinis darbų saugos kursas.`);
  await act(page, create.getByRole("button"), "trn", ["created"]);
  courseCreated = true;
  reg = await register(page);
  await expect(programRow(reg, COURSE), "the course persists, once").toHaveCount(1, { timeout: 30_000 });
  await expect(programRow(reg, COURSE).getByTestId("training-program-retired")).toHaveCount(0);
  await ctx.close();
});

test("T-2 (11.8). the owner assigns the course to Alfa's employee with a due date", async ({ browser }) => {
  test.skip(!courseCreated, "T-1 did not add the course");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const row = programRow(await register(page), COURSE);
  const assign = row.locator("form").filter({ has: page.locator('input[name="assigneeEmail"]') });
  await assign.locator('input[name="assigneeEmail"]').fill(PROD_QA_MANAGER_EMAIL);
  await assign.locator('input[name="requiredBy"]').fill(dayFromToday(14));
  await act(page, assign.getByRole("button"), "trn", ["assigned", "already_assigned"]);
  courseAssigned = true;
  const managed = (await register(page)).getByTestId("training-managed-row").filter({ hasText: COURSE });
  await expect(managed, "the assignment is in the organization's register").toHaveCount(1, { timeout: 30_000 });
  await expect(managed).toContainText("Reikia atlikti");
  await ctx.close();
});

test("T-3 (11.8). the employee completes the course on the phone; it persists", async ({ browser }) => {
  test.skip(!courseAssigned, "T-2 did not assign the course");
  const { ctx, page } = await as(browser, "manager", { phone: true });
  await useWorkspace(page, ALFA);
  let mine = (await register(page)).getByTestId("training-mine-row").filter({ hasText: COURSE });
  await expect(mine, "the employee sees what they were asked to complete").toHaveCount(1, { timeout: 30_000 });
  await fitsPhone(page, "documents with the training register");
  await mine.locator('input[name="note"]').fill(`${TAG}: perskaičiau ir atlikau.`);
  await act(page, mine.getByRole("button"), "trn", ["completed", "already_completed"]);
  courseCompleted = true;
  mine = (await register(page)).getByTestId("training-mine-row").filter({ hasText: COURSE });
  await expect(mine).toContainText("Atlikta", { timeout: 30_000 });
  await expect(mine.locator('input[name="note"]'), "a completed course offers no second completion").toHaveCount(0);
  await ctx.close();
});

test("T-4 (11.8). the owner sees the course completed", async ({ browser }) => {
  test.skip(!courseCompleted, "T-3 did not complete the course");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const managed = (await register(page)).getByTestId("training-managed-row").filter({ hasText: COURSE });
  await expect(managed).toContainText("Atlikta", { timeout: 30_000 });
  await ctx.close();
});

test("T-4b (11.8). the owner attaches the certificate by picking a file from Alfa's own register, never typing an id", async ({ browser }) => {
  test.skip(!courseCompleted, "T-3 did not complete the course");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  // A synthetic register document with a file: the only kind the picker offers.
  await page.goto("/lt/dashboard/documents#org-register");
  const create = inMain(page).getByTestId("org-documents-create");
  await expect(create).toBeVisible({ timeout: 30_000 });
  await create.locator("summary").click();
  await create.locator('select[name="typeSlug"]').selectOption("org_instruction");
  await create.locator('[name="title"]').fill(CERT_DOC);
  await act(page, inMain(page).getByTestId("org-documents-create-submit"), "docNotice", ["created"]);
  certDocCreated = true;
  await page.goto(`/lt/dashboard/documents?regQ=${encodeURIComponent(RUN)}#org-register`);
  const doc = inMain(page).getByTestId("org-document-row").filter({ hasText: CERT_DOC });
  await expect(doc, "this run's document, once").toHaveCount(1, { timeout: 30_000 });
  await doc.locator('input[type="file"][name="file"]').setInputFiles({ name: "QA-SYNTHETIC-pazymejimas.pdf", mimeType: "application/pdf", buffer: CERT_PDF });
  await act(page, doc.getByTestId("org-document-upload-submit"), "docNotice", ["uploaded"]);

  // #3442: the completed row's attach form offers a SELECT of register files.
  const managed = (await register(page)).getByTestId("training-managed-row").filter({ hasText: COURSE });
  const form = managed.getByTestId("training-attach-form");
  await expect(form, "a completed course without a certificate offers the attach form").toBeVisible({ timeout: 30_000 });
  await expect(form.locator('input[name="documentFileId"]'), "no free-text id field").toHaveCount(0);
  const picker = form.getByTestId("training-certificate-file");
  await expect(picker).toHaveAttribute("name", "documentFileId");
  expect(await picker.evaluate((el) => el.tagName), "the certificate file is picked from a list").toBe("SELECT");
  await expect(picker).toBeEnabled();
  const options = await picker.locator("option").evaluateAll((os) =>
    (os as HTMLOptionElement[]).filter((o) => o.value).map((o) => ({ v: o.value, t: o.textContent ?? "" })),
  );
  const mine = options.find((o) => o.t.includes(CERT_DOC));
  expect(mine, "the register's file is offered, labelled by its document").toBeTruthy();
  await picker.selectOption(mine!.v);
  await form.locator('input[name="issuedOn"]').fill(dayFromToday(0));
  await act(page, form.getByRole("button"), "trn", ["attached"]);
  certificateAttached = true;
  const certs = (await register(page)).getByTestId("training-certificates");
  await expect(certs.getByTestId("training-certificate-row").filter({ hasText: COURSE }), "the certificate is in Alfa's register").toHaveCount(1, { timeout: 30_000 });
  console.info(`[training] 11.8: certificate attached from the register (${options.length} file option(s))`);
  await ctx.close();
});

test("T-4c (11.8). the certificate list follows the active workspace: Alfa's certificate never shows in Beta", async ({ browser }) => {
  test.skip(!certificateAttached, "T-4b did not attach the certificate");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await expect((await register(page)).getByTestId("training-certificate-row").filter({ hasText: COURSE }), "in Alfa: listed").toHaveCount(1, { timeout: 30_000 });
  await useWorkspace(page, BETA);
  await page.goto("/lt/dashboard/documents#training");
  await rendered(page, "documents (Beta)");
  await expect(page.getByTestId("training-certificate-row").filter({ hasText: COURSE }), "in Beta: Alfa's certificate is not listed").toHaveCount(0);
  await expect(page.getByTestId("training-managed-row").filter({ hasText: COURSE })).toHaveCount(0);
  console.info("[training] 11.8: certificate scoped to the active workspace (Alfa 1, Beta 0)");
  await ctx.close();
});

test("T-5 (11.8). another organization and an unassigned worker see none of Alfa's course", async ({ browser }) => {
  test.skip(!courseCreated, "T-1 did not add the course");
  {
    const { ctx, page } = await as(browser, "manager");
    await useWorkspace(page, GAMA);
    await page.goto("/lt/dashboard/documents#training");
    await rendered(page, "documents (Gama)");
    await expect(page.getByTestId("training-program-row").filter({ hasText: COURSE }), "Gama does not see Alfa's course").toHaveCount(0);
    await expect(page.getByTestId("training-managed-row").filter({ hasText: COURSE })).toHaveCount(0);
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "worker2");
    await page.goto("/lt/dashboard/documents#training");
    await rendered(page, "documents (worker2)");
    await expect(page.getByTestId("training-mine-row").filter({ hasText: COURSE }), "the course was assigned to one person").toHaveCount(0);
    await ctx.close();
  }
});

/** Retire every still-active course whose title carries `marker`; returns how many. */
async function retireCourses(page: Page, marker: string): Promise<number> {
  let retired = 0;
  for (let i = 0; i < 10; i += 1) {
    const reg = await register(page);
    const active = reg
      .getByTestId("training-program-row")
      .filter({ hasText: marker })
      .filter({ hasNot: page.getByTestId("training-program-retired") })
      .first();
    if ((await active.count()) === 0) break;
    const edit = active.getByTestId("training-program-edit");
    await edit.locator("summary").click();
    await edit.locator('select[name="isActive"]').selectOption("false");
    await act(page, edit.getByTestId("training-program-save"), "trn", ["updated"]);
    retired += 1;
  }
  return retired;
}

test("T-6 (11.8). the owner retires the course; it stays listed as retired", async ({ browser }) => {
  test.skip(!courseCreated, "T-1 did not add the course");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  expect(await retireCourses(page, COURSE), "this run's course was retired").toBe(1);
  const row = programRow(await register(page), COURSE);
  await expect(row.getByTestId("training-program-retired"), "retired, not deleted").toBeVisible({ timeout: 30_000 });
  courseCreated = false;
  await ctx.close();
});

// ══════════════════════════════════════════════════ cleanup, pass or fail

test.afterAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await as(browser, "owner");
  try {
    await useWorkspace(page, ALFA);
    // A decision still waiting in the chain: the requester withdraws the request.
    if (decisionSubmitted && !decisionApproved) {
      try {
        await page.goto("/lt/dashboard/network?area=approvals");
        const mine = inMain(page).locator('[data-testid^="approvals-request-"]', { hasText: RUN }).first();
        const id = ((await mine.getAttribute("data-testid").catch(() => null)) ?? "").replace(/^approvals-request-/, "");
        const withdraw = id ? inMain(page).getByTestId(`approvals-withdraw-${id}`) : null;
        if (withdraw && (await withdraw.isVisible().catch(() => false))) {
          await withdraw.click();
          await page.waitForURL(/[?&]wf=/, { timeout: 30_000 });
          console.info("[cleanup] the waiting decision request was withdrawn");
        }
      } catch (e) {
        console.info(`[cleanup] decision withdraw did not complete: ${firstLine(e)}`);
      }
    }
    // T-4b's synthetic register document: archived, never deleted.
    if (certDocCreated) {
      try {
        await page.goto(`/lt/dashboard/documents?regQ=${encodeURIComponent(RUN)}#org-register`);
        const doc = inMain(page).getByTestId("org-document-row").filter({ hasText: CERT_DOC });
        if ((await doc.getAttribute("data-status").catch(() => null)) === "active") {
          await act(page, doc.getByTestId("org-document-archive"), "docNotice", ["archived"]);
          console.info("[cleanup] certificate document archived");
        }
      } catch (e) {
        console.info(`[cleanup] certificate document archive did not complete: ${firstLine(e)}`);
      }
    }
    // Swept by tag: every still-active synthetic course a run of this walk added.
    try {
      console.info(`[cleanup] courses retired=${await retireCourses(page, COURSE_PREFIX)}`);
    } catch (e) {
      console.info(`[cleanup] course sweep did not complete: ${firstLine(e)}`);
    }
  } finally {
    await ctx.close();
  }
});
