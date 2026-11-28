import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";
import { closeOpenSyntheticNeedsOrFail } from "./prod-synthetic-needs";
import { proveActionTiles } from "./action-tile-proof";
import { answerNoProjectIfAsked } from "./worklog-context";

import { bearerOf, qaApi } from "./prod-qa-api";
import { needLinks, requestIdOf, submitSyntheticNeed } from "./prod-need-post";

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
 *   5.13 Hire      — the accept's engagement is visible to both sides after a
 *                    reload: Gama finds the booked person on its people page
 *                    and in its engagements; the worker, in Personal space,
 *                    sees the engagement with Gama; Alfa sees neither (O-9..O-11).
 *                    HIRE-5: ends only this synthetic pair's former hire first, preserving
 *                    its history; the new acceptance must create a new hire. Its work
 *                    relationship then carries a journal entry, company confirmation and CV.
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

/** One booking row on /dashboard/bookings, found by this run's note. */
function bookingRow(page: Page, direction: "incoming" | "outgoing"): Locator {
  return page
    .locator(`li[data-testid^="booking-"][data-status][data-direction="${direction}"]`)
    .filter({ hasText: NOTE });
}

/** Close one need through the scouting page's own lifecycle control. */
async function closeNeed(page: Page, requestId: string): Promise<"closed" | "already-closed"> {
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const controls = page.getByTestId("demand-lifecycle-controls").first();
  const unstructured = page.getByTestId("scouting-not-structured").first();
  await expect(controls.or(unstructured).first()).toBeVisible({ timeout: 30_000 });
  if (await controls.isVisible()) {
    if ((await controls.getAttribute("data-demand-status")) === "closed") return "already-closed";
    await controls.getByTestId("demand-close").click();
    await expect(controls).toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
    return "closed";
  }
  // A need that names no trade: the scouting page draws its lifecycle controls
  // only for a structured need, so it is closed where the product offers that
  // for every submitted need — the chat workspace's candidates result
  // (`?result=candidates&demand=`, `company.close-demand`).
  await page.goto(`/lt/dashboard?result=candidates&demand=${requestId}`);
  const close = page.getByTestId("candidates-close-demand").filter({ visible: true }).first();
  const reopen = page.getByTestId("candidates-reopen-demand").filter({ visible: true }).first();
  await expect(close.or(reopen).first(), "the need's own close/reopen action").toBeVisible({ timeout: 60_000 });
  if (await reopen.isVisible()) return "already-closed";
  await close.click();
  const error = page.getByTestId("candidates-close-demand-error").first();
  await expect(reopen.or(error).first()).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`close refused: ${(await error.innerText()).slice(0, 120)}`);
  return "closed";
}

let workerId = "";
let workerProfileId = "";
let hiringCompanyId = "";
let hiringOrganizationId = "";
const priorRelationshipIds = new Set<string>();
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
  workerProfileId = sub;
});

// A long-lived active booking would make record_booking_engagement return the old
// row, so it could not exercise the newly installed hire trigger. The ordinary UI
// ends only the allowlisted worker's QA-SYNTHETIC Gama hire. Nothing is erased.
test("O-0a (HIRE-5). end this synthetic pair's former hire, keeping its history", async ({ browser }) => {
  const response = await qaApi(
    `/rest/v1/company_worker_engagements?select=id,companies(display_name,legal_name)&worker_id=eq.${workerId}&status=eq.active`,
    bearerOf("manager"),
  );
  expect(response.status).toBe(200);
  const rows = (await response.json()) as { id: string; companies: { display_name: string | null; legal_name: string | null } | null }[];
  const own = rows.filter((r) => [r.companies?.display_name, r.companies?.legal_name].some((n) => (n ?? "").includes(GAMA)));
  expect(own.length, "at most one active hire for the synthetic pair").toBeLessThanOrEqual(1);
  const orgResponse = await qaApi(`/rest/v1/organizations?select=id,legacy_company_id,display_name&display_name=like.${encodeURIComponent(GAMA + "%")}`, bearerOf("manager"));
  expect(orgResponse.status).toBe(200);
  const orgs = (await orgResponse.json()) as { id: string; legacy_company_id: string; display_name: string }[];
  expect(orgs).toHaveLength(1);
  expect(orgs[0]!.display_name).toContain(GAMA);
  hiringOrganizationId = orgs[0]!.id;
  hiringCompanyId = orgs[0]!.legacy_company_id;
  if (own.length > 0) {
    const id = own[0]!.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const { ctx, page } = await as(browser, "manager");
    try {
      await useWorkspace(page, GAMA);
      await page.goto("/lt/dashboard?result=engagements");
      const card = page.getByTestId(`engagement-${id}`).filter({ visible: true }).first();
      await expect(card).toBeVisible({ timeout: 60_000 });
      await card.getByTestId(`engagement-end-${id}`).click();
      await card.getByTestId(`engagement-end-confirm-${id}`).click();
      await expect(card.getByTestId(`engagement-status-${id}`)).toHaveAttribute("data-status", "ended", { timeout: 30_000 });
      const retained = await qaApi(`/rest/v1/company_worker_engagements?select=id,status&id=eq.${id}`, bearerOf("worker"));
      expect(retained.status).toBe(200);
      expect(await retained.json(), "the former hire remains history").toEqual([{ id, status: "ended" }]);
    } finally { await ctx.close(); }
  }
  const before = await qaApi(`/rest/v1/engagement_contexts?select=id,status&profile_id=eq.${workerProfileId}&organization_id=eq.${hiringOrganizationId}`, bearerOf("worker"));
  expect(before.status).toBe(200);
  const relationships = (await before.json()) as { id: string; status: string }[];
  // Never end an independently owned relationship to make a test pass.
  // If another fixture added one, this creation proof must stop honestly.
  expect(relationships.filter((r) => r.status === "active"), "no active relationship before the new acceptance").toHaveLength(0);
  for (const row of relationships) priorRelationshipIds.add(row.id);
});

/**
 * The first day, at least `from` days out, on which the worker has NO accepted
 * booking. Every run's accepted booking stays history (O-8), and an
 * open-ended booking occupies its start day, so fixed offsets clashed when the
 * walk ran twice in a day (run 40216243755 met the overlap constraint on the
 * second run of 10-25). Read with the worker's own token (own rows only).
 */
async function firstFreeDay(from: number): Promise<string> {
  const res = await qaApi(
    `/rest/v1/booking_requests?select=start_date,expected_end_date&status=eq.accepted&worker_id=eq.${encodeURIComponent(workerId)}`,
    bearerOf("worker"),
  );
  expect(res.status, "the worker's own accepted bookings answered").toBe(200);
  const taken = (await res.json()) as { start_date: string; expected_end_date: string | null }[];
  const busy = (day: string) => taken.some((b) => day >= b.start_date && day <= (b.expected_end_date ?? b.start_date));
  for (let d = from; d < from + 365; d += 1) {
    const day = dayFromToday(d);
    if (!busy(day)) return day;
  }
  throw new Error("no free day in a year of accepted bookings");
}

// #2795 uses a previous synthetic Gama booking as an immutable overlap witness.
// It changes only this run's new booking, through the existing worker controls.
let overlapBookingId = "";
let acceptedBookingDay = "";
async function knownSyntheticOverlapDay(): Promise<string> {
  const manager = JSON.parse(Buffer.from(bearerOf("manager").split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(
    `/rest/v1/booking_requests?select=id,start_date,note&status=eq.accepted&worker_id=eq.${encodeURIComponent(workerId)}&owner_id=eq.${encodeURIComponent(manager)}&start_date=gte.${dayFromToday(0)}&order=start_date.asc&limit=100`,
    bearerOf("worker"),
  );
  expect(res.ok, "own existing synthetic bookings can be read").toBe(true);
  const rows = (await res.json()) as { id: string; start_date: string; note: string | null }[];
  const prior = rows.find((row) => row.note?.startsWith("QA-SYNTHETIC") && row.id !== bookingId);
  expect(prior, "a prior synthetic Gama booking is required to prove acknowledged overlap").toBeDefined();
  overlapBookingId = prior!.id;
  return prior!.start_date;
}

async function submitNeed(page: Page): Promise<"done" | "limit"> {
  // Name a trade: a need nothing can be recognised in is "not structured" on
  // scouting (lib/scouting/scouting.ts runScoutingCore), which renders no
  // candidates at all — not even the hand-raiser O-3 looks for.
  return submitSyntheticNeed(page, NEED_ROLE, `${NOTE}: synthetic need for the production booking walk, 1 mūrininkas.`);
}

test("O-1 (5.13). Gama posts this run's need through the demand intake", async ({ browser }) => {
  test.setTimeout(480_000); // room for the leftover cleanup
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  let outcome = await submitNeed(page);
  // Gama is on the free plan (one open need). Step 0 sweeps only this walk's
  // leftovers; another walk may hold the slot (brigade-formation keeps its
  // B2B need open by design, run 39985839991). Close the QA-SYNTHETIC
  // leftovers through the product's own controls (never this run's need)
  // and try once more.
  if (outcome === "limit") {
    await page.goto("/lt/dashboard/company/scouting");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    const ids = new Set<string>();
    for (const a of await needLinks(page, "QA-SYNTHETIC").all()) {
      if ((await a.innerText().catch(() => "")).includes(RUN)) continue;
      const id = requestIdOf(await a.getAttribute("href"));
      if (id) ids.add(id);
    }
    let closed = 0;
    for (const id of [...ids].slice(0, 5)) if ((await closeNeed(page, id)) === "closed") closed += 1;
    console.info(`[bookings] open-need limit: synthetic leftovers seen=${ids.size} closed=${closed}`);
    if (closed > 0) outcome = await submitNeed(page);
  }
  expect(outcome, "the open-need limit refused this run's need").toBe("done");

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
  await expect(page.getByRole("main").getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
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
  const outcome = await propose(candidate, await firstFreeDay(21));
  expect(outcome, "the proposal was sent").toBe("sent");
  await ctx.close();
});

/** The booking's row in the page's main region. While a reloaded page is
 *  still streaming, React briefly holds a second, hidden copy of the list
 *  outside <main>; a page-wide locator then matches both. A copy that never
 *  goes away is a hydration failure, which mobile-surfaces M-5 measures. */
const bookingById = (page: Page, id: string) => page.getByRole("main").getByTestId(`booking-${id}`);

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
  const withdrawn = bookingById(page, bookingId);
  await expect(withdrawn).toHaveAttribute("data-status", "withdrawn", { timeout: 30_000 });

  // The company's own withdrawal may be undone with new dates (repeat actions).
  await withdrawn.getByTestId("propose-again-open").click();
  // Deliberately overlap one retained synthetic booking; never alter that witness.
  acceptedBookingDay = await knownSyntheticOverlapDay();
  const outcome = await propose(withdrawn, acceptedBookingDay);
  expect(outcome, "the second proposal was sent").toBe("sent");
  await page.reload();
  await expect(bookingById(page, bookingId)).toHaveAttribute("data-status", "proposed", {
    timeout: 30_000,
  });
  await ctx.close();
});

test("O-5 (5.13). the worker accepts the proposal on the phone", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker", true);
  await page.goto("/lt/dashboard/bookings");
  const row = bookingById(page, bookingId);
  await expect(row, "the proposal reached the worker").toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute("data-direction", "incoming");
  await expect(row).toHaveAttribute("data-status", "proposed");
  await expect(row.getByTestId("booking-proposer")).toContainText(GAMA);

  await row.getByTestId("booking-accept-open").click();
  await expect(row.getByTestId("booking-accept-disclosure")).toBeVisible();
  await row.getByTestId("booking-accept-confirm").click();
  const responded = row.getByTestId("booking-responded");
  const conflict = row.getByTestId("booking-conflict");
  await expect(conflict, "ordinary acceptance must report the known clash").toBeVisible({ timeout: 30_000 });
  await expect(responded).toHaveCount(0);
  await row.getByTestId("booking-accept-anyway").click();
  await expect(responded).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("booking-clash-acknowledged")).toBeVisible();
  const accepted = await qaApi(`/rest/v1/booking_requests?select=status,clash_acknowledged&id=eq.${bookingId}`, bearerOf("worker"));
  expect(accepted.ok).toBe(true);
  expect(await accepted.json()).toEqual([{ status: "accepted", clash_acknowledged: true }]);
  const witness = await qaApi(`/rest/v1/booking_requests?select=status&id=eq.${overlapBookingId}`, bearerOf("worker"));
  expect(witness.ok).toBe(true);
  expect(await witness.json(), "prior booking remains accepted").toEqual([{ status: "accepted" }]);
  const receipt = await qaApi(`/rest/v1/booking_request_events?select=id&booking_request_id=eq.${bookingId}&event_type=eq.clash_acknowledged&related_booking_request_id=eq.${overlapBookingId}`, bearerOf("worker"));
  expect(receipt.ok).toBe(true);
  expect(await receipt.json(), "one retained acknowledgement naming the known overlap").toHaveLength(1);
  await page.reload();
  // Run 40200190351: after this reload the row matched TWICE (identical
  // <li>s). Count where the copies live: a hidden streamed holder (#418
  // symptom) sits outside <main>; a real double render would be inside it.
  const copies = await page.evaluate((id) => {
    const all = [...document.querySelectorAll(`[data-testid="booking-${id}"]`)];
    return {
      total: all.length,
      inMain: all.filter((e) => e.closest("main")).length,
      inHiddenHolder: all.filter((e) => e.closest("[hidden][id^='S:']")).length,
    };
  }, bookingId);
  console.info(`[bookings] accepted row copies after reload: ${JSON.stringify(copies)}`);
  const inMainRow = page.getByRole("main").getByTestId(`booking-${bookingId}`);
  await expect(inMainRow, "the booking renders once on the page").toHaveCount(1, { timeout: 30_000 });
  await expect(inMainRow).toHaveAttribute("data-status", "accepted", { timeout: 30_000 });
  await ctx.close();
});

test("O-6 (5.13). Gama sees the acceptance and opens the conversation with the worker", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto("/lt/dashboard/bookings");
  const row = bookingById(page, bookingId);
  await expect(row).toHaveAttribute("data-status", "accepted", { timeout: 30_000 });
  await expect(row.getByTestId("booking-accepted-planning-link")).toBeVisible();
  await row.getByTestId("booking-outgoing-message-cta").click();
  await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.getByTestId("communication-composer-input")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("O-7 (5.13). the accepted booking is in the worker's plan on its date", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto(`/lt/dashboard/planning?view=agenda&source=booking&date=${acceptedBookingDay}`);
  await expect(page.getByTestId("planning-agenda")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`planning-item-booking:${bookingId}`)).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

let engagementId = "";

/** The engagements result, opened by its address: this engagement, active, after a reload. */
async function engagementActive(page: Page, who: string, counterparty: string): Promise<void> {
  await page.goto("/lt/dashboard?result=engagements");
  for (const pass of ["first load", "reload"]) {
    if (pass === "reload") await page.reload();
    const status = page.getByTestId(`engagement-status-${engagementId}`).filter({ visible: true }).first();
    await expect(status, `${who}, ${pass}: the engagement is listed`).toBeVisible({ timeout: 60_000 });
    await expect(status).toHaveAttribute("data-status", "active");
    await expect(page.getByTestId(`engagement-${engagementId}`).filter({ visible: true }).first()).toContainText(counterparty);
  }
}

test("O-9 (5.13). Gama finds the booked worker on its people page and in its engagements", async ({ browser }) => {
  // The accept (respond_booking_request_v4) makes or keeps ONE active engagement for the pair.
  // Read with the manager's own token: RLS lets the owning company read only its own rows.
  const res = await qaApi(
    `/rest/v1/company_worker_engagements?select=id,status,company_id,source_booking_id,companies(display_name,legal_name)&worker_id=eq.${encodeURIComponent(workerId)}&status=eq.active`,
    bearerOf("manager"),
  );
  expect(res.status, "the company's own engagements answered").toBe(200);
  const rows = (await res.json()) as { id: string; company_id: string; source_booking_id: string; companies: { display_name: string | null; legal_name: string | null } | null }[];
  const gama = rows.filter((r) => [r.companies?.display_name, r.companies?.legal_name].some((n) => (n ?? "").includes(GAMA)));
  expect(gama.length, "exactly one active Gama engagement with the booked worker").toBe(1);
  engagementId = gama[0]!.id;
  expect(gama[0]!.company_id).toBe(hiringCompanyId);
  expect(gama[0]!.source_booking_id, "this acceptance created the hire, not an earlier run").toBe(bookingId);

  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  for (const pass of ["first load", "reload"]) {
    if (pass === "reload") await page.reload();
    const row = page.getByRole("main").getByTestId(`booked-person-${engagementId}`);
    await expect(row, `${pass}: the booked worker is on Gama's people page`).toBeVisible({ timeout: 60_000 });
  }
  const name = (
    await page.getByRole("main").getByTestId(`booked-person-${engagementId}`).getByTestId("identity-card-name").first().innerText()
  ).trim();
  expect(name.length, "the booked person is named").toBeGreaterThan(0);
  await engagementActive(page, "Gama", name);
  await ctx.close();
});

test("O-9a (HIRE-5). the new hire carries work to company confirmation and Living CV", async ({ browser }) => {
  test.setTimeout(480_000);
  const orgResponse = await qaApi(`/rest/v1/organizations?select=id,display_name&legacy_company_id=eq.${hiringCompanyId}`, bearerOf("manager"));
  expect(orgResponse.status).toBe(200);
  const orgs = (await orgResponse.json()) as { id: string; display_name: string }[];
  expect(orgs).toHaveLength(1);
  expect(orgs[0]!.display_name).toContain(GAMA);
  const contexts = await qaApi(`/rest/v1/engagement_contexts?select=id,journal_review_enabled&profile_id=eq.${workerProfileId}&organization_id=eq.${orgs[0]!.id}&status=eq.active`, bearerOf("worker"));
  expect(contexts.status).toBe(200);
  const relationships = (await contexts.json()) as { id: string; journal_review_enabled: boolean }[];
  expect(relationships, "the accepted hire is connected to one work relationship").toHaveLength(1);
  const relationship = relationships[0]!;
  expect(orgs[0]!.id).toBe(hiringOrganizationId);
  expect(priorRelationshipIds.has(relationship.id), "the new acceptance opened a new interval").toBe(false);
  const company = await as(browser, "manager");
  const worker = await as(browser, "worker", true);
  try {
    await useWorkspace(company.page, GAMA);
    if (!relationship.journal_review_enabled) {
      const fold = company.page.getByRole("main").getByTestId("people-more").first();
      await expect(fold).toBeAttached({ timeout: 60_000 });
      if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
      await company.page.getByRole("main").getByTestId(`toggle-review-${relationship.id}`).click();
      await expect.poll(async () => {
        const res = await qaApi(`/rest/v1/engagement_contexts?select=journal_review_enabled&id=eq.${relationship.id}`, bearerOf("worker"));
        expect(res.status).toBe(200);
        return ((await res.json()) as { journal_review_enabled: boolean }[])[0]?.journal_review_enabled;
      }, { timeout: 30_000 }).toBe(true);
    }
    await worker.page.goto("/lt/cv");
    await expect(worker.page.getByTestId("cv-skills").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
    const confirmed = worker.page.getByTestId("cv-confirmed-work").filter({ visible: true });
    const beforeConfirmed = (await confirmed.count()) ? Number(await confirmed.getAttribute("data-entries")) : 0;
    await worker.page.goto("/lt/dashboard/work-in-numbers");
    const journal = worker.page.getByTestId("wi-experience-journal").filter({ visible: true });
    await expect(journal).toBeVisible({ timeout: 60_000 });
    const beforeHours = Number(await journal.getAttribute("data-hours"));
    const entryText = `QA-SYNTHETIC ${RUN} HIRE: šiandien 2 valandas mūrijau blokelių sieną`;
    await worker.page.goto("/lt/dashboard/journal");
    const main = worker.page.getByRole("main");
    await main.getByTestId("journal-quick-record-text").fill(entryText);
    await main.getByTestId("journal-quick-record-understand").click();
    await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 60_000 });
    const context = main.getByTestId("worklog-context");
    await expect(context, "the worker can select the hiring company").toBeVisible();
    await context.selectOption(relationship.id);
    await answerNoProjectIfAsked(worker.page);
    await main.getByTestId("worklog-save").click();
    await main.getByTestId("worklog-confirm").click();
    await expect(main.getByTestId("worklog-done")).toBeVisible({ timeout: 30_000 });
    const stored = await qaApi(`/rest/v1/journal_entries?select=id,engagement_context_id&worker_id=eq.${workerId}&original_text=eq.${encodeURIComponent(entryText)}`, bearerOf("worker"));
    expect(stored.status).toBe(200);
    const entries = (await stored.json()) as { id: string; engagement_context_id: string }[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.engagement_context_id).toBe(relationship.id);
    const entryId = entries[0]!.id;
    await company.page.goto("/lt/dashboard/inbox");
    const inbox = company.page.getByRole("main");
    await expect(inbox.getByTestId(`inbox-entry-${entryId}`)).toBeVisible({ timeout: 60_000 });
    await inbox.getByTestId(`journal-approve-entry-${entryId}`).click();
    await expect.poll(async () => {
      const res = await qaApi(`/rest/v1/journal_entry_confirmations?select=confirmation_scope&entry_id=eq.${entryId}`, bearerOf("worker"));
      expect(res.status).toBe(200);
      return ((await res.json()) as { confirmation_scope: { decision?: string } }[]).map((r) => r.confirmation_scope.decision);
    }, { timeout: 30_000 }).toEqual(["approved"]);
    await worker.page.goto("/lt/cv");
    await expect(confirmed).toHaveAttribute("data-entries", String(beforeConfirmed + 1), { timeout: 60_000 });
    await expect(worker.page.getByRole("main").first().getByTestId("cv-history-node").filter({ hasText: GAMA }).getByTestId("cv-history-recorded").first()).toBeVisible();
    await worker.page.goto("/lt/dashboard/work-in-numbers");
    await expect(journal, "the confirmed work counts once").toHaveAttribute("data-hours", String(beforeHours + 2), { timeout: 60_000 });
    // The synthetic confirmed entry and its attributable history are retained.
  } finally { await worker.ctx.close(); await company.ctx.close(); }
});

test("O-10 (5.13). the worker, in Personal space on the phone, sees the engagement with Gama", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker", true);
  // "Who do I work for" is read in Personal space: in an organization workspace the result is
  // that organization's engagements (lib/engagements/engagements-result.ts).
  await page.goto("/lt/dashboard");
  const chip = page.getByTestId("workspace-chip").first();
  if (await chip.isVisible({ timeout: 15_000 }).catch(() => false)) {
    const personal = page.getByTestId("workspace-option-personal");
    await chip.getByRole("button").first().click();
    if ((await personal.getAttribute("aria-current")) !== "true") {
      await personal.click();
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    } else {
      await page.keyboard.press("Escape");
    }
  }
  await engagementActive(page, "the worker", GAMA);
  await ctx.close();
});

test("O-11 (5.13). Alfa sees neither the booked person nor the engagement", async ({ browser }) => {
  const own = await qaApi(`/rest/v1/company_worker_engagements?select=id&id=eq.${encodeURIComponent(engagementId)}`, bearerOf("owner"));
  expect(own.status, "Alfa's own read answered").toBe(200);
  expect(await own.json(), "Alfa's own session reads no row of Gama's engagement").toEqual([]);
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.reload();
  await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(`booked-person-${engagementId}`), "Alfa's people page").toHaveCount(0);
  await page.goto("/lt/dashboard?result=engagements");
  await expect(
    page.getByTestId("engagements-empty").or(page.getByTestId("engagements-list")).filter({ visible: true }).first(),
    "Alfa's engagements answer",
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(`engagement-${engagementId}`), "Alfa's engagements").toHaveCount(0);
  await ctx.close();
});

test("O-8 (5.13). Gama closes this run's need (cleanup, the booking stays history)", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  expect(await closeNeed(page, requestId)).toBe("closed");
  await page.goto("/lt/dashboard/bookings");
  await expect(bookingById(page, bookingId)).toHaveAttribute("data-status", "accepted", {
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
  // The new-request form is its own block (decision 0034, `?tab=new`).
  await page.goto("/lt/dashboard/buyer?tab=new");
  const form = page.getByTestId("buyer-requests-form");
  await expect(form, "the customer setup is complete enough to file requests").toBeVisible({ timeout: 30_000 });
  await page.getByTestId("buyer-requests-field-title").fill(`${NOTE} užsakymas`);
  await page.getByTestId("buyer-requests-field-need-summary").fill(`${NOTE}: plytelių klojimas vonios kambaryje`);
  // The country is a required ISO choice since #3234; an unchosen select
  // stops the submit in the browser and no result is ever shown.
  await page.getByTestId("buyer-requests-field-country").selectOption("LT");
  await page.getByTestId("buyer-requests-status-draft").check();
  await page.getByTestId("buyer-requests-submit").click();
  await expect(page.getByTestId("buyer-requests-result")).toBeVisible({ timeout: 30_000 });
  await page.goto("/lt/dashboard/buyer");
  await expect(page.locator('[data-testid^="buyer-request-row-"]', { hasText: NOTE })).toHaveCount(1, {
    timeout: 30_000,
  });
  await ctx.close();
});

// ── T (#2828, owner A-09 ruling 2026-11-03): the bookings page's related-door
// grid is the ONE action tile. Read-only: real links, no gold primary (these
// are related doors), no destination twice, at 1280 and 390.
test("T-1 (#2828). the bookings related-door grid renders as action tiles", async ({ browser }) => {
  await proveActionTiles(
    async (mobile) => {
      const { ctx, page } = await as(browser, "manager", mobile);
      return { page, close: () => ctx.close() };
    },
    "/lt/dashboard/bookings",
    { scopeTestId: "bookings-connections", primaries: 0, prepare: (page) => useWorkspace(page, GAMA) },
  );
});

// Owner order 2026-11-22: no synthetic need this walk posted — or an earlier
// run left — stays open on the market, even when a step above failed
// (tests/e2e/prod-synthetic-needs.ts; the workflow sweeps again in always()).
test.afterAll(async () => {
  test.setTimeout(120_000);
  await closeOpenSyntheticNeedsOrFail("orders-bookings");
});
