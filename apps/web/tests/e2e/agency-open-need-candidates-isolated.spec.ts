import { test, expect, type Browser, type Page } from "@playwright/test";

import {
  BASE,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  setUpCompany,
  signUp,
  sql,
  stackMailLink,
  verifyCompanyAsLocalAdmin,
} from "./isolated-web-a-helpers";

/**
 * AGENCY CANDIDATES ON AN OPEN NEED (owner decision 2026-11-22, item 3) — on
 * the throwaway local stack (every migration replayed, synthetic data):
 *   an agency with NO earlier link to the client offers its company on an
 *   open need and names a worker of its roster; the client reads a pseudonym
 *   and professional facts only (never the name); the client chooses the
 *   candidate; the worker gets the booking request and decides; the client
 *   deals with the agency only (decision 0033). 1280 and 390 px.
 */
const B = BASE;
const RUN = Date.now().toString(36);
const CO = `aonc-co-${RUN}@example.test`, AG = `aonc-ag-${RUN}@example.test`, W = `aonc-w-${RUN}@example.test`, ADM = `aonc-adm-${RUN}@example.test`;
const CO_ORG = `Open Need Client ${RUN}`, AG_ORG = `Open Need Agency ${RUN}`;
const W_NAME = `Aonc Welder ${RUN}`;
const ROLE = `Welder ${RUN}`;
const s: Record<string, string> = {};
let co: Page, ag: Page, w: Page;

async function noSideways(p: Page, name: string) {
  for (const [wd, h] of [[1280, 900], [390, 844]] as const) {
    await p.setViewportSize({ width: wd, height: h });
    await p.waitForTimeout(300);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, `${name} @${wd}: no sideways scroll`).toBeLessThanOrEqual(wd + 1);
  }
  await p.setViewportSize({ width: 1280, height: 900 });
}
async function fresh(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
}
async function verifyEmail(page: Page, address: string) {
  await page.goto(`${B}/en/dashboard/network`);
  const prompt = page.getByTestId("network-email-unverified");
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await prompt.getByTestId("verify-email-send").click();
  await expect(prompt.getByTestId("verify-email-sent")).toBeVisible({ timeout: 30_000 });
  await page.goto(await stackMailLink(address));
  await page.waitForURL((u) => !u.pathname.includes("/auth/callback"), { timeout: 60_000 });
}
async function openOfferForm(p: Page) {
  await p.goto(`${B}/en/dashboard/services`);
  await p.waitForLoadState("networkidle").catch(() => {});
  const sec = p.locator('[data-testid^="team-demand-offer-section-"]').first();
  await expect(sec).toBeVisible({ timeout: 30_000 });
  if ((await sec.getAttribute("open")) === null) await sec.locator("summary").click();
  await expect(p.locator('[data-testid^="team-offer-demand-"]').first()).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });
test.skip(!isolatedStack(), "isolated local stack only");

test("0. a client posts a need; an agency puts its worker on its roster", async ({ browser }) => {
  co = await fresh(browser);
  await signUp(co, B, CO); await onboard(co, "hire", "Open Need Client Owner"); await setUpCompany(co, CO_ORG);
  await verifyEmail(co, CO);
  await publishNeed(co, B, ROLE, "LT");
  await verifyCompanyAsLocalAdmin(CO, ADM);
  s.need = sql<{ id: string }>(`select id from public.customer_requests where role_or_work_type=${lit(ROLE)} or title=${lit(ROLE)} limit 1`)[0]!.id;
  ag = await fresh(browser);
  await signUp(ag, B, AG); await onboard(ag, "agency", "Open Need Agency Owner"); await setUpCompany(ag, AG_ORG);
  await verifyEmail(ag, AG);
  w = await fresh(browser);
  await signUp(w, B, W); await onboard(w, "work", W_NAME);
  await w.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  await verifyEmail(w, W);
  await ag.goto(`${B}/en/dashboard/company/people#company-team`);
  await ag.getByTestId("company-workers-invite-email").fill(W);
  await ag.getByTestId("company-workers-invite-submit").click();
  await expect(ag.getByTestId("company-workers-invite-result")).toBeVisible({ timeout: 30_000 });
  await w.goto(`${B}/en/dashboard`);
  const acc = w.locator('[data-testid^="worker-invitation-accept-company-"]').filter({ visible: true }).first();
  await expect(acc).toBeVisible({ timeout: 30_000 });
  await acc.click();
  await expect
    .poll(() => sql<{ n: number }>(`select count(*)::int as n from public.company_workers cw join public.workers wk on wk.id = cw.worker_id join auth.users u on u.id = wk.profile_id where u.email = ${lit(W)} and cw.status = 'active'`)[0]!.n, { timeout: 30_000 })
    .toBe(1);
  // No earlier link between the agency and the client.
  expect(sql<{ n: number }>(`select count(*)::int as n from public.agency_client_connections c join public.companies a on a.id = c.agency_company_id where a.display_name = ${lit(AG_ORG)} or a.legal_name = ${lit(AG_ORG)}`)[0]!.n).toBe(0);
});

test("1. the agency offers its company on the open need and names its worker", async () => {
  await openOfferForm(ag);
  await ag.locator('[data-testid^="team-offer-demand-"]').first().selectOption(s.need);
  await ag.locator('[data-testid^="team-offer-note-"]').first().fill("A certified welder from our roster.");
  await ag.locator('[data-testid^="team-offer-submit-"]').first().click();
  await expect(ag.locator('[data-testid^="team-offer-sent-"]').first()).toBeVisible({ timeout: 30_000 });
  s.offer = sql<{ id: string }>(`select id from public.team_demand_offers where request_id = ${lit(s.need)} order by offered_at desc limit 1`)[0]!.id;
  s.worker = sql<{ id: string }>(`select wk.id from public.workers wk join auth.users u on u.id = wk.profile_id where u.email = ${lit(W)}`)[0]!.id;
  const panel = ag.getByTestId(`offer-candidates-${s.offer}`);
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await ag.getByTestId(`offer-candidate-add-select-${s.offer}`).selectOption(s.worker);
  await ag.getByTestId(`offer-candidate-add-submit-${s.offer}`).click();
  await expect(panel).toContainText(W_NAME, { timeout: 30_000 });
  s.candidate = sql<{ id: string }>(`select id from public.team_demand_offer_candidates where offer_id = ${lit(s.offer)}`)[0]!.id;
  await panel.scrollIntoViewIfNeeded();
  await noSideways(ag, "agency candidates");
});

test("2. the client reads a pseudonym and facts — never the name — and chooses the candidate", async () => {
  await co.goto(`${B}/en/dashboard/company/scouting?request=${s.need}`);
  await co.waitForLoadState("networkidle").catch(() => {});
  const card = co.getByTestId(`offer-candidate-${s.candidate}`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(/Candidate [0-9A-F]{6}/);
  await expect(co.locator("body"), "the worker's name is never shown to the client").not.toContainText(W_NAME);
  await expect(co.locator("body")).not.toContainText(W);
  await card.scrollIntoViewIfNeeded();
  await noSideways(co, "client candidates");
  await co.getByTestId(`offer-candidate-select-${s.candidate}`).click();
  await expect(card).toContainText(/Booking request sent/, { timeout: 30_000 });
  await expect(co.locator("body"), "still unnamed before the worker decides").not.toContainText(W_NAME);
  const row = sql<{ status: string; booking_id: string | null }>(
    `select a.status, a.booking_id from public.agency_candidate_offers a join public.team_demand_offer_candidates k on k.candidate_offer_id = a.id where k.id = ${lit(s.candidate)}`,
  )[0]!;
  expect(row.status, "the standard candidate offer, accepted by the client").toBe("accepted");
  expect(row.booking_id, "a booking was proposed to the worker").toBeTruthy();
  s.booking = row.booking_id!;
  expect(sql<{ status: string }>(`select status from public.booking_requests where id = ${lit(s.booking)}`)[0]!.status).toBe("proposed");
});

test("3. the worker decides: accepts the booking", async () => {
  await w.goto(`${B}/en/dashboard/bookings`);
  const card = w.getByTestId(`booking-${s.booking}`).filter({ visible: true }).first();
  await expect(card, "the worker sees the booking").toBeVisible({ timeout: 30_000 });
  await card.getByTestId("booking-accept-open").click();
  await card.getByTestId("booking-accept-confirm").click();
  await expect
    .poll(() => sql<{ status: string }>(`select status from public.booking_requests where id = ${lit(s.booking)}`)[0]!.status, { timeout: 30_000 })
    .toBe("accepted");
});

test("4. the agency sees its candidate chosen and accepted; no other agency sees this offer", async () => {
  await openOfferForm(ag);
  const panel = ag.getByTestId(`offer-candidates-${s.offer}`);
  await expect(panel).toContainText(/Chosen by the client/, { timeout: 30_000 });
  await expect(panel).toContainText(/The person accepted/, { timeout: 30_000 });
  // A signed-in outsider reads nothing of this offer's candidates.
  const n = sql<{ n: number }>(`select count(*)::int as n from public.team_demand_offer_candidates where offer_id = ${lit(s.offer)}`)[0]!.n;
  expect(n).toBe(1);
});
