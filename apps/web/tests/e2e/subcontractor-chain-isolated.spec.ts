import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import {
  BASE,
  PASSWORD,
  SB_ANON,
  SB_URL,
  accessToken,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  setUpCompany,
  signUp,
  sql,
  stackMailLink,
  userId,
  verifyCompanyAsLocalAdmin,
  onboardInvited,
} from "./isolated-web-a-helpers";

/**
 * THE SUBCONTRACTOR CHAIN THROUGH THE PRODUCT'S OWN SCREENS, on a THROWAWAY local stack
 * (.github/workflows/signup-isolated.yml). Coordinator order 2026-11-22 (owner: every journey end
 * to end before the 11-23 launch): offer -> agreeing scope and price -> order confirmation ->
 * project execution -> work reports, at 1440 px and at 390 px.
 *
 * Built from client-review-isolated.spec.ts, which walks the back half (counterparty registration,
 * the worker's entries, the client's confirmation and dispute, and who sees what) but does the
 * offer, the terms, the agreement and the hand-off by direct database calls. Here those four steps
 * are done on screen, by the people who do them:
 *   - the subcontractor's owner offers its crew against the client's need, with people, rate and
 *     scope, from the people page;
 *   - the client opens the offer under its need, reads the terms and agrees to that version;
 *   - the client puts the agreed crew onto its own project.
 * Client K does all of it at 1440 px, client K2 on a 390 px touch phone. Each step is proven by the
 * stored row, and a third person and the other client read none of it with their own session.
 *
 * "Order confirmation" in the product is the agreed terms version plus the agreed offer: the
 * organization lane has no separate contract record (the copy says "agreed in principle").
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);

const RUN = Date.now().toString(36);
const mail = (who: string) => `subcontract.${who}.${RUN}@local.test`;

const OA = mail("employer");
const W = mail("worker");
const W2 = mail("crewmate");
const R = mail("client");
const R2 = mail("client2");
const X = mail("outsider");

const A_ORG = `QA-SYNTHETIC Employer A ${RUN}`;
const K_ORG = `QA-SYNTHETIC Client K ${RUN}`;
const K2_ORG = `QA-SYNTHETIC Client K2 ${RUN}`;
const TEAM = `QA-SYNTHETIC crew of A ${RUN}`;
const W_NAME = `Synthetic Crew Tiler ${RUN}`;
const W2_NAME = `Synthetic Crew Mate ${RUN}`;
const NEED_K = `QA-SYNTHETIC lobby tiling ${RUN}`;
const NEED_K2 = `QA-SYNTHETIC warehouse screed ${RUN}`;
const PROJECT_K = `QA-SYNTHETIC client K lobby ${RUN}`;
const PROJECT_K2 = `QA-SYNTHETIC client K2 warehouse ${RUN}`;
const TERMS_K = `EUR 41 per hour, terms for K ${RUN}`;
const TERMS_K2 = `EUR 37 per hour, terms for K2 ${RUN}`;
const DISPUTE_NOTE = `The grout lines on the east wall are not done ${RUN}`;

const ENTRY = {
  d1280: `Client lobby: laid 12 m2 of wall tiles, 6 hours (${RUN} desk)`,
  p375: `Client lobby: grouted the east wall, 4 hours (${RUN} p375)`,
  p390: `Client lobby: sealed the floor joints, 3 hours (${RUN} p390)`,
  unsent: `Client lobby: cleaned the site, 1 hour, kept to myself (${RUN} unsent)`,
  employerOnly: `Workshop at the employer: sorted tools, 2 hours (${RUN} employer)`,
  k2: `Second client warehouse: screed levelling, 5 hours (${RUN} k2)`,
} as const;

const s = {
  aOrg: "",
  kOrg: "",
  k2Org: "",
  teamId: "",
  wId: "",
  w2Id: "",
  wWorker: "",
  wTeamCtx: "",
  wACtx: "",
  needK: "",
  needK2: "",
  projectK: "",
  projectK2: "",
  offerK: "",
  offerK2: "",
  linkK: "",
  linkK2: "",
  w1Link: "",
  w2Link: "",
  e: {} as Record<keyof typeof ENTRY, string>,
};

// ── people: one DESKTOP browser context per person for the whole walk ───────
const people = new Map<string, { ctx: BrowserContext; page: Page }>();
async function fresh(browser: Browser, address: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "UTC" });
  const page = await ctx.newPage();
  people.set(address, { ctx, page });
  return page;
}
function desk(address: string): Page {
  const p = people.get(address);
  if (!p) throw new Error("this person has no session in the walk (an earlier step failed)");
  return p.page;
}
test.afterAll(async () => {
  for (const { ctx } of people.values()) await ctx.close().catch(() => {});
});

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const PHONES = {
  "375": { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 },
  "390": { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
} as const;

/** The same person, on a phone: the desktop session is carried over (one sign-in per person —
 *  the local auth server limits sign-ins per IP and every walk in the job shares it). */
async function onPhone(browser: Browser, address: string, width: keyof typeof PHONES): Promise<{ page: Page; close: () => Promise<void> }> {
  const state = await people.get(address)?.ctx.storageState();
  if (!state) throw new Error("this person has no session in the walk (an earlier step failed)");
  const ctx = await browser.newContext({
    storageState: state,
    viewport: PHONES[width].viewport,
    deviceScaleFactor: PHONES[width].deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: USER_AGENT,
    timezoneId: "UTC",
  });
  const page = await ctx.newPage();
  return { page, close: () => ctx.close() };
}

/** Served locally, same path: the product may print its public origin. */
function local(link: string): string {
  const u = new URL(link);
  return `${BASE}${u.pathname}${u.search}`;
}

// ── each person's OWN database reads and commands (their JWT, row-level security) ──
const tokens = new Map<string, string>();
async function jwt(address: string): Promise<string> {
  let t = tokens.get(address);
  if (!t) {
    t = await accessToken(address);
    tokens.set(address, t);
  }
  return t;
}
async function readAs<T>(address: string, path: string): Promise<T[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await jwt(address)}` },
  });
  if (r.status === 401 || r.status === 403) return [];
  if (!r.ok) throw new Error(`rls read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T[];
}
async function rpcAs(address: string, fn: string, args: Record<string, unknown> = {}): Promise<{ status: number; json: unknown }> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await jwt(address)}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: r.status, json };
}
async function rpcOk<T>(address: string, fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await rpcAs(address, fn, args);
  if (r.status >= 300) throw new Error(`${fn} → ${r.status} ${JSON.stringify(r.json)}`);
  return r.json as T;
}
/** A decision attempt that did not record one: an HTTP refusal or a refusal word. */
const DECISIONS = ["approved", "rejected", "changes_requested"];
function refused(r: { status: number; json: unknown }): boolean {
  return r.status >= 400 || !(typeof r.json === "string" && DECISIONS.includes(r.json));
}
/** What each party saw, for the report (synthetic values only). */
function seen(party: string, what: Record<string, unknown>): void {
  const description = `${party}: ${JSON.stringify(what)}`;
  test.info().annotations.push({ type: "0033-sees", description });
  console.log(`[subcontract] ${description}`);
}

// ── page measures ───────────────────────────────────────────────────────────
/** The page is never wider than the phone (body, not documentElement: globals.css clips the root). */
async function fitsTheScreen(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const got = await page.evaluate(() => ({ scroll: document.body.scrollWidth, inner: document.documentElement.clientWidth }));
  expect(got.scroll - got.inner, `${where}: the body reaches ${got.scroll - got.inner} px past a ${got.inner} px screen`).toBeLessThanOrEqual(1);
}
/** A control a thumb can hit: at least 44 px tall (sub-pixel rounding at device scale 2 and 3). */
async function thumbSized(target: Locator, where: string): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box, `${where} is on the page`).not.toBeNull();
  expect(box!.height, `${where} is ${box!.height} px tall`).toBeGreaterThanOrEqual(43.5);
}
/** Tap until the expected result shows: a tap before hydration is a silent no-op. */
async function tapUntil(target: Locator, result: Locator, timeout = 60_000): Promise<void> {
  await expect(async () => {
    if (!(await result.isVisible().catch(() => false))) await target.tap({ timeout: 5_000 });
    await expect(result).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout });
}

// ── setup doors (the same ones teams-projects-isolated.spec.ts walks) ───────
/** The person proves their mailbox the product's own way (an addressed invitation resolves only
 *  for a verified address). */
async function verifyEmail(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/network`);
  const prompt = page.getByTestId("network-email-unverified");
  await expect(prompt, "a new account is asked to confirm its address").toBeVisible({ timeout: 30_000 });
  await prompt.getByTestId("verify-email-send").click();
  await expect(prompt.getByTestId("verify-email-sent")).toBeVisible({ timeout: 30_000 });
  await page.goto(await stackMailLink(address));
  await page.waitForURL((url) => url.host === new URL(BASE).host && !url.pathname.includes("/auth/callback"), {
    timeout: 60_000,
  });
}

/** The employer hands a join-organization LINK; the worker registers through it. */
async function joinByLink(browser: Browser, owner: Page, address: string, name: string): Promise<string> {
  await owner.goto(`${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${s.aOrg}#network-invite`);
  const panel = owner.getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByTestId("invite-mode-link").click();
  await panel.getByTestId("invite-name").fill(name);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed to the employer").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();

  const w = await fresh(browser, address);
  await w.goto(local(raw!));
  await w.getByTestId("invite-register").click();
  await w.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  await w.locator('input[type="email"]').fill(address);
  await w.locator('input[name="password"]').fill(PASSWORD);
  const confirm = w.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await w.locator('form button[type="submit"]').click();
  await w.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(w.url())) await onboardInvited(w, name);
  await w.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(w.url())) {
    const accept = w.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  const id = await userId(address);
  await expect
    .poll(
      () =>
        sql<{ n: number }>(
          `select count(*)::int as n from public.engagement_contexts
            where profile_id = ${lit(id)} and organization_id = ${lit(s.aOrg)}
              and relationship_slug = 'employee' and status = 'active'`,
        )[0]?.n ?? 0,
      { message: "registering through the link makes the worker A's employee", timeout: 30_000 },
    )
    .toBe(1);
  return id;
}

function teamMembers(): string[] {
  return sql<{ profile_id: string }>(
    `select profile_id from public.engagement_contexts
      where organization_id = ${lit(s.teamId)} and status = 'active' and relationship_slug = 'employee'
      order by profile_id`,
  ).map((r) => r.profile_id);
}

/** A's owner picks a person on the team card and gets a link for them. */
async function inviteToTeam(co: Page, name: string, address: string, previousLink: string): Promise<string> {
  const pick = co.locator(`[id="team-add-${s.teamId}"]`);
  await expect(pick, "the team card offers people to add").toBeVisible({ timeout: 30_000 });
  const options = await pick.locator("option").allInnerTexts();
  const label = options.find((o) => o.includes(name));
  expect(label, `the picker offers A's own person (${options.length} options)`).toBeTruthy();
  await pick.selectOption({ label: label! });
  const add = co.getByTestId(`team-invite-member-${s.teamId}`);
  await add.click();
  const code = co.getByTestId("team-invite-link").locator("code");
  const typed = co.getByTestId(`team-invite-email-${s.teamId}`);
  const fresher = async () => {
    if ((await code.count()) === 0) return "";
    const text = (await code.first().innerText().catch(() => "")).trim();
    return text && text !== previousLink ? text : "";
  };
  await expect
    .poll(async () => (await fresher()) !== "" || (await typed.isVisible().catch(() => false)), { timeout: 30_000 })
    .toBe(true);
  if ((await fresher()) === "") {
    await typed.fill(address);
    await add.click();
  }
  let link = "";
  await expect
    .poll(async () => (link = await fresher()), { message: "a fresh invitation link is shown", timeout: 30_000 })
    .not.toBe("");
  return link;
}

/** A client: sign-up, company setup, a need, a project — all through the forms; then the
 *  operator's verification (the existing local admin door). */
async function newClient(
  browser: Browser,
  address: string,
  owner: string,
  org: string,
  need: string,
  project: string,
  admin: string,
): Promise<{ orgId: string; needId: string; projectId: string }> {
  const page = await fresh(browser, address);
  await signUp(page, BASE, address);
  await onboard(page, "hire", owner);
  await setUpCompany(page, org);
  await publishNeed(page, BASE, need, "LT");

  await page.goto(`${BASE}/en/dashboard/company/projects/new`);
  const form = page.getByRole("main");
  await form.getByTestId("project-name-input").fill(project);
  await form.getByTestId("project-create-submit").click();
  const ok = form.getByTestId("project-context-created");
  const err = form.getByTestId("project-create-error");
  await expect(ok.or(err)).toBeVisible({ timeout: 30_000 });
  if (await err.isVisible()) throw new Error(`project not created: ${await err.getAttribute("data-code")}`);

  await verifyCompanyAsLocalAdmin(address, admin);
  const profile = await userId(address);
  const orgs = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(profile)} and organization_type <> 'team'`,
  );
  expect(orgs, "the client's organisation is stored once").toHaveLength(1);
  const needs = sql<{ id: string; organization_id: string | null }>(
    `select id, organization_id from public.customer_requests
      where (title = ${lit(need)} or role_or_work_type = ${lit(need)}) and profile_id = ${lit(profile)}`,
  );
  expect(needs, "the need is stored once").toHaveLength(1);
  expect(needs[0]!.organization_id, "the need is the organisation's").toBe(orgs[0]!.id);
  const projects = sql<{ id: string; organization_id: string | null }>(
    `select id, organization_id from public.projects where title = ${lit(project)}`,
  );
  expect(projects, "the project is stored once").toHaveLength(1);
  expect(projects[0]!.organization_id, "the project is the client's own").toBe(orgs[0]!.id);
  return { orgId: orgs[0]!.id, needId: needs[0]!.id, projectId: projects[0]!.id };
}

/** The subcontractor offers its crew, the client agrees to the terms and hands the crew onto its
 *  own project — every step on screen, on a desktop (1440 px) or a 390 px phone. */
async function crewToClientOnScreen(
  browser: Browser,
  client: string,
  otherClient: string,
  needId: string,
  projectId: string,
  terms: string,
  scope: string,
  device: "desk" | "390",
): Promise<{ offerId: string }> {
  const touch = device === "390";
  const open = async (who: string) => (touch ? await onPhone(browser, who, "390") : { page: desk(who), close: async () => {} });
  const press = async (target: Locator) => (touch ? target.tap() : target.click());

  // OFFER: the subcontractor's owner, from the people page's crew card.
  const a = await open(OA);
  await a.page.goto(`${BASE}/en/dashboard/company/people`);
  const section = a.page.getByTestId(`team-demand-offer-section-${s.teamId}`);
  await expect(section, "the crew card offers the crew to an open need").toBeVisible({ timeout: 30_000 });
  const pick = a.page.getByTestId(`team-offer-demand-${s.teamId}`);
  await expect(async () => {
    if (!(await pick.isVisible().catch(() => false))) await press(section.locator("summary").first());
    await expect(pick).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await expect(pick.locator(`option[value="${needId}"]`), "the client's open need is offered").toHaveCount(1, { timeout: 30_000 });
  await pick.selectOption(needId);
  await a.page.getByTestId(`team-offer-note-${s.teamId}`).fill(`QA-SYNTHETIC offer ${RUN}: our crew of two can start next week.`);
  await section.getByLabel("People", { exact: true }).fill("2");
  await section.getByLabel("Rate", { exact: true }).fill(terms);
  await section.getByLabel("Scope of work", { exact: true }).fill(scope);
  const send = a.page.getByTestId(`team-offer-submit-${s.teamId}`);
  if (touch) {
    await thumbSized(send, "the subcontractor's offer button");
    await fitsTheScreen(a.page, "the subcontractor's offer form on a 390 px phone");
  }
  await press(send);
  let offerId = "";
  await expect
    .poll(
      () =>
        (offerId =
          sql<{ id: string }>(
            `select id from public.team_demand_offers where team_org_id = ${lit(s.teamId)} and request_id = ${lit(needId)} and status = 'offered'`,
          )[0]?.id ?? ""),
      { message: "the offer is stored", timeout: 30_000 },
    )
    .not.toBe("");
  await expect(a.page.getByTestId(`team-offer-sent-${s.teamId}`), "the sent offer is listed for the subcontractor").toBeVisible({ timeout: 30_000 });
  const v1 = sql<{ version: number; capacity: number | null; rate_text: string | null; scope_text: string | null; status: string; proposed_side: string }>(
    `select version, capacity, rate_text, scope_text, status, proposed_side from public.team_demand_offer_terms where offer_id = ${lit(offerId)} order by version`,
  );
  expect(v1, "the offer carries its terms as version 1").toHaveLength(1);
  expect(v1[0]).toMatchObject({ version: 1, capacity: 2, rate_text: terms, scope_text: scope, status: "proposed" });
  seen("subcontractor (offer + terms v1)", { offer: "offered", capacity: v1[0]!.capacity, rate: v1[0]!.rate_text, side: v1[0]!.proposed_side });
  await a.close();

  // AGREE SCOPE AND PRICE: the client, under its own need.
  const k = await open(client);
  await k.page.goto(`${BASE}/en/dashboard/company/scouting?request=${needId}`);
  const card = k.page.getByTestId(`team-offer-received-${offerId}`);
  const shown = await card.waitFor({ state: "visible", timeout: 60_000 }).then(() => true, () => false);
  if (!shown) {
    await k.page.screenshot({ path: test.info().outputPath(`offer-missing-${device}.png`), fullPage: true });
    console.log(`[subcontract] offer card missing at ${k.page.url()}: ${(await k.page.getByRole("main").innerText().catch(() => "")).slice(0, 1500)}`);
  }
  await expect(card, "the offer is shown under the client's need").toBeVisible({ timeout: 1_000 });
  const box = card.getByTestId(`team-offer-terms-${offerId}`);
  const agree = card.getByTestId(`team-offer-terms-agree-${offerId}`);
  await expect(async () => {
    if (!(await agree.isVisible().catch(() => false))) await press(box.locator("summary").first());
    await expect(agree).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await expect(box, "the client reads the proposed rate").toContainText(terms);
  await expect(box, "and the proposed scope").toContainText(scope);
  if (touch) {
    await thumbSized(agree, "the client's agree-to-terms button");
    await fitsTheScreen(k.page, "the client's offer card on a 390 px phone");
  }
  await press(agree);
  await expect
    .poll(
      () => sql<{ status: string }>(`select status from public.team_demand_offer_terms where offer_id = ${lit(offerId)} and version = 1`)[0]?.status,
      { message: "terms version 1 is stored as agreed", timeout: 30_000 },
    )
    .toBe("accepted");

  // ORDER CONFIRMATION: the offer itself is agreed (the product's "agreed in principle").
  const offerStatus = () => sql<{ status: string }>(`select status from public.team_demand_offers where id = ${lit(offerId)}`)[0]?.status;
  if (offerStatus() === "offered") {
    await k.page.reload();
    const accept = k.page.getByTestId(`team-offer-accept-${offerId}`);
    await expect(accept).toBeVisible({ timeout: 30_000 });
    await press(accept);
  }
  await expect.poll(offerStatus, { message: "the offer is stored as agreed", timeout: 30_000 }).toBe("accepted");
  seen("client (agreement)", { terms_v1: "accepted", offer: offerStatus() });

  // PROJECT EXECUTION: the client puts the agreed crew on its own project.
  await k.page.reload();
  const assign = k.page.getByTestId(`team-offer-assign-${offerId}`);
  await expect(assign, "an agreed offer offers the hand-off into a project").toBeVisible({ timeout: 30_000 });
  await assign.locator("select").selectOption(projectId);
  const go = k.page.getByTestId(`team-offer-assign-submit-${offerId}`);
  if (touch) await thumbSized(go, "the client's assign button");
  await press(go);
  await expect
    .poll(() => offerStatus(), { message: "the offer is stored as assigned", timeout: 30_000 })
    .toBe("assigned");
  const rows = sql<{ team_org_id: string; ended_at: string | null }>(
    `select team_org_id, ended_at from public.team_assignments where project_id = ${lit(projectId)}`,
  );
  expect(rows, "ONE team assignment on the client's project").toEqual([{ team_org_id: s.teamId, ended_at: null }]);
  await k.page.reload();
  await expect(k.page.getByTestId(`team-offer-received-${offerId}`), "the card says the crew is assigned, after a reload").toContainText(
    "Assigned. The team's members now appear on that project.",
    { timeout: 30_000 },
  );
  await k.close();

  // RIGHTS: an unrelated person and the other client read neither the offer nor its terms.
  for (const who of [X, otherClient]) {
    expect(await readAs(who, `team_demand_offers?id=eq.${offerId}&select=id`), "another party cannot read the offer").toEqual([]);
    expect(await readAs(who, `team_demand_offer_terms?offer_id=eq.${offerId}&select=id`), "nor its terms").toEqual([]);
  }
  return { offerId };
}

// ── the worker's journal ─────────────────────────────────────────────────────
/** One entry through the journal's own flow, for a chosen relationship and project. */
async function record(page: Page, text: string, contextId: string, projectId: string | null, touch: boolean): Promise<string> {
  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  await main.getByTestId("journal-quick-record-text").fill(text);
  const understand = main.getByTestId("journal-quick-record-understand");
  const flow = main.getByTestId("worklog-flow");
  if (touch) await tapUntil(understand, flow);
  else {
    await understand.click();
    await expect(flow).toBeVisible({ timeout: 30_000 });
  }
  // W belongs to A and to A's crew T: the form asks which relationship the work was for.
  const context = main.getByTestId("worklog-context");
  await expect(context, "two relationships: the form asks which one").toBeVisible({ timeout: 30_000 });
  await context.selectOption(contextId);
  const project = main.getByTestId("worklog-project");
  if (projectId) {
    if (await project.isVisible().catch(() => false)) await project.selectOption(projectId);
    else await expect(main.getByTestId("worklog-project-auto"), "the one project is filed on its own").toBeVisible();
  } else if (await project.isVisible().catch(() => false)) {
    await project.selectOption("none");
  }
  if (touch) {
    await main.getByTestId("worklog-save").tap();
    await main.getByTestId("worklog-confirm").tap();
  } else {
    await main.getByTestId("worklog-save").click();
    await main.getByTestId("worklog-confirm").click();
  }
  const done = main.getByTestId("worklog-done");
  await expect(done.or(main.getByTestId("worklog-error")).or(main.getByTestId("worklog-blocked"))).toBeVisible({
    timeout: 60_000,
  });
  await expect(done, "the journal entry is saved").toBeVisible();
  const rows = sql<{ id: string; project_id: string | null; engagement_context_id: string | null }>(
    `select e.id, e.project_id, e.engagement_context_id from public.journal_entries e
       join public.workers w on w.id = e.worker_id
      where w.profile_id = ${lit(s.wId)} and e.original_text = ${lit(text)}
        and e.superseded_by is null and e.deleted_at is null`,
  );
  expect(rows, "the entry is stored once").toHaveLength(1);
  expect(rows[0]!.engagement_context_id, "for the chosen relationship").toBe(contextId);
  expect(rows[0]!.project_id, "on the chosen project").toBe(projectId);
  return rows[0]!.id;
}

/** An organisation's name as the product shows it (display name, else legal name). */
function orgName(id: string): string {
  const row = sql<{ name: string | null }>(
    `select coalesce(nullif(btrim(display_name), ''), nullif(btrim(legal_name), '')) as name
       from public.organizations where id = ${lit(id)}`,
  )[0];
  if (!row?.name) throw new Error("the organisation has no name");
  return row.name;
}

/** W submits one entry to the client named on its review panel; the submission row is read back. */
async function submit(page: Page, entryId: string, clientOrg: string, linkId: string, touch: boolean): Promise<void> {
  const client = orgName(clientOrg);
  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  const panel = main.getByTestId(`entry-review-${entryId}`);
  await expect(panel, "the entry offers client review").toHaveAttribute("data-phase", "ready_to_submit", { timeout: 60_000 });
  await expect(panel, "nothing is submitted until the worker presses the button").toContainText(client);
  const button = panel.getByTestId(`entry-review-submit-${entryId}`);
  if (touch) {
    await thumbSized(button, "the worker's submit-for-review button");
    await fitsTheScreen(page, "the worker's journal with the review panel");
  }
  // The worker has no decision control over their own work.
  await expect(main.locator('[data-testid^="counterparty-decide-"]')).toHaveCount(0);
  await expect(async () => {
    if ((await panel.getAttribute("data-phase")) !== "submitted") {
      if (touch) await button.tap({ timeout: 5_000 });
      else await button.click({ timeout: 5_000 });
    }
    await expect(panel).toHaveAttribute("data-phase", "submitted", { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  const sub = sql<{ link_id: string; submitted_by: string; worker_id: string }>(
    `select link_id, submitted_by, worker_id from public.journal_entry_review_submissions where entry_id = ${lit(entryId)}`,
  );
  expect(sub, "one stored submission").toEqual([{ link_id: linkId, submitted_by: s.wId, worker_id: s.wWorker }]);
}

type Decision = { confirmer_id: string; decision: string | null; action: string | null; basis: string | null; note: string | null; party: string | null };
function decisions(entryId: string): Decision[] {
  return sql<Decision>(
    `select confirmer_id, confirmation_scope->>'decision' as decision, confirmation_scope->>'action' as action,
            confirmation_scope#>>'{authority,basis}' as basis, confirmation_scope->>'note' as note,
            confirmation_scope#>>'{authority,party_organization_id}' as party
       from public.journal_entry_confirmations where entry_id = ${lit(entryId)} order by created_at, id`,
  );
}

// ── CR-0 ────────────────────────────────────────────────────────────────────

test("CR-0a. employer A, two of its people, and A's crew T with both of them in it", async ({ browser }) => {
  const oa = await fresh(browser, OA);
  await signUp(oa, BASE, OA);
  await onboard(oa, "hire", `Synthetic Employer Owner ${RUN}`);
  await setUpCompany(oa, A_ORG);
  const oaId = await userId(OA);
  const orgs = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(oaId)} and organization_type <> 'team'`,
  );
  expect(orgs, "the setup created one organisation").toHaveLength(1);
  s.aOrg = orgs[0]!.id;

  s.wId = await joinByLink(browser, oa, W, W_NAME);
  s.w2Id = await joinByLink(browser, oa, W2, W2_NAME);
  s.wWorker = sql<{ id: string }>(`select id from public.workers where profile_id = ${lit(s.wId)}`)[0]!.id;

  await oa.goto(`${BASE}/en/dashboard/company/people`);
  await expect(oa.getByTestId("team-brigades-panel")).toBeVisible({ timeout: 30_000 });
  await oa.getByTestId("team-create-name").fill(TEAM);
  await oa.getByTestId("team-create-submit").click();
  await expect(oa.locator('[data-testid^="team-brigade-"]', { hasText: TEAM })).toBeVisible({ timeout: 30_000 });
  const teams = sql<{ id: string }>(`select id from public.organizations where display_name = ${lit(TEAM)} and organization_type = 'team'`);
  expect(teams, "the crew is stored once").toHaveLength(1);
  s.teamId = teams[0]!.id;
  s.w1Link = await inviteToTeam(oa, W_NAME, W, "");
  s.w2Link = await inviteToTeam(oa, W2_NAME, W2, s.w1Link);

  for (const [address, link] of [
    [W, s.w1Link],
    [W2, s.w2Link],
  ] as const) {
    const page = desk(address);
    await verifyEmail(page, address);
    await page.goto(local(link));
    await expect(page.getByTestId("invite-page")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("invite-accept").click();
    await page.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
  }
  await expect
    .poll(() => teamMembers(), { message: "both people accepted: the crew has two members", timeout: 30_000 })
    .toEqual([s.wId, s.w2Id].sort());
  const ctx = (org: string) =>
    sql<{ id: string }>(
      `select id from public.engagement_contexts where profile_id = ${lit(s.wId)} and organization_id = ${lit(org)}
         and relationship_slug = 'employee' and status = 'active'`,
    )[0]?.id ?? "";
  s.wACtx = ctx(s.aOrg);
  s.wTeamCtx = ctx(s.teamId);
  expect(s.wACtx && s.wTeamCtx, "W works for A and in A's crew").toBeTruthy();
});

test("CR-0b. client K and second client K2: each a verified company with a need and its own project", async ({ browser }) => {
  expect(s.teamId, "CR-0a set up the employer").toBeTruthy();
  const k = await newClient(browser, R, `Synthetic Client Rep ${RUN}`, K_ORG, NEED_K, PROJECT_K, mail("admin1"));
  Object.assign(s, { kOrg: k.orgId, needK: k.needId, projectK: k.projectId });
  const k2 = await newClient(browser, R2, `Synthetic Second Client Rep ${RUN}`, K2_ORG, NEED_K2, PROJECT_K2, mail("admin2"));
  Object.assign(s, { k2Org: k2.orgId, needK2: k2.needId, projectK2: k2.projectId });
  const x = await fresh(browser, X);
  await signUp(x, BASE, X);
  await onboard(x, "work", `Synthetic Unrelated Person ${RUN}`);
  await x.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
});

test("CR-0c. on screen: A offers its crew with terms; K agrees at 1440 px, K2 on a 390 px phone; each puts it on its project", async ({ browser }) => {
  expect(s.needK && s.needK2, "CR-0b created both clients").toBeTruthy();
  s.offerK = (
    await crewToClientOnScreen(browser, R, R2, s.needK, s.projectK, TERMS_K, `Tile the lobby walls and floor ${RUN}`, "desk")
  ).offerId;
  s.offerK2 = (
    await crewToClientOnScreen(browser, R2, R, s.needK2, s.projectK2, TERMS_K2, `Level and screed the warehouse floor ${RUN}`, "390")
  ).offerId;
  // A's own review of the crew's work stays switched on (the employer side, decision 0018):
  // the people-page switch's RPC, as A's owner.
  expect(await rpcOk<string>(OA, "set_engagement_journal_review", { p_engagement_id: s.wTeamCtx, p_enabled: true })).toBe("enabled");
});

test("CR-0d. K's representative registers K as the counterparty of W's work from the project page; K2 the same for P2", async () => {
  expect(s.offerK, "CR-0c assigned the crew").toBeTruthy();
  const r = desk(R);
  await r.goto(`${BASE}/en/dashboard/projects/${s.projectK}`);
  const panel = r.getByRole("main").getByTestId("counterparty-link-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const row = panel.getByTestId(`counterparty-link-row-${s.wWorker}`);
  await expect(row, "W is a candidate: a real, active crew assignment on K's project").toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    if (!(await panel.getByTestId(`counterparty-link-active-${s.wWorker}`).isVisible().catch(() => false))) {
      await panel.getByTestId(`counterparty-link-register-${s.wWorker}`).click({ timeout: 5_000 });
    }
    await expect(panel.getByTestId(`counterparty-link-active-${s.wWorker}`)).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  const rId = await userId(R);
  const links = sql<{ id: string; worker_id: string; counterparty_organization_id: string; party_role: string; established_by: string }>(
    `select id, worker_id, counterparty_organization_id, party_role, established_by
       from public.work_counterparty_links where project_id = ${lit(s.projectK)} and revoked_at is null`,
  );
  expect(links).toHaveLength(1);
  expect(links[0]).toMatchObject({ worker_id: s.wWorker, counterparty_organization_id: s.kOrg, party_role: "client", established_by: rId });
  s.linkK = links[0]!.id;

  expect(
    await rpcOk<string>(R2, "register_work_counterparty_link_v1", { p_project_id: s.projectK2, p_worker_id: s.wWorker, p_party_role: "client" }),
  ).toBe("registered");
  s.linkK2 = sql<{ id: string }>(
    `select id from public.work_counterparty_links where project_id = ${lit(s.projectK2)} and revoked_at is null`,
  )[0]!.id;
  // Neither client can register itself for the other's project.
  expect(
    await rpcOk<string>(R, "register_work_counterparty_link_v1", { p_project_id: s.projectK2, p_worker_id: s.wWorker, p_party_role: "client" }),
  ).toBe("not_authorized");
});

// ── CR-1 ────────────────────────────────────────────────────────────────────

test("CR-1 (1440). W records an entry on K's project at a desktop and submits it to K", async () => {
  expect(s.linkK, "CR-0d registered K").toBeTruthy();
  const page = desk(W);
  s.e.d1280 = await record(page, ENTRY.d1280, s.wTeamCtx, s.projectK, false);
  await submit(page, s.e.d1280, s.kOrg, s.linkK, false);
});

for (const width of ["375", "390"] as const) {
  test(`CR-1 (${width}). W records an entry on K's project on a ${width} px phone and submits it to K`, async ({ browser }) => {
    expect(s.linkK, "CR-0d registered K").toBeTruthy();
    const { page, close } = await onPhone(browser, W, width);
    const key = width === "375" ? "p375" : "p390";
    s.e[key] = await record(page, ENTRY[key], s.wTeamCtx, s.projectK, true);
    await submit(page, s.e[key], s.kOrg, s.linkK, true);
    await close();
  });
}

// ── CR-2 ────────────────────────────────────────────────────────────────────

test("CR-2. R accepts the desktop entry on a 390 px phone; it is stored as K's acceptance; W sees it and the CV counts it", async ({ browser }) => {
  const entry = s.e.d1280;
  expect(entry, "CR-1 submitted the entry").toBeTruthy();
  const r = await onPhone(browser, R, "390");
  await r.page.goto(`${BASE}/en/dashboard/inbox/counterparty`);
  const main = r.page.getByRole("main");
  const card = main.getByTestId(`counterparty-card-${entry}`);
  await expect(card, "the submitted entry is in K's queue").toBeVisible({ timeout: 60_000 });
  await expect(card).toHaveAttribute("data-bucket", "to_decide");
  await expect(card).toContainText(ENTRY.d1280);
  await fitsTheScreen(r.page, "the client's queue on a 390 px phone");
  const radios = card.locator("label").filter({ has: r.page.locator('input[type="radio"]') });
  expect(await radios.count(), "accept, request a correction, dispute").toBe(3);
  for (let i = 0; i < 3; i += 1) await thumbSized(radios.nth(i), `decision ${i + 1}`);
  await thumbSized(card.locator("textarea"), "the note field");
  const decide = card.getByTestId(`counterparty-decide-${entry}`);
  await expect(async () => {
    await card.getByRole("radio", { name: /accept the work/i }).check({ timeout: 5_000 });
    await expect(decide).toBeEnabled({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await thumbSized(decide, "the client's Accept button");
  await fitsTheScreen(r.page, "the client's card with a decision chosen");
  await expect(async () => {
    if (decisions(entry).length === 0) await decide.tap({ timeout: 5_000 });
    await expect.poll(() => decisions(entry).length, { timeout: 10_000 }).toBe(1);
  }).toPass({ timeout: 60_000 });
  await expect(main.getByTestId(`counterparty-final-${entry}`), "accepting is final").toBeVisible({ timeout: 30_000 });
  await fitsTheScreen(r.page, "the client's card after accepting");
  await r.close();

  const rId = await userId(R);
  expect(decisions(entry), "ONE stored decision: K's acceptance, not an employer confirmation").toEqual([
    { confirmer_id: rId, decision: "approved", action: "client_accept", basis: "counterparty", note: null, party: s.kOrg },
  ]);

  const w = await onPhone(browser, W, "390");
  await w.page.goto(`${BASE}/en/dashboard/journal`);
  const panel = w.page.getByRole("main").getByTestId(`entry-review-${entry}`);
  await expect(panel, "W sees the client's acceptance").toHaveAttribute("data-phase", "accepted", { timeout: 60_000 });
  await expect(panel.getByTestId(`entry-review-accepted-${entry}`), "named as K's acceptance").toContainText(orgName(s.kOrg));
  await fitsTheScreen(w.page, "the worker's journal with the accepted entry");
  await w.page.goto(`${BASE}/en/cv`);
  const counted = w.page.getByRole("main").getByTestId("cv-client-accepted-work").filter({ visible: true }).first();
  await expect(counted, "the Living CV counts work the client accepted, as its own fact").toBeVisible({ timeout: 60_000 });
  expect(Number(await counted.getAttribute("data-entries"))).toBeGreaterThanOrEqual(1);
  await fitsTheScreen(w.page, "the Living CV on a 390 px phone");
  await w.close();
});

// ── CR-3 ────────────────────────────────────────────────────────────────────

test("CR-3. R disputes (rejects) the 375 px entry with a note on a 375 px phone; stored; W sees the rejection and the note", async ({ browser }) => {
  const entry = s.e.p375;
  expect(entry, "CR-1 submitted the entry").toBeTruthy();
  const r = await onPhone(browser, R, "375");
  await r.page.goto(`${BASE}/en/dashboard/inbox/counterparty`);
  const main = r.page.getByRole("main");
  const card = main.getByTestId(`counterparty-card-${entry}`);
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toHaveAttribute("data-bucket", "to_decide");
  await fitsTheScreen(r.page, "the client's queue on a 375 px phone");
  const decide = card.getByTestId(`counterparty-decide-${entry}`);
  await expect(async () => {
    await card.getByRole("radio", { name: /^dispute/i }).check({ timeout: 5_000 });
    await expect(card.getByLabel(/note \(required\)/i), "a rejection needs its reason").toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await card.getByLabel(/note \(required\)/i).fill(DISPUTE_NOTE);
  await thumbSized(decide, "the client's Dispute button");
  await fitsTheScreen(r.page, "the client's card with the note written");
  await expect(async () => {
    if (decisions(entry).length === 0) await decide.tap({ timeout: 5_000 });
    await expect.poll(() => decisions(entry).length, { timeout: 10_000 }).toBe(1);
  }).toPass({ timeout: 60_000 });
  await r.page.goto(`${BASE}/en/dashboard/inbox/counterparty`);
  await expect(main.getByTestId(`counterparty-card-${entry}`)).toHaveAttribute("data-bucket", "disputed", { timeout: 30_000 });
  await expect(main.getByTestId(`counterparty-history-${entry}`)).toContainText(DISPUTE_NOTE);
  await r.close();

  const rId = await userId(R);
  expect(decisions(entry), "ONE stored decision: K's dispute with its note").toEqual([
    { confirmer_id: rId, decision: "rejected", action: "client_dispute", basis: "counterparty", note: DISPUTE_NOTE, party: s.kOrg },
  ]);

  const w = await onPhone(browser, W, "375");
  await w.page.goto(`${BASE}/en/dashboard/journal`);
  const panel = w.page.getByRole("main").getByTestId(`entry-review-${entry}`);
  await expect(panel, "W sees the rejection").toHaveAttribute("data-phase", "disputed", { timeout: 60_000 });
  await expect(panel.getByTestId(`entry-review-disputed-${entry}`)).toContainText(DISPUTE_NOTE);
  await fitsTheScreen(w.page, "the worker's journal with the disputed entry");
  await w.close();
});

// ── CR-4 ────────────────────────────────────────────────────────────────────

test("CR-4a. W's other work: an unsent entry on P, an entry for A only, and an entry submitted to K2", async () => {
  expect(s.linkK2, "CR-0d registered K2").toBeTruthy();
  const page = desk(W);
  s.e.unsent = await record(page, ENTRY.unsent, s.wTeamCtx, s.projectK, false);
  s.e.employerOnly = await record(page, ENTRY.employerOnly, s.wACtx, null, false);
  s.e.k2 = await record(page, ENTRY.k2, s.wTeamCtx, s.projectK2, false);
  await submit(page, s.e.k2, s.k2Org, s.linkK2, false);
  expect(
    sql<{ n: number }>(`select count(*)::int as n from public.journal_entry_review_submissions where entry_id in (${lit(s.e.unsent)}, ${lit(s.e.employerOnly)})`)[0]!.n,
    "nothing is submitted automatically",
  ).toBe(0);
});

const toK = () => [s.e.d1280, s.e.p375, s.e.p390];
const notK = () => [s.e.unsent, s.e.employerOnly, s.e.k2];

test("CR-4b. R (K) sees only the entries submitted to K: not W's other work, not K2's, not A's terms with K2", async () => {
  expect(s.e.k2, "CR-4a recorded W's other work").toBeTruthy();
  // The UI, at a desktop.
  const r = desk(R);
  await r.goto(`${BASE}/en/dashboard/inbox/counterparty`);
  const main = r.getByRole("main");
  await expect(main.getByTestId(`counterparty-card-${s.e.p390}`), "the third submission waits for K").toHaveAttribute("data-bucket", "to_decide", {
    timeout: 60_000,
  });
  await expect(main.getByTestId(`counterparty-card-${s.e.d1280}`)).toHaveAttribute("data-bucket", "accepted");
  await expect(main.getByTestId(`counterparty-card-${s.e.p375}`)).toHaveAttribute("data-bucket", "disputed");
  await expect(main.locator('[data-testid^="counterparty-card-"]'), "exactly K's three submissions").toHaveCount(3);
  const page = (await main.textContent()) ?? "";
  for (const secret of [ENTRY.unsent, ENTRY.employerOnly, ENTRY.k2, K2_ORG, orgName(s.k2Org), NEED_K2, PROJECT_K2, TERMS_K2]) {
    expect(page, `K's queue does not show "${secret}"`).not.toContain(secret);
  }

  // R's own database reads.
  const queue = await rpcOk<{ entry_id: string; party_organization_id: string }[]>(R, "list_counterparty_review_queue_v1", {});
  expect(queue.map((q) => q.entry_id).sort(), "K's queue = the three entries W submitted to K").toEqual(toK().sort());
  expect(new Set(queue.map((q) => q.party_organization_id))).toEqual(new Set([s.kOrg]));
  const subs = await readAs<{ entry_id: string }>(R, "journal_entry_review_submissions?select=entry_id");
  expect(subs.map((x) => x.entry_id).sort(), "submission rows R can read").toEqual(toK().sort());
  const links = await readAs<{ id: string; counterparty_organization_id: string }>(R, "work_counterparty_links?select=id,counterparty_organization_id");
  expect(links, "only K's own link").toEqual([{ id: s.linkK, counterparty_organization_id: s.kOrg }]);
  const all = [...toK(), ...notK()];
  const entries = await readAs<{ id: string }>(R, `journal_entries?id=in.(${all.join(",")})&select=id`);
  for (const id of notK()) expect(entries.map((x) => x.id), "W's other work stays closed to K").not.toContain(id);
  for (const id of notK()) {
    expect(await rpcOk<unknown>(R, "counterparty_review_entry_detail_v1", { p_entry_id: id }), "no detail of work not submitted to K").toBeNull();
    expect(refused(await rpcAs(R, "review_journal_entry", { p_entry_id: id, p_decision: "approved", p_note: null })), "K cannot decide it").toBe(true);
  }
  // Commercial terms: K reads the terms it agreed with A; never A's terms with K2.
  const ownTerms = await rpcOk<{ rate_text: string | null }[]>(R, "list_team_demand_offer_terms_v1", { p_offer_id: s.offerK });
  expect(ownTerms.map((t) => t.rate_text), "K's own agreed terms").toContain(TERMS_K);
  const otherTerms = await rpcAs(R, "list_team_demand_offer_terms_v1", { p_offer_id: s.offerK2 });
  expect(otherTerms.status >= 400 || JSON.stringify(otherTerms.json) === "[]", "A's terms with K2 are not K's").toBe(true);
  expect(JSON.stringify(otherTerms.json ?? "")).not.toContain(TERMS_K2);
  expect(await readAs(R, `team_demand_offers?id=eq.${s.offerK2}&select=id`), "A's offer to K2").toEqual([]);
  const k2Offers = await rpcAs(R, "list_team_offers_for_request_v2", { p_request_id: s.needK2 });
  expect(k2Offers.status >= 400 || JSON.stringify(k2Offers.json) === "[]", "the offers made to K2's need").toBe(true);
  // Recorded, not asserted: rows the design may legitimately show K.
  const aMembers = await readAs<{ id: string }>(R, `engagement_contexts?organization_id=eq.${s.aOrg}&select=id`);
  const k2Need = await readAs<{ id: string }>(R, `customer_requests?id=eq.${s.needK2}&select=id`);
  seen("R (client K)", {
    queue: queue.length,
    submissionRows: subs.length,
    links: links.length,
    readableJournalEntriesOfW: entries.length,
    ownTermsVersions: ownTerms.length,
    termsOfA_withK2: otherTerms.json,
    engagementRowsOfA: aMembers.length,
    k2NeedRowReadable: k2Need.length,
  });
});

test("CR-4c. R2 (K2) sees only the entry submitted to K2; X sees nothing; W cannot decide its own work", async () => {
  expect(s.e.k2, "CR-4a recorded W's other work").toBeTruthy();
  const r2 = desk(R2);
  await r2.goto(`${BASE}/en/dashboard/inbox/counterparty`);
  const main = r2.getByRole("main");
  await expect(main.getByTestId(`counterparty-card-${s.e.k2}`)).toBeVisible({ timeout: 60_000 });
  await expect(main.locator('[data-testid^="counterparty-card-"]'), "exactly K2's one submission").toHaveCount(1);
  const page = (await main.textContent()) ?? "";
  for (const secret of [ENTRY.d1280, ENTRY.p375, ENTRY.p390, ENTRY.unsent, ENTRY.employerOnly, K_ORG, orgName(s.kOrg), NEED_K, PROJECT_K, TERMS_K, DISPUTE_NOTE]) {
    expect(page, `K2's queue does not show "${secret}"`).not.toContain(secret);
  }
  const q2 = await rpcOk<{ entry_id: string }[]>(R2, "list_counterparty_review_queue_v1", {});
  expect(q2.map((q) => q.entry_id)).toEqual([s.e.k2]);
  const subs2 = await readAs<{ entry_id: string }>(R2, "journal_entry_review_submissions?select=entry_id");
  expect(subs2.map((x) => x.entry_id)).toEqual([s.e.k2]);
  for (const id of toK()) {
    expect(await rpcOk<unknown>(R2, "counterparty_review_entry_detail_v1", { p_entry_id: id })).toBeNull();
    expect(refused(await rpcAs(R2, "review_journal_entry", { p_entry_id: id, p_decision: "approved", p_note: null }))).toBe(true);
  }
  const k2Terms = await rpcAs(R2, "list_team_demand_offer_terms_v1", { p_offer_id: s.offerK });
  expect(JSON.stringify(k2Terms.json ?? "")).not.toContain(TERMS_K);
  seen("R2 (client K2)", { queue: q2.length, submissionRows: subs2.length, termsOfA_withK: k2Terms.json });

  // X: an unrelated person.
  const x = desk(X);
  await x.goto(`${BASE}/en/dashboard/inbox/counterparty`);
  await expect(x.getByRole("main").getByTestId("counterparty-queue-empty"), "nothing to decide").toBeVisible({ timeout: 60_000 });
  const xPage = (await x.getByRole("main").textContent()) ?? "";
  for (const text of Object.values(ENTRY)) expect(xPage).not.toContain(text);
  expect(await rpcOk<unknown[]>(X, "list_counterparty_review_queue_v1", {})).toEqual([]);
  expect(await readAs(X, "journal_entry_review_submissions?select=entry_id")).toEqual([]);
  expect(await readAs(X, "work_counterparty_links?select=id")).toEqual([]);
  expect(await readAs(X, `journal_entries?id=in.(${[...toK(), ...notK()].join(",")})&select=id`)).toEqual([]);
  for (const id of [...toK(), s.e.k2]) {
    expect(await rpcOk<unknown>(X, "counterparty_review_entry_detail_v1", { p_entry_id: id })).toBeNull();
    expect(refused(await rpcAs(X, "review_journal_entry", { p_entry_id: id, p_decision: "approved", p_note: null }))).toBe(true);
  }
  expect(JSON.stringify((await rpcAs(X, "list_team_demand_offer_terms_v1", { p_offer_id: s.offerK })).json ?? "")).not.toContain(TERMS_K);
  seen("X (unrelated)", { queue: 0, submissionRows: 0, links: 0, journalEntries: 0 });

  // W: the subject never decides their own work.
  expect(refused(await rpcAs(W, "review_journal_entry", { p_entry_id: s.e.p390, p_decision: "approved", p_note: null }))).toBe(true);
  expect(await rpcOk<unknown[]>(W, "list_counterparty_review_queue_v1", {})).toEqual([]);
  expect(decisions(s.e.p390), "the third submission is still undecided").toEqual([]);
});

test("CR-4d. A's employer review is not replaced by K's decision: both stay, as separate records", async () => {
  expect(s.e.d1280, "CR-2 decided the entry").toBeTruthy();
  // The employer (A's owner, who manages A's crew) still has K's accepted and disputed entries to
  // review: only an employer-path decision closes the employer's item (decision 0018).
  const reviewable = await rpcOk<unknown[]>(OA, "reviewable_journal_entry_ids", {});
  const ids = reviewable.map((x) => (typeof x === "string" ? x : String(Object.values(x as object)[0])));
  for (const id of [s.e.d1280, s.e.p375, s.e.p390]) expect(ids, "still in the employer's review").toContain(id);
  // The employer is not K's counterparty: no client queue, no client decision on K's behalf.
  expect(await rpcOk<unknown[]>(OA, "list_counterparty_review_queue_v1", {})).toEqual([]);
  expect(await rpcOk<unknown>(OA, "counterparty_review_entry_detail_v1", { p_entry_id: s.e.d1280 })).toBeNull();

  // The employer confirms the same entry K accepted: a SECOND, employer record beside K's.
  expect(await rpcOk<string>(OA, "review_journal_entry", { p_entry_id: s.e.d1280, p_decision: "approved", p_note: null })).toBe("approved");
  const oaId = await userId(OA);
  const rows = decisions(s.e.d1280);
  expect(rows.map((d) => [d.basis, d.action, d.party]), "K's acceptance and A's confirmation, each its own").toEqual([
    ["counterparty", "client_accept", s.kOrg],
    ["employer", "confirm", s.teamId],
  ]);
  expect(rows[1]!.confirmer_id).toBe(oaId);
  // K's dispute did not stop the employer either, and the employer's queue no longer holds the
  // entry it decided.
  const after = (await rpcOk<unknown[]>(OA, "reviewable_journal_entry_ids", {})).map((x) =>
    typeof x === "string" ? x : String(Object.values(x as object)[0]),
  );
  expect(after).not.toContain(s.e.d1280);
  expect(after).toContain(s.e.p375);
  seen("A's owner (employer, through crew T)", { reviewableBefore: ids.length, reviewableAfter: after.length, clientQueue: 0 });
});
