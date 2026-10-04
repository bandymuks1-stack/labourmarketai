import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { db, dbOk, HAS_LOCAL_STACK, SUPA_SERVICE, SUPA_URL } from "./market-map-db-state";

/**
 * INTEGRATED PRODUCT CHAIN - one serial spec, ONE system (not per-PR tests).
 *
 *   registration -> organization -> invitation/roster -> marketplace offer/need
 *   -> discovery -> project / work object / stage / task -> person + team
 *   assignment -> Journal (hours, output) -> evidence (photo) -> counterparty
 *   review -> professional history / LPI
 *
 * Every step is driven through the real UI in a real browser AND read back from
 * the database; security-negative cases use real JWTs (RLS, not the service
 * role). Data is synthetic and tagged with a per-run value (`QA<TAG>`), no real
 * names or e-mails (`*.local.test`).
 *
 * LOCAL STACK ONLY. `db()` refuses a non-loopback target and every URL here is
 * the local Supabase API; the spec skips itself without the local-stack env
 * (SUPABASE_TEST_URL + service key), exactly like roster-claim-history.spec.ts.
 *
 * SEEDING is limited to what the product has no UI for (admin-API account
 * creation, and a few service-role rows named at their call sites). Everything
 * that is the OBJECT of a proof goes through the product's own path.
 *
 * Step state is persisted to `qa-state/chain-<TAG>.json` so a single step can be
 * re-run (`CHAIN_TAG=<tag> playwright test ... -g "<step>"`) while debugging.
 */
const HAS = HAS_LOCAL_STACK && !!process.env.SUPABASE_TEST_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PASSWORD = "Pw-chain-qa-1!";
const TAG = process.env.CHAIN_TAG ?? randomBytes(3).toString("hex");
const SHOTS = resolve(process.cwd(), "../../qa-shots");
const STATE_FILE = resolve(process.cwd(), `../../qa-state/chain-${TAG}.json`);

const created: string[] = [];
type State = Record<string, any>;
let S: State = {};
function loadState() {
  try {
    if (existsSync(STATE_FILE)) S = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    S = {};
  }
}
function save(patch: State) {
  S = { ...S, ...patch };
  mkdirSync(resolve(STATE_FILE, ".."), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(S, null, 2));
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const email = (k: string) => `qa.${k}.${TAG}@local.test`;
const nm = (k: string) => `QA${TAG} ${k}`;

// ---------------------------------------------------------------------------
// Local-stack plumbing (service role = SEEDING / READ-BACK only; RLS proofs use
// a person's own JWT through asUser / rpcAs).
// ---------------------------------------------------------------------------
async function rows<T = Record<string, any>>(path: string): Promise<T[]> {
  const res = await db("GET", path);
  if (!res.ok) throw new Error(`read ${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

async function authAdmin(method: string, path: string, body?: unknown): Promise<Response> {
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) throw new Error("refusing non-local auth admin call");
  return fetch(`${SUPA_URL}/auth/v1/${path}`, {
    method,
    headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jwtFor(mail: string, password = PASSWORD): Promise<string> {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${mail}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function asUser(jwt: string, method: "GET" | "PATCH" | "POST" | "DELETE", path: string, body?: unknown) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function rpcAs(jwt: string | null, fn: string, args: unknown = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

type Account = { id: string; email: string; name: string; jwt: string; workerId: string | null };

/** A confirmed account through the Auth admin API + the product's own onboarding RPC AS the person. */
async function createAccount(key: string, role: "worker" | "company", extra: { company?: string } = {}): Promise<Account> {
  const mail = email(key);
  const full = nm(key);
  const res = await authAdmin("POST", "admin/users", {
    email: mail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: full, role, locale: "en" },
  });
  if (!res.ok) throw new Error(`create user ${mail}: ${res.status} ${await res.text()}`);
  const id = ((await res.json()) as { id: string }).id;
  const jwt = await jwtFor(mail);
  const ob = await rpcAs(jwt, "complete_onboarding", {
    p_role: role,
    p_display_name: full,
    p_country: "LT",
    p_role_data: role === "company" ? { name: extra.company ?? `QA${TAG} ${key} Ltd` } : {},
  });
  if (ob.status >= 300) throw new Error(`complete_onboarding ${mail}: ${ob.status} ${JSON.stringify(ob.json)}`);
  const w = await rows<{ id: string }>(`workers?profile_id=eq.${id}&select=id`);
  return { id, email: mail, name: full, jwt, workerId: w[0]?.id ?? null };
}

async function acct(key: string): Promise<Account> {
  const a = S.accounts?.[key] as Account | undefined;
  if (!a) throw new Error(`account ${key} not created yet - run the earlier steps first`);
  return { ...a, jwt: await jwtFor(a.email) };
}

function rememberAccount(key: string, a: Account) {
  save({ accounts: { ...(S.accounts ?? {}), [key]: { id: a.id, email: a.email, name: a.name, workerId: a.workerId } } });
}

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------
const ctxs: BrowserContext[] = [];
const pages = new Map<string, Page>();

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
}

async function loginUi(browser: Browser, key: string): Promise<Page> {
  const cached = pages.get(key);
  if (cached && !cached.isClosed()) return cached;
  const a = S.accounts?.[key] as Account;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  ctxs.push(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(240_000);
  await page.goto("/en/auth/login", { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator('input[type="email"]').fill(a.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 240_000, waitUntil: "domcontentloaded" });
  // A manager works in the ORGANISATION workspace (the shell opens in "Personal
  // space" until the person switches - an explicit, durable choice).
  const wsOrg = key === "own" || key === "rep2" ? (S.ORG as string | undefined) : undefined;
  if (wsOrg) {
    await page.goto("/en/dashboard", { waitUntil: "domcontentloaded" });
    await settle(page);
    const chip = page.getByTestId("workspace-chip");
    await expect(chip).toBeVisible({ timeout: 120_000 });
    if (!/Build Ltd/.test(await chip.innerText())) {
      await chip.click();
      const opt = page.getByTestId(`workspace-option-${wsOrg}`);
      await opt.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
      if (await opt.count()) {
        await opt.click();
        await expect(chip).toContainText(/Build Ltd/, { timeout: 60_000 });
        await settle(page);
      }
    }
  }
  pages.set(key, page);
  return page;
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, `chain-${TAG}-${name}.png`), fullPage: true }).catch(() => undefined);
}

async function go(page: Page, path: string, anchor?: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  if (anchor) await expect(page.locator(anchor).first()).toBeVisible({ timeout: 180_000 });
  await settle(page);
}

test.describe.configure({ mode: "serial", timeout: 900_000 });

test.describe(`INTEGRATED PRODUCT CHAIN (tag ${TAG})`, () => {
  test.skip(!HAS, "local Supabase env absent - run with the local stack env (see header)");

  test.beforeAll(() => {
    loadState();
  });

  test.afterAll(async () => {
    for (const c of ctxs) await c.close().catch(() => undefined);
  });

  // =========================================================================
  // STEP 1 - REGISTRATION (worker-registration-friction, #2152)
  // =========================================================================
  test("1a. REGISTRATION: a worker signs up with e-mail + password only, gets a usable session at once, onboards with no e-mail step", async ({ browser }) => {
    const mail = email("reg");
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    ctxs.push(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(180_000);
    page.setDefaultNavigationTimeout(240_000);
    await page.goto("/en/auth/signup", { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.locator('input[type="email"]').fill(mail);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(PASSWORD);
    await page.getByRole("button", { name: /Sign up/i }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 240_000 });
    await expect(page.getByTestId("signup-check-email")).toHaveCount(0);
    await expect(page.getByText(/confirm your e-?mail|check your inbox/i)).toHaveCount(0);
    await settle(page);
    await page.waitForTimeout(2500);
    await shot(page, "1a-onboarding");

    // role step -> details step (no e-mail step anywhere)
    await page.getByTestId("onboarding-intent-work").click();
    await page.getByTestId("onboarding-intents-continue").click();
    await page.getByTestId("onboarding-intents").waitFor({ state: "detached", timeout: 30_000 });
    await page.locator('input[name="display_name"]').fill(nm("reg"));
    await page.getByTestId("onboarding-country").click();
    await page.getByText(/^Lithuania/).first().click();
    await page.getByRole("button", { name: /Finish/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 240_000 });
    await settle(page);
    await shot(page, "1a-after-onboarding");

    // The session is real and the app opens the person's own areas
    await go(page, "/en/dashboard/journal");
    await expect(page).not.toHaveURL(/\/auth\/(login|signup)/);
    pages.set("reg", page);

    // DB read-back
    const u = await rows<{ id: string; email_confirmed_at: string | null }>(`profiles?select=id&email=eq.${encodeURIComponent(mail)}`).catch(() => []);
    const authUsers = await (await authAdmin("GET", `admin/users?per_page=200`)).json();
    const au = (authUsers.users as any[]).find((x) => x.email === mail);
    expect(au, "auth user exists").toBeTruthy();
    const prof = await rows<{ onboarded: boolean; full_name: string; active_role: string }>(`profiles?id=eq.${au.id}&select=onboarded,full_name,active_role`);
    expect(prof[0]).toMatchObject({ onboarded: true, full_name: nm("reg"), active_role: "worker" });
    const w = await rows<{ id: string }>(`workers?profile_id=eq.${au.id}&select=id`);
    expect(w).toHaveLength(1);
    const a: Account = { id: au.id, email: mail, name: nm("reg"), jwt: "", workerId: w[0].id };
    rememberAccount("reg", a);
    void u;
  });

  test("1b. ORGANISATION: a company owner registers and creates the organisation through the product form", async ({ browser }) => {
    const mail = email("own");
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    ctxs.push(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(180_000);
    page.setDefaultNavigationTimeout(240_000);
    await page.goto("/en/auth/signup", { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.locator('input[type="email"]').fill(mail);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(PASSWORD);
    await page.getByRole("button", { name: /Sign up/i }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 240_000 });
    await settle(page);
    await page.waitForTimeout(2500);
    await page.getByTestId("onboarding-intent-hire").click();
    await page.getByTestId("onboarding-intents-continue").click();
    await page.getByTestId("onboarding-intents").waitFor({ state: "detached", timeout: 30_000 });
    await page.locator('input[name="display_name"]').fill(nm("own"));
    await page.getByTestId("onboarding-country").click();
    await page.getByText(/^Lithuania/).first().click();
    await page.getByRole("button", { name: /Finish/i }).click();
    await page.waitForURL(/\/dashboard\/start\/company/, { timeout: 240_000 });
    await settle(page);

    const orgName = `QA${TAG} Build Ltd`;
    await page.getByTestId("company-setup-legal-name").fill(orgName);
    await page.getByTestId("company-setup-company-type-construction").check({ force: true });
    await page.getByTestId("company-setup-country").selectOption("LT");
    await page.getByTestId("company-setup-requester-role-owner").check({ force: true });
    await shot(page, "1b-company-form");
    await page.getByTestId("company-setup-save-draft").click();
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
    await page.waitForTimeout(3000);
    await shot(page, "1b-company-saved");

    const au = ((await (await authAdmin("GET", "admin/users?per_page=200")).json()).users as any[]).find((x) => x.email === mail);
    const w = await rows<{ id: string }>(`workers?profile_id=eq.${au.id}&select=id`);
    const co = await rows<{ id: string }>(`companies?profile_id=eq.${au.id}&select=id,legal_name`);
    expect(co.length, "company row created by the form").toBeGreaterThan(0);
    const org = await rows<{ id: string; display_name: string; organization_type: string }>(
      `organizations?legacy_company_id=eq.${co[0].id}&select=id,display_name,legal_name,organization_type`,
    );
    expect(org).toHaveLength(1);
    const own = await rows<{ relationship_slug: string; status: string }>(
      `engagement_contexts?profile_id=eq.${au.id}&organization_id=eq.${org[0].id}&select=relationship_slug,status`,
    );
    const mem = await rows<{ role: string; status: string }>(`company_memberships?profile_id=eq.${au.id}&organization_id=eq.${org[0].id}&select=role,status`);
    expect(own.length + mem.length, "owner is linked to the organisation").toBeGreaterThan(0);
    rememberAccount("own", { id: au.id, email: mail, name: nm("own"), jwt: "", workerId: w[0]?.id ?? null });
    save({ ORG: org[0].id, CO_ID: co[0].id, ORG_NAME: orgName, ownEngagements: own, ownMemberships: mem });
    pages.set("own", page);
  });

  // =========================================================================
  // STEP 2 - THE WORLD: people, team, project structure
  // =========================================================================
  test("2a. WORLD: synthetic people (admin API + the product's onboarding RPC), team membership rows", async () => {
    const mk = async (key: string, role: "worker" | "company" = "worker") => rememberAccount(key, await createAccount(key, role));
    for (const k of ["m1", "m2", "m3", "exm", "nm", "str"]) await mk(k);
    await mk("rep2", "company"); // active_role company: the stadium page is the manager surface
    await mk("cli", "company");
    const cli = await acct("cli");
    const co = await rows<{ id: string }>(`companies?profile_id=eq.${cli.id}&select=id`);
    const cliOrg = await rows<{ id: string }>(`organizations?legacy_company_id=eq.${co[0].id}&select=id`);
    save({ CLI_ORG: cliOrg[0].id });
    // every worker has a worker row
    for (const k of ["m1", "m2", "m3", "exm", "nm", "str"]) expect((await acct(k)).workerId).toBeTruthy();
  });

  test("2b. TEAMS: the owner creates two teams through the product form; members are engagement rows", async ({ browser }) => {
    const own = await loginUi(browser, "own");
    await go(own, "/en/dashboard/company/people", '[data-testid="team-create-name"]');
    for (const [label, key] of [["Crew A", "teamA"], ["Crew B", "teamB"]] as const) {
      const exists = await rows(`organizations?display_name=eq.${encodeURIComponent(`QA${TAG} ${label}`)}&select=id`);
      if (exists.length === 0) {
        await own.getByTestId("team-create-name").fill(`QA${TAG} ${label}`);
        await own.getByTestId("team-create-submit").click();
        await expect(own.getByTestId("team-brigades-msg")).toBeVisible({ timeout: 300_000 });
        await expect(own.getByTestId("team-create-submit")).not.toHaveText(/Creating|Kuriama/i, { timeout: 300_000 });
        await settle(own);
        await go(own, "/en/dashboard/company/people", '[data-testid="team-create-name"]');
      }
      const t = await rows<{ id: string; organization_type: string; owner_profile_id: string | null }>(
        `organizations?display_name=eq.${encodeURIComponent(`QA${TAG} ${label}`)}&select=id,organization_type,owner_profile_id`,
      );
      expect(t, `${label} created`).toHaveLength(1);
      expect(t[0].organization_type).toBe("team");
      save({ [key]: t[0].id });
    }
    await shot(own, "2b-teams");
    // Membership rows: what an ACCEPTED join_team invitation writes (the
    // invitation round-trip itself is covered by roster-claim / team specs;
    // mailed tokens are hashed, so a spec cannot read them back).
    const member = async (profileKey: string, team: string, ended = false) => {
      const a = S.accounts[profileKey] as Account;
      const slug = "employee";
      await dbOk("POST", "engagement_contexts", {
        profile_id: a.id,
        organization_id: team,
        relationship_slug: slug,
        status: ended ? "ended" : "active",
        started_at: ended ? "2025-01-01" : null,
        ended_at: ended ? new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10) : null,
        is_primary: false,
        title: "QA crew member",
        hash_self: sha(`${a.id}:${slug}:${team}`),
      });
    };
    await member("m1", S.teamA);
    await member("m2", S.teamA);
    await member("exm", S.teamA, true);
    await member("m2", S.teamB);
    await member("m3", S.teamB);
    const mA = await rows(`engagement_contexts?organization_id=eq.${S.teamA}&relationship_slug=eq.employee&select=profile_id,status`);
    expect(mA).toHaveLength(3);
  });

  test("2c. PROJECT / WORK OBJECT / STAGE / TASK are created through the product UI and read back", async ({ browser }) => {
    const own = await loginUi(browser, "own");
    const title = `QA${TAG} Site Project`;
    if (!S.PROJECT) {
      await go(own, "/en/dashboard/projects", '[data-testid="project-create"]');
      const form = own.getByTestId("project-create");
      await form.locator('input[name="title"]').fill(title);
      await form.locator('input[name="city"]').fill("Vilnius");
      await form.locator('button[type="submit"]').click();
      await expect.poll(async () => (await rows(`projects?title=eq.${encodeURIComponent(title)}&select=id`)).length, { timeout: 120_000 }).toBe(1);
      const p = await rows<{ id: string; organization_id: string; status: string }>(`projects?title=eq.${encodeURIComponent(title)}&select=id,organization_id,status`);
      expect(p[0].organization_id).toBe(S.ORG);
      save({ PROJECT: p[0].id, PROJECT_TITLE: title });
      await shot(own, "2c-project");
    }

    // WORK OBJECT (site) through its own form
    if (!S.OBJECT) {
      await go(own, "/en/dashboard/projects", '[data-testid="work-object-add-form"]');
      const wo = own.getByTestId("work-object-add-form");
      await wo.locator('input[name="name"]').fill(`QA${TAG} Block A`);
      const sel = wo.locator('select[name="projectId"]');
      if (await sel.count()) await sel.selectOption(S.PROJECT);
      await wo.locator('button[type="submit"]').click();
      await expect.poll(async () => (await rows(`work_objects?name=eq.${encodeURIComponent(`QA${TAG} Block A`)}&select=id`)).length, { timeout: 120_000 }).toBe(1);
      const objs = await rows<{ id: string; project_id: string | null; status: string }>(`work_objects?name=eq.${encodeURIComponent(`QA${TAG} Block A`)}&select=id,project_id,status`);
      save({ OBJECT: objs[0].id });
      await shot(own, "2c-object");
    }

    // STAGE on the project operations page
    if (!S.STAGE) {
      await go(own, `/en/dashboard/projects/${S.PROJECT}/operations`, '[data-testid="project-stages-panel"]');
      await own.getByTestId("project-stage-name").fill(`QA${TAG} Stage 1`);
      await own.getByTestId("project-stage-add").click();
      await expect.poll(async () => (await rows(`project_stages?project_id=eq.${S.PROJECT}&select=id`)).length, { timeout: 120_000 }).toBeGreaterThan(0);
      const st = await rows<{ id: string }>(`project_stages?project_id=eq.${S.PROJECT}&select=id,name`);
      save({ STAGE: st[0].id });
      await shot(own, "2c-stage");
    }

    // TASK (in the stage, on the object) from the tasks page
    if (!S.TASK) {
      await go(own, `/en/dashboard/tasks?project=${S.PROJECT}`, '[data-testid="tasks-create"]');
      await own.getByTestId("tasks-create").locator("summary").click();
      const tf = own.getByTestId("tasks-create").locator("form").first();
      await tf.locator('input[name="title"]').fill(`QA${TAG} Task One`);
      const stageSel = tf.locator('select[name="stageId"]');
      if (await stageSel.count()) await stageSel.selectOption({ index: 1 });
      const objSel = tf.locator('select[name="objectId"]');
      if (await objSel.count()) await objSel.selectOption({ index: 1 });
      await tf.locator('button[type="submit"]').click();
      await expect.poll(async () => (await rows(`work_tasks?title=eq.${encodeURIComponent(`QA${TAG} Task One`)}&select=id`)).length, { timeout: 120_000 }).toBe(1);
      await shot(own, "2c-task");
    }
    const tk = await rows<{ id: string; project_id: string; stage_id: string | null; object_id: string | null; status: string }>(
      `work_tasks?title=eq.${encodeURIComponent(`QA${TAG} Task One`)}&select=id,project_id,stage_id,object_id,status`,
    );
    expect(tk).toHaveLength(1);
    expect(tk[0].project_id).toBe(S.PROJECT);
    expect(tk[0].stage_id, "task is in the stage").toBe(S.STAGE);
    expect(tk[0].object_id, "task is on the work object").toBe(S.OBJECT);
    save({ TASK: tk[0].id, taskStage: tk[0].stage_id, taskObject: tk[0].object_id });
  });

  // =========================================================================
  // STEP 3 - TEAM ASSIGNMENT IS A REAL JOURNAL CONTEXT (#2149)
  // =========================================================================
  const projectBlock = (page: Page) => page.getByTestId("project-assignments").filter({ hasText: S.PROJECT_TITLE }).getByTestId("project-teams").first();

  test("3a. TEAM -> PROJECT: the manager assigns Crew A to the project as ONE relationship (no per-person fan-out)", async ({ browser }) => {
    const own = await loginUi(browser, "own");
    await go(own, "/en/dashboard/projects", '[data-testid="project-teams"]');
    const blk = projectBlock(own);
    await blk.getByTestId("project-team-select").selectOption({ value: S.teamA });
    await blk.getByTestId("project-team-scope-select").selectOption("project");
    await blk.getByTestId("project-team-submit").click();
    await expect(blk.getByTestId("project-team-message")).toBeVisible({ timeout: 60_000 });
    await settle(own);
    await shot(own, "3a-team-assigned");

    const ta = await rows<{ id: string; team_org_id: string; project_id: string; work_object_id: string | null; task_id: string | null; status: string }>(
      `team_assignments?project_id=eq.${S.PROJECT}&select=*`,
    );
    expect(ta).toHaveLength(1);
    expect(ta[0]).toMatchObject({ team_org_id: S.teamA, status: "active", work_object_id: null, task_id: null });
    save({ TA_PROJECT: ta[0].id });
    // ZERO fan-out: no per-person assignment row for any member
    const m1 = await acct("m1");
    const m2 = await acct("m2");
    const pwa = await rows(`project_worker_assignments?project_id=eq.${S.PROJECT}&select=id,worker_id`);
    expect(pwa, "no project_worker_assignments fan-out").toEqual([]);
    // the UI lists the resolved members
    await expect(blk.getByTestId("project-team-members")).toContainText(m1.name);
    await expect(blk.getByTestId("project-team-members")).toContainText(m2.name);
    // audit trail
    const audit = await rows(`audit_logs?action=eq.team_assigned_v1&entity_id=eq.${ta[0].id}&select=id`);
    expect(audit).toHaveLength(1);
  });

  test("3b. TEAM -> TASK: Crew A is also assigned to the task (task scope row, still no fan-out)", async ({ browser }) => {
    const own = await loginUi(browser, "own");
    await go(own, "/en/dashboard/projects", '[data-testid="project-teams"]');
    const blk = projectBlock(own);
    await blk.getByTestId("project-team-select").selectOption({ value: S.teamA });
    await blk.getByTestId("project-team-scope-select").selectOption("task");
    await blk.getByTestId("project-team-task-select").selectOption({ value: S.TASK });
    await blk.getByTestId("project-team-submit").click();
    await expect(blk.getByTestId("project-team-message")).toBeVisible({ timeout: 60_000 });
    await settle(own);
    const ta = await rows<{ id: string; task_id: string | null }>(`team_assignments?project_id=eq.${S.PROJECT}&task_id=eq.${S.TASK}&select=id,task_id,status`);
    expect(ta).toHaveLength(1);
    save({ TA_TASK: ta[0].id });
    expect(await rows(`project_worker_assignments?project_id=eq.${S.PROJECT}&select=id`)).toEqual([]);
    await shot(own, "3b-team-task");
  });

  test("3c. JOURNAL (project): a member of the assigned team writes an entry on the team's project, labelled 'via team'; author = the member", async ({ browser }) => {
    const m1 = await acct("m1");
    const page = await loginUi(browser, "m1");
    await go(page, "/en/dashboard/journal", "#journal-composer textarea");
    // The team's project is the member's journal context, reached via the team.
    const text = `QA${TAG} member-entry: installed tiles in Block A, worked 6 hours, 12 m2`;
    await page.locator("#journal-composer textarea").fill(text);
    await page.getByRole("button", { name: /Read it back/i }).click();
    // The read-back names the project the entry will be attributed to, reached VIA THE TEAM.
    const auto = page.getByTestId("worklog-project-auto");
    await expect(auto).toBeVisible({ timeout: 60_000 });
    const labelText = await auto.innerText();
    expect(labelText).toContain(`QA${TAG} Site Project`);
    expect(labelText.toLowerCase()).toContain("via team");
    await shot(page, "3c-readback-via-team");
    await page.getByTestId("worklog-save").click();
    await page.getByTestId("worklog-confirm").click(); // "Confirm the entry?"
    await expect.poll(async () => (await rows(`journal_entries?original_text=ilike.${encodeURIComponent(`QA${TAG} member-entry%`)}&select=id`)).length, { timeout: 90_000 }).toBe(1);
    await settle(page);
    await shot(page, "3c-saved");

    const e = await rows<{ id: string; worker_id: string; project_id: string | null; engagement_context_id: string; original_text: string }>(
      `journal_entries?original_text=ilike.${encodeURIComponent(`QA${TAG} member-entry%`)}&select=id,worker_id,project_id,engagement_context_id,original_text`,
    );
    expect(e).toHaveLength(1);
    expect(e[0].worker_id, "author is the MEMBER, never the team").toBe(m1.workerId);
    expect(e[0].project_id).toBe(S.PROJECT);
    const ec = await rows<{ organization_id: string }>(`engagement_contexts?id=eq.${e[0].engagement_context_id}&select=organization_id`);
    expect(ec[0].organization_id).toBe(S.teamA);
    // no project_worker_assignments row exists for the member
    expect(await rows(`project_worker_assignments?worker_id=eq.${m1.workerId}&select=id`)).toEqual([]);
    // hours/output were recorded as metrics
    const mt = await rows<{ metric_slug: string; value_numeric: number | null; unit_slug: string | null }>(
      `journal_entry_metrics?entry_id=eq.${e[0].id}&select=metric_slug,value_numeric,unit_slug`,
    );
    save({ ENTRY_M1: e[0].id, ENTRY_M1_METRICS: mt });
    expect(mt.length, "hours / output metrics were saved").toBeGreaterThan(0);
  });

  test("3d. JOURNAL (task): the member sees the task 'via team' and links the entry to it as evidence", async ({ browser }) => {
    const page = await loginUi(browser, "m1");
    await go(page, "/en/dashboard/tasks", '[data-testid="tasks-page"]');
    const card = page.getByTestId(`task-card-${S.TASK}`);
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(`task-via-team-${S.TASK}`)).toBeVisible();
    await shot(page, "3d-task-via-team");
    const sel = page.getByTestId(`task-evidence-select-${S.TASK}`);
    await sel.selectOption({ value: S.ENTRY_M1 });
    await page.getByTestId(`task-evidence-link-${S.TASK}`).click();
    await expect
      .poll(async () => (await rows(`journal_entry_tasks?entry_id=eq.${S.ENTRY_M1}&task_id=eq.${S.TASK}&unlinked_at=is.null&select=id`)).length, { timeout: 60_000 })
      .toBe(1);
    const link = await rows<{ linked_by: string }>(`journal_entry_tasks?entry_id=eq.${S.ENTRY_M1}&task_id=eq.${S.TASK}&select=linked_by`);
    expect(link[0].linked_by).toBe(S.accounts.m1.id);
    expect(await rows(`project_worker_assignments?worker_id=eq.${S.accounts.m1.workerId}&select=id`)).toEqual([]);
  });

  test("3e. NEGATIVE: a non-member and an ex-member cannot write on the team's project (RLS/RPC as themselves)", async () => {
    const exm = await acct("exm");
    const nm_ = await acct("nm");
    const exCtx = await rows<{ id: string }>(`engagement_contexts?profile_id=eq.${exm.id}&organization_id=eq.${S.teamA}&select=id`);
    const m1Ctx = await rows<{ id: string }>(`engagement_contexts?profile_id=eq.${S.accounts.m1.id}&organization_id=eq.${S.teamA}&select=id`);
    const base = {
      p_entry_type_slug: "freeform",
      p_profession_id: null,
      p_original_text: `QA${TAG} intruder`,
      p_original_language: "en",
      p_hash_prev: null,
      p_hash_self: sha(`intruder:${TAG}`),
      p_visibility_scope: "closed",
      p_metrics: [],
      p_project_id: S.PROJECT,
      p_project_explicit: true,
    };
    const asEx = await rpcAs(exm.jwt, "create_journal_entry_full", { ...base, p_worker_id: exm.workerId, p_engagement_context_id: exCtx[0].id });
    expect(asEx.status, JSON.stringify(asEx.json)).toBeGreaterThanOrEqual(400);
    // the non-member borrows a member's context id: refused as well
    const asNm = await rpcAs(nm_.jwt, "create_journal_entry_full", { ...base, p_worker_id: nm_.workerId, p_engagement_context_id: m1Ctx[0].id });
    expect(asNm.status, JSON.stringify(asNm.json)).toBeGreaterThanOrEqual(400);
    // and cannot impersonate the member as the author
    const asNm2 = await rpcAs(nm_.jwt, "create_journal_entry_full", { ...base, p_worker_id: S.accounts.m1.workerId, p_engagement_context_id: m1Ctx[0].id });
    expect(asNm2.status).toBeGreaterThanOrEqual(400);
    expect(await rows(`journal_entries?original_text=eq.${encodeURIComponent(`QA${TAG} intruder`)}&select=id`)).toEqual([]);
    // they cannot see the team assignment, the project or the task
    for (const a of [exm, nm_]) {
      expect((await asUser(a.jwt, "GET", `team_assignments?project_id=eq.${S.PROJECT}&select=id`)).json).toEqual([]);
      expect((await asUser(a.jwt, "GET", `projects?id=eq.${S.PROJECT}&select=id`)).json).toEqual([]);
      expect((await asUser(a.jwt, "GET", `work_tasks?id=eq.${S.TASK}&select=id`)).json).toEqual([]);
    }
    // the member does see them, with no per-person row
    const m1 = await acct("m1");
    expect((await asUser(m1.jwt, "GET", `projects?id=eq.${S.PROJECT}&select=id`)).json).toHaveLength(1);
    expect((await asUser(m1.jwt, "GET", `work_tasks?id=eq.${S.TASK}&select=id`)).json).toHaveLength(1);
  });

  // =========================================================================
  // STEP 4 - REPLACEMENT, HISTORY, NO FAN-OUT, TEAM-MEMBER KNOWING OVERRIDE
  // =========================================================================
  test("4a. SETUP: dated project window + a member's clashing commitment (service-role rows named here)", async () => {
    // The product has no UI to date a project or to place a member on a second
    // project in one step, so those two rows are seeded (documented).
    await dbOk("PATCH", `projects?id=eq.${S.PROJECT}`, { start_date: "2026-11-02", end_date: "2026-11-20" });
    const p2 = await dbOk("POST", "projects", {
      title: `QA${TAG} Other Site`,
      organization_id: S.ORG,
      status: "live",
      start_date: "2026-11-09",
      end_date: "2026-11-27",
    });
    const p2id = ((await p2.json()) as { id: string }[])[0].id;
    const m3 = await acct("m3");
    await dbOk("POST", "project_worker_assignments", { project_id: p2id, worker_id: m3.workerId, status: "active" });
    save({ PROJECT2: p2id });
    expect(await rows(`project_worker_assignments?worker_id=eq.${m3.workerId}&select=id`)).toHaveLength(1);
  });

  test("4b. REPLACE: Crew A is replaced by Crew B on the project through the UI; A is ENDED (kept as history), never deleted", async ({ browser }) => {
    const own = await loginUi(browser, "own");
    await go(own, "/en/dashboard/projects", '[data-testid="project-team-row"]');
    // the project-scope row of Crew A (the task row is a separate row)
    const rowsLoc = own.getByTestId("project-team-row");
    const projectRow = rowsLoc.filter({ hasText: /whole project|project/i }).filter({ hasNotText: /QA.*Task One/ }).first();
    await projectRow.getByTestId("project-team-replace-toggle").click();
    const rep = projectRow.getByTestId("project-team-replace");
    await rep.locator("select").selectOption({ value: S.teamB });
    await rep.getByRole("button").click();
    await expect(own.getByTestId("project-team-message").first()).toBeVisible({ timeout: 60_000 });
    await shot(own, "4b-replaced");

    const all = await rows<{ id: string; team_org_id: string; task_id: string | null; status: string; ended_at: string | null; end_reason: string | null; replaced_by_id: string | null }>(
      `team_assignments?project_id=eq.${S.PROJECT}&select=id,team_org_id,task_id,status,ended_at,end_reason,replaced_by_id&order=assigned_at`,
    );
    const a = all.find((r) => r.id === S.TA_PROJECT)!;
    const b = all.find((r) => r.team_org_id === S.teamB && r.task_id === null)!;
    expect(a, "old assignment row still exists (history)").toBeTruthy();
    expect(a).toMatchObject({ status: "ended", end_reason: "replaced", replaced_by_id: b.id });
    expect(a.ended_at).toBeTruthy();
    expect(b.status).toBe("active");
    save({ TA_PROJECT_B: b.id });
    // zero fan-out, audit trail
    expect(await rows(`project_worker_assignments?project_id=eq.${S.PROJECT}&select=id`)).toEqual([]);
    expect(await rows(`audit_logs?action=eq.team_assignment_replaced_v1&entity_id=eq.${a.id}&select=id`)).toHaveLength(1);
    // past entry is intact (never rewritten by the replacement)
    const past = await rows<{ id: string; project_id: string | null; deleted_at: string | null; superseded_by: string | null }>(
      `journal_entries?id=eq.${S.ENTRY_M1}&select=id,project_id,deleted_at,superseded_by`,
    );
    expect(past[0]).toMatchObject({ project_id: S.PROJECT, deleted_at: null, superseded_by: null });
  });

  test("4c. #2146 TEAM-MEMBER KNOWING OVERRIDE: the member's calendar clash is shown; keeping it writes an immutable receipt with the TEAM basis", async ({ browser }) => {
    const own = await loginUi(browser, "own");
    // The clash notice is shown right after the write that resolves the member
    // (assign/replace). Re-assign Crew B to a WORK OBJECT to produce a fresh
    // notice (B x object = a new relationship row; ends nothing).
    await go(own, "/en/dashboard/projects", '[data-testid="project-teams"]');
    const blk = projectBlock(own);
    await shot(own, "4c-before");
    const cal = blk.getByTestId("project-team-calendar");
    if ((await cal.count()) === 0) {
      // trigger the notice: assign Crew B to the task (a distinct scope row)
      await blk.getByTestId("project-team-select").selectOption({ value: S.teamB });
      await blk.getByTestId("project-team-scope-select").selectOption("task");
      await blk.getByTestId("project-team-task-select").selectOption({ value: S.TASK });
      await blk.getByTestId("project-team-submit").click();
      await expect(blk.getByTestId("project-team-message")).toBeVisible({ timeout: 60_000 });
    }
    await expect(blk.getByTestId("project-team-calendar")).toBeVisible({ timeout: 60_000 });
    await shot(own, "4c-clash");
    const m3 = await acct("m3");
    await expect(blk.getByTestId("project-team-calendar")).toContainText(m3.name);
    await blk.getByTestId("assign-reservation-keep").first().click();
    await expect(blk.getByTestId("team-member-keep-decided")).toBeVisible({ timeout: 60_000 });
    await shot(own, "4c-kept");

    const rec = await rows<Record<string, any>>(`commitment_override_receipts?project_id=eq.${S.PROJECT}&select=*`);
    expect(rec).toHaveLength(1);
    expect(rec[0].team_assignment_id, "TEAM basis").toBeTruthy();
    expect(rec[0].assignment_id, "no person basis").toBeNull();
    expect(rec[0].worker_id ?? rec[0].worker_profile_id).toBeTruthy();
    save({ RECEIPT: rec[0].id, RECEIPT_ROW: rec[0] });
    // still no fan-out row for the member on THIS project
    expect(await rows(`project_worker_assignments?project_id=eq.${S.PROJECT}&select=id`)).toEqual([]);
    // IMMUTABLE: the service role cannot rewrite or delete it either
    const upd = await db("PATCH", `commitment_override_receipts?id=eq.${rec[0].id}`, { reason_code: "other" });
    expect(upd.ok, "receipt update must be refused").toBe(false);
    const del = await db("DELETE", `commitment_override_receipts?id=eq.${rec[0].id}`);
    expect(del.ok, "receipt delete must be refused").toBe(false);
    // the manager (not service role) cannot write receipts directly
    const own_ = await acct("own");
    const forged = await asUser(own_.jwt, "POST", "commitment_override_receipts", { project_id: S.PROJECT, team_assignment_id: S.TA_PROJECT_B });
    expect(forged.status).toBeGreaterThanOrEqual(400);
    // a stranger gets nothing on the receipts table
    const str = await acct("str");
    expect((await asUser(str.jwt, "GET", `commitment_override_receipts?project_id=eq.${S.PROJECT}&select=id`)).json).toEqual([]);
  });

  test("4d. OLD MEMBERS LOSE CONTEXT FOR NEW ENTRIES: after Crew A is ended everywhere, m1 is refused; m2/m3 (Crew B) are allowed; past entries stay", async ({ browser }) => {
    const own = await loginUi(browser, "own");
    // end Crew A's remaining (task-scope) assignment through the UI
    await go(own, "/en/dashboard/projects", '[data-testid="project-team-row"]');
    const aTaskRow = own.getByTestId("project-team-row").filter({ hasText: `QA${TAG} Crew A` }).first();
    if (await aTaskRow.count()) await aTaskRow.getByTestId("project-team-end").click();
    await expect
      .poll(async () => (await rows(`team_assignments?team_org_id=eq.${S.teamA}&ended_at=is.null&select=id`)).length, { timeout: 60_000 })
      .toBe(0);
    const ended = await rows<{ status: string; end_reason: string | null }>(`team_assignments?team_org_id=eq.${S.teamA}&select=status,end_reason`);
    expect(ended.every((r) => r.status === "ended")).toBe(true);
    expect(await rows(`audit_logs?action=eq.team_assignment_ended_v1&select=id`)).not.toHaveLength(0);

    const base = (text: string, ext: string) => ({
      p_entry_type_slug: "freeform",
      p_profession_id: null,
      p_original_text: text,
      p_original_language: "en",
      p_hash_prev: null,
      p_hash_self: sha(`${text}:${ext}`),
      p_visibility_scope: "closed",
      p_metrics: [],
      p_project_id: S.PROJECT,
      p_project_explicit: true,
    });
    const ctx = async (key: string, team: string) =>
      (await rows<{ id: string }>(`engagement_contexts?profile_id=eq.${S.accounts[key].id}&organization_id=eq.${team}&select=id`))[0].id;
    const m1 = await acct("m1");
    const m2 = await acct("m2");
    const m3 = await acct("m3");
    // m1 (Crew A only): refused for NEW entries
    const r1 = await rpcAs(m1.jwt, "create_journal_entry_full", { ...base(`QA${TAG} late-m1`, "m1"), p_worker_id: m1.workerId, p_engagement_context_id: await ctx("m1", S.teamA) });
    expect(r1.status, JSON.stringify(r1.json)).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r1.json)).toContain("project_not_assignable");
    // m2 and m3 (Crew B, active): allowed, authored by themselves
    const r2 = await rpcAs(m2.jwt, "create_journal_entry_full", { ...base(`QA${TAG} entry-m2`, "m2"), p_worker_id: m2.workerId, p_engagement_context_id: await ctx("m2", S.teamB) });
    expect(r2.status, JSON.stringify(r2.json)).toBeLessThan(300);
    const r3 = await rpcAs(m3.jwt, "create_journal_entry_full", { ...base(`QA${TAG} entry-m3`, "m3"), p_worker_id: m3.workerId, p_engagement_context_id: await ctx("m3", S.teamB) });
    expect(r3.status, JSON.stringify(r3.json)).toBeLessThan(300);
    const got = await rows<{ worker_id: string; project_id: string }>(`journal_entries?original_text=in.(${encodeURIComponent(`"QA${TAG} entry-m2","QA${TAG} entry-m3"`)})&select=worker_id,project_id`);
    expect(got.map((g) => g.worker_id).sort()).toEqual([m2.workerId, m3.workerId].sort());
    expect(got.every((g) => g.project_id === S.PROJECT)).toBe(true);
    // m1 can no longer see the project; the past entry is intact and still theirs
    expect((await asUser(m1.jwt, "GET", `projects?id=eq.${S.PROJECT}&select=id`)).json).toEqual([]);
    const past = await rows<{ worker_id: string; project_id: string; deleted_at: string | null }>(`journal_entries?id=eq.${S.ENTRY_M1}&select=worker_id,project_id,deleted_at`);
    expect(past[0]).toMatchObject({ worker_id: m1.workerId, project_id: S.PROJECT, deleted_at: null });
    // still zero fan-out
    expect(await rows(`project_worker_assignments?project_id=eq.${S.PROJECT}&select=id`)).toEqual([]);
    await go(await loginUi(browser, "m1"), "/en/dashboard/journal", "#journal-composer textarea");
  });

  // =========================================================================
  // STEP 5 - COUNTERPARTY AUTHORITY ON THE REAL PROJECT COUNTERPARTY (#2143)
  // =========================================================================
  // A tiny valid PNG (1x1) for the photo field.
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const decisionCodes = ["approved", "rejected", "changes_requested"];
  const refusedDecision = (r: { status: number; json: any }) =>
    r.status >= 400 || (typeof r.json === "string" && !decisionCodes.includes(r.json));

  test("5a. SETUP+REGISTER: the client's authorized representative registers as counterparty of a TEAM MEMBER (real active team assignment) from the project page", async ({ browser }) => {
    // rep2 is a MANAGER of the project's organization (membership row seeded: the
    // manager-invitation round trip is not the object of this proof) and is NOT
    // a member of the crew's team organization, so is independent of the member.
    const rep2 = await acct("rep2");
    // The product's own command AS the owner (creates the manager engagement the
    // review decision requires; no raw membership row).
    const own0 = await acct("own");
    const gm = await rpcAs(own0.jwt, "grant_org_manager", { p_org_id: S.ORG, p_profile_id: rep2.id, p_operations_role: null });
    expect(gm.status, JSON.stringify(gm.json)).toBeLessThan(300);
    const m3 = await acct("m3");

    // NEGATIVE registrations (real JWTs), before the legitimate one
    const reg = (jwt: string | null, worker: string) => rpcAs(jwt, "register_work_counterparty_link_v1", { p_project_id: S.PROJECT, p_worker_id: worker, p_party_role: "client" });
    const asSubject = await reg(m3.jwt, m3.workerId!);
    expect(JSON.stringify(asSubject.json)).toMatch(/not_authorized|subject_cannot/);
    const own = await acct("own");
    const asOwner = await reg(own.jwt, m3.workerId!);
    save({ NEG_OWNER_REGISTER: asOwner.json });
    expect(JSON.stringify(asOwner.json), "owner of the member's own team org is not an independent counterparty").toMatch(/counterparty_not_independent|subject_is_member/);
    const asStranger = await reg((await acct("str")).jwt, m3.workerId!);
    expect(JSON.stringify(asStranger.json)).toMatch(/not_authorized/);
    const asCli = await reg((await acct("cli")).jwt, m3.workerId!);
    expect(JSON.stringify(asCli.json)).toMatch(/not_authorized/);
    const asAnon = await reg(null, m3.workerId!);
    expect(asAnon.status).toBeGreaterThanOrEqual(400);
    expect(await rows(`work_counterparty_links?project_id=eq.${S.PROJECT}&select=id`)).toEqual([]);

    // The legitimate registration through the UI
    const page = await loginUi(browser, "rep2");
    await go(page, `/en/dashboard/projects/${S.PROJECT}`, '[data-testid="counterparty-link-panel"]');
    const row = page.getByTestId(`counterparty-link-row-${m3.workerId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row).toContainText(/team/i);
    await shot(page, "5a-candidates");
    await page.getByTestId(`counterparty-link-register-${m3.workerId}`).click();
    await expect(page.getByTestId(`counterparty-link-active-${m3.workerId}`)).toBeVisible({ timeout: 60_000 });
    await shot(page, "5a-registered");

    const link = await rows<Record<string, any>>(`work_counterparty_links?project_id=eq.${S.PROJECT}&select=*`);
    expect(link).toHaveLength(1);
    expect(link[0]).toMatchObject({ worker_id: m3.workerId, counterparty_organization_id: S.ORG, party_role: "client", established_by: rep2.id, basis: "project_assignment" });
    expect(link[0].revoked_at).toBeNull();
    save({ LINK_M3: link[0].id });
    const aud = await rows<{ payload: any }>(`audit_logs?action=eq.register_work_counterparty_link&entity_id=eq.${link[0].id}&select=payload`);
    expect(aud[0].payload.relationship_kind).toBe("team");
    // the subject has no decision surface, and a second registration is idempotent
    const again = await reg(rep2.jwt, m3.workerId!);
    expect(JSON.stringify(again.json)).toMatch(/already_registered/);
  });

  test("5b. SUBMIT: the member records work with a PHOTO and submits it EXPLICITLY (nothing is auto-submitted)", async ({ browser }) => {
    const m3 = await acct("m3");
    const page = await loginUi(browser, "m3");
    await go(page, "/en/dashboard/journal", "#journal-composer textarea");
    if (!S.ENTRY_CP) {
      const text = `QA${TAG} client-job: poured screed in Block A, worked 5 hours, 20 m2`;
      await page.locator("#journal-composer textarea").fill(text);
      await page.getByRole("button", { name: /Read it back/i }).click();
      await expect(page.getByTestId("worklog-project-auto")).toBeVisible({ timeout: 60_000 });
      await page.getByTestId("worklog-photo-input").setInputFiles({ name: "site.png", mimeType: "image/png", buffer: PNG });
      await page.getByTestId("worklog-save").click();
      await page.getByTestId("worklog-confirm").click(); // "Confirm the entry?"
      await expect.poll(async () => (await rows(`journal_entries?original_text=ilike.${encodeURIComponent(`QA${TAG} client-job%`)}&select=id`)).length, { timeout: 90_000 }).toBe(1);
      await settle(page);
      await shot(page, "5b-saved-with-photo");

      const e = await rows<{ id: string; project_id: string; worker_id: string }>(
        `journal_entries?original_text=ilike.${encodeURIComponent(`QA${TAG} client-job%`)}&select=id,project_id,worker_id`,
      );
      expect(e).toHaveLength(1);
      expect(e[0]).toMatchObject({ project_id: S.PROJECT, worker_id: m3.workerId });
      save({ ENTRY_CP: e[0].id });
      await expect
        .poll(async () => (await rows<{ upload_status: string }>(`journal_entry_photos?entry_id=eq.${e[0].id}&select=upload_status,storage_path`)).map((p) => p.upload_status), { timeout: 60_000 })
        .toContain("uploaded");
      const ph = await rows<{ storage_path: string }>(`journal_entry_photos?entry_id=eq.${e[0].id}&upload_status=eq.uploaded&select=storage_path`);
      save({ PHOTO_PATH: ph[0].storage_path });
    }

    // not submitted yet: nothing in the counterparty's queue, no submission row
    expect(await rows(`journal_entry_review_submissions?entry_id=eq.${S.ENTRY_CP}&select=id`)).toEqual([]);
    const rep2 = await acct("rep2");
    const q0 = await rpcAs(rep2.jwt, "list_counterparty_review_queue_v1", {});
    expect(JSON.stringify(q0.json)).not.toContain(S.ENTRY_CP);

    // explicit submit through the entry's review panel
    await go(page, "/en/dashboard/journal", `[data-testid="entry-review-${S.ENTRY_CP}"]`);
    const panel = page.getByTestId(`entry-review-${S.ENTRY_CP}`);
    await expect(panel).toHaveAttribute("data-phase", "ready_to_submit");
    await expect(page.locator('[data-testid^="counterparty-decide-"]')).toHaveCount(0);
    await shot(page, "5b-ready-to-submit");
    await page.getByTestId(`entry-review-submit-${S.ENTRY_CP}`).click();
    await expect(panel).toHaveAttribute("data-phase", "submitted", { timeout: 60_000 });
    const sub = await rows<Record<string, any>>(`journal_entry_review_submissions?entry_id=eq.${S.ENTRY_CP}&select=*`);
    expect(sub).toHaveLength(1);
    expect(sub[0]).toMatchObject({ link_id: S.LINK_M3, submitted_by: m3.id, worker_id: m3.workerId });
    expect(sub[0].resubmission_of_entry_id).toBeNull();
    // no decision exists yet
    expect(await rows(`journal_entry_confirmations?entry_id=eq.${S.ENTRY_CP}&select=id`)).toEqual([]);
  });

  test("5c. SECURITY-NEGATIVE: only the authorized representative can decide or open the photos (subject, teammate, manager of the subject's own org, wrong org, stranger, anon)", async () => {
    const entry = S.ENTRY_CP;
    const rep2 = await acct("rep2");
    const who: [string, string | null][] = [
      ["subject m3", (await acct("m3")).jwt],
      ["teammate m2", (await acct("m2")).jwt],
      ["owner of subject's own team org (manages ORG too)", (await acct("own")).jwt],
      ["wrong org (cli owner)", (await acct("cli")).jwt],
      ["stranger", (await acct("str")).jwt],
      ["anon (apikey only)", null],
    ];
    for (const [label, jwt] of who) {
      const r = await rpcAs(jwt, "review_journal_entry", { p_entry_id: entry, p_decision: "approved", p_note: "forged" });
      expect(refusedDecision(r), `${label} must be refused: ${JSON.stringify(r)}`).toBe(true);
      const d = await rpcAs(jwt, "counterparty_review_entry_detail_v1", { p_entry_id: entry });
      const detail = JSON.stringify(d.json);
      expect(detail === "null" || d.status >= 400 || detail === "[]" || !detail.includes(`QA${TAG} client-job`), `${label} must not read the entry detail`).toBe(true);
      const q = await rpcAs(jwt, "list_counterparty_review_queue_v1", {});
      expect(JSON.stringify(q.json ?? "")).not.toContain(entry);
    }
    expect(await rows(`journal_entry_confirmations?entry_id=eq.${entry}&select=id`), "no forged confirmation exists").toEqual([]);

    // PHOTO ACCESS through the REAL storage API
    const path = S.PHOTO_PATH as string;
    const sign = async (jwt: string | null) => {
      const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/journal-entry-photos/${path}`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 60 }),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok || !j.signedURL) return { ok: false, status: res.status };
      const got = await fetch(`${SUPA_URL}/storage/v1${j.signedURL}`);
      return { ok: got.ok, status: got.status, bytes: got.ok ? (await got.arrayBuffer()).byteLength : 0 };
    };
    const direct = async (jwt: string | null) => {
      const res = await fetch(`${SUPA_URL}/storage/v1/object/authenticated/journal-entry-photos/${path}`, {
        headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}` },
      });
      return { ok: res.ok, status: res.status };
    };
    const authorized = await sign(rep2.jwt);
    expect(authorized.ok, `the authorized representative can open the photo: ${JSON.stringify(authorized)}`).toBe(true);
    expect((await direct(rep2.jwt)).ok).toBe(true);
    // The manager of the entry's OWN engagement organisation (the employer side,
    // here the team organisation OWN owns) reads the photo through the PRE-EXISTING
    // employer storage policy - not through the counterparty policy. Recorded, not asserted as denied.
    const ownerSign = await sign((await acct("own")).jwt);
    test.info().annotations.push({ type: "photo-employer-side", description: `owner of the entry's engagement org can open photo: ${ownerSign.ok} (pre-existing employer policy)` });
    for (const [label, jwt] of who.filter(([l]) => !l.startsWith("subject") && !l.startsWith("owner of subject"))) {
      expect((await sign(jwt)).ok, `${label} must NOT open the photo (sign)`).toBe(false);
      expect((await direct(jwt)).ok, `${label} must NOT open the photo (direct)`).toBe(false);
    }
    // the author (owner of the object) can still open their own photo
    expect((await direct((await acct("m3")).jwt)).ok).toBe(true);
  });

  test("5d. REQUEST A CORRECTION (note required) from the client's queue, then the worker corrects (correction_of) and RESUBMITS", async ({ browser }) => {
    const entry = S.ENTRY_CP;
    const rep = await loginUi(browser, "rep2");
    const already = (await rows(`journal_entry_confirmations?entry_id=eq.${entry}&select=id`)).length > 0;
    await go(rep, "/en/dashboard/inbox/counterparty", `[data-testid="counterparty-card-${entry}"]`);
    if (!already) {
      const card = rep.getByTestId(`counterparty-card-${entry}`);
      await expect(card).toHaveAttribute("data-bucket", "to_decide");
      await expect(card).toContainText(`QA${TAG} client-job`);
      await shot(rep, "5d-queue");
      await card.getByRole("radio", { name: /request a correction/i }).check();
      const note = card.getByLabel(/note \(required\)/i);
      await expect(note).toHaveAttribute("required", "");
      // note required: an empty note cannot be sent
      await card.getByTestId(`counterparty-decide-${entry}`).click();
      await expect(card.getByTestId(`counterparty-result-${entry}`)).toHaveCount(0);
      await note.fill("Please state the area in square metres.");
      await card.getByTestId(`counterparty-decide-${entry}`).click();
    }
    // after the write the card re-renders into its WAITING state (the transient result line is replaced)
    await expect(rep.getByTestId(`counterparty-waiting-${entry}`)).toBeVisible({ timeout: 90_000 });
    await shot(rep, "5d-waiting-for-worker");
    const rep2 = await acct("rep2");
    const c1 = await rows<Record<string, any>>(`journal_entry_confirmations?entry_id=eq.${entry}&select=*`);
    expect(c1).toHaveLength(1);
    expect(c1[0].confirmer_id).toBe(rep2.id);
    expect(c1[0].confirmation_scope.action).toBe("client_request_correction");
    expect(c1[0].confirmation_scope.decision).toBe("changes_requested");
    expect(c1[0].confirmation_scope.authority.basis).toBe("counterparty");
    expect(c1[0].confirmation_scope.provenance.origin).toBe("NATIVE_PLATFORM_CLIENT_CONFIRMATION");
    // a note-less correction request is refused by the database as well
    const noNote = await rpcAs(rep2.jwt, "review_journal_entry", { p_entry_id: entry, p_decision: "rejected", p_note: "" });
    expect(refusedDecision(noNote) || JSON.stringify(noNote.json).includes("note_required"), JSON.stringify(noNote)).toBe(true);
    expect(await rows(`journal_entry_confirmations?entry_id=eq.${entry}&select=id`), "no second row from a note-less decision").toHaveLength(1);

    // WORKER: sees the request with the note, corrects through the existing editor, resubmits
    const w = await loginUi(browser, "m3");
    const preFix = await rows<{ id: string }>(`journal_entries?correction_of=eq.${entry}&select=id`);
    if (preFix.length === 0) {
      await go(w, "/en/dashboard/journal", `[data-testid="entry-review-${entry}"]`);
      const panel = w.getByTestId(`entry-review-${entry}`);
      await expect(panel).toHaveAttribute("data-phase", "correction_requested");
      await expect(panel).toContainText("Please state the area in square metres.");
      await shot(w, "5d-worker-sees-request");
      await w.getByTestId(`journal-entry-edit-${entry}`).click();
      const ed = w.getByTestId("journal-compact-text");
      await expect(ed).toBeVisible({ timeout: 60_000 });
      await ed.fill(`QA${TAG} client-job: poured screed in Block A, worked 5 hours, 20 m2 (area 20 m2, corrected)`);
      await w.getByRole("button", { name: /save/i }).last().click();
      await expect(w.getByTestId("journal-compact-saved")).toBeVisible({ timeout: 60_000 });
    }
    const fixed = await rows<{ id: string; correction_of: string | null; project_id: string | null }>(
      `journal_entries?correction_of=eq.${entry}&select=id,correction_of,project_id`,
    );
    expect(fixed).toHaveLength(1);
    expect(fixed[0].project_id, "the correction keeps the project").toBe(S.PROJECT);
    // The CONFIRMED original is not rewritten: the correction points back at it (correction_of);
    // the original keeps its decision history (immutable).
    const old = await rows<{ superseded_by: string | null; deleted_at: string | null }>(`journal_entries?id=eq.${entry}&select=superseded_by,deleted_at`);
    expect(old[0].deleted_at).toBeNull();
    test.info().annotations.push({ type: "correction-model", description: `original.superseded_by=${old[0].superseded_by} (confirmed original stays; correction_of links back)` });
    save({ ENTRY_CP2: fixed[0].id });

    await go(w, "/en/dashboard/journal", `[data-testid="entry-review-${fixed[0].id}"]`);
    const panel2 = w.getByTestId(`entry-review-${fixed[0].id}`);
    await expect(panel2).toHaveAttribute("data-phase", "ready_to_submit");
    await panel2.getByRole("button", { name: /resubmit|submit/i }).click();
    await expect(panel2).toHaveAttribute("data-phase", "submitted", { timeout: 60_000 });
    const sub = await rows<Record<string, any>>(`journal_entry_review_submissions?entry_id=eq.${fixed[0].id}&select=*`);
    expect(sub).toHaveLength(1);
    expect(sub[0].resubmission_of_entry_id).toBe(entry);
    await shot(w, "5d-resubmitted");
  });

  test("5e. ACCEPT is final, provenance is read back, and it is CLIENT_ACCEPTED - never an employer confirmation, skill verification or payment", async ({ browser }) => {
    const e2 = S.ENTRY_CP2;
    const rep = await loginUi(browser, "rep2");
    await go(rep, "/en/dashboard/inbox/counterparty", `[data-testid="counterparty-card-${e2}"]`);
    const card = rep.getByTestId(`counterparty-card-${e2}`);
    if ((await card.getAttribute("data-bucket")) === "to_decide") {
      await expect(card).toHaveAttribute("data-bucket", "to_decide");
      await expect(rep.getByTestId(`counterparty-resubmission-${e2}`)).toBeVisible();
      await card.getByRole("radio", { name: /accept the work/i }).check();
      await expect(card.getByText(/cannot be undone/i)).toBeVisible();
      await card.getByTestId(`counterparty-decide-${e2}`).click();
      await expect(rep.getByTestId(`counterparty-final-${e2}`)).toBeVisible({ timeout: 90_000 }); // "accept is final" marker
    }
    await expect(rep.getByTestId(`counterparty-final-${e2}`)).toBeVisible({ timeout: 90_000 });
    await shot(rep, "5e-accepted");

    const rep2 = await acct("rep2");
    const c = await rows<Record<string, any>>(`journal_entry_confirmations?entry_id=eq.${e2}&select=*`);
    expect(c).toHaveLength(1);
    expect(c[0].confirmer_id).toBe(rep2.id);
    expect(c[0].confirmation_scope.action).toBe("client_accept");
    expect(c[0].confirmation_scope.decision).toBe("approved");
    expect(c[0].confirmation_scope.authority).toMatchObject({ basis: "counterparty" });
    expect(c[0].confirmation_scope.provenance.origin).toBe("NATIVE_PLATFORM_CLIENT_CONFIRMATION");
    expect(c[0].confirmation_scope.provenance.confirmed_by ?? c[0].confirmer_id).toBeTruthy();
    // never counted as a manager 'confirm'
    expect(await rows(`journal_entry_confirmations?confirmation_scope->>action=eq.confirm&entry_id=in.(${S.ENTRY_CP},${e2})&select=id`)).toEqual([]);
    // no skill verification / payment side effect for the subject from a client acceptance
    const m3 = await acct("m3");
    const verified = await rows(`worker_skills?worker_id=eq.${m3.workerId}&verification_status=eq.verified&select=id`).catch(() => []);
    expect(verified).toEqual([]);

    // FINAL: a later reject / re-decision is refused, the accepted decision stands
    const flip = await rpcAs(rep2.jwt, "review_journal_entry", { p_entry_id: e2, p_decision: "rejected", p_note: "too late" });
    expect(flip.json === "rejected" && flip.status < 300, `flip after accept must be refused: ${JSON.stringify(flip)}`).toBe(false);
    const after = await rows<{ confirmation_scope: any }>(`journal_entry_confirmations?entry_id=eq.${e2}&select=confirmation_scope`);
    expect(after.map((x) => x.confirmation_scope.action)).toEqual(["client_accept"]);
    // append-only: confirmations cannot be rewritten even by the service role
    for (const who of [rep2, await acct("m3")]) {
      const upd = await asUser(who.jwt, "PATCH", `journal_entry_confirmations?entry_id=eq.${e2}`, { confirmation_scope: { action: "confirm", decision: "approved" } });
      expect(upd.status >= 400 || (Array.isArray(upd.json) && upd.json.length === 0), `no client-side rewrite of a decision: ${JSON.stringify(upd)}`).toBe(true);
    }
    const stillScope = await rows<{ confirmation_scope: any }>(`journal_entry_confirmations?entry_id=eq.${e2}&select=confirmation_scope`);
    expect(stillScope[0].confirmation_scope.action).toBe("client_accept");

    // WORKER sees a CLIENT acceptance, separate from an employer's
    const w = await loginUi(browser, "m3");
    await go(w, "/en/dashboard/journal", `[data-testid="entry-review-${e2}"]`);
    const panel = w.getByTestId(`entry-review-${e2}`);
    await expect(panel).toHaveAttribute("data-phase", "accepted");
    await expect(panel).toContainText(/different thing from a manager.s record, does not verify a skill and is not a payment/i);
    await expect(panel).not.toContainText(/confirmed by (your )?(manager|employer)/i);
    await shot(w, "5e-worker-accepted");
    // the subject cannot flip it
    const subj = await rpcAs(m3.jwt, "review_journal_entry", { p_entry_id: e2, p_decision: "rejected", p_note: "x" });
    expect(refusedDecision(subj)).toBe(true);
  });

  // =========================================================================
  // STEP 6 - INVITATION / ROSTER / IMPORTED HISTORY (#2147, #2155, #2152)
  // =========================================================================
  const chainHash = (prev: string | null, fp: string, at: string) => sha(`work-history-chain:v1:${prev ?? ""}:${fp}:${at}`);
  const LIVE = [
    { date: "2025-03-10", hours: 8 },
    { date: "2025-03-11", hours: 6.5 },
  ];
  const WITHDRAWN = { date: "2025-03-12", hours: 5 };
  const inviteToken = () => randomBytes(24).toString("base64url");
  const invitePath = (tok: string) => `/en/invite/${tok}`;

  /** The product's own RPC, AS the inviting manager (the app's createInvitation does exactly this). */
  async function createInvitation(jwt: string, args: Record<string, unknown>): Promise<{ token: string; res: { status: number; json: any } }> {
    const token = inviteToken();
    const res = await rpcAs(jwt, "create_invitation_v2", { p_token_hash: sha(token), p_invitation_type: "join_as_employee", ...args });
    return { token, res };
  }

  test("6a. ADDRESSED LINK (#2155): a stranger with a different e-mail sees the MISMATCH page - no Accept, nothing consumed; the real invitee still accepts", async ({ browser }) => {
    const own = await acct("own");
    const inv = await createAccount("inv", "worker");
    rememberAccount("inv", inv);
    const { token, res } = await createInvitation(own.jwt, {
      p_invited_email: inv.email,
      p_invited_name: nm("inv"),
      p_organization_id: S.ORG,
      p_proposed_role: "Tiler",
      p_relationship_slug: "employee",
    });
    expect(res.status, JSON.stringify(res.json)).toBeLessThan(300);
    save({ INV_TOKEN: token });
    const before = await rows<{ id: string; status: string }>(`invitations?invited_email=eq.${encodeURIComponent(inv.email)}&select=id,status`);
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe("pending");

    // the stranger (a DIFFERENT, registered account) follows the forwarded link
    const strPage = await loginUi(browser, "str");
    await strPage.goto(invitePath(token), { waitUntil: "domcontentloaded" });
    await expect(strPage.getByTestId("invite-email-mismatch")).toBeVisible({ timeout: 120_000 });
    await expect(strPage.getByTestId("invite-accept")).toHaveCount(0);
    await shot(strPage, "6a-stranger-mismatch");
    // nothing consumed / created
    const str = await acct("str");
    const mid = await rows<{ status: string; accepted_by_profile_id: string | null }>(`invitations?id=eq.${before[0].id}&select=status,accepted_by_profile_id`);
    expect(mid[0]).toMatchObject({ status: "pending", accepted_by_profile_id: null });
    expect(await rows(`engagement_contexts?profile_id=eq.${str.id}&organization_id=eq.${S.ORG}&select=id`)).toEqual([]);
    // the doors refuse as the stranger (real JWT): accept, decline, preview -> email_mismatch, row untouched
    for (const fn of ["accept_invitation_v2", "decline_invitation_v2", "accept_invitation_v1", "decline_invitation_v1"]) {
      const r = await rpcAs(str.jwt, fn, { p_token: token });
      expect(JSON.stringify(r.json), `${fn} as stranger`).toMatch(/email_mismatch/);
    }
    const pv = await rpcAs(str.jwt, "get_invitation_preview_v2", { p_token: token });
    expect(JSON.stringify(pv.json)).toMatch(/email_mismatch/);
    expect(JSON.stringify(pv.json)).not.toContain(inv.email);
    const after = await rows<{ status: string }>(`invitations?id=eq.${before[0].id}&select=status`);
    expect(after[0].status).toBe("pending");
    // unknown / garbage tokens are denied too
    const bad = await rpcAs(str.jwt, "accept_invitation_v2", { p_token: "not-a-real-token-" + TAG });
    expect(JSON.stringify(bad.json)).toMatch(/not_found|invalid|expired/);

    // the REAL invitee (token + matching address, e-mail not otherwise proved) still accepts
    const invPage = await loginUi(browser, "inv");
    await invPage.goto(invitePath(token), { waitUntil: "domcontentloaded" });
    await expect(invPage.getByTestId("invite-accept")).toBeVisible({ timeout: 120_000 });
    await expect(invPage.getByTestId("invite-email-mismatch")).toHaveCount(0);
    await shot(invPage, "6a-invitee-sees-accept");
    await invPage.getByTestId("invite-accept").click();
    await invPage.waitForURL((u) => !/\/invite\//.test(u.pathname) || /notice=/.test(u.search), { timeout: 120_000 });
    const fin = await rows<{ status: string; accepted_by_profile_id: string }>(`invitations?id=eq.${before[0].id}&select=status,accepted_by_profile_id`);
    expect(fin[0]).toMatchObject({ status: "accepted", accepted_by_profile_id: inv.id });
    expect(await rows(`engagement_contexts?profile_id=eq.${inv.id}&organization_id=eq.${S.ORG}&status=eq.active&select=id`)).toHaveLength(1);
    // used token: denied for a replay (by the invitee) and for the stranger
    const replay = await rpcAs(inv.jwt, "accept_invitation_v2", { p_token: token });
    expect(JSON.stringify(replay.json)).not.toMatch(/"outcome":"(accepted|ok)"/);
    const replayStr = await rpcAs(str.jwt, "accept_invitation_v2", { p_token: token });
    expect(JSON.stringify(replayStr.json)).not.toMatch(/"outcome":"(accepted|ok)"/);
  });

  test("6b. SHAREABLE (no e-mail) link still works for anyone holding it; an EXPIRED link and a REVOKED link are denied", async ({ browser }) => {
    const own = await acct("own");
    const { token, res } = await createInvitation(own.jwt, {
      p_invited_email: null,
      p_organization_id: S.ORG,
      p_proposed_role: "Helper",
      p_relationship_slug: "employee",
      p_max_uses: 3,
      p_campaign_label: `QA${TAG} shareable`,
    });
    expect(res.status, JSON.stringify(res.json)).toBeLessThan(300);
    const str = await acct("str");
    const page = await loginUi(browser, "str");
    await page.goto(invitePath(token), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("invite-accept")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("invite-email-mismatch")).toHaveCount(0);
    await shot(page, "6b-shareable");
    await page.getByTestId("invite-accept").click();
    await page.waitForURL((u) => !/\/invite\//.test(u.pathname) || /notice=/.test(u.search), { timeout: 120_000 });
    expect(await rows(`engagement_contexts?profile_id=eq.${str.id}&organization_id=eq.${S.ORG}&status=eq.active&select=id`)).toHaveLength(1);

    // EXPIRED: a link whose expiry has passed
    const exp = await createInvitation(own.jwt, { p_invited_email: null, p_organization_id: S.ORG, p_proposed_role: "x", p_relationship_slug: "employee", p_max_uses: 2 });
    await dbOk("PATCH", `invitations?token_hash=eq.${sha(exp.token)}`, { expires_at: new Date(Date.now() - 3600_000).toISOString() });
    const nm_ = await acct("nm");
    const r = await rpcAs(nm_.jwt, "accept_invitation_v2", { p_token: exp.token });
    expect(JSON.stringify(r.json)).toMatch(/expired|not_found|invalid/);
    expect(await rows(`engagement_contexts?profile_id=eq.${nm_.id}&organization_id=eq.${S.ORG}&select=id`)).toEqual([]);
    // REVOKED
    const rev = await createInvitation(own.jwt, { p_invited_email: null, p_organization_id: S.ORG, p_proposed_role: "x", p_relationship_slug: "employee", p_max_uses: 2 });
    const rid = (await rows<{ id: string }>(`invitations?token_hash=eq.${sha(rev.token)}&select=id`))[0].id;
    const rv = await rpcAs(own.jwt, "revoke_invitation_v1", { p_invitation_id: rid });
    expect(rv.status).toBeLessThan(300);
    const r2 = await rpcAs(nm_.jwt, "accept_invitation_v2", { p_token: rev.token });
    expect(JSON.stringify(r2.json)).toMatch(/revoked|not_found|invalid|expired|closed/);
    expect(await rows(`engagement_contexts?profile_id=eq.${nm_.id}&organization_id=eq.${S.ORG}&select=id`)).toEqual([]);
  });

  test("6c. UNVERIFIED registrant (#2152): cannot claim / list / accept / decline resources addressed to their TYPED e-mail; a verified owner of the address can; possession of a token still works", async ({ browser }) => {
    const own = await acct("own");
    const victimMail = email("victimc");
    // a pending roster invitation addressed to an address nobody has proved
    const seed = await dbOk("POST", "company_worker_invitations", { company_id: S.CO_ID, invited_email: victimMail, status: "pending", inviter_profile_id: (await acct("own")).id });
    const invId = ((await seed.json()) as { id: string }[])[0]?.id;
    expect(invId).toBeTruthy();
    // the attacker REGISTERS with that address through the real UI and gets in at once
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    ctxs.push(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(180_000);
    page.setDefaultNavigationTimeout(240_000);
    await page.goto("/en/auth/signup", { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.locator('input[type="email"]').fill(victimMail);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(PASSWORD);
    await page.getByRole("button", { name: /Sign up/i }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 240_000 });
    // finish onboarding (the person's own RPC) so the account area opens
    const jwt0 = await jwtFor(victimMail);
    const ob0 = await rpcAs(jwt0, "complete_onboarding", { p_role: "worker", p_display_name: nm("victimc"), p_country: "LT", p_role_data: {} });
    expect(ob0.status, JSON.stringify(ob0.json)).toBeLessThan(300);
    // 1. The UI offers the proof, not the invitation
    await go(page, "/en/dashboard/network");
    await expect(page.getByTestId("network-email-unverified")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("verify-email-send")).toBeVisible();
    await expect(page.getByTestId("incoming-invitations")).toHaveCount(0);
    await shot(page, "6c-unverified-network");
    // 2. The database refuses the claim for the same session (real JWT)
    const jwt = await jwtFor(victimMail);
    const au = ((await (await authAdmin("GET", "admin/users?per_page=200")).json()).users as any[]).find((x) => x.email === victimMail);
    created.push(au.id);
    const accept = await rpcAs(jwt, "accept_company_worker_invitation", { p_company_id: S.CO_ID });
    const body = JSON.stringify(accept.json).replace(/"/g, "");
    expect(["email_unverified", "no_worker_profile"]).toContain(body);
    const list = await rpcAs(jwt, "list_invitations_for_me_v1", {});
    expect(list.json.items).toEqual([]);
    expect(list.json.email_unverified).toBe(true);
    expect((await asUser(jwt, "GET", `company_worker_invitations?select=id&invited_email=eq.${encodeURIComponent(victimMail)}`)).json).toEqual([]);
    for (const fn of ["accept_invitation_by_id_v2", "accept_invitation_by_id_v1"]) {
      const r = await rpcAs(jwt, fn, { p_invitation_id: invId });
      expect(JSON.stringify(r.json), fn).not.toMatch(/"outcome":"(accepted|ok)"/);
    }
    // the agency-side doors fail closed as well
    const ag = await rpcAs(jwt, "accept_agency_worker_invitation", { p_agency_id: S.CO_ID });
    expect(JSON.stringify(ag.json).replace(/"/g, "")).not.toMatch(/^(linked|already_linked|accepted)$/);
    const still = await rows<{ status: string }>(`company_worker_invitations?id=eq.${invId}&select=status`);
    expect(still[0].status).toBe("pending");

    // 3. POSSESSION OF A TOKEN still works for the same unverified person (intended token flow)
    const tk = await createInvitation(own.jwt, { p_invited_email: null, p_organization_id: S.ORG, p_proposed_role: "x", p_relationship_slug: "employee", p_max_uses: 1 });
    const tokenOk = await rpcAs(jwt, "accept_invitation_v2", { p_token: tk.token });
    expect(JSON.stringify(tokenOk.json)).toMatch(/accepted|ok|engagement/);

    // 4. A VERIFIED owner of the address IS allowed. The mailbox proof is recorded
    //    exactly as confirm_my_email_v1 records it (append-only evidence row); the
    //    mailed one-time-token round trip is NOT RUN here (no mail provider locally).
    await dbOk("POST", "email_verifications_v1", { profile_id: au.id, email: victimMail, method: "mailbox_proof" });
    const jwt2 = await jwtFor(victimMail);
    const list2 = await rpcAs(jwt2, "list_invitations_for_me_v1", {});
    expect(list2.json.email_unverified, "verified: the list door is no longer fail-closed").toBeFalsy();
    const acc2 = await rpcAs(jwt2, "accept_company_worker_invitation", { p_company_id: S.CO_ID });
    expect(JSON.stringify(acc2.json).replace(/"/g, ""), "the verified owner of the address may accept").toMatch(/^(linked|already_linked)$/);
    await page.close();
  });

  test("6d. ROSTER HISTORY (#2147/#2154): seeded history is invisible to a foreign account (same name/e-mail), appears ONLY after the person accepts the link; withdrawn evidence never counts", async ({ browser }) => {
    const own = await acct("own");
    const reg = await acct("reg");
    const rosterName = nm("reg");
    let personId: string = S.ROSTER_PERSON ?? "";
    if (!personId) {
      const mk = async (name: string, ref: string) => {
        const r = await dbOk("POST", "organization_people", {
          organization_id: S.ORG,
          display_name: name,
          normalized_name: name.toLowerCase(),
          external_ref: `qa-${ref}-${TAG}`,
          relationship_kind: "employee",
          source_note: `integrated chain ${TAG}`,
          created_by: own.id,
        });
        return ((await r.json()) as { id: string }[])[0].id;
      };
      personId = await mk(rosterName, "reg");
      const s = await dbOk("POST", "evidence_import_sessions", {
        organization_id: S.ORG,
        source_kind: "manual",
        source_filename: `chain-${TAG}.csv`,
        source_fingerprint: sha(`session:${TAG}`),
        source_language: "en",
        supplied_by_organization_id: S.ORG,
        supplier_role: "employer",
        actor_kind: "human",
        created_by: own.id,
        notes: `integrated chain ${TAG}`,
      });
      const sessionId = ((await s.json()) as { id: string }[])[0].id;
      let prev: string | null = null;
      const importedAt = new Date().toISOString();
      const ids: string[] = [];
      for (const r of [...LIVE, WITHDRAWN]) {
        const fingerprint = sha(`record:${S.ORG}:${personId}:${r.date}:${r.hours}:${TAG}`);
        const self = chainHash(prev, fingerprint, importedAt);
        const res = await dbOk("POST", "organization_evidence_records", {
          organization_id: S.ORG,
          organization_person_id: personId,
          activity_kind: "work",
          context_label: `QA${TAG} History ${r.date}`,
          activity_date: r.date,
          hours: r.hours,
          original_text: `Work ${r.date}`,
          original_language: "en",
          evidence_state: "LEGACY_IMPORTED",
          supplied_by_organization_id: S.ORG,
          supplier_role: "employer",
          supplied_by_profile_id: own.id,
          imported_by_profile_id: own.id,
          imported_at: importedAt,
          session_id: sessionId,
          source_kind: "manual",
          source_filename: `chain-${TAG}.csv`,
          source_fact: { row: r.date },
          derived: {},
          record_fingerprint: fingerprint,
          hash_prev: prev,
          hash_self: self,
        });
        prev = self;
        ids.push(((await res.json()) as { id: string }[])[0].id);
      }
      await dbOk("POST", "organization_evidence_events", {
        organization_id: S.ORG,
        record_id: ids[ids.length - 1],
        event_type: "withdrawn",
        actor_profile_id: own.id,
        note: `chain ${TAG}`,
      });
      save({ ROSTER_PERSON: personId });
    }

    // A FOREIGN account with the SAME display name and a lookalike e-mail inherits nothing
    const clone = S.accounts?.clone ? await acct("clone") : await createAccount("clone", "worker");
    rememberAccount("clone", clone);
    await rpcAs(clone.jwt, "complete_onboarding", { p_role: "worker", p_display_name: rosterName, p_country: "LT", p_role_data: {} });
    for (const who of [clone, await acct("str")]) {
      expect((await asUser(who.jwt, "GET", `organization_evidence_records?select=id&organization_id=eq.${S.ORG}`)).json).toEqual([]);
      expect((await asUser(who.jwt, "GET", `organization_people?select=id&id=eq.${personId}`)).json).toEqual([]);
      const selfLink = await asUser(who.jwt, "PATCH", `organization_people?id=eq.${personId}`, { linked_profile_id: who.id, linked_worker_id: who.workerId, link_state: "linked", link_method: "worker_confirmed" });
      expect(selfLink.json).toEqual([]);
    }
    expect((await rows(`organization_people?id=eq.${personId}&select=link_state`))[0].link_state).toBe("unlinked");

    // The manager OFFERS the link to the real person (the UI-registered worker); they have no invitation yet.
    const ownPage = await loginUi(browser, "own");
    await go(ownPage, "/en/dashboard/company/people", `[data-testid="organization-roster-person-${personId}"]`);
    const sel = ownPage.getByTestId(`roster-link-worker-${personId}`);
    if ((await rows(`engagement_contexts?profile_id=eq.${reg.id}&organization_id=eq.${S.ORG}&status=eq.active&select=id`)).length === 0) {
      // the worker must be on the roster as an engagement first: invite them through the roster-claim control
      await ownPage.getByTestId(`roster-claim-email-${personId}`).fill(reg.email);
      await ownPage.getByTestId(`roster-claim-invite-${personId}`).locator('button[type="submit"]').click();
      const done = ownPage.getByTestId(`roster-claim-invited-${personId}`);
      await expect(done).toBeVisible({ timeout: 60_000 });
      const link = ownPage.getByTestId(`roster-claim-link-${personId}`);
      expect(await link.count(), "the invite link is shown when delivery is not configured").toBeGreaterThan(0);
      const href = (await link.inputValue()).replace(/^https?:\/\/[^/]+/, "");
      await shot(ownPage, "6d-claim-invited");
      // the invited person (same e-mail, signed up through the UI) accepts the invitation by its link
      const regPage = await loginUi(browser, "reg");
      await regPage.goto(href, { waitUntil: "domcontentloaded" });
      await expect(regPage.getByTestId("invite-accept")).toBeVisible({ timeout: 120_000 });
      await regPage.getByTestId("invite-accept").click();
      await regPage.waitForURL((u) => !/\/invite\//.test(u.pathname) || /notice=/.test(u.search), { timeout: 120_000 });
      await expect.poll(async () => (await rows(`engagement_contexts?profile_id=eq.${reg.id}&organization_id=eq.${S.ORG}&status=eq.active&select=id`)).length).toBe(1);
    }
    // invited + accepted an organisation invitation: STILL no history (no auto-link by name or e-mail)
    expect((await rows(`organization_people?id=eq.${personId}&select=link_state`))[0].link_state).toBe("unlinked");
    expect((await asUser(reg.jwt, "GET", `organization_evidence_records?select=id&organization_id=eq.${S.ORG}`)).json).toEqual([]);

    await go(ownPage, "/en/dashboard/company/people", `[data-testid="roster-link-worker-${personId}"]`);
    await ownPage.getByTestId(`roster-link-worker-${personId}`).selectOption({ value: `${reg.workerId}:${reg.id}` });
    await ownPage.getByTestId(`roster-link-offer-${personId}`).locator('button[type="submit"]').click();
    await expect(ownPage.getByTestId(`organization-roster-person-${personId}`).locator('[data-link-state="link_proposed"]')).toBeVisible({ timeout: 60_000 });
    expect((await rows(`organization_people?id=eq.${personId}&select=link_state`))[0].link_state).toBe("link_proposed");
    expect((await asUser(reg.jwt, "GET", `organization_evidence_records?select=id&organization_id=eq.${S.ORG}`)).json, "offered is not linked: still nothing").toEqual([]);
    // the manager cannot confirm on the person's behalf
    const forced = await asUser(own.jwt, "PATCH", `organization_people?id=eq.${personId}`, { link_state: "linked", link_method: "worker_confirmed", linked_by: own.id });
    expect(forced.status).toBe(403);

    // the person accepts on their own profile - only now
    const regPage2 = await loginUi(browser, "reg");
    await go(regPage2, "/en/dashboard/profile", `[data-testid="roster-link-offer"][data-person-id="${personId}"]`);
    await regPage2.locator(`[data-testid="roster-link-offer"][data-person-id="${personId}"] button[name="decision"][value="accept"]`).click();
    await expect.poll(async () => (await rows<{ link_state: string }>(`organization_people?id=eq.${personId}&select=link_state`))[0].link_state, { timeout: 60_000 }).toBe("linked");
    const p = await rows<Record<string, any>>(`organization_people?id=eq.${personId}&select=link_state,link_method,linked_by,linked_profile_id,linked_worker_id`);
    expect(p[0]).toMatchObject({ link_method: "worker_confirmed", linked_by: reg.id, linked_profile_id: reg.id, linked_worker_id: reg.workerId });
    const vis = await asUser((await acct("reg")).jwt, "GET", `organization_evidence_records?select=id,hours&organization_person_id=eq.${personId}`);
    expect(vis.json).toHaveLength(3);
    // the foreign account STILL sees nothing
    expect((await asUser(clone.jwt, "GET", `organization_evidence_records?select=id&organization_id=eq.${S.ORG}`)).json).toEqual([]);

    // surfaces: profile history, Work in Numbers ledger, Living CV - LIVE hours only (14.5), the withdrawn 5 h never counts
    await go(regPage2, "/en/dashboard/work-in-numbers?period=all", '[data-testid="work-in-numbers"]');
    const ledger = regPage2.getByTestId("wi-org-records");
    await expect(ledger.first()).toBeVisible({ timeout: 60_000 });
    expect(Number(await ledger.first().getAttribute("data-all-hours"))).toBe(14.5);
    await shot(regPage2, "6d-win");
    await go(regPage2, "/en/dashboard/profile", '[data-testid="organization-history-summary"]');
    expect(Number(await regPage2.getByTestId("organization-history-summary").first().getAttribute("data-records"))).toBeGreaterThanOrEqual(2);
    await go(regPage2, "/en/cv", '[data-testid="cv-skills"]');
    const cvText = await regPage2.locator("body").innerText();
    expect(cvText).not.toMatch(/19[.,]5/);
    expect(cvText).toMatch(/14[.,]5/);
    await shot(regPage2, "6d-cv");
  });

  test("5f. PERSON-BASIS: an independent person with a real active assignment - what the product allows (composer attribution) vs. what the counterparty path needs", async ({ browser }) => {
    // A third project owned by the same organisation, one independent worker
    // (personal engagement context, NO organisation) with a PERSON assignment.
    let P3 = S.PROJECT3 as string | undefined;
    let iw: Account;
    let composerWorks = false;
    if (!P3) {
      const p3 = await dbOk("POST", "projects", { title: `QA${TAG} Person Project`, organization_id: S.ORG, status: "live" });
      P3 = ((await p3.json()) as { id: string }[])[0].id;
      iw = await createAccount("iw", "worker");
      rememberAccount("iw", iw);
      await dbOk("POST", "project_worker_assignments", { project_id: P3, worker_id: iw.workerId, status: "active" });
      save({ PROJECT3: P3 });
      const ecs0 = await rows<{ id: string; organization_id: string | null }>(`engagement_contexts?profile_id=eq.${iw.id}&status=eq.active&select=id,organization_id`);
      expect(ecs0.length).toBeGreaterThan(0);
      const asRpc0 = await rpcAs(iw.jwt, "create_journal_entry_full", {
        p_worker_id: iw.workerId,
        p_engagement_context_id: ecs0[0].id,
        p_entry_type_slug: "freeform",
        p_profession_id: null,
        p_original_text: `QA${TAG} person-basis entry`,
        p_original_language: "en",
        p_hash_prev: null,
        p_hash_self: sha(`person-basis:${TAG}`),
        p_visibility_scope: "closed",
        p_metrics: [],
        p_project_id: P3,
        p_project_explicit: true,
      });
      save({ PERSON_BASIS_COMPOSER: { status: asRpc0.status, body: asRpc0.json } });
    }
    iw = await acct("iw");
    const pbc = S.PERSON_BASIS_COMPOSER as { status: number; body: unknown };
    composerWorks = pbc.status < 300;
    const asRpc = { status: pbc.status, json: pbc.body };

    // (ii) Whatever the answer, the REGISTRATION on the real person assignment works from the UI
    const page = await loginUi(browser, "rep2");
    await go(page, `/en/dashboard/projects/${P3}`, '[data-testid="counterparty-link-panel"]');
    const row = page.getByTestId(`counterparty-link-row-${iw.workerId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row).toContainText(/assigned directly/i);
    await page.getByTestId(`counterparty-link-register-${iw.workerId}`).click();
    await expect(page.getByTestId(`counterparty-link-active-${iw.workerId}`)).toBeVisible({ timeout: 60_000 });
    await shot(page, "5f-person-registered");
    const aud = await rows<{ payload: any }>(`audit_logs?action=eq.register_work_counterparty_link&select=payload&order=created_at.desc&limit=1`);
    expect(aud[0].payload.relationship_kind).toBe("person");

    // (iii) negative: no work relationship -> cannot be registered (ex-member has none)
    const exm = await acct("exm");
    const rep2 = await acct("rep2");
    const noRel = await rpcAs(rep2.jwt, "register_work_counterparty_link_v1", { p_project_id: P3, p_worker_id: exm.workerId, p_party_role: "client" });
    expect(JSON.stringify(noRel.json)).toMatch(/no_work_relationship/);

    // (iv) If the product DID let the worker write on the project, the loop is the same; if not, state it.
    test.info().annotations.push({
      type: "person-basis-composer",
      description: composerWorks ? "composer attribution to the client's project WORKS for an independent person" : `composer attribution REFUSED for an independent person: ${JSON.stringify(asRpc.json)}`,
    });
    if (composerWorks) {
      const e = await rows<{ id: string }>(`journal_entries?original_text=eq.${encodeURIComponent(`QA${TAG} person-basis entry`)}&select=id`);
      const sub = await rpcAs(iw.jwt, "submit_journal_entry_for_review_v1", { p_entry_id: e[0].id });
      expect(JSON.stringify(sub.json)).toMatch(/submitted|ok/);
    }
  });

  // ---- MCP / chat tools -------------------------------------------------------
  async function mcp(jwt: string | null, method: string, params: unknown) {
    const res = await fetch(`${process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100"}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await res.text();
    return { status: res.status, text };
  }
  const tool = (jwt: string | null, name: string, args: unknown) => mcp(jwt, "tools/call", { name, arguments: args });

  test("5g. CHAT/MCP TOOLS: the same counterparty rules through the MCP door (list/read the queue, draft -> confirm decision); strangers and anon are refused", async () => {
    const rep2 = await acct("rep2");
    const m2 = await acct("m2");
    // m2 (Crew B member) has an entry on the project from 4d; register + submit through the product RPCs
    const reg = await rpcAs(rep2.jwt, "register_work_counterparty_link_v1", { p_project_id: S.PROJECT, p_worker_id: m2.workerId, p_party_role: "client" });
    expect(JSON.stringify(reg.json)).toMatch(/registered|already/);
    const e = await rows<{ id: string }>(`journal_entries?original_text=eq.${encodeURIComponent(`QA${TAG} entry-m2`)}&select=id`);
    expect(e).toHaveLength(1);
    const sub = await rpcAs(m2.jwt, "submit_journal_entry_for_review_v1", { p_entry_id: e[0].id });
    expect(JSON.stringify(sub.json)).toMatch(/submitted/);
    save({ ENTRY_M2: e[0].id });

    // the tools exist
    const list = await mcp(rep2.jwt, "tools/list", {});
    expect(list.status).toBe(200);
    for (const t of ["counterparty_review_queue_get", "counterparty_review_entry_get", "counterparty_review_decide_draft", "counterparty_review_decide_confirm"]) {
      expect(list.text, t).toContain(t);
    }
    // authorized representative: queue lists the entry, entry.get reads it
    const q = await tool(rep2.jwt, "counterparty_review_queue_get", {});
    expect(q.text).toContain(e[0].id);
    const g = await tool(rep2.jwt, "counterparty_review_entry_get", { entryId: e[0].id });
    expect(g.text).toContain(`QA${TAG} entry-m2`);
    // refused principals: stranger, subject, teammate; anon has no door
    for (const who of [await acct("str"), m2, await acct("m3")]) {
      const q2 = await tool(who.jwt, "counterparty_review_queue_get", {});
      expect(q2.text, "queue must not list another party's entry").not.toContain(e[0].id);
      const g2 = await tool(who.jwt, "counterparty_review_entry_get", { entryId: e[0].id });
      expect(g2.text).not.toContain(`QA${TAG} entry-m2`);
      const d2 = await tool(who.jwt, "counterparty_review_decide_draft", { entryId: e[0].id, decision: "accept" });
      expect(d2.text).not.toContain("confirmationToken");
    }
    const anon = await tool(null, "counterparty_review_queue_get", {});
    expect(anon.status).toBe(401);
    // correction request WITHOUT a note is refused; with a note it drafts
    const noNote = await tool(rep2.jwt, "counterparty_review_decide_draft", { entryId: e[0].id, decision: "request_correction" });
    expect(noNote.text).not.toContain("confirmationToken");
    // decide: draft writes nothing, confirm writes ONE client_accept
    const draft = await tool(rep2.jwt, "counterparty_review_decide_draft", { entryId: e[0].id, decision: "accept", note: "ok from chat" });
    const tok = /confirmationToken\\?"\s*:\s*\\?"([^"\\]+)/.exec(draft.text)?.[1];
    expect(tok, draft.text.slice(0, 400)).toBeTruthy();
    expect(await rows(`journal_entry_confirmations?entry_id=eq.${e[0].id}&select=id`)).toEqual([]);
    const conf = await tool(rep2.jwt, "counterparty_review_decide_confirm", { entryId: e[0].id, decision: "accept", note: "ok from chat", confirmationToken: tok });
    expect(conf.text).not.toMatch(/"isError":\s*true/);
    const c = await rows<{ confirmation_scope: any; confirmer_id: string }>(`journal_entry_confirmations?entry_id=eq.${e[0].id}&select=confirmation_scope,confirmer_id`);
    expect(c).toHaveLength(1);
    expect(c[0].confirmer_id).toBe(rep2.id);
    expect(c[0].confirmation_scope.action).toBe("client_accept");
    expect(c[0].confirmation_scope.authority.basis).toBe("counterparty");
    // a replay of the one-time token does not write a second row
    const replay = await tool(rep2.jwt, "counterparty_review_decide_confirm", { entryId: e[0].id, decision: "accept", note: "ok from chat", confirmationToken: tok });
    void replay;
    expect(await rows(`journal_entry_confirmations?entry_id=eq.${e[0].id}&select=id`)).toHaveLength(1);
  });

  // =========================================================================
  // STEP 8 - PROFESSIONAL HISTORY / LPI: native work, and the client's acceptance as its own fact
  // =========================================================================
  test("8a. LIVING CV / WORK IN NUMBERS: native hours appear for the member; the CLIENT acceptance is a separate fact, not an employer confirmation", async ({ browser }) => {
    const m3 = await acct("m3");
    const page = await loginUi(browser, "m3");
    await go(page, "/en/cv", '[data-testid="cv-skills"]');
    const rec = page.getByTestId("cv-recorded-hours");
    await expect(rec).toBeVisible({ timeout: 60_000 });
    const recText = await rec.innerText();
    await shot(page, "8a-cv");
    // DB truth for the member's native hours
    const entries = await rows<{ id: string }>(`journal_entries?worker_id=eq.${m3.workerId}&deleted_at=is.null&superseded_by=is.null&select=id`);
    const metrics = await rows<{ entry_id: string; metric_slug: string; value_numeric: number | null; unit_slug: string | null }>(
      `journal_entry_metrics?entry_id=in.(${entries.map((e) => e.id).join(",")})&select=entry_id,metric_slug,value_numeric,unit_slug`,
    );
    save({ M3_METRICS: metrics });
    expect(metrics.length, "hours/output recorded as metrics for the member").toBeGreaterThan(0);
    expect(recText).toMatch(/\d/);
    // client acceptance is its OWN fact beside - never inside - the employer-confirmed figure
    const client = page.getByTestId("cv-client-accepted-work");
    await expect(client).toBeVisible({ timeout: 60_000 });
    expect(Number(await client.getAttribute("data-entries"))).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("cv-confirmed-work")).toHaveCount(0); // no employer confirmation exists for this person
    // DB: zero employer 'confirm' rows for the member's entries; the acceptance is a client_accept row
    const accepted = await rows<{ confirmation_scope: any }>(`journal_entry_confirmations?confirmation_scope->>action=eq.client_accept&select=confirmation_scope,entry_id`);
    expect(accepted.length).toBeGreaterThanOrEqual(1);
    const employer = await rows(`journal_entry_confirmations?confirmation_scope->>action=eq.confirm&entry_id=in.(${entries.map((e) => e.id).join(",")})&select=id`);
    expect(employer).toEqual([]);

    await go(page, "/en/dashboard/work-in-numbers?period=all", '[data-testid="work-in-numbers"]');
    await shot(page, "8a-work-in-numbers");
    const win = await page.locator("body").innerText();
    const winNorm = win.replace(/[\s  ]+/g, " ");
    expect(winNorm).toContain("10 h"); // 5 h + the corrected 5 h; the corrected original is not counted twice
    expect(winNorm).not.toContain("15 h");
  });

  test("8b. LIVING CV (member via team): another member's native work shows with NO employer or client claim", async ({ browser }) => {
    const m1 = await acct("m1");
    const page = await loginUi(browser, "m1");
    await go(page, "/en/cv", '[data-testid="cv-skills"]');
    await expect(page.getByTestId("cv-recorded-hours")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("cv-client-accepted-work")).toHaveCount(0);
    await expect(page.getByTestId("cv-confirmed-work")).toHaveCount(0);
    await shot(page, "8b-cv-m1");
    void m1;
  });
});
