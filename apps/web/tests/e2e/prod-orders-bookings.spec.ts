import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION ORDERS, BOOKINGS, EXECUTION — owner area 12 (registry rows 5.13,
 * 6.4, 6.7, 6.8, 6.9). Every step is what a person does in the browser; every
 * assertion is what that person sees after a fresh load.
 *
 *   5.13 Booking   — a company posts a need, a worker raises a hand on it, the
 *                    company proposes dates, withdraws, proposes again; the
 *                    worker accepts on the phone; both see it accepted, the
 *                    company opens the conversation, the worker sees it in the
 *                    plan. The need is closed at the end.
 *   6.9  Finance   — the owner records an expense for the workspace company,
 *                    finds it in the CSV export, then cancels it.
 *   6.7  Procurement — the owner files an inquiry for the ACTIVE workspace,
 *                    records an offer, submits, selects the offer, closes it.
 *   6.8  Trips     — the owner plans a business trip, submits it for approval
 *                    where the organization has a published template, cancels.
 *   6.4  Buyer     — a customer-role session saves a request draft on the
 *                    buyer workspace (skipped, with the reason, when no
 *                    synthetic identity holds the customer role).
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   manager  qa.manager+multiw — owns "QA-SYNTHETIC Gama": posts the need, books
 *   worker   qa.worker+multiw  — Vytas: raises a hand, accepts the booking
 *   owner    qa.owner+multiw   — owns "QA-SYNTHETIC Alfa": finance, procurement, trips
 *
 * Idempotent: every object carries the run id; the walk closes its need,
 * cancels its record and trip and closes its inquiry, and step 0 closes the
 * needs earlier failed runs of THIS walk left open. A booking is made on this
 * run's own need, so a decline or an acceptance of an earlier run never
 * blocks this one (both are final for their need + worker pair). Failure
 * messages carry states and counts only — never another company's data.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const GAMA = "QA-SYNTHETIC Gama";
const NEED_LABEL = "QA-SYNTHETIC rezervacija";
const NEED_ROLE = `${NEED_LABEL} ${RUN}`;
const NOTE = `QA-SYNTHETIC ${RUN}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["worker", "manager", "owner"].every((s) => existsSync(state(s)));
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

/** ISO day `days` from today (UTC) — booking and trip dates in the future. */
function dayFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** The scouting need links of the active workspace, by visible title. */
function needLinks(page: Page, text: string): Locator {
  return page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: text });
}

function requestIdOf(href: string | null): string {
  return /request=([0-9a-f-]{36})/.exec(href ?? "")?.[1] ?? "";
}

/** One booking row on /dashboard/bookings, found by this run's note. */
function bookingRow(page: Page, direction: "incoming" | "outgoing"): Locator {
  return page
    .locator(`li[data-testid^="booking-"][data-status][data-direction="${direction}"]`)
    .filter({ hasText: NOTE });
}

/** Close one need through the scouting page's own lifecycle control. */
async function closeNeed(page: Page, requestId: string): Promise<"closed" | "already-closed"> {
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const controls = page.getByTestId("demand-lifecycle-controls");
  await expect(controls).toBeVisible({ timeout: 30_000 });
  if ((await controls.getAttribute("data-demand-status")) === "closed") return "already-closed";
  await controls.getByTestId("demand-close").click();
  await expect(controls).toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
  return "closed";
}

let workerId = "";
let requestId = "";
let bookingId = "";

test("0. Gama closes the needs earlier runs of this walk left open", async ({ browser }) => {
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
  for (const id of [...ids].slice(0, 10)) {
    if ((await closeNeed(page, id)) === "closed") closed += 1;
  }
  console.info(`[bookings] leftover needs seen=${ids.size} closed=${closed}`);
  await ctx.close();
});

test("O-0. the worker's own worker id (own row, own token)", async () => {
  const token = bearerOf("worker");
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, "own worker row answered").toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.length, "exactly one own worker row").toBe(1);
  workerId = rows[0].id;
});

test("O-1 (5.13). Gama posts this run's need through the demand intake", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await page.getByTestId("demand-role").fill(NEED_ROLE);
  // Name a trade: a need nothing can be recognised in is "not structured" on
  // scouting (lib/scouting/scouting.ts runScoutingCore), which renders no
  // candidates at all — not even the hand-raiser O-3 looks for.
  await page.getByTestId("demand-description").fill(`${NOTE}: synthetic need for the production booking walk, 1 mūrininkas.`);
  await page.getByTestId("demand-next").click();
  const size = page.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await page.getByTestId("demand-next").click();
  await page.getByTestId("demand-create").click();
  const done = page.getByTestId("demand-done");
  const limit = page.getByTestId("demand-open-need-limit");
  await expect(done.or(limit)).toBeVisible({ timeout: 30_000 });
  expect(await limit.isVisible(), "the open-need limit refused this run's need").toBe(false);

  await page.goto("/lt/dashboard/company/scouting");
  const link = needLinks(page, RUN).first();
  await expect(link, "this run's need is listed among Gama's needs").toBeVisible({ timeout: 30_000 });
  requestId = requestIdOf(await link.getAttribute("href"));
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  await ctx.close();
});

test("O-2 (5.13). the worker raises a hand on that need", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/opportunities?view=all");
  await expect(page.getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
  const card = page.locator(`li[id="opp-${requestId}"]`);
  await expect(card, "the new need is on the worker's board").toBeVisible({ timeout: 60_000 });
  await card.getByTestId("interest-express").click();
  await expect(card.getByTestId("interest-sent")).toHaveAttribute("data-interest-status", "interested", {
    timeout: 30_000,
  });
  await ctx.close();
});

/** Fill and send the propose form inside `scope`; returns the visible outcome. */
async function propose(scope: Locator, startDate: string): Promise<string> {
  const form = scope.getByTestId("propose-booking-form");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.getByTestId("propose-booking-start-date").fill(startDate);
  await form.getByTestId("propose-booking-note").fill(NOTE);
  await form.getByTestId("propose-booking-send").click();
  const sent = scope.getByTestId("propose-booking-sent");
  const answers = form.locator(
    '[data-testid="propose-booking-refused"], [data-testid="propose-booking-limit"], [data-testid="propose-booking-already-accepted"], [data-testid="propose-booking-error"], [data-testid="propose-booking-not-entitled"], [data-testid="propose-booking-unavailable"]',
  );
  await expect(sent.or(answers.first())).toBeVisible({ timeout: 30_000 });
  if (await sent.isVisible()) return "sent";
  return (await answers.first().getAttribute("data-testid")) ?? "unknown";
}

test("O-3 (5.13). Gama proposes dates to the hand-raiser from its candidate list", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const candidate = page.getByTestId(`scout-candidate-${workerId}`);
  await expect(candidate, "the hand-raiser is in Gama's candidate list").toBeVisible({ timeout: 60_000 });
  const open = candidate.getByTestId("propose-booking-open");
  await expect(open, "the candidate card offers a booking proposal").toBeVisible({ timeout: 30_000 });
  await open.click();
  const outcome = await propose(candidate, dayFromToday(21));
  expect(outcome, "the proposal was sent").toBe("sent");
  await ctx.close();
});

test("O-4 (5.13). Gama sees the proposal, withdraws it, and proposes new dates", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto("/lt/dashboard/bookings");
  const row = bookingRow(page, "outgoing");
  await expect(row, "exactly one outgoing proposal carries this run's note").toHaveCount(1, { timeout: 30_000 });
  await expect(row).toHaveAttribute("data-status", "proposed");
  bookingId = ((await row.getAttribute("data-testid")) ?? "").replace(/^booking-/, "");
  expect(bookingId).toMatch(/^[0-9a-f-]{36}$/);

  await row.getByTestId("booking-withdraw").click();
  await row.getByTestId("booking-withdraw-form").getByTestId("booking-withdraw-confirm").click();
  await expect(row.getByTestId("booking-withdrawn")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  const withdrawn = page.getByTestId(`booking-${bookingId}`);
  await expect(withdrawn).toHaveAttribute("data-status", "withdrawn", { timeout: 30_000 });

  // The company's own withdrawal may be undone with new dates (repeat actions).
  await withdrawn.getByTestId("propose-again-open").click();
  const outcome = await propose(withdrawn, dayFromToday(28));
  expect(outcome, "the second proposal was sent").toBe("sent");
  await page.reload();
  await expect(page.getByTestId(`booking-${bookingId}`)).toHaveAttribute("data-status", "proposed", {
    timeout: 30_000,
  });
  await ctx.close();
});

test("O-5 (5.13). the worker accepts the proposal on the phone", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker", true);
  await page.goto("/lt/dashboard/bookings");
  const row = page.getByTestId(`booking-${bookingId}`);
  await expect(row, "the proposal reached the worker").toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute("data-direction", "incoming");
  await expect(row).toHaveAttribute("data-status", "proposed");
  await expect(row.getByTestId("booking-proposer")).toContainText(GAMA);

  await row.getByTestId("booking-accept-open").click();
  await expect(row.getByTestId("booking-accept-disclosure")).toBeVisible();
  await row.getByTestId("booking-accept-confirm").click();
  const responded = row.getByTestId("booking-responded");
  const conflict = row.getByTestId("booking-conflict");
  await expect(responded.or(conflict)).toBeVisible({ timeout: 30_000 });
  if (await conflict.isVisible()) {
    // An earlier run's accepted booking overlaps these dates. The product's
    // own answer is one deliberate second action, recorded as such.
    console.info("[bookings] accept met a date clash; the worker accepts knowingly");
    await row.getByTestId("booking-accept-anyway").click();
    await expect(responded).toBeVisible({ timeout: 30_000 });
  }
  await page.reload();
  await expect(page.getByTestId(`booking-${bookingId}`)).toHaveAttribute("data-status", "accepted", {
    timeout: 30_000,
  });
  await ctx.close();
});

test("O-6 (5.13). Gama sees the acceptance and opens the conversation with the worker", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto("/lt/dashboard/bookings");
  const row = page.getByTestId(`booking-${bookingId}`);
  await expect(row).toHaveAttribute("data-status", "accepted", { timeout: 30_000 });
  await expect(row.getByTestId("booking-accepted-planning-link")).toBeVisible();
  await row.getByTestId("booking-outgoing-message-cta").click();
  await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.getByTestId("communication-composer-input")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("O-7 (5.13). the accepted booking is in the worker's plan on its date", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto(`/lt/dashboard/planning?view=agenda&source=booking&date=${dayFromToday(28)}`);
  await expect(page.getByTestId("planning-agenda")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`planning-item-booking:${bookingId}`)).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("O-8 (5.13). Gama closes this run's need (cleanup, the booking stays history)", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  expect(await closeNeed(page, requestId)).toBe("closed");
  await page.goto("/lt/dashboard/bookings");
  await expect(page.getByTestId(`booking-${bookingId}`)).toHaveAttribute("data-status", "accepted", {
    timeout: 30_000,
  });
  await ctx.close();
});

// ── 6.9 / 6.7 / 6.8 — the owner's operational records in Alfa ─────────────

const RECORD_TITLE = `${NOTE} išlaidos`;
let recordId = "";

test("F-1 (6.9). Alfa's owner records an expense for the company", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/finance");
  const create = page.getByTestId("finance-create");
  await expect(create).toBeVisible({ timeout: 30_000 });
  await create.locator('select[name="recordType"]').selectOption("expense");
  await create.locator('input[name="title"]').fill(RECORD_TITLE);
  await create.locator('input[name="counterparty"]').fill("QA-SYNTHETIC tiekėjas");
  await create.locator('input[name="amount"]').fill("1.00");
  const link = create.locator('input[name="linkCompany"]');
  await expect(link, "an owner is offered the company link").toBeVisible();
  await expect(link).toBeChecked();
  await page.getByTestId("finance-create-submit").click();
  const notice = page.locator('[data-testid^="finance-notice-"]').first();
  await expect(notice).toBeVisible({ timeout: 30_000 });
  expect(await notice.getAttribute("data-testid"), "the record was created").toMatch(
    /^finance-notice-created(_possible_duplicate)?$/,
  );
  await page.goto("/lt/dashboard/finance");
  const row = page.locator('li[data-testid^="finance-record-"]', { hasText: RECORD_TITLE });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row).toHaveAttribute("data-company-linked", "true");
  recordId = ((await row.getAttribute("data-testid")) ?? "").replace(/^finance-record-/, "");
  expect(recordId).toMatch(/^[0-9a-f-]{36}$/);
  await ctx.close();
});

test("F-2 (6.9). the CSV export of Alfa's workspace carries the record", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const res = await page.request.get("/lt/dashboard/finance/export");
  expect(res.status(), "the export answered").toBe(200);
  expect(res.headers()["content-type"] ?? "").toContain("text/csv");
  expect(await res.text(), "the export contains this run's record").toContain(RECORD_TITLE);
  await ctx.close();
});

test("F-3 (6.9). another organization's export never carries Alfa's record", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  const res = await page.request.get("/lt/dashboard/finance/export");
  expect(res.status(), "Gama's export answered").toBe(200);
  expect(await res.text()).not.toContain(RECORD_TITLE);
  await ctx.close();
});

test("F-4 (6.9). Alfa's owner cancels the record (cleanup)", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/finance");
  await page.getByTestId(`finance-action-cancel-${recordId}`).click();
  await expect(page.getByTestId("finance-notice-updated")).toBeVisible({ timeout: 30_000 });
  await page.goto("/lt/dashboard/finance");
  await expect(page.getByTestId(`finance-record-${recordId}`)).toHaveAttribute("data-status", "cancelled", {
    timeout: 30_000,
  });
  await ctx.close();
});

/**
 * Submit one of the finance page's server-action forms from a CLEAN url and
 * wait for its redirect notice (`?proc=` / `?trip=`), so a reload never races
 * the write. Returns the notice; an error notice fails the step by name.
 */
async function act(page: Page, control: Locator, param: "proc" | "trip"): Promise<string> {
  await control.click();
  await page.waitForURL(new RegExp(`[?&]${param}=`), { timeout: 30_000 });
  const notice = new URL(page.url()).searchParams.get(param) ?? "";
  expect(notice, `the ${param} action answered`).not.toMatch(/error|invalid|not_authorized|not_found|needs_migration/);
  return notice;
}

const INQUIRY = `${NOTE} pirkimas: 10 maišų plytelių klijų`;

test("P-1 (6.7). Alfa's owner runs a procurement inquiry from request to closed", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const fresh = () => page.goto("/lt/dashboard/finance#procurement");
  await fresh();
  const create = page.getByTestId("procurement-create");
  await expect(create).toBeVisible({ timeout: 30_000 });
  await create.locator("summary").click();
  // The picker defaults to the ACTIVE workspace's organization.
  await expect(create.locator('select[name="organizationId"] option:checked')).toContainText(ALFA);
  await create.locator('textarea[name="itemDescription"]').fill(INQUIRY);
  await create.locator('input[name="quantity"]').fill("10");
  await create.locator('input[name="estimatedBudget"]').fill("50.00");
  expect(await act(page, page.getByTestId("procurement-create-submit"), "proc")).toBe("created");

  await fresh();
  const item = page.locator('li[data-testid^="procurement-inquiry-"]', { hasText: INQUIRY });
  await expect(item).toHaveCount(1, { timeout: 30_000 });
  await expect(item).toHaveAttribute("data-status", "draft");
  const inquiryId = ((await item.getAttribute("data-testid")) ?? "").replace(/^procurement-inquiry-/, "");
  const inquiry = page.getByTestId(`procurement-inquiry-${inquiryId}`);

  // Record one supplier offer.
  const offerForm = inquiry.locator("details").filter({ has: page.locator('input[name="supplierName"]') });
  await offerForm.locator("summary").click();
  await offerForm.locator('input[name="supplierName"]').fill("QA-SYNTHETIC tiekėjas");
  await offerForm.locator('input[name="amount"]').fill("45.00");
  await act(page, page.getByTestId(`procurement-save-offer-${inquiryId}`), "proc");
  await fresh();
  await expect(inquiry.locator('[data-testid^="procurement-offer-"]')).toHaveCount(1, { timeout: 30_000 });

  await act(page, page.getByTestId(`procurement-submit-${inquiryId}`), "proc");
  await fresh();
  await expect(inquiry).toHaveAttribute("data-status", "submitted", { timeout: 30_000 });

  await act(page, inquiry.locator('[data-testid^="procurement-select-offer-"]').first(), "proc");
  await fresh();
  await expect(inquiry).toHaveAttribute("data-status", "decided", { timeout: 30_000 });

  // Cleanup that is also the last real step: the inquiry is closed.
  await act(page, page.getByTestId(`procurement-close-${inquiryId}`), "proc");
  await fresh();
  await expect(inquiry).toHaveAttribute("data-status", "closed", { timeout: 30_000 });
  await ctx.close();
});

const DESTINATION = `${NOTE} Kaunas`;

test("T-1 (6.8). Alfa's owner plans a business trip, submits it where a template exists, then cancels it", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const fresh = () => page.goto("/lt/dashboard/finance#trips");
  await fresh();
  const create = page.getByTestId("trips-create");
  await expect(create).toBeVisible({ timeout: 30_000 });
  await create.locator("summary").click();
  await expect(create.locator('select[name="organizationId"] option:checked')).toContainText(ALFA);
  await create.locator('input[name="destination"]').fill(DESTINATION);
  await create.locator('input[name="dateFrom"]').fill(dayFromToday(35));
  await create.locator('input[name="dateTo"]').fill(dayFromToday(37));
  await create.locator('textarea[name="purpose"]').fill(`${NOTE}: objekto apžiūra`);
  expect(await act(page, page.getByTestId("trips-create-submit"), "trip")).toBe("created");

  await fresh();
  const found = page.locator('li[data-testid^="trip-"][data-status]', { hasText: DESTINATION }).first();
  await expect(found).toHaveAttribute("data-status", "draft", { timeout: 30_000 });
  const tripId = ((await found.getAttribute("data-testid")) ?? "").replace(/^trip-/, "");
  // A trip can be listed both under "mine" and the organization's list.
  const trip = page.locator(`li[data-testid="trip-${tripId}"]`).first();

  // Submitting needs the organization's published approval template; the
  // page's own door creates the standard one when there is none.
  const template = trip.locator('[data-testid^="trips-create-template-"]');
  if (await template.isVisible().catch(() => false)) {
    console.info("[trips] no published template yet; following the page's own door");
    await act(page, template, "trip");
    await fresh();
  }
  const submit = trip.getByTestId(`trip-submit-${tripId}`);
  if (await submit.isVisible().catch(() => false)) {
    await act(page, submit, "trip");
    await fresh();
    await expect(trip).toHaveAttribute("data-status", "submitted", { timeout: 30_000 });
  } else {
    console.info("[trips] submit not offered: the organization has no published trip template");
  }

  // Cleanup: the trip is cancelled (kept as history).
  await act(page, trip.getByTestId(`trip-cancel-${tripId}`), "trip");
  await fresh();
  await expect(trip).toHaveAttribute("data-status", "cancelled", { timeout: 30_000 });
  await ctx.close();
});

test("B-1 (6.4). a customer saves a request draft on the buyer workspace", async ({ browser }) => {
  // The buyer workspace is gated on the customer role. Only an identity that
  // already holds it walks this step: adding a role here would change a
  // synthetic account's active role for every other walk.
  let slot: string | null = null;
  for (const s of ["worker2", "worker", "owner", "manager", "agency"]) {
    if (!existsSync(state(s))) continue;
    const { ctx, page } = await as(browser, s);
    await page.goto("/lt/dashboard/buyer");
    const ok = await page
      .getByTestId("buyer-dashboard")
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    await ctx.close();
    if (ok) {
      slot = s;
      break;
    }
  }
  test.skip(slot === null, "no synthetic identity holds the customer role (owner decision: provision one)");

  const { ctx, page } = await as(browser, slot!);
  await page.goto("/lt/dashboard/buyer");
  const form = page.getByTestId("buyer-requests-form");
  await expect(form, "the customer setup is complete enough to file requests").toBeVisible({ timeout: 30_000 });
  await page.getByTestId("buyer-requests-field-title").fill(`${NOTE} užsakymas`);
  await page.getByTestId("buyer-requests-field-need-summary").fill(`${NOTE}: plytelių klojimas vonios kambaryje`);
  await page.getByTestId("buyer-requests-status-draft").check();
  await page.getByTestId("buyer-requests-submit").click();
  await expect(page.getByTestId("buyer-requests-result")).toBeVisible({ timeout: 30_000 });
  await page.goto("/lt/dashboard/buyer");
  await expect(page.locator('[data-testid^="buyer-request-row-"]', { hasText: NOTE })).toHaveCount(1, {
    timeout: 30_000,
  });
  await ctx.close();
});
