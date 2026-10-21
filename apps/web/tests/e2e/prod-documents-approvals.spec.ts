import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION DOCUMENTS, CONTRACTS, APPROVALS — owner area 14 (registry rows
 * 2.18, 3.24, 3.29, 4.18, 6.6). Every step is what a person does in the
 * browser; every assertion is what that person sees after a fresh load.
 *
 *   2.18 Documents  — a worker records a credential with its validity; the
 *                     inventory derives "expiring" from the date.
 *   3.29 Register   — the owner registers an organization document, finds it
 *                     by search, archives it.
 *   3.24 Approvals  — the owner keeps a published approval template; the
 *                     employee files a request; the owner approves it in the
 *                     inbox; the employee sees the decision.
 *   6.6  Contracts  — the owner records a proposal and moves it through its
 *                     statuses, records a contract, and keeps an agreement in
 *                     the register from draft to active to terminated.
 *   4.18 Disclosure — a company asks a hand-raiser for contact details; the
 *                     worker accepts the ask, grants the disclosure with the
 *                     versioned wording, the company sees it granted; the
 *                     worker withdraws it again (cleanup). The need is closed.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   owner    qa.owner+multiw   — owns "QA-SYNTHETIC Alfa"
 *   worker   qa.worker+multiw  — Vytas, employee of Alfa
 *   worker2  qa.worker+goal3   — records a credential
 *   manager  qa.manager+multiw — owns "QA-SYNTHETIC Gama", asks for contact details
 *
 * Idempotent: every object carries the run id; documents are upserted per
 * type + country; the register document is archived, the agreement
 * terminated, the proposal and contract deleted, the grant withdrawn and the
 * need closed. Step 0 closes needs earlier failed runs of THIS walk left open.
 * Failure messages carry states and counts only.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const GAMA = "QA-SYNTHETIC Gama";
const NOTE = `QA-SYNTHETIC ${RUN}`;
const NEED_LABEL = "QA-SYNTHETIC atskleidimas";
const NEED_ROLE = `${NEED_LABEL} ${RUN}`;
const TEMPLATE = "QA-SYNTHETIC patvirtinimas";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["owner", "worker", "worker2", "manager"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string, mobile = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: "lt-LT",
    ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
  });
  return { ctx, page: await ctx.newPage() };
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

function dayFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Submit a native server-action form and wait for its redirect notice, so a
 * reload never races the write. An error notice fails the step by name.
 */
async function act(page: Page, control: Locator, param: string): Promise<string> {
  await control.click();
  await page.waitForURL(new RegExp(`[?&]${param}=`), { timeout: 30_000 });
  const notice = new URL(page.url()).searchParams.get(param) ?? "";
  expect(notice, `the ${param} action answered`).not.toMatch(/error|invalid|not_authorized|not_allowed|not_found|needs_migration/);
  return notice;
}

// ── 2.18 — a worker's credential and its validity ─────────────────────────

test("D-1 (2.18). a worker records a credential that runs out in 20 days; the inventory says expiring", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2", true);
  await page.goto("/lt/dashboard/documents");
  const form = page.getByTestId("worker-document-form");
  await expect(form).toBeVisible({ timeout: 30_000 });
  const type = form.locator('select[name="document_type_slug"]');
  const slug = (await type.locator("option").first().getAttribute("value")) ?? "";
  expect(slug, "a document type is offered").not.toBe("");
  await type.selectOption(slug);
  await form.locator('select[name="country"]').selectOption("LT");
  await form.locator('input[name="status"][value="ready"]').check({ force: true });
  await form.locator('input[name="valid_from"]').fill(dayFromToday(-300));
  await form.locator('input[name="valid_until"]').fill(dayFromToday(20));
  await form.locator('[name="note"]').fill(NOTE);
  await page.getByTestId("worker-document-save").click();
  const saved = page.getByTestId("worker-document-saved");
  const error = page.getByTestId("worker-document-error");
  await expect(saved.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`document not saved: ${await error.innerText()}`);

  await page.goto("/lt/dashboard/documents");
  const item = page.locator(`[data-testid="doc-centre-item"][data-type="${slug}"][data-country="LT"]`);
  await expect(item, "one inventory row for the type and country").toHaveCount(1, { timeout: 30_000 });
  await expect(item).toHaveAttribute("data-status", "expiring");
  await expect(item).toContainText(dayFromToday(20));
  await ctx.close();
});

// ── 3.29 — the organization documents register ────────────────────────────

const ORG_DOC = `${NOTE} darbų saugos instrukcija`;

test("R-1 (3.29). Alfa's owner registers a document, finds it by search, and archives it", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/documents#org-register");
  const register = page.getByTestId("org-documents-register");
  await expect(register).toBeVisible({ timeout: 30_000 });
  const create = page.getByTestId("org-documents-create");
  await create.locator("summary").click();
  await create.locator('select[name="typeSlug"]').selectOption("org_instruction");
  await create.locator('[name="title"]').fill(ORG_DOC);
  await create.locator('input[name="expiresOn"]').fill(dayFromToday(365));
  expect(await act(page, page.getByTestId("org-documents-create-submit"), "docNotice")).toMatch(/created/);

  await page.goto(`/lt/dashboard/documents?regQ=${encodeURIComponent(RUN)}#org-register`);
  const row = page.getByTestId("org-document-row").filter({ hasText: ORG_DOC });
  await expect(row, "the search finds exactly this run's document").toHaveCount(1, { timeout: 30_000 });
  await expect(row).toHaveAttribute("data-status", "active");

  await act(page, row.getByTestId("org-document-archive"), "docNotice");
  await page.goto(`/lt/dashboard/documents?regQ=${encodeURIComponent(RUN)}&regStatus=archived#org-register`);
  await expect(page.getByTestId("org-document-row").filter({ hasText: ORG_DOC })).toHaveAttribute(
    "data-status",
    "archived",
    { timeout: 30_000 },
  );
  await ctx.close();
});

// ── 3.24 — approvals ──────────────────────────────────────────────────────

test("A-1 (3.24). Alfa keeps a published approval template", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/network?area=approvals");
  await expect(page.getByTestId("approvals-admin")).toBeVisible({ timeout: 30_000 });
  let template = page.locator('[data-testid^="approvals-template-"]', { hasText: TEMPLATE }).first();
  if (!(await template.isVisible().catch(() => false))) {
    console.info("[approvals] creating the synthetic template once");
    const create = page.getByTestId("approvals-create-template");
    await create.locator("summary").click();
    const org = create.locator('select[name="organizationId"]');
    const value = await org.locator("option", { hasText: ALFA }).first().getAttribute("value");
    expect(value, "Alfa is one of the organizations the owner governs").toBeTruthy();
    await org.selectOption(value!);
    await create.locator('input[name="name"]').fill(TEMPLATE);
    await act(page, page.getByTestId("approvals-create-template-submit"), "wf");
    await page.goto("/lt/dashboard/network?area=approvals");
    template = page.locator('[data-testid^="approvals-template-"]', { hasText: TEMPLATE }).first();
    await expect(template).toBeVisible({ timeout: 30_000 });
  }
  const publish = template.locator('[data-testid^="approvals-publish-"]');
  if (await publish.isVisible().catch(() => false)) {
    await act(page, publish, "wf");
    await page.goto("/lt/dashboard/network?area=approvals");
  }
  await expect(
    page.locator('[data-testid^="approvals-template-"]', { hasText: TEMPLATE }).first().locator('[data-testid^="approvals-publish-"]'),
    "the template is published",
  ).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

const REQUEST_TITLE = `${NOTE} įrankių pirkimo prašymas`;
let instanceId = "";

test("A-2 (3.24). the employee files a request with that template", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/network?area=approvals");
  const start = page.getByTestId("approvals-start");
  await expect(start, "the employee is offered a request form").toBeVisible({ timeout: 30_000 });
  await start.locator("summary").click();
  const definition = start.locator('select[name="definitionId"]');
  const value = await definition.locator("option", { hasText: TEMPLATE }).first().getAttribute("value");
  expect(value, "Alfa's template is offered to its employee").toBeTruthy();
  await definition.selectOption(value!);
  await start.locator('input[name="title"]').fill(REQUEST_TITLE);
  await start.locator('textarea[name="details"]').fill(`${NOTE}: synthetic approval request.`);
  await act(page, page.getByTestId("approvals-start-submit"), "wf");
  await page.goto("/lt/dashboard/network?area=approvals");
  const mine = page.locator('[data-testid^="approvals-request-"]', { hasText: REQUEST_TITLE });
  await expect(mine).toHaveCount(1, { timeout: 30_000 });
  instanceId = ((await mine.getAttribute("data-testid")) ?? "").replace(/^approvals-request-/, "");
  await expect(page.getByTestId(`approvals-withdraw-${instanceId}`), "the request is pending").toBeVisible();
  await ctx.close();
});

test("A-3 (3.24). Alfa's owner approves the request from the inbox", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/network?area=approvals");
  const item = page.getByTestId(`approvals-inbox-${instanceId}`);
  await expect(item, "the request reached the approver's inbox").toBeVisible({ timeout: 30_000 });
  await act(page, item.getByTestId(`approvals-approve-${instanceId}`), "wf");
  await page.goto("/lt/dashboard/network?area=approvals");
  await expect(page.getByTestId(`approvals-inbox-${instanceId}`)).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("A-4 (3.24). the employee sees the decision; the request is no longer open", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker", true);
  await page.goto("/lt/dashboard/network?area=approvals");
  const mine = page.getByTestId(`approvals-request-${instanceId}`);
  await expect(mine).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`approvals-withdraw-${instanceId}`)).toHaveCount(0);
  await ctx.close();
});

// ── 6.6 — proposals, contracts and the agreement register ─────────────────

const PROPOSAL = `${NOTE} pasiūlymas`;
const CONTRACT = `${NOTE} sutartis`;
const AGREEMENT = `${NOTE} paslaugų susitarimas`;

test("C-1 (6.6). Alfa's owner records a proposal and moves it to accepted", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/commercial");
  await expect(page.getByTestId("proposals-panel")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("proposal-title").fill(PROPOSAL);
  await page.getByTestId("proposal-amount").fill("1200.00");
  await page.getByTestId("proposal-create").click();
  const row = page.getByTestId("proposal-row").filter({ hasText: PROPOSAL });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  for (const status of ["sent", "accepted"]) {
    await row.getByTestId("proposal-status").selectOption(status);
    await expect(page.getByTestId("commercial-msg")).toBeVisible({ timeout: 30_000 });
    // Persistence: a fresh load shows the status (reloaded until the write lands).
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByTestId("proposal-row").filter({ hasText: PROPOSAL }).getByTestId("proposal-status").inputValue();
        },
        { timeout: 30_000 },
      )
      .toBe(status);
  }
  await ctx.close();
});

test("C-2 (6.6). the owner records the contract, then removes both synthetic rows (cleanup)", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/commercial");
  await page.getByTestId("contract-title").fill(CONTRACT);
  await page.getByTestId("contract-value").fill("1200.00");
  await page.getByTestId("contract-create").click();
  const contract = page.getByTestId("contract-row").filter({ hasText: CONTRACT });
  await expect(contract).toHaveCount(1, { timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("contract-row").filter({ hasText: CONTRACT })).toHaveCount(1, { timeout: 30_000 });

  await page.getByTestId("contract-row").filter({ hasText: CONTRACT }).getByTestId("contract-delete").click();
  await expect(page.getByTestId("contract-row").filter({ hasText: CONTRACT })).toHaveCount(0, { timeout: 30_000 });
  await page.getByTestId("proposal-row").filter({ hasText: PROPOSAL }).getByTestId("proposal-delete").click();
  await expect(page.getByTestId("proposal-row").filter({ hasText: PROPOSAL })).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});

test("C-3 (6.6). the agreement register: draft → active record → terminated", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/commercial");
  const create = page.getByTestId("agreements-create");
  await expect(create).toBeVisible({ timeout: 30_000 });
  await create.locator("summary").click();
  await create.locator('select[name="agreementType"]').selectOption({ index: 0 });
  await create.locator('input[name="title"]').fill(AGREEMENT);
  await create.locator('input[name="counterpartyName"]').fill("QA-SYNTHETIC kontrahentas");
  await act(page, page.getByTestId("agreements-create-submit"), "agr");

  const find = async () => {
    await page.goto(`/lt/dashboard/commercial?agrSearch=${encodeURIComponent(RUN)}`);
    return page.getByTestId("agreement-row").filter({ hasText: AGREEMENT });
  };
  let row = await find();
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row).toHaveAttribute("data-status", "draft");
  await act(page, row.getByTestId("agreement-set-active_record"), "agr");
  row = await find();
  await expect(row).toHaveAttribute("data-status", "active_record", { timeout: 30_000 });
  await act(page, row.getByTestId("agreement-set-terminated_record"), "agr");
  row = await find();
  await expect(row).toHaveAttribute("data-status", "terminated_record", { timeout: 30_000 });
  await ctx.close();
});

// ── 4.18 — the employer data disclosure grant ─────────────────────────────

let workerId = "";
let requestId = "";

function needLinks(page: Page, text: string): Locator {
  return page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: text });
}

function requestIdOf(href: string | null): string {
  return /request=([0-9a-f-]{36})/.exec(href ?? "")?.[1] ?? "";
}

async function closeNeed(page: Page, id: string): Promise<"closed" | "already-closed"> {
  await page.goto(`/lt/dashboard/company/scouting?request=${id}`);
  const controls = page.getByTestId("demand-lifecycle-controls");
  await expect(controls).toBeVisible({ timeout: 30_000 });
  if ((await controls.getAttribute("data-demand-status")) === "closed") return "already-closed";
  await controls.getByTestId("demand-close").click();
  await expect(controls).toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
  return "closed";
}

test("G-0. Gama closes the needs earlier runs of this walk left open", async ({ browser }) => {
  test.setTimeout(360_000);
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto("/lt/dashboard/company/scouting");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const ids = new Set<string>();
  for (const a of await needLinks(page, NEED_LABEL).all()) {
    const id = requestIdOf(await a.getAttribute("href"));
    if (id) ids.add(id);
  }
  let closed = 0;
  for (const id of [...ids].slice(0, 10)) if ((await closeNeed(page, id)) === "closed") closed += 1;
  console.info(`[disclosure] leftover needs seen=${ids.size} closed=${closed}`);
  await ctx.close();
});

test("G-1 (4.18). the worker's own worker id; Gama posts this run's need; the worker raises a hand", async ({ browser }) => {
  const token = bearerOf("worker");
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, "own worker row answered").toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.length, "exactly one own worker row").toBe(1);
  workerId = rows[0].id;

  const gama = await as(browser, "manager");
  await useWorkspace(gama.page, GAMA);
  await gama.page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await gama.page.getByTestId("demand-role").fill(NEED_ROLE);
  await gama.page.getByTestId("demand-description").fill(`${NOTE}: synthetic need for the production disclosure walk.`);
  await gama.page.getByTestId("demand-next").click();
  const size = gama.page.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await gama.page.getByTestId("demand-next").click();
  await gama.page.getByTestId("demand-create").click();
  await expect(gama.page.getByTestId("demand-done").or(gama.page.getByTestId("demand-open-need-limit"))).toBeVisible({
    timeout: 30_000,
  });
  await gama.page.goto("/lt/dashboard/company/scouting");
  const link = needLinks(gama.page, RUN).first();
  await expect(link, "this run's need is listed").toBeVisible({ timeout: 30_000 });
  requestId = requestIdOf(await link.getAttribute("href"));
  await gama.ctx.close();

  const worker = await as(browser, "worker");
  await worker.page.goto("/lt/dashboard/opportunities?view=all");
  const card = worker.page.locator(`li[id="opp-${requestId}"]`);
  await expect(card, "the need is on the worker's board").toBeVisible({ timeout: 60_000 });
  await card.getByTestId("interest-express").click();
  await expect(card.getByTestId("interest-sent")).toHaveAttribute("data-interest-status", "interested", {
    timeout: 30_000,
  });
  await worker.ctx.close();
});

test("G-2 (4.18). Gama asks the hand-raiser for contact details", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const candidate = page.getByTestId(`scout-candidate-${workerId}`);
  await expect(candidate).toBeVisible({ timeout: 60_000 });
  await candidate.getByTestId(`contact-request-open-${workerId}`).click();
  await expect(candidate.getByTestId(`contact-request-status-${workerId}`)).toHaveAttribute("data-status", "created", {
    timeout: 30_000,
  });
  await ctx.close();
});

let askId = "";

test("G-3 (4.18). the worker accepts the ask and grants the disclosure with the versioned wording", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker", true);
  await page.goto("/lt/dashboard/privacy#contact-requests");
  const ask = page.locator('li[data-testid^="contact-request-"][data-status]', { hasText: RUN });
  await expect(ask, "exactly one ask for this run's need").toHaveCount(1, { timeout: 30_000 });
  askId = ((await ask.getAttribute("data-testid")) ?? "").replace(/^contact-request-/, "");
  await expect(ask).toContainText(GAMA);
  await ask.getByTestId(`contact-request-accept-${askId}`).click();
  await expect(ask.getByTestId(`contact-request-done-${askId}`)).toBeVisible({ timeout: 30_000 });
  const block = ask.getByTestId(`contact-request-grant-block-${askId}`);
  await expect(block, "the grant is a separate step with its wording shown first").toBeVisible();
  await ask.getByTestId(`contact-request-grant-${askId}`).click();
  await expect(ask.getByTestId(`contact-request-granted-${askId}`)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId(`contact-request-granted-${askId}`), "the grant persists").toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("G-4 (4.18). Gama sees the disclosure granted", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const status = page.getByTestId(`contact-request-status-${workerId}`);
  await expect(status).toHaveAttribute("data-status", "accepted", { timeout: 60_000 });
  await expect(status).toHaveAttribute("data-disclosure-granted", "true");
  await ctx.close();
});

test("G-5 (4.18). the worker withdraws the grant; Gama sees it withdrawn; the need is closed (cleanup)", async ({ browser }) => {
  const worker = await as(browser, "worker");
  await worker.page.goto("/lt/dashboard/privacy#contact-requests");
  await worker.page.getByTestId(`contact-request-withdraw-${askId}`).click();
  await expect(worker.page.getByTestId(`contact-request-withdrawn-${askId}`)).toBeVisible({ timeout: 30_000 });
  // The person may change their mind again: the grant is offered anew.
  await expect(worker.page.getByTestId(`contact-request-grant-${askId}`)).toBeVisible();
  await worker.page.reload();
  await expect(worker.page.getByTestId(`contact-request-granted-${askId}`)).toHaveCount(0, { timeout: 30_000 });
  await worker.ctx.close();

  const gama = await as(browser, "manager");
  await useWorkspace(gama.page, GAMA);
  await gama.page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  await expect(gama.page.getByTestId(`contact-request-status-${workerId}`)).toHaveAttribute(
    "data-disclosure-granted",
    "false",
    { timeout: 60_000 },
  );
  expect(await closeNeed(gama.page, requestId)).toBe("closed");
  await gama.ctx.close();
});
