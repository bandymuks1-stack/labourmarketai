import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page, type Route } from "@playwright/test";

import { bearerOf, qaApi } from "./prod-qa-api";
import { ORGANIZATION_PLAN_KEY } from "../../lib/billing/plans";
import { PROD_QA_MANAGER_EMAIL, PROD_QA_OWNER_EMAIL } from "../../lib/testing/prod-qa-guard";

/**
 * PRODUCTION BILLING IN STRIPE TEST MODE — owner area 13 (Payments). Every step
 * is what a person does in Chrome; every assertion is what that person sees
 * after a fresh load.
 *
 * DISPATCHED ONLY AFTER THE OWNER ARMS STRIPE TEST MODE
 * (`ops/vps/lm-stripe-arm.sh test`) with a QA-SYNTHETIC organization in
 * BILLING_PILOT_ORGANIZATION_IDS. Unarmed, step 0 FAILS with `billing_not_armed`
 * — a skipped walk is not proof. Armed in LIVE mode, step 0 aborts with
 * `live_mode_refused` before any checkout click; no card is ever entered unless
 * the hosted page is proven to be a Stripe TEST session (`proveStripeTestMode`:
 * the `cs_test_` session in the URL AND Stripe's own test badge).
 *
 * Registry processes walked (owner area 13):
 *   7.4  Stripe test checkout / portal / refresh / webhook — the armed chain end to end
 *   7.2  Free organization limit: 1 open need — the limit line before payment
 *   7.15 Subscription checkout for the one approved paid plan — Stripe Checkout, billing address
 *   7.16 Webhook signature verification and test/live mode check — the plan appears only via the webhook
 *   7.17 No double charge — a second checkout for the same organization is refused
 *   7.3 / 7.22 Entitlement resolver + paid-feature limits — the open-need limit is lifted, then back
 *   7.18 Payment confirmation and cancellation change the organization's rights
 *   7.21 Billing portal — opens for the payer, cancellation inside the portal
 *   7.19 Refunds — MANUAL (Stripe Dashboard), annotated, never automated here
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   owner    qa.owner+multiw   — owns "QA-SYNTHETIC Alfa": the PAYER (default pilot organization)
 *   manager  qa.manager+multiw — owns "QA-SYNTHETIC Gama": the OTHER organization
 *   worker   qa.worker+multiw  — an employee of Alfa without billing authority
 * `PROD_QA_BILLING_ORG=gama` swaps payer and other organization when the owner
 * put Gama (not Alfa) in the pilot list. Nothing else is configurable.
 *
 * Idempotent: every need carries the run id and is closed by the walk; step 0
 * closes the needs earlier runs left open and cancels a subscription an
 * earlier failed run left behind (through the same portal a person uses).
 * Failure messages carry states and counts only — never another company's
 * data, never a session, key, card or customer id.
 *
 * Evidence: each step pushes `test.info().annotations` of type `evidence`
 * (statuses, counts, hosts — no ids, no secrets); the workflow's JSON result
 * carries them, so the run artefact is the per-process proof.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const GAMA = "QA-SYNTHETIC Gama";
const BILLING_ORG = (process.env.PROD_QA_BILLING_ORG ?? "alfa").trim().toLowerCase();
const PAYER =
  BILLING_ORG === "gama"
    ? { slot: "manager", org: GAMA, email: PROD_QA_MANAGER_EMAIL }
    : { slot: "owner", org: ALFA, email: PROD_QA_OWNER_EMAIL };
const OTHER = BILLING_ORG === "gama" ? { slot: "owner", org: ALFA } : { slot: "manager", org: GAMA };
const NEED_LABEL = "QA-SYNTHETIC apmokėjimo patikra";
const NOTE = `QA-SYNTHETIC ${RUN}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["worker", "manager", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
// retries: 0 — a retried payment step would be a second checkout.
test.describe.configure({ mode: "serial", timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

/** The only two Stripe hosts this walk may ever be on. */
const STRIPE_CHECKOUT_HOST = "checkout.stripe.com";
const STRIPE_PORTAL_HOST = "billing.stripe.com";
/** Stripe's documented always-succeeds TEST card. No other card number is in this file. */
const STRIPE_TEST_CARD = "4242 4242 4242 4242";
const APP_HOST = new URL(process.env.E2E_BASE_URL ?? "https://labourmarket.ai").hostname;
/** Subscription states in which the order button is withheld (lib/billing/checkout-operations-core.ts). */
const HOLDS_SUBSCRIPTION = ["active", "trialing", "past_due", "unpaid", "incomplete"];
const POLL_MS = 90_000;

function evidence(description: string): void {
  test.info().annotations.push({ type: "evidence", description });
}

/**
 * A synthetic person's context. Stripe's hosted pages follow the browser
 * language; the payment contexts use English so the walk reads Stripe's own
 * words ("Test mode", "Cancel plan") — the app keeps `/lt/` from the path.
 */
async function as(browser: Browser, slot: string, locale = "lt-LT"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale });
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

interface BillingView {
  readonly state: string;
  readonly status: string;
  readonly section: Locator;
}

/** Open /lt/dashboard/account fresh, unfold "Your plan", read the billing section's states. */
async function openAccount(page: Page): Promise<BillingView> {
  await page.goto("/lt/dashboard/account");
  const fold = page.getByTestId("account-plan-fold");
  await expect(fold).toBeVisible({ timeout: 30_000 });
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  const section = page.getByTestId("account-billing-status");
  await expect(section).toBeVisible({ timeout: 30_000 });
  return {
    state: (await section.getAttribute("data-billing-state")) ?? "unknown",
    status: (await section.getAttribute("data-subscription-status")) ?? "unknown",
    section,
  };
}

/** The order button of the ONE paid plan (rendered `test-checkout-${planKey}`). */
function orderButton(page: Page): Locator {
  return page.getByTestId("account-billing-order").getByRole("button");
}

/**
 * Reload the account page until `want(status)` holds or POLL_MS passes. Where
 * the page itself offers "Refresh billing status" (only while it is waiting on
 * the provider) the walk presses it, as a person would. Returns the last view.
 */
async function pollAccount(page: Page, want: (status: string) => boolean): Promise<BillingView> {
  const deadline = Date.now() + POLL_MS;
  let view = await openAccount(page);
  while (!want(view.status) && Date.now() < deadline) {
    const refresh = page.getByTestId("billing-refresh-button");
    if (await refresh.isVisible().catch(() => false)) {
      await refresh.click();
      await expect(page.getByTestId("billing-refresh-status")).not.toBeEmpty({ timeout: 25_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(5_000);
    view = await openAccount(page);
  }
  return view;
}

/** The open-needs usage line on the demand form: used / limit / remaining, or null when not shown. */
async function readUsage(page: Page): Promise<{ used: number; limit: number; atLimit: boolean } | null> {
  await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await expect(page.getByTestId("demand-form")).toBeVisible({ timeout: 30_000 });
  const usage = page.getByTestId("demand-open-need-usage");
  if (!(await usage.isVisible().catch(() => false))) return null;
  const nums = ((await usage.innerText()).match(/\d+/g) ?? []).map(Number);
  return { used: nums[0] ?? -1, limit: nums[1] ?? -1, atLimit: (await usage.getAttribute("data-at-limit")) === "true" };
}

/** Post one run-tagged need through the canonical demand intake. */
async function createNeed(page: Page, n: number): Promise<"done" | "limit"> {
  await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await page.getByTestId("demand-role").fill(`${NEED_LABEL} ${RUN} #${n}`);
  await page.getByTestId("demand-description").fill(`${NOTE}: synthetic need for the production billing walk, 1 person.`);
  await page.getByTestId("demand-next").click();
  const size = page.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await page.getByTestId("demand-next").click();
  await page.getByTestId("demand-create").click();
  const done = page.getByTestId("demand-done");
  const limit = page.getByTestId("demand-open-need-limit");
  await expect(done.or(limit)).toBeVisible({ timeout: 30_000 });
  return (await limit.isVisible()) ? "limit" : "done";
}

function needLinks(page: Page, text: string): Locator {
  return page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: text });
}

function requestIdOf(href: string | null): string {
  return /request=([0-9a-f-]{36})/.exec(href ?? "")?.[1] ?? "";
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

/** Close every need of this walk whose title carries `text`; returns [seen, closed]. */
async function closeNeedsMatching(page: Page, text: string): Promise<[number, number]> {
  await page.goto("/lt/dashboard/company/scouting");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const ids = new Set<string>();
  for (const a of await needLinks(page, text).all()) {
    const id = requestIdOf(await a.getAttribute("href"));
    if (id) ids.add(id);
  }
  let closed = 0;
  for (const id of [...ids].slice(0, 10)) {
    if ((await closeNeed(page, id)) === "closed") closed += 1;
  }
  return [ids.size, closed];
}

/**
 * THE TEST-MODE PROOF. Throws unless the page is on the expected Stripe host,
 * the hosted session is a TEST one (`cs_test_` checkout session /
 * `session/test_` portal session — Stripe's own prefixes; a live session reads
 * `cs_live_` / `session/live_`) and, on Checkout, Stripe shows its test badge.
 * Called before ANY card field is touched.
 */
async function proveStripeTestMode(page: Page, kind: "checkout" | "portal"): Promise<void> {
  const url = new URL(page.url());
  if (kind === "checkout") {
    expect(url.hostname, "the order button opened Stripe Checkout").toBe(STRIPE_CHECKOUT_HOST);
    expect(url.pathname, "live_mode_refused: the Checkout session is not a TEST session").toMatch(/\/cs_test_/);
    await expect(
      page.getByText(/^\s*(test mode|sandbox)\s*$/i).first(),
      "live_mode_refused: Stripe Checkout does not show its TEST MODE badge",
    ).toBeVisible({ timeout: 30_000 });
    evidence(`7.15 checkout host=${url.hostname} session=cs_test_ badge=test-mode`);
  } else {
    expect(url.hostname, "the manage button opened the Stripe customer portal").toBe(STRIPE_PORTAL_HOST);
    expect(url.pathname, "live_mode_refused: the portal session is not a TEST session").toMatch(/\/session\/test_/);
    const badge = await page
      .getByText(/^\s*(test mode|sandbox)\s*$/i)
      .first()
      .isVisible()
      .catch(() => false);
    evidence(`7.21 portal host=${url.hostname} session=test_ badge=${badge ? "test-mode" : "not-rendered"}`);
  }
}

/** A visible Stripe field, filled only when the hosted page asks for it. */
async function fillIfShown(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector);
  if (await field.isVisible().catch(() => false)) await field.fill(value);
}

/**
 * Pay on Stripe Checkout with the TEST card. The test-mode proof is the first
 * statement — no card field is touched before it passes (guard-pinned:
 * lib/guards/prod-billing-walk-safety.test.ts).
 */
async function payWithTestCard(page: Page): Promise<void> {
  await proveStripeTestMode(page, "checkout");
  const email = page.locator("#email");
  if ((await email.isVisible().catch(() => false)) && (await email.inputValue()) === "") await email.fill(PAYER.email);
  const card = page.locator("#cardNumber");
  if (!(await card.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /^card$/i }).or(page.getByRole("radio", { name: /^card$/i })).first().click();
  }
  await expect(card, "Stripe Checkout shows the card form").toBeVisible({ timeout: 30_000 });
  await card.fill(STRIPE_TEST_CARD);
  const yy = String((new Date().getUTCFullYear() + 3) % 100).padStart(2, "0");
  await page.locator("#cardExpiry").fill(`12 / ${yy}`);
  await page.locator("#cardCvc").fill("123");
  await fillIfShown(page, "#billingName", "QA-SYNTHETIC Walk");
  const country = page.locator("#billingCountry");
  if (await country.isVisible().catch(() => false)) await country.selectOption("LT");
  const manual = page.getByRole("button", { name: /enter address manually/i });
  if (await manual.isVisible().catch(() => false)) await manual.click();
  await fillIfShown(page, "#billingAddressLine1", "Gedimino pr. 1");
  await fillIfShown(page, "#billingLocality", "Vilnius");
  await fillIfShown(page, "#billingPostalCode", "01103");
  await page.locator('button[type="submit"]').first().click();
}

/**
 * Cancel the payer's subscription inside the Stripe TEST portal and come back.
 * Returns what the portal said: cancelled now, or scheduled for period end
 * (the portal configuration decides; the app is not asked).
 */
async function cancelInPortal(page: Page): Promise<"immediately" | "at_period_end" | "unknown"> {
  await page.getByTestId("billing-portal-open").click();
  await page.waitForURL((u) => u.hostname === STRIPE_PORTAL_HOST, { timeout: 60_000 });
  await proveStripeTestMode(page, "portal");
  const cancelName = /^\s*cancel (plan|subscription)\s*$/i;
  const open = page.getByRole("link", { name: cancelName }).or(page.getByRole("button", { name: cancelName })).first();
  await expect(open, "the portal offers cancellation (portal configuration)").toBeVisible({ timeout: 30_000 });
  await open.click();
  const confirm = page.getByRole("button", { name: cancelName }).first();
  await expect(confirm, "the portal asks to confirm the cancellation").toBeVisible({ timeout: 30_000 });
  await confirm.click();
  // An optional cancellation-reason survey: a person may skip it.
  const skip = page.getByRole("button", { name: /^\s*(skip|no thanks)\s*$/i }).first();
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const text = await page.locator("body").innerText();
  const mode = /cancels on|will be cancel+ed|renew (plan|subscription)/i.test(text)
    ? "at_period_end"
    : /cancel+ed|no (active )?subscriptions?/i.test(text)
      ? "immediately"
      : "unknown";
  // Back to the product through the portal's own return link (the return_url
  // the portal route set); a direct load of the same URL when Stripe hides it.
  const back = page.locator('a[href*="billing=portal_return"]').first();
  if (await back.isVisible().catch(() => false)) await back.click();
  else await page.goto("/lt/dashboard/account?billing=portal_return");
  await page.waitForURL((u) => u.hostname === APP_HOST && /\/dashboard\/account/.test(u.pathname), { timeout: 60_000 });
  return mode;
}

let cancelMode: "immediately" | "at_period_end" | "unknown" | "not-run" = "not-run";
let paidStatus = "";

test("0 (7.4). precondition: the pilot organization has billing armed in Stripe TEST mode — never live", async ({ browser }) => {
  test.setTimeout(420_000);
  expect(["alfa", "gama"], "PROD_QA_BILLING_ORG names a QA-SYNTHETIC organization").toContain(BILLING_ORG);
  const { ctx, page } = await as(browser, PAYER.slot, "en-US");
  await useWorkspace(page, PAYER.org);
  let view = await openAccount(page);
  evidence(`7.4 precondition billing_state=${view.state} subscription_status=${view.status}`);
  // LIVE: abort before anything can be clicked. This walk never pays for real.
  expect(view.state, "live_mode_refused: production billing is in LIVE mode; this walk runs only in TEST mode").not.toBe(
    "stripe_live",
  );
  expect(
    view.state,
    `billing_not_armed: the pilot organization reads billing as '${view.state}' (owner: ops/vps/lm-stripe-arm.sh test with this organization in the pilot list)`,
  ).toBe("stripe_test");

  // A subscription an earlier failed run left behind: cancel it through the
  // same portal a person uses, so this run starts from the free plan.
  if (HOLDS_SUBSCRIPTION.includes(view.status)) {
    const portal = page.getByTestId("billing-portal-open");
    expect(
      await portal.isVisible().catch(() => false),
      `leftover_subscription: status=${view.status} and no portal to cancel it`,
    ).toBe(true);
    const mode = await cancelInPortal(page);
    view = await pollAccount(page, (s) => !HOLDS_SUBSCRIPTION.includes(s));
    evidence(`7.18 leftover subscription cancelled portal_mode=${mode} status_after=${view.status}`);
    expect(
      HOLDS_SUBSCRIPTION.includes(view.status),
      `leftover_subscription: status=${view.status} after the portal (portal_mode=${mode}; a period-end cancellation must be ended in the Stripe TEST Dashboard by the owner)`,
    ).toBe(false);
  }
  await expect(
    orderButton(page),
    "billing_not_armed: the Organization plan order button is absent for the pilot organization's owner",
  ).toBeVisible({ timeout: 30_000 });

  const [seen, closed] = await closeNeedsMatching(page, NEED_LABEL);
  evidence(`cleanup leftover run needs seen=${seen} closed=${closed}`);
  await ctx.close();
});

test("1 (7.2). free state: no subscription, the order button, and the 1-open-need limit", async ({ browser }) => {
  const { ctx, page } = await as(browser, PAYER.slot);
  await useWorkspace(page, PAYER.org);
  const view = await openAccount(page);
  expect(HOLDS_SUBSCRIPTION, "the organization holds no subscription").not.toContain(view.status);
  await expect(page.getByTestId("account-billing-plan"), "no paid plan is shown").toHaveCount(0);
  await expect(orderButton(page)).toBeVisible();
  const chargedToday = await page.getByTestId("billing-charged-today").isVisible().catch(() => false);
  evidence(`7.2 free status=${view.status} order_button=visible charged_today_notice=${chargedToday ? "shown(trial off)" : "hidden(trial on)"}`);

  const usage = await readUsage(page);
  expect(usage, "the free plan's open-need usage line is shown on the demand form").not.toBeNull();
  expect(usage!.limit, "the free organization limit is 1 open need").toBe(1);
  evidence(`7.2 free open-needs used=${usage!.used} limit=${usage!.limit} at_limit=${usage!.atLimit}`);
  await ctx.close();
});

test("2 (7.15). the owner orders the Organization plan and pays in Stripe TEST Checkout with the 4242 card", async ({ browser }) => {
  test.setTimeout(300_000);
  const { ctx, page } = await as(browser, PAYER.slot, "en-US");
  await useWorkspace(page, PAYER.org);
  const view = await openAccount(page);
  expect(view.state, "live_mode_refused: billing is not in TEST mode").toBe("stripe_test");

  // The checkout answer is checked BEFORE the browser may follow it: a session
  // that is not a TEST one is replaced by a refusal, so Stripe is never opened.
  let checkout = "not-called";
  await page.route("**/api/billing/test-checkout", async (route: Route) => {
    const res = await route.fetch();
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; testMode?: boolean; reason?: string };
    let host = "";
    try {
      host = new URL(body.url ?? "").hostname;
    } catch {
      host = "";
    }
    const isTest = body.ok === true && body.testMode === true && host === STRIPE_CHECKOUT_HOST && /\/cs_test_/.test(body.url ?? "");
    checkout = body.ok ? (isTest ? "test-session" : "refused-not-test") : `refused:${body.reason ?? "unknown"}`;
    if (!isTest) {
      await route.fulfill({ status: 409, json: { ok: false, reason: body.ok ? "walk_refused_not_test_mode" : (body.reason ?? "error") } });
      return;
    }
    await route.fulfill({ response: res });
  });
  await orderButton(page).click();
  await page.waitForURL((u) => u.hostname === STRIPE_CHECKOUT_HOST, { timeout: 60_000 }).catch(() => undefined);
  evidence(`7.15 checkout route answer=${checkout}`);
  expect(checkout, "the checkout route answered with a Stripe TEST session").toBe("test-session");

  await payWithTestCard(page);
  await page.waitForURL((u) => u.hostname === APP_HOST && /\/dashboard\/account/.test(u.pathname), { timeout: 120_000 });
  const back = new URL(page.url());
  expect(back.searchParams.get("billing"), "Stripe returned to the TEST success URL").toBe("test_success");
  await expect(page.getByTestId("account-billing-return")).toHaveAttribute("data-return", "test_success", { timeout: 30_000 });
  evidence(`7.15 paid with the Stripe test card; returned to ${back.pathname} billing=test_success`);
  await ctx.close();
});

test("3 (7.16, 7.18, 7.17). the webhook activates the plan; a second checkout is refused", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await as(browser, PAYER.slot);
  await useWorkspace(page, PAYER.org);
  const view = await pollAccount(page, (s) => s === "active" || s === "trialing");
  evidence(`7.16/7.18 after webhook status=${view.status} within<=${POLL_MS / 1000}s`);
  expect(["active", "trialing"], `webhook_not_arrived: status=${view.status} after ${POLL_MS / 1000}s`).toContain(view.status);
  paidStatus = view.status;
  await expect(page.getByTestId("account-billing-plan"), "the paid plan is named").toContainText(ORGANIZATION_PLAN_KEY);
  await expect(page.getByTestId("account-billing-order"), "no second order button while subscribed").toHaveCount(0);
  await expect(page.getByTestId("billing-portal-open"), "the payer can manage the subscription").toBeVisible();

  // 7.17 — the route itself refuses a second subscription for this organization
  // (admission reads only; no Stripe session is created on refusal).
  const res = await page.request.post("/api/billing/test-checkout", { data: { planKey: ORGANIZATION_PLAN_KEY } });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
  evidence(`7.17 second checkout http=${res.status()} ok=${body.ok} reason=${body.reason ?? "-"}`);
  expect(body.ok, "a second checkout for the subscribed organization is refused").toBe(false);
  expect(body.reason).toBe("subscription_exists");
  await ctx.close();
});

test("4 (7.3, 7.22). the paid plan lifts the open-need limit: two run needs accepted, then closed", async ({ browser }) => {
  test.setTimeout(300_000);
  const { ctx, page } = await as(browser, PAYER.slot);
  await useWorkspace(page, PAYER.org);
  const usage = await readUsage(page);
  expect(usage, "the paid plan has no open-need ceiling, so no usage line is shown").toBeNull();
  const outcomes = [await createNeed(page, 1), await createNeed(page, 2)];
  evidence(`7.22 paid open-needs usage_line=hidden creates=${outcomes.join(",")}`);
  expect(outcomes, "both run needs were accepted (limit lifted)").toEqual(["done", "done"]);
  const [seen, closed] = await closeNeedsMatching(page, `${NEED_LABEL} ${RUN}`);
  evidence(`cleanup run needs seen=${seen} closed=${closed}`);
  expect(seen, "both run needs are listed").toBe(2);
  expect(closed, "both run needs were closed").toBe(2);
  await ctx.close();
});

test("5 (7.18). persistence: a new browser context still shows the plan active", async ({ browser }) => {
  const { ctx, page } = await as(browser, PAYER.slot);
  await useWorkspace(page, PAYER.org);
  const view = await openAccount(page);
  evidence(`7.18 fresh context status=${view.status}`);
  expect(view.status, "the subscription persists").toBe(paidStatus || "active");
  await expect(page.getByTestId("account-billing-plan")).toContainText(ORGANIZATION_PLAN_KEY);
  await ctx.close();
});

test("6 (7.21, 7.15). other people never see or act on this organization's billing", async ({ browser }) => {
  // The worker: an employee without billing authority, in their own workspace.
  {
    const { ctx, page } = await as(browser, "worker");
    const view = await openAccount(page);
    await expect(page.getByTestId("account-billing-plan"), "the worker sees no organization plan").toHaveCount(0);
    await expect(page.getByTestId("billing-portal-open"), "the worker gets no portal").toHaveCount(0);
    await expect(page.getByTestId("account-billing-order"), "the worker gets no order button").toHaveCount(0);
    const portal = (await (await page.request.post("/api/billing/portal")).json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    const order = (await (
      await page.request.post("/api/billing/test-checkout", { data: { planKey: ORGANIZATION_PLAN_KEY } })
    )
      .json()
      .catch(() => ({}))) as { ok?: boolean; reason?: string };
    expect(portal.ok, "the portal route refuses the worker").not.toBe(true);
    expect(order.ok, "the checkout route refuses the worker").not.toBe(true);
    // RLS: the worker's own token reads zero billing rows (owner-or-admin policy).
    const rows = await qaApi("/rest/v1/billing_subscriptions?select=status", bearerOf("worker"));
    const visible = rows.status === 200 ? ((await rows.json()) as unknown[]).length : -1;
    expect(visible, "the worker reads no billing subscription row").toBeLessThanOrEqual(0);
    evidence(
      `7.21 worker billing_state=${view.state} status=${view.status} portal=${portal.reason ?? "refused"} checkout=${order.reason ?? "refused"} rls_rows=${visible} (http ${rows.status})`,
    );
    await ctx.close();
  }
  // The other organization's owner, in their own organization.
  {
    const { ctx, page } = await as(browser, OTHER.slot);
    await useWorkspace(page, OTHER.org);
    const view = await openAccount(page);
    expect(["active", "trialing"], "the other organization does not inherit the paid plan").not.toContain(view.status);
    await expect(page.getByTestId("account-billing-plan"), "the other organization shows no paid plan").toHaveCount(0);
    evidence(`7.21 other organization billing_state=${view.state} status=${view.status} plan=hidden`);
    await ctx.close();
  }
});

test("7 (7.21, 7.18). the payer cancels in the Stripe TEST portal; the rights follow", async ({ browser }) => {
  test.setTimeout(300_000);
  const { ctx, page } = await as(browser, PAYER.slot, "en-US");
  await useWorkspace(page, PAYER.org);
  const before = await openAccount(page);
  expect(["active", "trialing"], "a subscription to cancel").toContain(before.status);
  cancelMode = await cancelInPortal(page);
  await expect(page.getByTestId("account-billing-return")).toHaveAttribute("data-return", "portal_return", { timeout: 30_000 });
  evidence(`7.21 portal cancellation portal_mode=${cancelMode}`);

  if (cancelMode === "at_period_end") {
    // App rule (lib/billing/entitlements-v1.ts): a subscription stays `active`
    // and entitling until Stripe ends it at the period end. The account page
    // does not display the scheduled end (cancel_at_period_end is stored, not
    // shown) — recorded as a finding, not asserted as a change.
    const view = await openAccount(page);
    evidence(`7.18 period-end cancellation: status=${view.status} (rights continue until period end; scheduled end not shown on the account page)`);
    test.info().annotations.push({
      type: "manual",
      description: "7.18 portal is configured to cancel at period end: the owner ends the TEST subscription immediately in the Stripe Dashboard before the next run",
    });
    expect(["active", "trialing"]).toContain(view.status);
    await ctx.close();
    return;
  }

  // Cancelled now: the row turns `cancelled`, the organization is FREE again.
  const view = await pollAccount(page, (s) => !HOLDS_SUBSCRIPTION.includes(s));
  evidence(`7.18 after cancellation status=${view.status}`);
  expect(HOLDS_SUBSCRIPTION, `cancellation_not_synced: status=${view.status} after ${POLL_MS / 1000}s`).not.toContain(view.status);
  await expect(page.getByTestId("account-billing-plan"), "no paid plan after cancellation").toHaveCount(0);
  await expect(orderButton(page), "the order button returns").toBeVisible();
  const usage = await readUsage(page);
  expect(usage, "the free limit applies again").not.toBeNull();
  expect(usage!.limit).toBe(1);
  evidence(`7.18/7.22 back to free open-needs used=${usage!.used} limit=${usage!.limit}`);
  await ctx.close();
});

test("8 (7.18). payment failure → past_due grace: not automatable from the product UI", async () => {
  // WHY NOT HERE. A failing charge needs a charge attempt AFTER the card is
  // swapped. Stripe's attach-then-decline TEST card (4000 0000 0000 0341) can be
  // added in the portal, but the next charge is the renewal a month later; the
  // only ways to force it now are a Stripe test clock or advancing the invoice
  // in the Stripe Dashboard — owner tools, not the product. Using that card at
  // Checkout instead leaves an `incomplete` subscription row that blocks the
  // organization's next checkout (a real side effect on the pilot). The
  // past_due → grace → free rule itself is unit-proven in
  // lib/billing/entitlements-v1.test.ts and the webhook ordering tests.
  test.info().annotations.push({
    type: "not-automatable",
    description:
      "7.18 payment failure: needs a renewal charge (Stripe test clock / Dashboard invoice advance, owner-only); a declining card at Checkout would leave an incomplete row blocking the pilot's next checkout",
  });
  test.skip(true, "payment-failure path is an owner step in the Stripe TEST Dashboard (see annotation)");
});

test("9 (7.19). cleanup: subscription ended, run needs closed; refunds are a manual Dashboard step", async ({ browser }) => {
  const { ctx, page } = await as(browser, PAYER.slot);
  await useWorkspace(page, PAYER.org);
  const view = await openAccount(page);
  const [seen, closed] = await closeNeedsMatching(page, `${NEED_LABEL} ${RUN}`);
  evidence(`cleanup final status=${view.status} cancel_mode=${cancelMode} run_needs_open_closed_now=${closed}/${seen}`);
  test.info().annotations.push({
    type: "manual",
    description:
      "7.19 refund of the TEST charge is done by the owner in the Stripe Dashboard (no refund control exists in the product UI)",
  });
  if (cancelMode !== "at_period_end") {
    expect(HOLDS_SUBSCRIPTION, `the walk's subscription is ended (status=${view.status})`).not.toContain(view.status);
  }
  await ctx.close();
});
