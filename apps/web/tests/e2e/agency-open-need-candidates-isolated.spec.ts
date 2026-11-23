import { test, expect, type Browser, type Page } from "@playwright/test";

import {
  accessToken,
  BASE,
  SB_ANON,
  SB_URL,
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
 * R3 (#3651): the worker must have chosen to be visible to companies (roster
 * membership is not consent) and sees each proposal on their Bookings page;
 * the agency never receives the client user's e-mail; the 0033 negatives
 * are read as the outsider ITSELF (its own session), never as superuser.
 */
const B = BASE;
const RUN = Date.now().toString(36);
const CO = `aonc-co-${RUN}@example.test`, AG = `aonc-ag-${RUN}@example.test`, W = `aonc-w-${RUN}@example.test`, ADM = `aonc-adm-${RUN}@example.test`;
const AG2 = `aonc-ag2-${RUN}@example.test`, W2 = `aonc-w2-${RUN}@example.test`;
const CO_ORG = `Open Need Client ${RUN}`, AG_ORG = `Open Need Agency ${RUN}`;
const W_NAME = `Aonc Welder ${RUN}`;
const ROLE = `Welder ${RUN}`;
const s: Record<string, string> = {};
let co: Page, ag: Page, w: Page, w2: Page;

async function noSideways(p: Page, name: string) {
  for (const [wd, h] of [[1280, 900], [390, 844]] as const) {
    await p.setViewportSize({ width: wd, height: h });
    await p.waitForTimeout(300);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, `${name} @${wd}: no sideways scroll`).toBeLessThanOrEqual(wd + 1);
  }
  await p.setViewportSize({ width: 1280, height: 900 });
}
/** One call under that person's OWN session (anon key + their token): RLS and grants apply. */
async function asUser(address: string, path: string, body?: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await accessToken(address)}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const rpcAs = (address: string, fn: string, args: Record<string, unknown>) => asUser(address, `rpc/${fn}`, args);
const message = (j: unknown) => String((j as { message?: unknown } | null)?.message ?? "");
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
  if ((await sec.getAttribute("open")) === null) await sec.locator(":scope > summary").click();
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

test("1. the agency offers its company on the open need and names its worker", async ({ browser }) => {
  await openOfferForm(ag);
  await ag.locator('[data-testid^="team-offer-demand-"]').first().selectOption(s.need);
  await ag.locator('[data-testid^="team-offer-note-"]').first().fill("A certified welder from our roster.");
  await ag.locator('[data-testid^="team-offer-submit-"]').first().click();
  await expect(ag.locator('[data-testid^="team-offer-sent-"]').first()).toBeVisible({ timeout: 30_000 });
  s.offer = sql<{ id: string }>(`select id from public.team_demand_offers where request_id = ${lit(s.need)} order by offered_at desc limit 1`)[0]!.id;
  s.worker = sql<{ id: string }>(`select wk.id from public.workers wk join auth.users u on u.id = wk.profile_id where u.email = ${lit(W)}`)[0]!.id;
  const panel = ag.getByTestId(`offer-candidates-${s.offer}`);
  await expect(panel).toBeVisible({ timeout: 30_000 });
  // Roster membership alone is not consent to be shown to a stranger.
  await ag.getByTestId(`offer-candidate-add-select-${s.offer}`).selectOption(s.worker);
  await ag.getByTestId(`offer-candidate-add-submit-${s.offer}`).click();
  await expect(panel.getByRole("status")).toContainText(/has not chosen to be visible to companies/, { timeout: 30_000 });
  expect(sql<{ n: number }>(`select count(*)::int as n from public.team_demand_offer_candidates where offer_id = ${lit(s.offer)}`)[0]!.n).toBe(0);
  // The worker chooses, on their own privacy page.
  await w.goto(`${B}/en/dashboard/privacy`);
  const open = w.getByTestId("discoverability-open");
  if (await open.isVisible().catch(() => false)) await open.click();
  await w.getByTestId("discoverability-grant").click();
  await expect(w.getByTestId("discoverability-granted")).toBeVisible({ timeout: 30_000 });
  await ag.getByTestId(`offer-candidate-add-select-${s.offer}`).selectOption(s.worker);
  await ag.getByTestId(`offer-candidate-add-submit-${s.offer}`).click();
  await expect(panel).toContainText(W_NAME, { timeout: 30_000 });
  s.candidate = sql<{ id: string }>(`select id from public.team_demand_offer_candidates where offer_id = ${lit(s.offer)}`)[0]!.id;
  await panel.scrollIntoViewIfNeeded();
  await noSideways(ag, "agency candidates");
  // A person NOT on the agency's roster is refused, even with an id in hand.
  w2 = await fresh(browser);
  await signUp(w2, B, W2); await onboard(w2, "work", `Aonc Other ${RUN}`);
  await w2.context().close();
  const other = sql<{ id: string }>(`select wk.id from public.workers wk join auth.users u on u.id = wk.profile_id where u.email = ${lit(W2)}`)[0]!.id;
  const refused = await rpcAs(AG, "add_offer_candidate_v1", { p_offer_id: s.offer, p_worker_id: other });
  expect(refused.status, "a stranger's worker id is refused").not.toBe(200);
  expect(message(refused.json)).toMatch(/worker_not_on_roster/);
  // Before the client chooses, the agency has no connection with — and no address of — the client.
  const before = await asUser(AG, "agency_client_connections?select=id,invited_email,client_company_id");
  expect(before.json, "no connection before the client's choice").toEqual([]);
});

test("1b. the worker is told: the proposal is on their Bookings page, without the client's name", async () => {
  await w.goto(`${B}/en/dashboard/bookings`);
  const mine = w.getByTestId(`my-offer-candidacy-${s.candidate}`);
  await expect(mine).toBeVisible({ timeout: 30_000 });
  await expect(mine).toContainText(AG_ORG);
  await expect(mine).toContainText(ROLE);
  await expect(w.getByTestId("my-offer-candidacies"), "the client is never named to the worker").not.toContainText(CO_ORG);
  await noSideways(w, "worker proposals");
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
  // The connection the choice made is the agency's to read — and carries no person's e-mail.
  const conn = await asUser(AG, "agency_client_connections?select=invited_email,status");
  const rows = conn.json as Array<{ invited_email: string; status: string }>;
  expect(rows.length, "one standing connection").toBe(1);
  expect(rows[0]!.status).toBe("active");
  expect(rows[0]!.invited_email, "never the client user's login address").not.toContain(CO);
  expect(rows[0]!.invited_email).toMatch(/^open-need\+[0-9a-f]{32}@connection\.invalid$/);
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
  // The agency's own list of clients names the connection, never the marker.
  await ag.goto(`${B}/en/dashboard/company/partners`);
  await ag.waitForLoadState("networkidle").catch(() => {});
  const connections = ag.getByTestId("agency-bridge-connections");
  await expect(connections).toBeVisible({ timeout: 30_000 });
  await expect(connections).toContainText(/Client from an open need/);
  await expect(connections).not.toContainText(/connection\.invalid/);
  await connections.scrollIntoViewIfNeeded();
  await noSideways(ag, "agency clients");
});

test("5. decision 0033 negatives, read as the outsider itself (its own session)", async ({ browser }) => {
  const other = await fresh(browser);
  await signUp(other, B, AG2); await onboard(other, "agency", "Other Agency Owner"); await setUpCompany(other, `Other Agency ${RUN}`);
  await other.context().close();
  for (const [who, label] of [[AG2, "another agency"], [W2, "an unrelated worker"]] as const) {
    const list = await rpcAs(who, "list_offer_candidates_v1", { p_offer_id: s.offer });
    expect(list.status, `${label}: list`).toBe(200);
    expect(list.json, `${label} reads no candidate of this offer`).toEqual([]);
    const add = await rpcAs(who, "add_offer_candidate_v1", { p_offer_id: s.offer, p_worker_id: s.worker });
    expect(add.status, `${label} cannot propose on this offer`).not.toBe(200);
    const pick = await rpcAs(who, "select_offer_candidate_v1", { p_candidate_id: s.candidate, p_note: null });
    expect(pick.status, `${label} cannot choose`).not.toBe(200);
    const conns = await asUser(who, "agency_client_connections?select=id");
    expect(conns.json, `${label} sees no connection`).toEqual([]);
  }
  // The worker's own list holds only their own proposals; another person's is empty.
  expect((await rpcAs(W2, "list_my_offer_candidacies_v1", {})).json).toEqual([]);
  const mine = (await rpcAs(W, "list_my_offer_candidacies_v1", {})).json as Array<{ candidate_id: string }>;
  expect(mine.map((r) => r.candidate_id)).toEqual([s.candidate]);
});
