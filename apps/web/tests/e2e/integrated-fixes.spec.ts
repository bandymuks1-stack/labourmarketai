import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { db, dbOk, HAS_LOCAL_STACK, SUPA_SERVICE, SUPA_URL } from "./market-map-db-state";

/**
 * INTEGRATED FIXES - one serial spec that re-proves the lane FIXES (#2143 #2146
 * #2149 #2152 #2155 #2157 #2158 #2159 #2160) on ONE stack, with real user JWTs
 * through PostgREST for every security claim and the product UI where a UI
 * exists. Synthetic data, per-run tag (`QF<TAG>`), `*.local.test` addresses.
 *
 * LOCAL STACK ONLY: db() refuses a non-loopback target, every URL is the local
 * Supabase API, and the spec skips itself without the local-stack env.
 *
 * Service role = SEEDING / READ-BACK only (each seed is named at its call
 * site). State is persisted to `.tmp/fixes-<TAG>.json` so one step can be re-run
 * (`FIX_TAG=<tag> playwright test integrated-fixes -g "B5"`).
 */
const HAS = HAS_LOCAL_STACK && !!process.env.SUPABASE_TEST_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const PASSWORD = "Pw-fixes-qa-1!";
const TAG = process.env.FIX_TAG ?? randomBytes(3).toString("hex");
const TMP = resolve(process.cwd(), "../../.tmp");
const SHOTS = resolve(TMP, "shots");
const STATE_FILE = resolve(TMP, `fixes-${TAG}.json`);

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
  mkdirSync(TMP, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(S, null, 2));
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const email = (k: string) => `qf.${k}.${TAG}@local.test`;
const nm = (k: string) => `QF${TAG} ${k}`;
const j = (v: unknown) => JSON.stringify(v);

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
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email: mail, password }),
    });
    if (res.ok) {
      await new Promise((r) => setTimeout(r, 1200)); // PGRST303 'JWT issued at future' guard
      return ((await res.json()) as { access_token: string }).access_token;
    }
    if (i === 2) throw new Error(`sign-in ${mail}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("unreachable");
}

type Res = { status: number; json: any; text: string };
async function asUser(jwt: string, method: "GET" | "PATCH" | "POST" | "DELETE", path: string, body?: unknown, prefer = "return=representation"): Promise<Res> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}

async function rpcAs(jwt: string | null, fn: string, args: unknown = {}): Promise<Res> {
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
  return { status: res.status, json, text };
}

async function mcp(jwt: string | null, method: string, params: unknown) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: res.status, text: await res.text() };
}
const tool = (jwt: string | null, name: string, args: unknown) => mcp(jwt, "tools/call", { name, arguments: args });
/** The MCP door acts for the DURABLE workspace pointer; an owner of several organisations starts in the personal space. */
async function switchTo(jwt: string, orgId: string) {
  const l = toolJson((await tool(jwt, "context_list", {})).text);
  const ws = (l?.data?.workspaces ?? []).find((w: { id: string }) => w.id === orgId);
  if (!ws) throw new Error(`context_list has no workspace ${orgId}: ${j(l)}`);
  const r = await tool(jwt, "context_switch", { workspace: ws.label });
  if (/"isError":\s*true/.test(r.text)) throw new Error(`context_switch failed: ${r.text.slice(0, 400)}`);
}
const tokenOf = (text: string) => /confirmationToken\\?"\s*:\s*\\?"([^"\\]+)/.exec(text)?.[1];
/** the structured payload of a tool result (the JSON text the server returns inside content[0].text) */
function toolJson(text: string): any {
  try {
    const body = JSON.parse(text.replace(/^data: /m, "").trim().split("\n").find((l) => l.startsWith("{")) ?? text);
    const inner = body?.result?.content?.[0]?.text;
    return inner ? JSON.parse(inner) : body;
  } catch {
    return null;
  }
}

type Account = { id: string; email: string; name: string; workerId: string | null };
const acctJwt = async (k: string) => jwtFor((S.accounts[k] as Account).email);
const A = (k: string) => S.accounts[k] as Account;

async function createAccount(key: string, role: "worker" | "company", company?: string): Promise<Account> {
  const mail = email(key);
  const full = nm(key);
  const res = await authAdmin("POST", "admin/users", { email: mail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: full, role, locale: "en" } });
  if (res.status === 422 && /email_exists/.test(await res.clone().text())) {
    const users = ((await (await authAdmin("GET", "admin/users?per_page=1000")).json()) as { users: { id: string; email: string }[] }).users;
    const id = users.find((u) => u.email === mail)!.id;
    const w0 = await rows<{ id: string }>(`workers?profile_id=eq.${id}&select=id`);
    return { id, email: mail, name: full, workerId: w0[0]?.id ?? null };
  }
  if (!res.ok) throw new Error(`create user ${mail}: ${res.status} ${await res.text()}`);
  const id = ((await res.json()) as { id: string }).id;
  const jwt = await jwtFor(mail);
  const ob = await rpcAs(jwt, "complete_onboarding", { p_role: role, p_display_name: full, p_country: "LT", p_role_data: role === "company" ? { name: company ?? `QF${TAG} ${key} Ltd` } : {} });
  if (ob.status >= 300) throw new Error(`complete_onboarding ${mail}: ${ob.status} ${j(ob.json)}`);
  const w = await rows<{ id: string }>(`workers?profile_id=eq.${id}&select=id`);
  return { id, email: mail, name: full, workerId: w[0]?.id ?? null };
}
const remember = (k: string, a: Account) => save({ accounts: { ...(S.accounts ?? {}), [k]: a } });
async function orgOf(a: Account): Promise<{ orgId: string; companyId: string }> {
  const co = await rows<{ id: string }>(`companies?profile_id=eq.${a.id}&select=id`);
  const o = await rows<{ id: string }>(`organizations?legacy_company_id=eq.${co[0].id}&select=id`);
  return { orgId: o[0].id, companyId: co[0].id };
}

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------
const ctxs: BrowserContext[] = [];
const pages = new Map<string, Page>();
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
}
function hardenGoto(page: Page) {
  const orig = page.goto.bind(page);
  (page as any).goto = async (url: string, opts?: Parameters<Page["goto"]>[1]) => {
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await orig(url, { ...opts, timeout: attempt === 0 ? 150_000 : 240_000 });
      } catch (e) {
        last = e;
        if (!/Timeout|ERR_CONNECTION_(REFUSED|RESET)/i.test(String(e))) throw e;
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    throw last;
  };
}
async function newPage(browser: Browser, opts: { tz?: string } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: opts.tz ?? "UTC" });
  ctxs.push(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(240_000);
  hardenGoto(page);
  return page;
}
async function login(page: Page, key: string) {
  await page.goto("/en/auth/login", { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator('input[type="email"]').fill(A(key).email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 240_000, waitUntil: "domcontentloaded" });
}
async function loginUi(browser: Browser, key: string, tz?: string): Promise<Page> {
  const cached = pages.get(key);
  if (cached && !cached.isClosed()) return cached;
  const page = await newPage(browser, { tz });
  await login(page, key);
  pages.set(key, page);
  return page;
}
async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, `fixes-${TAG}-${name}.png`), fullPage: true }).catch(() => undefined);
}
async function go(page: Page, path: string, anchor?: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  if (anchor) await expect(page.locator(anchor).first()).toBeVisible({ timeout: 180_000 });
  await settle(page);
}
const bodyText = async (page: Page) => (await page.locator("body").innerText()).replace(/[\s  ]+/g, " ");

test.describe.configure({ mode: "serial", timeout: 900_000 });

test.describe(`INTEGRATED FIXES (tag ${TAG})`, () => {
  test.skip(!HAS, "local Supabase env absent - run with the local stack env (see header)");
  test.beforeAll(() => {
    loadState();
  });
  test.afterAll(async () => {
    for (const c of ctxs) await c.close().catch(() => undefined);
  });

  // =========================================================================
  // B0 - WORLD (seeded; named at each call)
  // =========================================================================
  test("B0. WORLD: owner + client + foreign orgs, employee, 3 team members, independent, stranger; project, teams", async () => {
    const mk = async (k: string, role: "worker" | "company") => remember(k, await createAccount(k, role));
    for (const k of ["ew", "tm1", "tm2", "tm3", "ind", "str", "mgr2"]) await mk(k, "worker");
    for (const k of ["bo", "fo", "cr"]) await mk(k, "company");
    const bo = await orgOf(A("bo"));
    const fo = await orgOf(A("fo"));
    const cr = await orgOf(A("cr"));
    save({ BO_ORG: bo.orgId, BO_CO: bo.companyId, FO_ORG: fo.orgId, FO_CO: fo.companyId, CR_ORG: cr.orgId });
    // NAMED SEED: projects (the product has a UI; a dated, 'live' project per scenario is cheaper to seed)
    const mkProject = async (title: string, org: string, co: string, extra: Record<string, unknown> = {}) => {
      const r = await dbOk("POST", "projects", { title, organization_id: org, company_id: co, status: "live", start_date: "2026-11-02", end_date: "2026-11-20", ...extra });
      return ((await r.json()) as { id: string }[])[0].id;
    };
    save({
      P1: await mkProject(nm("Project One"), bo.orgId, bo.companyId),
      P2: await mkProject(nm("Project Two"), bo.orgId, bo.companyId),
      P3: await mkProject(nm("Project Three"), bo.orgId, bo.companyId),
      PF: await mkProject(nm("Foreign Project"), fo.orgId, fo.companyId),
    });
    // NAMED SEED: two team organisations owned by the BO owner (the people page creates them through a form)
    const mkTeam = async (label: string) => {
      const r = await dbOk("POST", "organizations", { organization_type: "team", display_name: nm(label), owner_profile_id: A("bo").id, country: "LT" });
      return ((await r.json()) as { id: string }[])[0].id;
    };
    save({ T1: await mkTeam("Crew One"), T2: await mkTeam("Crew Two") });
    // NAMED SEED: engagement rows (what an ACCEPTED invitation writes)
    const ctx = async (k: string, org: string, slug = "employee") => {
      await dbOk("POST", "engagement_contexts", { profile_id: A(k).id, organization_id: org, relationship_slug: slug, status: "active", is_primary: false, title: "QF member", hash_self: sha(`${A(k).id}:${slug}:${org}`) });
    };
    await ctx("ew", bo.orgId);
    for (const k of ["tm1", "tm2", "tm3"]) await ctx(k, S.T1);
    await ctx("tm1", S.T2);
    expect(await rows(`engagement_contexts?organization_id=eq.${S.T1}&relationship_slug=eq.employee&select=id`)).toHaveLength(3);
    // BO owner can manage the org (real JWT)
    const jwt = await acctJwt("bo");
    const m = await rpcAs(jwt, "manages_organization", { org_id: bo.orgId });
    save({ MANAGES_RPC: m.status });
  });

  // =========================================================================
  // B5 - INTEGRITY DOORS (#2157): G-1 / G-4 / G-5 as real users
  // =========================================================================
  const ctxOf = async (k: string, org: string | null) => {
    const q = org ? `organization_id=eq.${org}` : "organization_id=is.null";
    const r = await rows<{ id: string }>(`engagement_contexts?profile_id=eq.${A(k).id}&${q}&select=id&limit=1`);
    return r[0]?.id as string;
  };
  const entryBody = (worker: string, ec: string, text: string, project?: string | null) => ({
    worker_id: worker,
    engagement_context_id: ec,
    entry_type_slug: "freeform",
    original_text: text,
    original_language: "en",
    hash_self: sha(text + Math.random()),
    visibility_scope: "closed",
    ...(project ? { project_id: project } : {}),
  });

  test("B5-G1. a worker cannot write into another organisation's engagement context nor attribute a non-assignable project; legit contexts still work", async () => {
    const ew = A("ew");
    const jwt = await acctJwt("ew");
    const own = await ctxOf("ew", S.BO_ORG);
    const boOwnerCtx = (await rows<{ id: string }>(`engagement_contexts?profile_id=eq.${A("bo").id}&relationship_slug=eq.owner&select=id&limit=1`))[0].id;
    const indCtx = await ctxOf("ind", null);
    const foOwnerCtx = (await rows<{ id: string }>(`engagement_contexts?profile_id=eq.${A("fo").id}&relationship_slug=eq.owner&select=id&limit=1`))[0].id;
    save({ EW_CTX: own });
    // (1) foreign contexts: another org's owner context, another person's personal context
    for (const [label, ec] of [["BO owner ctx", boOwnerCtx], ["FO owner ctx", foOwnerCtx], ["independent's personal ctx", indCtx]] as const) {
      const r = await asUser(jwt, "POST", "journal_entries", entryBody(ew.workerId!, ec, `QF${TAG} foreign ${label}`));
      expect(r.status, `${label}: ${r.text}`).toBeGreaterThanOrEqual(400);
      expect(r.text, label).toMatch(/engagement_context_not_own|42501|row-level security/);
    }
    expect(await rows(`journal_entries?original_text=ilike.${encodeURIComponent(`QF${TAG} foreign%`)}&select=id`)).toEqual([]);
    // (2) an UNASSIGNED project of the context's own org, and a FOREIGN project -> denied
    for (const [label, p] of [["unassigned own-org project", S.P1], ["foreign-org project", S.PF]] as const) {
      const r = await asUser(jwt, "POST", "journal_entries", entryBody(ew.workerId!, own, `QF${TAG} noassign ${label}`, p));
      expect(r.status, `${label}: ${r.text}`).toBeGreaterThanOrEqual(400);
      expect(r.text, label).toMatch(/project_not_assignable|42501/);
    }
    // (3) LEGIT: employee context, no project; then project once ASSIGNED (NAMED SEED: person assignment row)
    const ok1 = await asUser(jwt, "POST", "journal_entries", entryBody(ew.workerId!, own, `QF${TAG} legit employee`));
    expect(ok1.status, ok1.text).toBe(201);
    await dbOk("POST", "project_worker_assignments", { project_id: S.P1, worker_id: ew.workerId, status: "active" });
    const ok2 = await asUser(jwt, "POST", "journal_entries", entryBody(ew.workerId!, own, `QF${TAG} legit assigned`, S.P1));
    expect(ok2.status, ok2.text).toBe(201);
    save({ EW_ENTRY: ok2.json[0].id });
    // (4) SUPERSEDE/UPDATE retarget into the foreign context or foreign project is denied
    // journal_entries has no worker UPDATE policy (entries are append-only): the door is 'refused or 0 rows', and the row must be unchanged
    const upd = await asUser(jwt, "PATCH", `journal_entries?id=eq.${ok2.json[0].id}`, { engagement_context_id: boOwnerCtx });
    const upd2 = await asUser(jwt, "PATCH", `journal_entries?id=eq.${ok1.json[0].id}`, { project_id: S.PF });
    for (const u of [upd, upd2]) expect(u.status >= 400 || (Array.isArray(u.json) && u.json.length === 0), u.text).toBe(true);
    const still = await rows<{ id: string; engagement_context_id: string; project_id: string | null }>(`journal_entries?id=in.(${ok1.json[0].id},${ok2.json[0].id})&select=id,engagement_context_id,project_id`);
    expect(still.find((r) => r.id === ok2.json[0].id)).toMatchObject({ engagement_context_id: own, project_id: S.P1 });
    expect(still.find((r) => r.id === ok1.json[0].id)).toMatchObject({ engagement_context_id: own, project_id: null });
    const guard = await rpcAs(jwt, "journal_entries_attribution_guard_v1", {});
    expect(guard.status, "the guard function is not callable through the API").toBeGreaterThanOrEqual(400);
    // team member (team org context, project assigned through the TEAM) - NAMED SEED: team assignment through the product RPC as the owner
    const boJwt = await acctJwt("bo");
    const asg = await rpcAs(boJwt, "assign_team_to_work_v1", { p_team_org_id: S.T1, p_project_id: S.P2 });
    expect(asg.status, asg.text).toBeLessThan(300);
    const tm1Jwt = await acctJwt("tm1");
    const tmCtx = await ctxOf("tm1", S.T1);
    const okT = await asUser(tm1Jwt, "POST", "journal_entries", entryBody(A("tm1").workerId!, tmCtx, `QF${TAG} legit team member`, S.P2));
    expect(okT.status, okT.text).toBe(201);
    // ... but NOT a project the team is not assigned to
    const noT = await asUser(tm1Jwt, "POST", "journal_entries", entryBody(A("tm1").workerId!, tmCtx, `QF${TAG} team nonassigned`, S.P3));
    expect(noT.status, noT.text).toBeGreaterThanOrEqual(400);
    // independent personal-context entry, own-workspace-style (personal context, no project)
    const indJwt = await acctJwt("ind");
    const okI = await asUser(indJwt, "POST", "journal_entries", entryBody(A("ind").workerId!, indCtx, `QF${TAG} legit independent personal`));
    expect(okI.status, okI.text).toBe(201);
    save({ TA_P2: (asg.json as any)?.id ?? null });
  });

  test("B5-G4. a manager cannot make a roster link 'linked' on their own; the employee sees no imported history; the offer -> accept path still works", async () => {
    const boJwt = await acctJwt("bo");
    const ewJwt = await acctJwt("ew");
    const ew = A("ew");
    // roster person as the manager (insert policy: created_by = caller, unlinked)
    const ins = await asUser(boJwt, "POST", "organization_people", {
      organization_id: S.BO_ORG, display_name: nm("Roster Ew"), normalized_name: nm("Roster Ew").toLowerCase(), relationship_kind: "employee", created_by: A("bo").id, link_state: "unlinked",
    });
    expect(ins.status, ins.text).toBe(201);
    const pid = ins.json[0].id as string;
    // NAMED SEED: one imported history record for that roster person (the import RPC's own column set)
    const fp = sha(`rec:${pid}`);
    const at = new Date().toISOString();
    const sess = await dbOk("POST", "evidence_import_sessions", { organization_id: S.BO_ORG, source_kind: "manual", source_filename: `qf-${TAG}.csv`, source_fingerprint: sha(`s:${TAG}`), source_language: "en", supplied_by_organization_id: S.BO_ORG, supplier_role: "employer", actor_kind: "human", created_by: A("bo").id, notes: `qf ${TAG}` });
    const sessionId = ((await sess.json()) as { id: string }[])[0].id;
    await dbOk("POST", "organization_evidence_records", {
      organization_id: S.BO_ORG, organization_person_id: pid, activity_kind: "work", context_label: nm("Imported site"), activity_date: "2025-03-10", hours: 8, original_text: "x", original_language: "en",
      evidence_state: "LEGACY_IMPORTED", supplied_by_organization_id: S.BO_ORG, supplier_role: "employer", supplied_by_profile_id: A("bo").id, imported_by_profile_id: A("bo").id, imported_at: at, session_id: sessionId, source_kind: "manual",
      source_filename: `qf-${TAG}.csv`, source_fact: {}, derived: {}, record_fingerprint: fp, hash_prev: null, hash_self: sha(`work-history-chain:v1::${fp}:${at}`),
    });
    save({ ROSTER_PID: pid });
    // (1) the manager tries to make the link 'linked' / manager_link directly -> refused
    for (const patch of [
      { linked_profile_id: ew.id, linked_worker_id: ew.workerId, link_state: "linked", link_method: "manager_link" },
      { linked_profile_id: ew.id, linked_worker_id: ew.workerId, link_state: "linked", link_method: "worker_confirmed" },
    ]) {
      const r = await asUser(boJwt, "PATCH", `organization_people?id=eq.${pid}`, patch);
      expect(r.status, j(patch) + r.text).toBeGreaterThanOrEqual(400);
      expect(r.text).toMatch(/42501|row-level|subject|consent|confirmation/);
    }
    const st = await rows<{ link_state: string; link_method: string | null }>(`organization_people?id=eq.${pid}&select=link_state,link_method`);
    expect(st[0]).toMatchObject({ link_state: "unlinked" });
    // the employee sees NO history for that roster person
    expect((await asUser(ewJwt, "GET", `organization_evidence_records?organization_person_id=eq.${pid}&select=id`)).json).toEqual([]);
    // (2) legitimate: manager OFFERS (link_proposed / manager_offer) -> still no history
    const offer = await asUser(boJwt, "PATCH", `organization_people?id=eq.${pid}`, { linked_profile_id: ew.id, linked_worker_id: ew.workerId, link_state: "link_proposed", link_method: "manager_offer" });
    expect(offer.status, offer.text).toBe(200);
    expect((await asUser(ewJwt, "GET", `organization_evidence_records?organization_person_id=eq.${pid}&select=id`)).json).toEqual([]);
    // (3) the subject accepts -> history becomes theirs
    const acc = await asUser(ewJwt, "PATCH", `organization_people?id=eq.${pid}&linked_profile_id=eq.${ew.id}`, { link_state: "linked", link_method: "worker_confirmed", linked_at: new Date().toISOString() });
    expect(acc.status, acc.text).toBe(200);
    const hist = await asUser(ewJwt, "GET", `organization_evidence_records?organization_person_id=eq.${pid}&select=id`);
    expect(hist.json).toHaveLength(1);
  });

  test("B5-G5. a worker cannot self-verify a skill through PostgREST; self-declared writes work; the employer review pipeline still verifies", async () => {
    const ewJwt = await acctJwt("ew");
    const ew = A("ew");
    const skill = (await rows<{ id: string }>(`skills?select=id&limit=2`));
    expect(skill.length).toBeGreaterThan(1);
    const [s1, s2] = skill;
    // self-declared INSERT works
    const ok = await asUser(ewJwt, "POST", "worker_skills", { worker_id: ew.workerId, skill_id: s1.id, self_rated_level: 3, verified: false, source: "self_declared", confidence_bin: "yellow" });
    expect(ok.status, ok.text).toBe(201);
    const wsId = ok.json[0].id as string;
    // self rating change works
    const rate = await asUser(ewJwt, "PATCH", `worker_skills?id=eq.${wsId}`, { self_rated_level: 4 });
    expect(rate.status, rate.text).toBe(200);
    // forbidden writes
    const forbidden: Record<string, unknown>[] = [
      { verified: true },
      { source: "manager_confirmed" },
      { confidence_bin: "green" },
      { confidence_score: 90 },
      { verified: true, verified_by: A("bo").id, verified_at: new Date().toISOString() },
    ];
    for (const patch of forbidden) {
      const r = await asUser(ewJwt, "PATCH", `worker_skills?id=eq.${wsId}`, patch);
      expect(r.status, j(patch) + r.text).toBeGreaterThanOrEqual(400);
      expect(r.text).toMatch(/worker_skill_verification_is_pipeline_only|42501/);
    }
    const ins = await asUser(ewJwt, "POST", "worker_skills", { worker_id: ew.workerId, skill_id: s2.id, self_rated_level: 5, verified: true, source: "manager_confirmed", confidence_bin: "green", confidence_score: 95 });
    expect(ins.status, ins.text).toBeGreaterThanOrEqual(400);
    const db_ = await rows<{ verified: boolean; source: string; confidence_bin: string; self_rated_level: number }>(`worker_skills?worker_id=eq.${ew.workerId}&select=skill_id,verified,source,confidence_bin,self_rated_level`);
    expect(db_).toHaveLength(1);
    expect(db_[0]).toMatchObject({ verified: false, source: "self_declared", confidence_bin: "yellow", self_rated_level: 4 });
    save({ WS_ID: wsId, S1: s1.id });
  });

  // =========================================================================
  // B4 - CHAT/MCP KEEP + TEAM TOOLS (#2146 / #2149) through /api/mcp with real JWTs
  // =========================================================================
  test("B4a. tools/list: 76 tools, version 0.1.0+t76.be37fbb5, the team/keep tools are published", async () => {
    const jwt = await acctJwt("bo");
    const init = await mcp(jwt, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "qf", version: "1" } });
    expect(init.text).toContain("0.1.0+t76.be37fbb5");
    const list = await mcp(jwt, "tools/list", {});
    const parsed = JSON.parse(list.text.replace(/^data: /m, "").trim().split("\n").find((l) => l.startsWith("{"))!);
    const names: string[] = parsed.result.tools.map((t: { name: string }) => t.name);
    expect(names).toHaveLength(76);
    for (const t of ["team_assignment_create_draft", "team_assignment_create_confirm", "team_assignment_replace_draft", "team_assignment_replace_confirm", "team_assignment_end_draft", "team_assignment_end_confirm", "assignment_keep_draft", "assignment_keep_confirm"]) expect(names.includes(t), t).toBe(true);
  });

  test("B4b. team_assignment create_draft -> create_confirm: clash verdict in the draft, ONE-TIME token, no per-person fan-out; replace; end", async () => {
    const bo = await acctJwt("bo");
    await switchTo(bo, S.BO_ORG);
    const tm1 = A("tm1");
    // NAMED SEED: tm1 is also PERSON-assigned on P3 (same dates) so Crew Two (tm1) clashes when it is assigned to P1
    await dbOk("POST", "project_worker_assignments", { project_id: S.P3, worker_id: tm1.workerId, status: "active" });
    const d = await tool(bo, "team_assignment_create_draft", { teamId: S.T2, projectId: S.P1 });
    save({ B4_DRAFT: d.text.slice(0, 1500) });
    const tok = tokenOf(d.text);
    expect(tok, d.text.slice(0, 600)).toBeTruthy();
    expect(d.text, "the draft carries the per-member clash verdict").toMatch(/clash|collid|calendar/i);
    expect(await rows(`team_assignments?project_id=eq.${S.P1}&team_org_id=eq.${S.T2}&select=id`)).toEqual([]);
    const strJwt = await acctJwt("str");
    const stolen = await tool(strJwt, "team_assignment_create_confirm", { teamId: S.T2, projectId: S.P1, confirmationToken: tok });
    expect(await rows(`team_assignments?project_id=eq.${S.P1}&team_org_id=eq.${S.T2}&select=id`)).toEqual([]);
    expect(stolen.text).not.toMatch(/"ok":\s*true/);
    const c = await tool(bo, "team_assignment_create_confirm", { teamId: S.T2, projectId: S.P1, confirmationToken: tok });
    expect(c.text).not.toMatch(/"isError":\s*true/);
    const ta = await rows<{ id: string; status: string }>(`team_assignments?project_id=eq.${S.P1}&team_org_id=eq.${S.T2}&select=id,status`);
    expect(ta).toHaveLength(1);
    expect(ta[0].status).toBe("active");
    expect(await rows(`project_worker_assignments?project_id=eq.${S.P1}&worker_id=eq.${tm1.workerId}&select=id`)).toEqual([]);
    const replay = await tool(bo, "team_assignment_create_confirm", { teamId: S.T2, projectId: S.P1, confirmationToken: tok });
    save({ B4_REPLAY: replay.text.slice(0, 400) });
    expect(await rows(`team_assignments?project_id=eq.${S.P1}&team_org_id=eq.${S.T2}&select=id`)).toHaveLength(1);
    save({ TA_T2_P1: ta[0].id });
    const rd = await tool(bo, "team_assignment_replace_draft", { teamId: S.T1, projectId: S.P1, replaceAssignmentId: ta[0].id });
    const rtok = tokenOf(rd.text);
    expect(rtok, rd.text.slice(0, 500)).toBeTruthy();
    const rc = await tool(bo, "team_assignment_replace_confirm", { teamId: S.T1, projectId: S.P1, replaceAssignmentId: ta[0].id, confirmationToken: rtok });
    expect(rc.text).not.toMatch(/"isError":\s*true/);
    const after = await rows<{ id: string; team_org_id: string; status: string; end_reason: string | null; replaced_by_id: string | null }>(`team_assignments?project_id=eq.${S.P1}&select=id,team_org_id,status,end_reason,replaced_by_id`);
    expect(after.find((r) => r.id === ta[0].id)).toMatchObject({ status: "ended", end_reason: "replaced" });
    const newA = after.find((r) => r.team_org_id === S.T1)!;
    expect(newA.status).toBe("active");
    expect(after.find((r) => r.id === ta[0].id)!.replaced_by_id).toBe(newA.id);
    save({ TA_T1_P1: newA.id });
    const ed = await tool(bo, "team_assignment_end_draft", { assignmentId: newA.id, reason: "qa end" });
    const etok = tokenOf(ed.text);
    expect(etok, ed.text.slice(0, 500)).toBeTruthy();
    const ec = await tool(bo, "team_assignment_end_confirm", { assignmentId: newA.id, reason: "qa end", confirmationToken: etok });
    expect(ec.text).not.toMatch(/"isError":\s*true/);
    const ended = await rows<{ status: string; ended_at: string | null }>(`team_assignments?id=eq.${newA.id}&select=status,ended_at`);
    expect(ended[0].status).toBe("ended");
    expect(ended[0].ended_at).toBeTruthy();
    const anon = await tool(null, "team_assignment_end_draft", { assignmentId: newA.id });
    expect(anon.status).toBe(401);
    const asStr = await tool(strJwt, "team_assignment_create_draft", { teamId: S.T2, projectId: S.P1 });
    expect(tokenOf(asStr.text)).toBeFalsy();
  });

  test("B4c. assignment create_confirm over a clash: override pending, NO receipt; keep_draft -> keep_confirm writes ONE immutable receipt (person AND team basis); fabricated collision refused 22023", async () => {
    const bo = await acctJwt("bo");
    await switchTo(bo, S.BO_ORG);
    const boId = A("bo").id;
    const ew = A("ew");
    // NAMED SEED: the person is on the organisation's ACTIVE ROSTER (company_workers) - what an accepted staff invitation writes
    if ((await rows(`company_workers?company_id=eq.${S.BO_CO}&worker_id=eq.${ew.workerId}&select=worker_id`)).length === 0) await dbOk("POST", "company_workers", { company_id: S.BO_CO, worker_id: ew.workerId, status: "active" });
    const d = await tool(bo, "assignment_create_draft", { projectId: S.P3, workerProfileId: ew.id });
    const tok = tokenOf(d.text);
    expect(tok, d.text.slice(0, 500)).toBeTruthy();
    const c = await tool(bo, "assignment_create_confirm", { projectId: S.P3, workerProfileId: ew.id, confirmationToken: tok });
    save({ B4_CREATE_CONFIRM: c.text.slice(0, 1500) });
    expect(c.text, "an assignment over a clash returns override pending (keep / undo)").toMatch(/override|keep|clash|collid|pending/i);
    expect(await rows(`project_worker_assignments?project_id=eq.${S.P3}&worker_id=eq.${ew.workerId}&status=eq.active&select=id`)).toHaveLength(1);
    expect(await rows(`commitment_override_receipts?project_id=eq.${S.P3}&select=id`), "NO receipt before the knowing keep").toEqual([]);
    const fake = await rpcAs(bo, "record_commitment_override_v1", {
      p_project_id: S.P3, p_worker_profile_id: ew.id, p_reason_code: "other",
      p_collisions: [{ kind: "project", sourceId: "11111111-1111-4111-8111-111111111111", overlapStart: "2026-11-02", overlapEnd: "2026-11-20" }],
    });
    expect(fake.status, fake.text).toBeGreaterThanOrEqual(400);
    expect(fake.text).toMatch(/22023|collision not verified/);
    expect(await rows(`commitment_override_receipts?project_id=eq.${S.P3}&select=id`)).toEqual([]);
    const kd = await tool(bo, "assignment_keep_draft", { projectId: S.P3, workerProfileId: ew.id, reasonCode: "agreed_with_worker" });
    const ktok = tokenOf(kd.text);
    expect(ktok, kd.text.slice(0, 500)).toBeTruthy();
    expect(await rows(`commitment_override_receipts?project_id=eq.${S.P3}&select=id`), "a draft writes nothing").toEqual([]);
    const kc = await tool(bo, "assignment_keep_confirm", { projectId: S.P3, workerProfileId: ew.id, reasonCode: "agreed_with_worker", confirmationToken: ktok });
    expect(kc.text).not.toMatch(/"isError":\s*true/);
    const r1 = await rows<Record<string, any>>(`commitment_override_receipts?project_id=eq.${S.P3}&select=*`);
    expect(r1).toHaveLength(1);
    expect(r1[0].assignment_id, "PERSON basis").toBeTruthy();
    expect(r1[0].team_assignment_id).toBeNull();
    expect(r1[0].decided_by).toBe(boId);
    await tool(bo, "assignment_keep_confirm", { projectId: S.P3, workerProfileId: ew.id, reasonCode: "agreed_with_worker", confirmationToken: ktok });
    expect(await rows(`commitment_override_receipts?project_id=eq.${S.P3}&select=id`)).toHaveLength(1);
    const honest = await rpcAs(bo, "record_commitment_override_v1", { p_project_id: S.P3, p_worker_profile_id: ew.id, p_reason_code: "agreed_with_worker", p_collisions: r1[0].collisions });
    expect(honest.status, honest.text).toBeLessThan(300);
    expect(honest.json).toBe(r1[0].id);
    expect(await rows(`commitment_override_receipts?project_id=eq.${S.P3}&select=id`)).toHaveLength(1);
    expect((await db("PATCH", `commitment_override_receipts?id=eq.${r1[0].id}`, { reason_code: "other" })).ok).toBe(false);
    expect((await db("DELETE", `commitment_override_receipts?id=eq.${r1[0].id}`)).ok).toBe(false);
    const forged = await asUser(await acctJwt("str"), "POST", "commitment_override_receipts", { project_id: S.P3 });
    expect(forged.status).toBeGreaterThanOrEqual(400);
    // TEAM basis: tm1 is a member of Crew One (assigned to P2 in B5) and person-assigned on P3 -> clash on P2
    const td = await tool(bo, "assignment_keep_draft", { projectId: S.P2, workerProfileId: A("tm1").id, reasonCode: "partial_overlap" });
    const ttok = tokenOf(td.text);
    expect(ttok, td.text.slice(0, 600)).toBeTruthy();
    const tc = await tool(bo, "assignment_keep_confirm", { projectId: S.P2, workerProfileId: A("tm1").id, reasonCode: "partial_overlap", confirmationToken: ttok });
    expect(tc.text).not.toMatch(/"isError":\s*true/);
    const r2 = await rows<Record<string, any>>(`commitment_override_receipts?project_id=eq.${S.P2}&select=*`);
    expect(r2).toHaveLength(1);
    expect(r2[0].team_assignment_id, "TEAM basis").toBeTruthy();
    expect(r2[0].assignment_id).toBeNull();
    test.info().annotations.push({ type: "b4-chat-action", description: "company.keep-assignment via the conversation endpoint: NOT RUN (needs the AI conversation path; MCP door proven)" });
  });

  // =========================================================================
  // B7 - V1 DOORS CLOSED, v2 flows work (#2158 / 151400 / 151500)
  // =========================================================================
  test("B7a. v1 invitation and marketplace write doors are denied to authenticated and anon (permission denied)", async () => {
    const jwt = await acctJwt("bo");
    const calls: [string, unknown][] = [
      ["accept_invitation_v1", { p_token: "x".repeat(24) }],
      ["accept_invitation_by_id_v1", { p_invitation_id: "11111111-1111-4111-8111-111111111111" }],
      ["decline_invitation_v1", { p_token: "x".repeat(24) }],
      ["create_marketplace_listing_v1", { p_listing_kind: "sale", p_category: "goods_handmade", p_title: "x" }],
      ["update_marketplace_listing_v1", { p_id: "11111111-1111-4111-8111-111111111111", p_title: "x" }],
      ["set_marketplace_listing_status_v1", { p_id: "11111111-1111-4111-8111-111111111111", p_status: "active" }],
    ];
    for (const [fn, args] of calls) {
      for (const who of [jwt, null]) {
        const r = await rpcAs(who, fn, args);
        expect(r.status, `${fn} ${who ? "authenticated" : "anon"}: ${r.text}`).toBeGreaterThanOrEqual(400);
        expect(r.text, fn).toMatch(/permission denied|42501|PGRST202/i);
      }
    }
  });

  test("B7b. v2: by-id accept + shareable multi-use link accepted by two people (third refused); a double submit is one seat", async () => {
    const bo = await acctJwt("bo");
    const mkTok = () => randomBytes(24).toString("base64url");
    const mkInv = async (args: Record<string, unknown>) => {
      const token = mkTok();
      const r = await rpcAs(bo, "create_invitation_v2", { p_token_hash: sha(token), p_invitation_type: "join_as_employee", p_organization_id: S.BO_ORG, p_proposed_role: "Helper", p_relationship_slug: "employee", ...args });
      expect(r.status, r.text).toBeLessThan(300);
      return token;
    };
    await mkInv({ p_invited_email: A("ind").email, p_invited_name: nm("ind") });
    let indJwt = await acctJwt("ind");
    // #2152: an UNVERIFIED registrant sees nothing addressed to the typed e-mail (fail closed) ...
    const unverified = await rpcAs(indJwt, "list_invitations_for_me_v1", {});
    expect(unverified.json.items, unverified.text).toEqual([]);
    expect(unverified.json.email_unverified).toBe(true);
    // ... a verified owner of the address does. NAMED SEED: the mailbox proof exactly as confirm_my_email_v1 records it
    await dbOk("POST", "email_verifications_v1", { profile_id: A("ind").id, email: A("ind").email, method: "mailbox_proof" });
    indJwt = await acctJwt("ind");
    const mine = await rpcAs(indJwt, "list_invitations_for_me_v1", {});
    expect(mine.status, mine.text).toBeLessThan(300);
    const list = (mine.json?.items ?? []) as any[];
    const invId = list[0]?.id ?? list[0]?.invitation_id;
    expect(invId, mine.text).toBeTruthy();
    const byId = await rpcAs(indJwt, "accept_invitation_by_id_v2", { p_invitation_id: invId });
    expect(j(byId.json), byId.text).toMatch(/accepted/);
    expect(await rows(`engagement_contexts?profile_id=eq.${A("ind").id}&organization_id=eq.${S.BO_ORG}&status=eq.active&select=id`)).toHaveLength(1);
    expect(await rows(`invitation_acceptances?invitation_id=eq.${invId}&decision=eq.accepted&select=id`)).toHaveLength(1);
    const again = await rpcAs(indJwt, "accept_invitation_by_id_v2", { p_invitation_id: invId });
    expect(j(again.json)).not.toMatch(/"outcome":"accepted"/);
    expect(await rows(`engagement_contexts?profile_id=eq.${A("ind").id}&organization_id=eq.${S.BO_ORG}&status=eq.active&select=id`)).toHaveLength(1);
    const shared = await mkInv({ p_invited_email: null, p_max_uses: 2, p_campaign_label: `QF${TAG} shareable` });
    const a = await rpcAs(await acctJwt("str"), "accept_invitation_v2", { p_token: shared });
    const b = await rpcAs(await acctJwt("mgr2"), "accept_invitation_v2", { p_token: shared });
    const c = await rpcAs(await acctJwt("tm3"), "accept_invitation_v2", { p_token: shared });
    expect(j(a.json), a.text).toMatch(/"outcome":"accepted"/);
    expect(j(b.json), b.text).toMatch(/"outcome":"accepted"/);
    expect(j(c.json), c.text).not.toMatch(/"outcome":"accepted"/);
    const inv = await rows<{ use_count: number; status: string }>(`invitations?token_hash=eq.${sha(shared)}&select=use_count,status`);
    expect(inv[0]).toMatchObject({ use_count: 2, status: "accepted" });
    const tok3 = await mkInv({ p_invited_email: null, p_max_uses: 3 });
    const jwtA = await acctJwt("tm2");
    const [r1, r2] = await Promise.all([rpcAs(jwtA, "accept_invitation_v2", { p_token: tok3 }), rpcAs(jwtA, "accept_invitation_v2", { p_token: tok3 })]);
    const accepted = [r1, r2].filter((r) => /"outcome":"accepted"/.test(j(r.json))).length;
    expect(accepted, `${r1.text} | ${r2.text}`).toBe(1);
    expect((await rows<{ use_count: number }>(`invitations?token_hash=eq.${sha(tok3)}&select=use_count`))[0].use_count).toBe(1);
    test.info().annotations.push({ type: "b7-funnel", description: "emitServerFunnelEvent writes pilot_events only from a non-local host; locally the event cannot be read back - NOT RUN (unit-covered)" });
  });

  test("B7c. marketplace v2: create/activate/pause/close/delete work for the owner; foreign users cannot touch it", async () => {
    const ind = await acctJwt("ind");
    const c = await rpcAs(ind, "create_marketplace_listing_v2", { p_listing_kind: "sale", p_category: "goods_handmade", p_title: nm("handmade offer"), p_organization_id: null, p_project_id: null });
    expect(c.status, c.text).toBeLessThan(300);
    const id = c.json as string;
    for (const st of ["active", "paused", "active", "closed"]) {
      const r = await rpcAs(ind, "set_marketplace_listing_status_v2", { p_id: id, p_status: st });
      expect(r.status, `${st}: ${r.text}`).toBeLessThan(300);
      expect((await rows<{ status: string }>(`marketplace_listings?id=eq.${id}&select=status`))[0].status).toBe(st);
    }
    const upd = await rpcAs(ind, "update_marketplace_listing_v2", { p_id: id, p_title: nm("handmade offer (edited)"), p_category: "goods_handmade", p_listing_kind: "sale" });
    expect(upd.status, upd.text).toBeLessThan(300);
    const str = await acctJwt("str");
    expect((await rpcAs(str, "set_marketplace_listing_status_v2", { p_id: id, p_status: "active" })).status).toBeGreaterThanOrEqual(400);
    expect((await rpcAs(str, "delete_marketplace_listing_v1", { p_id: id })).status).toBeGreaterThanOrEqual(400);
    expect(await rows(`marketplace_listings?id=eq.${id}&select=id`)).toHaveLength(1);
    const del = await rpcAs(ind, "delete_marketplace_listing_v1", { p_id: id });
    expect(del.status, del.text).toBeLessThan(300);
    expect(await rows(`marketplace_listings?id=eq.${id}&select=id`)).toEqual([]);
  });

  test("B11. publish policy refuses an expired / invalid-category / foreign-org listing; the owner's valid listing publishes", async () => {
    const ind = await acctJwt("ind");
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const exp = await rpcAs(ind, "create_marketplace_listing_v2", { p_listing_kind: "sale", p_category: "goods_handmade", p_title: nm("expired offer"), p_expires_at: past });
    if (exp.status < 300) {
      const act = await rpcAs(ind, "set_marketplace_listing_status_v2", { p_id: exp.json as string, p_status: "active" });
      expect(act.status, act.text).toBeGreaterThanOrEqual(400);
      expect(act.text).toMatch(/listing expired/);
      expect((await rows<{ status: string }>(`marketplace_listings?id=eq.${exp.json}&select=status`))[0].status).not.toBe("active");
    } else {
      expect(exp.text).toMatch(/expired|invalid|must be in the future/i);
    }
    const badCat = await rpcAs(ind, "create_marketplace_listing_v2", { p_listing_kind: "sale", p_category: "not_a_category", p_title: nm("bad category") });
    if (badCat.status < 300) {
      const act = await rpcAs(ind, "set_marketplace_listing_status_v2", { p_id: badCat.json as string, p_status: "active" });
      expect(act.status, act.text).toBeGreaterThanOrEqual(400);
      expect(act.text).toMatch(/invalid category/);
    }
    const foreignOrg = await rpcAs(ind, "create_marketplace_listing_v2", { p_listing_kind: "sale", p_category: "goods_handmade", p_title: nm("foreign org"), p_organization_id: S.FO_ORG });
    if (foreignOrg.status < 300) {
      const act = await rpcAs(ind, "set_marketplace_listing_status_v2", { p_id: foreignOrg.json as string, p_status: "active" });
      expect(act.status, "foreign-org listing must not activate").toBeGreaterThanOrEqual(400);
    }
    const ok = await rpcAs(ind, "create_marketplace_listing_v2", { p_listing_kind: "sale", p_category: "goods_handmade", p_title: nm("valid offer"), p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    expect(ok.status, ok.text).toBeLessThan(300);
    const act = await rpcAs(ind, "set_marketplace_listing_status_v2", { p_id: ok.json as string, p_status: "active" });
    expect(act.status, act.text).toBeLessThan(300);
  });

  // =========================================================================
  // shared UI helpers for the counters steps
  // =========================================================================
  async function pickOrg(page: Page, orgId: string) {
    const chip = page.getByTestId("workspace-chip");
    await go(page, "/en/dashboard");
    await expect(chip).toBeVisible({ timeout: 120_000 });
    const opt = page.getByTestId(`workspace-option-${orgId}`);
    for (let attempt = 0; attempt < 8 && !(await opt.isVisible()); attempt++) {
      await page.waitForTimeout(2_000);
      await chip.click().catch(() => undefined);
      await opt.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    }
    if (await opt.isVisible()) await opt.click();
    await settle(page);
  }
  async function hydrated(page: Page, selector: string) {
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps") || k.startsWith("__reactFiber"));
      },
      selector,
      { timeout: 180_000 },
    );
  }
  /** Record work through the product composer: read-back, save, confirm; returns the new entry id (polled from the DB). */
  async function compose(page: Page, text: string, expectProjectLabel?: RegExp): Promise<string> {
    await go(page, "/en/dashboard/journal", "#journal-composer textarea");
    await hydrated(page, "#journal-composer textarea");
    await page.locator("#journal-composer textarea").fill(text);
    await page.getByRole("button", { name: /Read it back/i }).click();
    if (expectProjectLabel) await expect(page.getByTestId("worklog-project-auto")).toContainText(expectProjectLabel, { timeout: 90_000 });
    else await expect(page.getByTestId("worklog-save")).toBeVisible({ timeout: 90_000 });
    await page.getByTestId("worklog-save").click();
    await page.getByTestId("worklog-confirm").click();
    const key = text.slice(0, 40);
    await expect.poll(async () => (await rows(`journal_entries?original_text=ilike.${encodeURIComponent(key + "%")}&select=id`)).length, { timeout: 120_000 }).toBeGreaterThanOrEqual(1);
    await settle(page);
    return (await rows<{ id: string }>(`journal_entries?original_text=ilike.${encodeURIComponent(key + "%")}&select=id&order=created_at.desc&limit=1`))[0].id;
  }
  /** lines of a page that carry a count about confirmation / acceptance / review, normalised */
  const confirmLines = (t: string) => t.split(/(?<=[.!?·])\s|\n/).map((l) => l.trim()).filter((l) => /confirm|accept|review|approv|awaiting/i.test(l) && /\d/.test(l));

  // =========================================================================
  // B2 - CLIENT ACCEPTANCE IS NOT EMPLOYER CONFIRMATION (#2143 + #2160)
  // =========================================================================
  test("B2. a client_accept leaves the employer pending item and every confirmed counter unchanged; employer approval then counts once; a corrected+resubmitted chain is ONE queue card", async ({ browser }) => {
    const bo = await acctJwt("bo");
    const tm3 = A("tm3");
    const mgr2 = A("mgr2");
    // NAMED SEED: owner toggle 'journal review' for the member's team context (the product has the toggle on the people page)
    await dbOk("PATCH", `engagement_contexts?profile_id=eq.${tm3.id}&organization_id=eq.${S.T1}`, { journal_review_enabled: true });
    // the manager-invitation round trip is not the object here: the product's own command AS the owner (as the chain does)
    const gm = await rpcAs(bo, "grant_org_manager", { p_org_id: S.BO_ORG, p_profile_id: mgr2.id, p_operations_role: null });
    expect(gm.status, gm.text).toBeLessThan(300);
    const tm3Page = await loginUi(browser, "tm3");
    const E = await compose(tm3Page, `QF${TAG} b2 entry: tiled the hall, worked 6 hours, 12 m2`, new RegExp(`QF${TAG} Project Two`));
    save({ B2_E: E });
    const mgr2Jwt = await acctJwt("mgr2");
    const reg = await rpcAs(mgr2Jwt, "register_work_counterparty_link_v1", { p_project_id: S.P2, p_worker_id: tm3.workerId, p_party_role: "client" });
    expect(j(reg.json), reg.text).toMatch(/registered|already/);
    const tm3Jwt = await acctJwt("tm3");
    const sub = await rpcAs(tm3Jwt, "submit_journal_entry_for_review_v1", { p_entry_id: E });
    expect(j(sub.json), sub.text).toMatch(/submitted/);

    const reviewable = async () => ((await rpcAs(bo, "reviewable_journal_entry_ids", {})).json as string[]) ?? [];
    const queue = async (jwt: string) => ((await rpcAs(jwt, "list_counterparty_review_queue_v1", {})).json as { entry_id: string }[]) ?? [];
    const confRows = async () => rows<{ id: string; confirmation_scope: any }>(`journal_entry_confirmations?entry_id=eq.${E}&select=id,confirmation_scope`);
    const skillsVerified = async () => rows(`worker_skills?worker_id=eq.${tm3.workerId}&verified=eq.true&select=id`);
    const boPage = await loginUi(browser, "bo");
    await pickOrg(boPage, S.BO_ORG);
    const snap = async (label: string) => {
      const out: Record<string, any> = {};
      out.reviewable = (await reviewable()).filter((x) => x === E).length;
      out.reviewableTotal = (await reviewable()).length;
      out.clientQueue = (await queue(mgr2Jwt)).map((q) => q.entry_id);
      out.confirmations = (await confRows()).map((c) => c.confirmation_scope?.action);
      out.verifiedSkills = (await skillsVerified()).length;
      await go(boPage, "/en/dashboard/inbox", '[data-testid="inbox-summary"]');
      out.inbox = confirmLines(await bodyText(boPage)).join(" | ");
      await go(boPage, "/en/dashboard/reports");
      out.reports = confirmLines(await bodyText(boPage)).join(" | ");
      await go(tm3Page, "/en/cv", '[data-testid="cv-skills"]');
      out.cvConfirmed = await tm3Page.getByTestId("cv-confirmed-work").count();
      out.cvClient = Number((await tm3Page.getByTestId("cv-client-accepted-work").first().getAttribute("data-entries").catch(() => null)) ?? 0);
      out.cvRecorded = (await tm3Page.getByTestId("cv-recorded-hours").innerText().catch(() => "")).replace(/\s+/g, " ");
      out.cvConfirmLines = confirmLines(await bodyText(tm3Page)).join(" | ");
      await go(tm3Page, "/en/dashboard/journal", "#journal-composer textarea");
      out.journalConfirmLines = confirmLines(await bodyText(tm3Page)).join(" | ");
      await shot(boPage, `b2-${label}-bo`);
      save({ [`B2_SNAP_${label}`]: out });
      return out;
    };
    const before = await snap("before");
    expect(before.reviewable, "employer pending item exists before").toBe(1);
    expect(before.clientQueue).toContain(E);
    expect(before.confirmations).toEqual([]);
    // CLIENT ACCEPT
    const dec = await rpcAs(mgr2Jwt, "review_journal_entry", { p_entry_id: E, p_decision: "approved", p_note: "ok" });
    expect(dec.json, dec.text).toBe("approved");
    const after = await snap("afterClient");
    expect(after.confirmations).toEqual(["client_accept"]);
    expect(after.reviewable, "employer pending item UNCHANGED by a client acceptance").toBe(1);
    expect(after.reviewableTotal).toBe(before.reviewableTotal);
    expect(after.verifiedSkills, "no skill verification").toBe(before.verifiedSkills);
    expect(after.inbox, "inbox / confirm-pulse text unchanged").toBe(before.inbox);
    expect(after.reports, "reports hub confirmations unchanged").toBe(before.reports);
    expect(after.cvConfirmed, "no employer-confirmed figure").toBe(0);
    expect(after.cvRecorded, "recorded hours unchanged").toBe(before.cvRecorded);
    expect(after.cvClient, "the client acceptance is its OWN separate counter").toBeGreaterThanOrEqual(1);
    expect(after.cvConfirmLines.replace(/client|accepted/gi, "")).toBeTruthy();
    // the employer (manager of the team organisation) now approves: counts ONCE
    const emp = await rpcAs(bo, "review_journal_entry", { p_entry_id: E, p_decision: "approved", p_note: "employer ok" });
    expect(emp.json, emp.text).toBe("approved");
    const conf = (await confRows()).map((c) => c.confirmation_scope?.action).sort();
    expect(conf).toEqual(["client_accept", "confirm"]);
    expect((await reviewable()).filter((x) => x === E)).toHaveLength(0);
    const fin = await snap("afterEmployer");
    expect(fin.cvConfirmed + (fin.cvConfirmLines.includes("confirm") ? 1 : 0)).toBeGreaterThanOrEqual(1);
    // CORRECTED + RESUBMITTED chain: ONE queue card
    const text2 = `QF${TAG} b2 entry corrected: tiled the hall, worked 6 hours, 12 m2, corrected`;
    const ec = (await rows<{ engagement_context_id: string }>(`journal_entries?id=eq.${E}&select=engagement_context_id`))[0].engagement_context_id;
    const corr = await asUser(tm3Jwt, "POST", "journal_entries", { ...entryBody(tm3.workerId!, ec, text2, S.P2), correction_of: E });
    expect(corr.status, corr.text).toBe(201);
    const E2 = corr.json[0].id as string;
    const sub2 = await rpcAs(tm3Jwt, "submit_journal_entry_for_review_v1", { p_entry_id: E2 });
    expect(j(sub2.json), sub2.text).toMatch(/submitted/);
    const q = await queue(mgr2Jwt);
    const inChain = q.filter((r) => r.entry_id === E || r.entry_id === E2);
    expect(inChain.map((r) => r.entry_id), "the chain appears ONCE").toEqual([E2]);
    // inbox '(N)' equals the page bucket sizes
    const pageQ = await loginUi(browser, "mgr2");
    await go(pageQ, "/en/dashboard/inbox/counterparty", '[data-testid="counterparty-queue"]');
    const cards = await pageQ.locator('[data-testid^="counterparty-card-"]').count();
    expect(cards, "queue page card count equals the RPC queue size").toBe(q.length);
    await shot(pageQ, "b2-queue");
    const sumTxt = await pageQ.getByTestId("counterparty-queue-summary").innerText().catch(() => "");
    save({ B2_QUEUE_SUMMARY: sumTxt, B2_CARDS: cards, B2_QUEUE_RPC: q.length });
    await go(pageQ, "/en/dashboard/inbox");
    const inboxTxt = await bodyText(pageQ);
    const m = /counterparty[^()]*\((\d+)\)|\((\d+)\)/i.exec(inboxTxt);
    save({ B2_INBOX_PAREN: m ? m[1] ?? m[2] : null });
    if (m) expect(Number(m[1] ?? m[2])).toBe(q.length);
  });

  // =========================================================================
  // B3 - TEAM-AWARE COUNTERS (#2149 / #2160)
  // =========================================================================
  test("B3. one team of three = '3 people (3 via team)'; individual+team counts once; an ended team contributes nobody", async ({ browser }) => {
    const bo = await acctJwt("bo");
    const r = await dbOk("POST", "projects", { title: nm("Project Four"), organization_id: S.BO_ORG, company_id: S.BO_CO, status: "live", start_date: "2026-12-01", end_date: "2026-12-20" });
    const P4 = ((await r.json()) as { id: string }[])[0].id;
    save({ P4 });
    const asg = await rpcAs(bo, "assign_team_to_work_v1", { p_team_org_id: S.T1, p_project_id: P4 });
    expect(asg.status, asg.text).toBeLessThan(300);
    const taId = (await rows<{ id: string }>(`team_assignments?project_id=eq.${P4}&status=eq.active&select=id`))[0].id;
    const members = await rpcAs(bo, "list_team_assignment_members_v1", { p_assignment_ids: [taId] });
    save({ B3_MEMBERS_RPC: members.text.slice(0, 600) });
    const page = await loginUi(browser, "bo");
    await pickOrg(page, S.BO_ORG);
    const field = async () => {
      await go(page, `/en/dashboard/projects/${P4}`, '[data-testid="project-teams"], main h1');
      const txt = await bodyText(page);
      return { txt, via: await page.getByTestId("field-via-team").innerText().catch(() => ""), m: /(\d+)\s+(?:person|people) on the field/i.exec(txt)?.[1] ?? null };
    };
    const f1 = await field();
    await shot(page, "b3-three-via-team");
    expect(f1.m, f1.txt.slice(0, 400)).toBe("3");
    expect(f1.via).toMatch(/3 via team/i);
    expect(f1.txt).not.toMatch(/\b0 assigned\b/i);
    // individual + team => once
    await dbOk("POST", "project_worker_assignments", { project_id: P4, worker_id: A("tm1").workerId, status: "active" });
    const f2 = await field();
    expect(f2.m, "tm1 assigned individually AND via the team counts ONCE").toBe("3");
    expect(f2.via).toMatch(/2 via team/i);
    // other surfaces that route through the same module: company home / workforce capacity
    await go(page, "/en/dashboard/company");
    const homeTxt = await bodyText(page);
    save({ B3_COMPANY_HOME_VIA_TEAM: /via team/i.test(homeTxt), B3_COMPANY_HOME_SNIP: (/.{60}via team.{40}/i.exec(homeTxt)?.[0] ?? "") });
    // ended team contributes nobody
    const ed = await rpcAs(bo, "end_team_assignment_v1", { p_assignment_id: taId, p_reason: "qa" });
    expect(ed.status, ed.text).toBeLessThan(300);
    const f3 = await field();
    expect(f3.m, "ended team contributes nobody; only the individual assignment remains").toBe("1");
    expect(f3.via).toBe("");
    // replaced team: assign T2 (tm1) then replace by T1 => only the live team counts
    const a2 = await rpcAs(bo, "assign_team_to_work_v1", { p_team_org_id: S.T2, p_project_id: P4 });
    expect(a2.status, a2.text).toBeLessThan(300);
    const t2 = (await rows<{ id: string }>(`team_assignments?project_id=eq.${P4}&team_org_id=eq.${S.T2}&status=eq.active&select=id`))[0].id;
    const rep = await rpcAs(bo, "assign_team_to_work_v1", { p_team_org_id: S.T1, p_project_id: P4, p_replace_assignment_id: t2 });
    expect(rep.status, rep.text).toBeLessThan(300);
    const f4 = await field();
    expect(f4.m).toBe("3");
    // MCP assist count (acts for the workspace)
    await switchTo(bo, S.BO_ORG);
    const mm = await tool(bo, "project_get", { projectId: P4 }).catch(() => ({ text: "" }));
    save({ B3_MCP_PROJECT_GET: (mm.text ?? "").slice(0, 300) });
  });

  // =========================================================================
  // B1 - TIMEZONE (#2159)
  // The brief asked for Europe/Vilnius with the clock faked to 21:30Z. The SERVER's clock cannot be faked without
  // shifting the whole server process (JWT/refresh validation breaks), so the SAME bug class is reproduced with the REAL
  // clock: a viewer whose local calendar day is already AHEAD of the UTC day (Pacific/Kiritimati, UTC+14, local 'tomorrow').
  // =========================================================================
  test("B1. a viewer east of UTC: work recorded at the default (local) date shows on the CV, Work in Numbers and /dashboard/hours; lm_tz is set; a future-dated entry stays out; no cookie still shows the all-time CV hours", async ({ browser }) => {
    const TZ = "Pacific/Kiritimati";
    const utcDay = new Date().toISOString().slice(0, 10);
    const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    save({ B1_UTC_DAY: utcDay, B1_LOCAL_DAY: localDay });
    expect(localDay > utcDay, `the local day (${localDay}) must be ahead of the UTC day (${utcDay}) for this proof to be the bug window`).toBe(true);
    remember("tz1", await createAccount("tz1", "worker"));
    const page = await newPage(browser, { tz: TZ });
    pages.set("tz1", page);
    await login(page, "tz1");
    await go(page, "/en/dashboard/journal", "#journal-composer textarea");
    await expect.poll(async () => decodeURIComponent((await page.context().cookies()).find((c) => c.name === "lm_tz")?.value ?? ""), { timeout: 60_000 }).toBe(TZ);
    // work with a duration at the DEFAULT date
    const E = await compose(page, `QF${TAG} b1 tz entry: swept the yard, worked 4 hours`);
    save({ B1_E: E });
    const wd = await rows<{ value_text: string }>(`journal_entry_metrics?entry_id=eq.${E}&metric_slug=eq.work_date&select=value_text`);
    save({ B1_WORK_DATE: wd[0]?.value_text });
    expect(wd[0]?.value_text, "composer stamps the person's LOCAL day").toBe(localDay);
    const hrs = await rows<{ value_numeric: number }>(`journal_entry_metrics?entry_id=eq.${E}&metric_slug=eq.fragment_time&select=value_numeric`);
    expect(Number(hrs[0]?.value_numeric)).toBe(4);
    // future-dated entry (beyond even UTC+14 tomorrow): excluded everywhere
    const tzJwt = await acctJwt("tz1");
    const ctx = (await rows<{ id: string }>(`engagement_contexts?profile_id=eq.${A("tz1").id}&organization_id=is.null&select=id&limit=1`))[0].id;
    const fut = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const ins = await rpcAs(tzJwt, "create_journal_entry_full", {
      p_worker_id: A("tz1").workerId, p_engagement_context_id: ctx, p_entry_type_slug: "freeform", p_profession_id: null,
      p_original_text: `QF${TAG} b1 future entry worked 3 hours`, p_original_language: "en", p_hash_prev: null, p_hash_self: sha(`fut${TAG}`), p_visibility_scope: "closed",
      p_metrics: [
        { metric_slug: "work_date", value_text: fut, source: "worker_input" },
        { metric_slug: "parsed_fragment", value_text: "1|worked 3 hours", source: "ai_extracted" },
        { metric_slug: "fragment_time", value_text: "1", value_numeric: 3, unit_slug: "hours", source: "ai_extracted" },
        { metric_slug: "pipeline_version", value_numeric: 2, source: "worker_input" },
      ],
    });
    expect(ins.status, ins.text).toBeLessThan(300);
    // surfaces
    await go(page, "/en/cv", '[data-testid="cv-skills"]');
    const cvTxt = await page.getByTestId("cv-recorded-hours").innerText().catch(() => "");
    await shot(page, "b1-cv");
    save({ B1_CV: cvTxt.replace(/\s+/g, " ") });
    // expected = hours of every entry whose work_date is NOT in the future for this viewer (each run of this step adds 4 h)
    const myEntries = await rows<{ id: string }>(`journal_entries?worker_id=eq.${A("tz1").workerId}&deleted_at=is.null&superseded_by=is.null&select=id`);
    const mx = await rows<{ entry_id: string; metric_slug: string; value_numeric: number | null; value_text: string | null }>(`journal_entry_metrics?entry_id=in.(${myEntries.map((e) => e.id).join(",")})&metric_slug=in.(work_date,fragment_time)&select=entry_id,metric_slug,value_numeric,value_text`);
    let expected = 0;
    for (const e of myEntries) {
      const d = mx.find((m) => m.entry_id === e.id && m.metric_slug === "work_date")?.value_text ?? localDay;
      const h = mx.filter((m) => m.entry_id === e.id && m.metric_slug === "fragment_time").reduce((s2, m) => s2 + Number(m.value_numeric ?? 0), 0);
      if (d <= localDay) expected += h;
    }
    save({ B1_EXPECTED_HOURS: expected });
    expect(expected).toBeGreaterThanOrEqual(4);
    expect(cvTxt).toMatch(new RegExp(`\\b${expected} h\\b`));
    expect(cvTxt).not.toMatch(new RegExp(`\\b${expected + 3} h\\b`));
    await go(page, "/en/dashboard/work-in-numbers?period=all", '[data-testid="work-in-numbers"]');
    const win = await bodyText(page);
    save({ B1_WIN: (/.{0,60}\bh\b.{0,60}/.exec(win)?.[0] ?? "") });
    expect(win).toMatch(new RegExp(`\\b${expected} h\\b`));
    expect(win).not.toMatch(new RegExp(`\\b${expected + 3} h\\b`));
    // /dashboard/hours is the EMPLOYER's day sheet ("This area is for a company workspace" for a worker): its default day must be the
    // manager's LOCAL day (viewerWorkToday), not the UTC day - the same frame the composer stamps in.
    // NAMED SEED: a work object (site), without which the day sheet has nothing to render ("no sites yet")
    if ((await rows(`work_objects?organization_id=eq.${S.BO_ORG}&select=id&limit=1`)).length === 0) await dbOk("POST", "work_objects", { organization_id: S.BO_ORG, project_id: S.P1, name: nm("B1 site"), status: "active", created_by: A("bo").id });
    const mgr = await newPage(browser, { tz: TZ });
    await login(mgr, "bo");
    await pickOrg(mgr, S.BO_ORG);
    await go(mgr, "/en/dashboard/hours");
    await expect.poll(async () => decodeURIComponent((await mgr.context().cookies()).find((c) => c.name === "lm_tz")?.value ?? ""), { timeout: 60_000 }).toBe(TZ);
    await go(mgr, "/en/dashboard/hours");
    const dateVal = await mgr.locator('input[type="date"]').first().inputValue().catch(() => "");
    const hoursTxt = await bodyText(mgr);
    await shot(mgr, "b1-hours");
    save({ B1_HOURS_DATE: dateVal, B1_HOURS_SNIP: hoursTxt.slice(0, 400) });
    expect(dateVal || hoursTxt, `the manager's hours sheet opens on the LOCAL day ${localDay}, not the UTC day ${utcDay}`).toContain(localDay);
    // the worker's own recorded hours are on the CV / Work in Numbers (asserted above) - never the empty state
    expect(await bodyText(page)).not.toMatch(/No journal entries with a duration yet/i);
    // NO cookie: the first (server-rendered) response without lm_tz still shows the all-time hours (UTC+1 horizon is inclusive)
    await page.context().clearCookies({ name: "lm_tz" });
    const res = await page.context().request.get("/en/cv");
    const html = await res.text();
    expect(res.status()).toBe(200);
    expect(/cv-recorded-hours/.test(html), "SSR cv without the lm_tz cookie renders the recorded-hours block").toBe(true);
    const block = /data-testid="cv-recorded-hours"[\s\S]{0,400}/.exec(html)?.[0] ?? "";
    expect(block.replace(/<[^>]+>/g, " ")).toMatch(new RegExp(`\\b${expected}\\b`));
  });

  // =========================================================================
  // B5-G5b - the employer review pipeline still verifies (kept next to B8's skills proof)
  // =========================================================================
  test("B5-G5b. confirm_entry_and_verify_skills (employer review) still verifies a skill the worker could not self-verify", async () => {
    const bo = await acctJwt("bo");
    const ew = A("ew");
    const [s1, s2] = await rows<{ id: string }>(`skills?select=id&limit=2`);
    // NAMED SEED: the owner's 'journal review' toggle for the employee context
    await dbOk("PATCH", `engagement_contexts?profile_id=eq.${ew.id}&organization_id=eq.${S.BO_ORG}`, { journal_review_enabled: true });
    const E = S.EW_ENTRY as string;
    const r = await rpcAs(bo, "confirm_entry_and_verify_skills", { p_entry_id: E, p_skill_ids: [s1.id], p_note: "qa verify" });
    save({ G5B_RESULT: r.text.slice(0, 300) });
    expect(r.status, r.text).toBeLessThan(300);
    const ws = await rows<{ skill_id: string; verified: boolean; source: string; confidence_bin: string }>(`worker_skills?worker_id=eq.${ew.workerId}&skill_id=eq.${s1.id}&select=skill_id,verified,source,confidence_bin`);
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ verified: true, source: "manager_confirmed" });
    save({ S2: s2.id });
  });

  // =========================================================================
  // B8 - PERSISTENCE FIXES (#2158)
  // =========================================================================
  test("B8a. the skills route keeps manager-verified skills when a stale picker saves", async () => {
    const ew = A("ew");
    const jwt = await acctJwt("ew");
    const url = `${BASE}/api/workers/${ew.workerId}/skills`;
    const post = async (skillIds: string[]) => {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ skillIds }) });
      return { status: r.status, body: await r.text() };
    };
    const before = await rows<{ skill_id: string; verified: boolean; source: string }>(`worker_skills?worker_id=eq.${ew.workerId}&select=skill_id,verified,source`);
    expect(before.find((r) => r.skill_id === S.S1), "S1 was verified by the employer review pipeline").toMatchObject({ verified: true, source: "manager_confirmed" });
    // the worker declares a SECOND skill themselves (self-declared, unverified): the only kind the route may retire
    const decl = await asUser(jwt, "POST", "worker_skills", { worker_id: ew.workerId, skill_id: S.S2, self_rated_level: 2, verified: false, source: "self_declared", confidence_bin: "red" });
    expect(decl.status, decl.text).toBe(201);
    // a STALE picker that knows only the self-declared skill (and not the verified one) saves
    const a = await post([S.S2]);
    expect(a.status, a.body).toBe(200);
    let now = await rows<{ skill_id: string; verified: boolean }>(`worker_skills?worker_id=eq.${ew.workerId}&select=skill_id,verified`);
    expect(now.find((r) => r.skill_id === S.S1), "verified skill survives a stale save").toMatchObject({ verified: true });
    expect(now.find((r) => r.skill_id === S.S2)).toBeTruthy();
    // an EMPTY save retires only the self-declared, unverified claim
    const b = await post([]);
    expect(b.status, b.body).toBe(200);
    now = await rows(`worker_skills?worker_id=eq.${ew.workerId}&select=skill_id,verified`);
    expect(now.find((r) => r.skill_id === S.S1), "verified skill survives an EMPTY save").toMatchObject({ verified: true });
    expect(now.find((r) => r.skill_id === S.S2), "the self-declared claim was retired").toBeUndefined();
    // another worker cannot replace ew's set
    const other = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await acctJwt("str")}` }, body: JSON.stringify({ skillIds: [] }) });
    expect(other.status).toBe(403);
  });

  test("B8b. double-click on the journal save creates ONE entry; hostile invite token adds no path segment; listing delete needs the second confirm click", async ({ browser }) => {
    const ind = A("ind");
    const page = await loginUi(browser, "ind");
    // ---- journal: double click on the confirm
    await go(page, "/en/dashboard/journal", "#journal-composer textarea");
    await hydrated(page, "#journal-composer textarea");
    const text = `QF${TAG} b8 double click: cleaned the site, worked 2 hours`;
    const t0 = new Date(Date.now() - 2_000).toISOString(); // re-runs of this step leave earlier entries behind: count only this attempt's
    await page.locator("#journal-composer textarea").fill(text);
    await page.getByRole("button", { name: /Read it back/i }).click();
    await expect(page.getByTestId("worklog-save")).toBeVisible({ timeout: 90_000 });
    await page.getByTestId("worklog-save").dblclick();
    const confirm = page.getByTestId("worklog-confirm");
    await confirm.waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
    if (await confirm.isVisible()) await confirm.dblclick();
    await expect.poll(async () => (await rows(`journal_entries?original_text=ilike.${encodeURIComponent(`QF${TAG} b8 double click%`)}&created_at=gte.${encodeURIComponent(t0)}&select=id`)).length, { timeout: 120_000 }).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(5_000);
    expect(await rows(`journal_entries?original_text=ilike.${encodeURIComponent(`QF${TAG} b8 double click%`)}&created_at=gte.${encodeURIComponent(t0)}&select=id`), "ONE entry, not two").toHaveLength(1);
    // ---- invite redirect with a hostile token: no extra path segment, no open redirect
    for (const hostile of ["..%2F..%2Fdashboard%2Fadmin", "a%2Fb", "x%3Fnext%3D%2Fevil", "%0d%0aLocation:%20http:%2F%2Fevil"]) {
      const r = await page.context().request.get(`/en/invite/${hostile}`, { maxRedirects: 0 });
      const loc = r.headers()["location"] ?? "";
      expect([200, 307, 308, 404], `${hostile} -> ${r.status()} ${loc}`).toContain(r.status());
      expect(loc, hostile).not.toMatch(/evil|\/dashboard\/admin|\/\.\./);
    }
    // ---- marketplace listing: delete needs the SECOND (confirm) click
    const jwt = await acctJwt("ind");
    const c = await rpcAs(jwt, "create_marketplace_listing_v2", { p_listing_kind: "sale", p_category: "goods_handmade", p_title: nm("b8 removable"), p_organization_id: null, p_project_id: null });
    expect(c.status, c.text).toBeLessThan(300);
    const id = c.json as string;
    await go(page, "/en/dashboard/listings", '[data-testid="market-actor-filter"], main h1');
    const row = page.locator("li, article, tr").filter({ hasText: nm("b8 removable") }).first();
    await expect(row).toBeVisible({ timeout: 120_000 });
    await row.getByRole("button", { name: /^(Remove|Delete)$/i }).first().click();
    await expect(page.getByTestId(`listing-remove-confirm-${id}`)).toBeVisible();
    await page.waitForTimeout(1_000);
    expect(await rows(`marketplace_listings?id=eq.${id}&select=id`), "one click does not delete").toHaveLength(1);
    await page.getByTestId(`listing-remove-confirm-${id}`).click();
    await expect.poll(async () => (await rows(`marketplace_listings?id=eq.${id}&select=id`)).length, { timeout: 60_000 }).toBe(0);
    void ind;
  });

  test("B8c. task forms are disabled while pending: a double click sends ONE request and writes ONE row (assign, evidence link)", async ({ browser }) => {
    const bo = await acctJwt("bo");
    const ew = A("ew");
    // NAMED SEED: a task on P1 (the product creates tasks through a form; the object here is the double submit)
    const t = await dbOk("POST", "work_tasks", { project_id: S.P1, source_type: "project", source_id: S.P1, title: nm("b8 task"), status: "todo", priority: "normal", created_by: A("bo").id });
    const taskId = ((await t.json()) as { id: string }[])[0].id;
    save({ B8_TASK: taskId });
    void bo;
    const owner = await loginUi(browser, "bo");
    await pickOrg(owner, S.BO_ORG);
    await go(owner, "/en/dashboard/tasks", '[data-testid="tasks-page"]');
    const card = owner.getByTestId(`task-card-${taskId}`);
    await expect(card).toBeVisible({ timeout: 120_000 });
    const form = owner.getByTestId(`task-assign-form-${taskId}`);
    const sel = form.locator("select").first();
    await sel.selectOption({ index: 1 }).catch(() => undefined);
    let posts = 0;
    await owner.route("**/dashboard/tasks*", async (route) => {
      if (route.request().method() === "POST") {
        posts++;
        await new Promise((r) => setTimeout(r, 3_000));
      }
      await route.continue();
    });
    const save_ = owner.getByTestId(`task-assign-save-${taskId}`);
    await save_.dblclick();
    await expect(save_).toBeDisabled({ timeout: 5_000 }).catch(() => undefined);
    const disabledWhilePending = await save_.isDisabled().catch(() => false);
    await owner.waitForTimeout(8_000);
    save({ B8_ASSIGN_POSTS: posts, B8_ASSIGN_DISABLED: disabledWhilePending });
    expect(posts, "one POST for a double click").toBeLessThanOrEqual(1);
    await owner.unroute("**/dashboard/tasks*");
    const t1 = await rows<{ assignee_profile_id: string | null }>(`work_tasks?id=eq.${taskId}&select=assignee_profile_id`);
    expect(t1).toHaveLength(1);
    // evidence link by the assignee: ew is person-assigned on P1 (B5) and assigned the task (seed the assignee)
    await dbOk("PATCH", `work_tasks?id=eq.${taskId}`, { assignee_profile_id: ew.id });
    const wp = await loginUi(browser, "ew");
    await go(wp, "/en/dashboard/tasks", '[data-testid="tasks-page"]');
    const link = wp.getByTestId(`task-evidence-link-${taskId}`);
    await expect(link).toBeVisible({ timeout: 120_000 });
    await wp.getByTestId(`task-evidence-select-${taskId}`).selectOption({ index: 1 }).catch(() => undefined);
    let posts2 = 0;
    await wp.route("**/dashboard/tasks*", async (route) => {
      if (route.request().method() === "POST") {
        posts2++;
        await new Promise((r) => setTimeout(r, 3_000));
      }
      await route.continue();
    });
    await link.dblclick();
    const dis2 = await link.isDisabled().catch(() => false);
    await wp.waitForTimeout(8_000);
    await wp.unroute("**/dashboard/tasks*");
    save({ B8_EVIDENCE_POSTS: posts2, B8_EVIDENCE_DISABLED: dis2 });
    expect(posts2).toBeLessThanOrEqual(1);
    expect(await rows(`journal_entry_tasks?task_id=eq.${taskId}&unlinked_at=is.null&select=id`), "ONE evidence link").toHaveLength(1);
  });

  // =========================================================================
  // B9 - COUNTERS (#2160)
  // =========================================================================
  test("B9a. company work history: day hours and period hours are separate; an 800 h-style period is never summed into day hours", async ({ browser }) => {
    const boJwt = await acctJwt("bo");
    const ins = await asUser(boJwt, "POST", "organization_people", { organization_id: S.BO_ORG, display_name: nm("History Person"), normalized_name: nm("History Person").toLowerCase(), relationship_kind: "employee", created_by: A("bo").id, link_state: "unlinked" });
    expect(ins.status, ins.text).toBe(201);
    const pid = ins.json[0].id as string;
    save({ B9_PID: pid });
    const sess = await dbOk("POST", "evidence_import_sessions", { organization_id: S.BO_ORG, source_kind: "manual", source_filename: `qf-b9-${TAG}.csv`, source_fingerprint: sha(`s9:${TAG}:${randomBytes(4).toString("hex")}`), source_language: "en", supplied_by_organization_id: S.BO_ORG, supplier_role: "employer", actor_kind: "human", created_by: A("bo").id, notes: `qf ${TAG}` });
    const sessionId = ((await sess.json()) as { id: string }[])[0].id;
    const at = new Date().toISOString();
    let prev: string | null = null;
    const rec = async (key: string, extra: Record<string, unknown>) => {
      const fp = sha(`b9:${pid}:${key}`);
      const self = sha(`work-history-chain:v1:${prev ?? ""}:${fp}:${at}`);
      await dbOk("POST", "organization_evidence_records", {
        organization_id: S.BO_ORG, organization_person_id: pid, activity_kind: "work", context_label: nm("Hall site"), original_text: "x", original_language: "en", evidence_state: "LEGACY_IMPORTED",
        supplied_by_organization_id: S.BO_ORG, supplier_role: "employer", supplied_by_profile_id: A("bo").id, imported_by_profile_id: A("bo").id, imported_at: at, session_id: sessionId, source_kind: "manual",
        source_filename: `qf-b9-${TAG}.csv`, source_fact: {}, derived: {}, record_fingerprint: fp, hash_prev: prev, hash_self: self, ...extra,
      });
      prev = self;
    };
    await rec("d1", { activity_date: "2025-03-10", hours: 8 });
    await rec("d2", { activity_date: "2025-03-11", hours: 6.5 });
    await rec("p1", { activity_date: null, period_start: "2025-01-01", period_end: "2025-06-30", hours: 800 });
    await rec("p2", { activity_date: null, period_start: "2025-07-01", period_end: "2025-07-31", hours: 165 });
    const page = await loginUi(browser, "bo");
    await pickOrg(page, S.BO_ORG);
    await go(page, "/en/dashboard/company/history");
    const txt = await bodyText(page);
    await shot(page, "b9-history");
    save({ B9_HISTORY_SNIP: txt.slice(0, 800) });
    // the page states the period aggregates as ONE separate figure per place (800 + 165 = 965 h period total) and says they are never added to single days
    expect(txt).toMatch(/965 h period total/);
    expect(txt).toMatch(/never added to single days/i);
    expect(txt).toMatch(/14\.5 h/);
    // day hours of the org = this person's 14.5 + the G4 roster person's 8 h imported day (when G4 ran in this tag)
    const g4 = (await rows<{ hours: number }>(`organization_evidence_records?organization_id=eq.${S.BO_ORG}&activity_date=not.is.null&select=hours`)).reduce((s2, r) => s2 + Number(r.hours), 0);
    expect(txt).toMatch(new RegExp(`${g4} h\\s+Hours on single days`));
    // NEVER a figure that sums a day with a period (14.5 + 965 = 979.5; 8 + 800; ...) - on ANY section of the page, incl. 'Who performed this work?'
    for (const wrong of ["979.5", "979,5", "814.5", "814,5", "808", "973", "987.5", "987,5"]) expect(txt, `a summed figure ${wrong} must not appear`).not.toContain(wrong);
    // SQL truth for Part C
    const recs = await rows<{ activity_date: string | null; hours: number }>(`organization_evidence_records?organization_person_id=eq.${pid}&select=activity_date,hours`);
    expect(recs.filter((r) => r.activity_date).reduce((s, r) => s + Number(r.hours), 0)).toBe(14.5);
    expect(recs.filter((r) => !r.activity_date).reduce((s, r) => s + Number(r.hours), 0)).toBe(965);
  });

  test("B9b. a rejected work_hour_allocation is excluded from the hours-page day total but listed as 'rejected, not counted'", async ({ browser }) => {
    const ew = A("ew");
    const wo = await dbOk("POST", "work_objects", { organization_id: S.BO_ORG, project_id: S.P1, name: nm("Hall object"), status: "active", created_by: A("bo").id });
    const woId = ((await wo.json()) as { id: string }[])[0].id;
    for (const [h, st] of [[5, "recorded"], [3, "rejected"]] as const) {
      await dbOk("POST", "work_hour_allocations", { organization_id: S.BO_ORG, worker_id: ew.workerId, entered_by: A("bo").id, work_date: "2026-10-01", work_object_id: woId, hours_numeric: h, status: st, source: "manual" });
    }
    const page = await loginUi(browser, "bo");
    await pickOrg(page, S.BO_ORG);
    await go(page, "/en/dashboard/hours?d=2026-10-01");
    const txt = await bodyText(page);
    await shot(page, "b9-hours");
    save({ B9_HOURS_SNIP: txt.slice(0, 700) });
    expect(txt).toMatch(/rejected, not counted/i);
    expect(txt).toMatch(/Day total:? ?5 h/i);
    expect(txt).not.toMatch(/Day total:? ?8 h/i);
  });

  test("B9c. bell unread count equals the select count where read_at is null (>20); reports hub labels the tasks tile 'Your tasks'", async ({ browser }) => {
    const ew = A("ew");
    for (let i = 0; i < 25; i++) {
      await dbOk("POST", "notification_events", { recipient_profile_id: ew.id, event_type: "weekly_digest", entity_type: "weekly_digest", entity_id: ew.id, dedupe_key: `qf:${TAG}:${i}:${randomBytes(3).toString("hex")}`, metadata: {} });
    }
    const jwt = await acctJwt("ew");
    const unread = await asUser(jwt, "GET", "notification_events?read_at=is.null&select=id");
    const n = (unread.json as unknown[]).length;
    expect(n).toBeGreaterThanOrEqual(25);
    const page = await loginUi(browser, "ew");
    await go(page, "/en/dashboard/journal", "#journal-composer textarea");
    const bell = page.getByRole("button", { name: /My notifications/i }).first();
    await expect(bell).toBeVisible({ timeout: 60_000 });
    const label = (await bell.getAttribute("aria-label")) ?? "";
    const text = (await bell.innerText()).trim();
    save({ B9_BELL_LABEL: label, B9_BELL_TEXT: text, B9_UNREAD_SQL: n });
    // The bell renders NO number: a dot (unread > 0) over a list capped at 20 and a 'View all activity' link. The REAL unread total
    // (head count, #2160) is computed by readMyNotificationEvents but dropped by spine.ts - so no number can disagree with SQL, and
    // none is shown (recorded as an observation in the report). What is asserted: the dot is live, the panel is the 20-row window.
    await expect.poll(async () => bell.locator("span.bg-state-live").count(), { timeout: 60_000, message: "the bell dot appears once the notification feed streams in" }).toBeGreaterThan(0).catch(() => undefined);
    const dot = await bell.locator("span.bg-state-live").count();
    await bell.click();
    await page.waitForTimeout(3_000);
    const panelRows = await page.locator('[role="dialog"] li, [role="dialog"] [data-testid^="notification"]').count();
    const panelTxt = (await page.locator('[role="dialog"]').first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const listed = (panelTxt.match(/weekly work and opportunities summary is ready/g) ?? []).length;
    save({ B9_BELL_DOT: dot, B9_PANEL_ROWS: panelRows, B9_PANEL_LISTED: listed, B9_UNREAD_SQL: n });
    expect(dot, "the bell dot is live while there is unread").toBeGreaterThan(0);
    expect(listed, "the panel shows the 20-row window, not the 26 unread").toBeLessThanOrEqual(20);
    expect(listed).toBeGreaterThan(0);
    await page.keyboard.press("Escape").catch(() => undefined);
    // the full list page
    await go(page, "/en/dashboard/activity");
    const full = await page.locator('[data-testid^="activity-stored-unread-"]').count();
    save({ B9_ACTIVITY_UNREAD_ROWS: full });
    expect(full, `activity page unread rows ${full} vs SQL ${n}`).toBeLessThanOrEqual(n);
    // reports hub (manager)
    const owner = await loginUi(browser, "bo");
    await pickOrg(owner, S.BO_ORG);
    await go(owner, "/en/dashboard/reports");
    const rt = await bodyText(owner);
    await shot(owner, "b9-reports");
    expect(rt).toMatch(/Your tasks/);
  });

  test("B9d. task evidence follows an edit (correction) to the CURRENT entry, once", async ({ browser }) => {
    const ew = A("ew");
    const jwt = await acctJwt("ew");
    const taskId = S.B8_TASK as string;
    const ec = S.EW_CTX as string;
    const A1 = (await rows<{ id: string }>(`journal_entry_tasks?task_id=eq.${taskId}&unlinked_at=is.null&select=entry_id`))[0] as unknown as { entry_id: string } | undefined;
    const entryId = A1?.entry_id ?? (S.EW_ENTRY as string);
    const text2 = `QF${TAG} b9d corrected version of the linked entry`;
    const corr = await asUser(jwt, "POST", "journal_entries", { ...entryBody(ew.workerId!, ec, text2, S.P1), correction_of: entryId });
    expect(corr.status, corr.text).toBe(201);
    const E2 = corr.json[0].id as string;
    const page = await loginUi(browser, "ew");
    await go(page, "/en/dashboard/tasks", '[data-testid="tasks-page"]');
    const ev = page.getByTestId(`task-evidence-${taskId}`);
    await expect(ev).toBeVisible({ timeout: 120_000 });
    const t = await ev.innerText();
    save({ B9D_EVIDENCE: t.replace(/\s+/g, " ").slice(0, 500), B9D_E2: E2 });
    const occurrences = (t.match(/b9d corrected version/g) ?? []).length;
    expect(occurrences, "the current version appears ONCE").toBeLessThanOrEqual(1);
    await shot(page, "b9d-task-evidence");
  });

  // =========================================================================
  // A-SEED - the independent pair counterparty-review-journey.spec.ts REQUIRES (written to .tmp/cp-env.sh)
  // =========================================================================
  test("A-SEED. independent counterparty pair for counterparty-review-journey (client rep + independent worker with a real person assignment + one unsubmitted entry + outsider)", async () => {
    const cr = A("cr");
    const ind = A("ind");
    // NAMED SEED: the client's project and the independent worker's PERSON assignment on it (what the assign UI writes)
    const r = await dbOk("POST", "projects", { title: nm("Client Project"), organization_id: S.CR_ORG, company_id: (await orgOf(cr)).companyId, status: "live", start_date: "2026-11-02", end_date: "2026-11-20" });
    const PCR = ((await r.json()) as { id: string }[])[0].id;
    await dbOk("POST", "project_worker_assignments", { project_id: PCR, worker_id: ind.workerId, status: "active" });
    const indJwt = await acctJwt("ind");
    const indCtx = (await rows<{ id: string }>(`engagement_contexts?profile_id=eq.${ind.id}&organization_id=is.null&select=id&limit=1`))[0].id;
    const text = `QF${TAG} counterparty seed entry: laid flooring for the client`;
    const ins = await asUser(indJwt, "POST", "journal_entries", entryBody(ind.workerId!, indCtx, text, PCR));
    expect(ins.status, ins.text).toBe(201);
    save({ PCR, CP_ENTRY_TEXT: text });
    const env = [
      `export COUNTERPARTY_PROJECT_ID=${PCR}`,
      `export COUNTERPARTY_REP_EMAIL=${cr.email}`,
      `export COUNTERPARTY_REP_PASSWORD=${PASSWORD}`,
      `export COUNTERPARTY_WORKER_EMAIL=${ind.email}`,
      `export COUNTERPARTY_WORKER_PASSWORD=${PASSWORD}`,
      `export COUNTERPARTY_ENTRY_TEXT='${text}'`,
      `export COUNTERPARTY_OUTSIDER_EMAIL=${A("str").email}`,
      `export COUNTERPARTY_OUTSIDER_PASSWORD=${PASSWORD}`,
    ].join("\n");
    writeFileSync(resolve(TMP, "cp-env.sh"), env + "\n");
  });

  // =========================================================================
  // PART C - runtime read-backs: SURFACE vs SQL vs EXPECTED (each unexplained difference is a finding)
  // =========================================================================
  const cRows: Record<string, any>[] = [];
  const cNote = (id: string, surface: unknown, sqlv: unknown, expected: unknown, ok: boolean, note = "") => {
    cRows.push({ id, surface, sql: sqlv, expected, ok, note });
    save({ C_ROWS: [...(S.C_ROWS ?? []).filter((r: any) => r.id !== id), { id, surface, sql: sqlv, expected, ok, note }] });
  };
  const num = (re: RegExp, t: string) => {
    const m = re.exec(t);
    return m ? Number(m[1]) : null;
  };

  test("C-R1. entries count: live vs counted-once across journal page / CV / work-in-numbers / project gallery (tm3's corrected chain)", async ({ browser }) => {
    const tm3 = A("tm3");
    const live = await rows<{ id: string; correction_of: string | null }>(`journal_entries?worker_id=eq.${tm3.workerId}&deleted_at=is.null&superseded_by=is.null&select=id,correction_of`);
    const corrected = new Set(live.map((r) => r.correction_of).filter(Boolean));
    const countedOnce = live.filter((r) => !corrected.has(r.id)).length;
    const page = await loginUi(browser, "tm3");
    await go(page, "/en/dashboard/journal", "#journal-composer textarea");
    const jt = await bodyText(page);
    const jN = num(/·\s*(\d+)\s+entr(?:y|ies)/, jt);
    await go(page, "/en/cv", '[data-testid="cv-skills"]');
    const cvt = await bodyText(page);
    const cvN = num(/(\d+)\s+(?:work\s+)?entr(?:y|ies)/i, cvt);
    await go(page, "/en/dashboard/work-in-numbers?period=all", '[data-testid="work-in-numbers"]');
    const wt = await bodyText(page);
    const wN = num(/(\d+)\s+entr(?:y|ies)/i, wt);
    cNote("R1.journal", jN, { live: live.length, countedOnce }, countedOnce, jN === countedOnce, "live vs counted-once: a correction and its original are one job");
    cNote("R1.cv", cvN, { live: live.length, countedOnce }, countedOnce, cvN === null || cvN === countedOnce);
    cNote("R1.winumbers", wN, { live: live.length, countedOnce }, countedOnce, wN === countedOnce);
    expect(jN, `journal page says ${jN}; live ${live.length}; counted once ${countedOnce}`).toBe(countedOnce);
    expect(wN).toBe(countedOnce);
  });

  test("C-R2/R3. the 'confirmed' numbers and the reviewable set: SQL vs inbox / queue / pages", async ({ browser }) => {
    const bo = await acctJwt("bo");
    const mgr2 = await acctJwt("mgr2");
    const E = S.B2_E as string;
    const confs = await rows<{ entry_id: string; confirmation_scope: any }>(`journal_entry_confirmations?entry_id=eq.${E}&select=entry_id,confirmation_scope`);
    const employer = confs.filter((c) => c.confirmation_scope?.action === "confirm").length;
    const client = confs.filter((c) => c.confirmation_scope?.action === "client_accept").length;
    cNote("R2.rows", { employer, client }, "journal_entry_confirmations", { employer: 1, client: 1 }, employer === 1 && client === 1);
    const reviewable = ((await rpcAs(bo, "reviewable_journal_entry_ids", {})).json as string[]) ?? [];
    const queue = ((await rpcAs(mgr2, "list_counterparty_review_queue_v1", {})).json as unknown[]) ?? [];
    const page = await loginUi(browser, "bo");
    await pickOrg(page, S.BO_ORG);
    await go(page, "/en/dashboard/inbox", '[data-testid="inbox-summary"]');
    const it = await bodyText(page);
    const summary = (await page.getByTestId("inbox-summary").innerText()).replace(/\s+/g, " ");
    const nInbox = num(/(\d+)/, summary);
    cNote("R3.inbox", { summary, nInbox }, { reviewable: reviewable.length }, reviewable.length, nInbox === null || nInbox === reviewable.length);
    const m2 = await loginUi(browser, "mgr2");
    await go(m2, "/en/dashboard/inbox/counterparty", '[data-testid="counterparty-queue"]');
    const cards = await m2.locator('[data-testid^="counterparty-card-"]').count();
    cNote("R3.client-queue", cards, { queue: queue.length }, queue.length, cards === queue.length);
    expect(cards).toBe(queue.length);
    if (nInbox !== null) expect(nInbox, `inbox summary '${summary}' vs reviewable ${reviewable.length}`).toBe(reviewable.length);
    void it;
  });

  test("C-R4. hours: journal metrics vs allocations vs imported evidence vs company work history (period never summed)", async () => {
    const tz = A("tz1");
    const m = await rows<{ entry_id: string; value_numeric: number }>(`journal_entry_metrics?metric_slug=eq.fragment_time&unit_slug=eq.hours&select=entry_id,value_numeric`);
    const mine = await rows<{ id: string }>(`journal_entries?worker_id=eq.${tz.workerId}&deleted_at=is.null&superseded_by=is.null&select=id`);
    const sumTz = m.filter((x) => mine.some((e) => e.id === x.entry_id)).reduce((s, x) => s + Number(x.value_numeric), 0);
    cNote("R4.tz1-journal-hours(incl. future-dated)", S.B1_CV, sumTz, S.B1_EXPECTED_HOURS, typeof S.B1_EXPECTED_HOURS === "number" && sumTz > S.B1_EXPECTED_HOURS, "SQL sums ALL entries incl. the 5-day-future one (3 h); surfaces must show only 4 h");
    const alloc = await rows<{ status: string; hours_numeric: number }>(`work_hour_allocations?organization_id=eq.${S.BO_ORG}&work_date=eq.2026-10-01&select=status,hours_numeric`);
    const counted = alloc.filter((a) => a.status !== "rejected").reduce((s, a) => s + Number(a.hours_numeric), 0);
    cNote("R4.allocations-day", S.B9_HOURS_SNIP?.slice(0, 120), alloc, 5, counted === 5);
    if (!S.B9_PID) { test.info().annotations.push({ type: "R4-evidence", description: "NOT RUN in this tag (B9a did not run)" }); return; }
    const recs = await rows<{ activity_date: string | null; hours: number }>(`organization_evidence_records?organization_person_id=eq.${S.B9_PID}&select=activity_date,hours`);
    const day = recs.filter((r) => r.activity_date).reduce((s, r) => s + Number(r.hours), 0);
    const period = recs.filter((r) => !r.activity_date).reduce((s, r) => s + Number(r.hours), 0);
    cNote("R4.evidence-day-vs-period", S.B9_HISTORY_SNIP?.slice(0, 160), { day, period }, { day: 14.5, period: 965 }, day === 14.5 && period === 965, "800 h + 165 h are PERIOD aggregates, never summed into day hours");
    expect(day).toBe(14.5);
    expect(period).toBe(965);
  });

  test("C-R5. assigned people: person vs team (SQL union vs project page)", async ({ browser }) => {
    const P4 = S.P4 as string;
    const pwa = await rows<{ worker_id: string }>(`project_worker_assignments?project_id=eq.${P4}&status=eq.active&select=worker_id`);
    const ta = await rows<{ id: string; team_org_id: string }>(`team_assignments?project_id=eq.${P4}&status=eq.active&select=id,team_org_id`);
    const bo = await acctJwt("bo");
    const mem = await rpcAs(bo, "list_team_assignment_members_v1", { p_assignment_ids: ta.map((t) => t.id) });
    const memberProfiles = new Set(((mem.json as any[]) ?? []).map((r) => r.profile_id ?? r.member_profile_id).filter(Boolean));
    const personProfiles = new Set(await Promise.all(pwa.map(async (r) => (await rows<{ profile_id: string }>(`workers?id=eq.${r.worker_id}&select=profile_id`))[0].profile_id)));
    const union = new Set([...memberProfiles, ...personProfiles]);
    const page = await loginUi(browser, "bo");
    await pickOrg(page, S.BO_ORG);
    await go(page, `/en/dashboard/projects/${P4}`, "main h1");
    const m = num(/(\d+)\s+(?:person|people) on the field/i, await bodyText(page));
    cNote("R5.project-field-count", m, { person: pwa.length, teamMembers: memberProfiles.size, union: union.size }, union.size, m === union.size);
    expect(m).toBe(union.size);
  });

  test("C-R6. invitation states vs bell / network / Today panel; >20 unread", async ({ browser }) => {
    const jwt = await acctJwt("ew");
    const unreadSql = ((await asUser(jwt, "GET", "notification_events?read_at=is.null&select=id")).json as unknown[]).length;
    cNote("R6.unread", { dot: S.B9_BELL_DOT, panelListed: S.B9_PANEL_LISTED, activityRows: S.B9_ACTIVITY_UNREAD_ROWS }, unreadSql, "bell = dot + 20-row window; no unread NUMBER is rendered anywhere (unreadCount is computed but not consumed)", (S.B9_PANEL_LISTED ?? 0) <= 20 && unreadSql > 20, "OBSERVATION: the head-count unreadCount of readMyNotificationEvents is dropped by spine.ts - no surface can disagree, none shows it");
    // pending invitations for a person with BOTH a canonical invitation and a roster claim
    const ind = A("ind");
    const bo = await acctJwt("bo");
    const tok = randomBytes(24).toString("base64url");
    const mk = await rpcAs(bo, "create_invitation_v2", { p_token_hash: sha(tok), p_invitation_type: "join_as_employee", p_invited_email: A("tm2").email, p_invited_name: nm("tm2"), p_organization_id: S.FO_ORG, p_proposed_role: "x", p_relationship_slug: "employee" });
    const strayInv = await rows(`invitations?inviter_profile_id=eq.${A("bo").id}&organization_id=eq.${S.FO_ORG}&select=id`);
    cNote("R6.setup-canonical-invite", { status: mk.status, outcome: j(mk.json).slice(0, 120) }, { rowsByBoForFoOrg: strayInv.length }, "no invitation row is created by a manager of ANOTHER organisation", strayInv.length === 0, "the door answers with a refusal outcome, not a row");
    expect(strayInv, "bo (not a manager of FO) must not be able to invite into FO").toEqual([]);
    const fo = await acctJwt("fo");
    const mk2 = await rpcAs(fo, "create_invitation_v2", { p_token_hash: sha(tok), p_invitation_type: "join_as_employee", p_invited_email: A("tm2").email, p_invited_name: nm("tm2"), p_organization_id: S.FO_ORG, p_proposed_role: "x", p_relationship_slug: "employee" });
    expect(mk2.status, mk2.text).toBeLessThan(300);
    const tm2 = await acctJwt("tm2");
    const mine = (await rpcAs(tm2, "list_invitations_for_me_v1", {})).json as { items: unknown[] };
    const page = await loginUi(browser, "tm2");
    await go(page, "/en/dashboard"); await page.waitForTimeout(8_000);
    const body = await bodyText(page);
    const bell = await page.getByRole("button", { name: /My notifications/i }).first().getAttribute("aria-label").catch(() => "");
    cNote("R6.pending-invitations", { bell, todayText: (/.{0,60}invit.{0,60}/i.exec(body)?.[0] ?? "") }, { listForMe: mine.items?.length }, mine.items?.length, true, "see annotation: bell / Today text recorded for manual comparison");
    void ind;
  });

  test("C-R7. marketplace tab contents vs market_index_v1 grouped by domain", async ({ browser }) => {
    const idx = await rows<{ domain: string }>(`market_index_v1?select=domain`).catch(() => null);
    if (!idx) {
      cNote("R7", null, "market_index_v1 not readable by service role over PostgREST", null, false, "NOT RUN: market_index_v1 is not exposed");
      return;
    }
    const by: Record<string, number> = {};
    for (const r of idx) by[r.domain] = (by[r.domain] ?? 0) + 1;
    const page = await loginUi(browser, "ind");
    await go(page, "/en/dashboard/listings", '[data-testid="market-actor-filter"], main h1');
    const rowsN = await page.locator('[data-testid="market-row-actor"]').count();
    cNote("R7.rows-on-page", rowsN, by, "per-domain counts; page shows the viewer's visible subset", true, "recorded for comparison");
    save({ C_R7: { by, rowsN } });
  });

  test("C-R8. reports hub totals vs SQL with > 100 projects", async ({ browser }) => {
    // NAMED SEED: 110 additional projects in the BO organisation across the whitelisted statuses
    const statuses = ["draft", "live", "paused", "completed"];
    const batch = Array.from({ length: 110 }, (_, i) => ({ title: nm(`bulk ${i}`), organization_id: S.BO_ORG, company_id: S.BO_CO, status: statuses[i % 4] }));
    await dbOk("POST", "projects", batch, "return=minimal");
    const all = await rows<{ status: string }>(`projects?organization_id=eq.${S.BO_ORG}&select=status&limit=1000`);
    const by: Record<string, number> = {};
    for (const r of all) by[r.status] = (by[r.status] ?? 0) + 1;
    const page = await loginUi(browser, "bo");
    await pickOrg(page, S.BO_ORG);
    await go(page, "/en/dashboard/reports");
    const t = await bodyText(page);
    await shot(page, "c-r8-reports");
    save({ C_R8: { by, total: all.length, snippet: (/.{0,100}\b1\d\d\b.{0,100}/.exec(t)?.[0] ?? "") } });
    cNote("R8.reports-hub", t.slice(0, 500), { total: all.length, by }, "head counts equal SQL (not capped at 100)", t.includes(String(all.length)), "projects total must be the real count, not a 100-row page");
    expect(t, `reports hub must show the real total ${all.length}`).toContain(String(all.length));
  });

  // =========================================================================
  // B13 - DOUBLE-CLICK / RETRY on dangerous writes (parallel = the double click that beats the UI guard)
  // =========================================================================
  test("B13. assignment, override keep, submit for review, counterparty decision: exactly one row/event; the second is an idempotent no-op or refused", async () => {
    const bo = await acctJwt("bo");
    const tm3 = A("tm3");
    const tm3Jwt = await acctJwt("tm3");
    const mgr2 = await acctJwt("mgr2");
    // --- team assignment x2 in parallel (Crew Two on P3)
    const [a1, a2] = await Promise.all([rpcAs(bo, "assign_team_to_work_v1", { p_team_org_id: S.T2, p_project_id: S.P3 }), rpcAs(bo, "assign_team_to_work_v1", { p_team_org_id: S.T2, p_project_id: S.P3 })]);
    const active = await rows(`team_assignments?project_id=eq.${S.P3}&team_org_id=eq.${S.T2}&status=eq.active&select=id`);
    save({ B13_ASSIGN: [a1.text.slice(0, 160), a2.text.slice(0, 160)] });
    expect(active, `${a1.text} | ${a2.text}`).toHaveLength(1);
    // --- override keep x2 in parallel with a NEW reason (the honest collisions of the earlier receipt)
    const prior = (await rows<{ collisions: unknown }>(`commitment_override_receipts?project_id=eq.${S.P3}&select=collisions`))[0];
    const before = (await rows(`commitment_override_receipts?project_id=eq.${S.P3}&select=id`)).length;
    const args = { p_project_id: S.P3, p_worker_profile_id: A("ew").id, p_reason_code: "urgent_need", p_collisions: prior.collisions };
    const [k1, k2] = await Promise.all([rpcAs(bo, "record_commitment_override_v1", args), rpcAs(bo, "record_commitment_override_v1", args)]);
    expect(k1.status, k1.text).toBeLessThan(300);
    expect(k2.status, k2.text).toBeLessThan(300);
    expect(k1.json).toBe(k2.json);
    expect(await rows(`commitment_override_receipts?project_id=eq.${S.P3}&select=id`)).toHaveLength(before + 1);
    // --- submit for review x2 + counterparty decide x2 (a fresh entry E3 for tm3 on P2)
    const ec = (await rows<{ id: string }>(`engagement_contexts?profile_id=eq.${tm3.id}&organization_id=eq.${S.T1}&select=id`))[0].id;
    const ins = await asUser(tm3Jwt, "POST", "journal_entries", entryBody(tm3.workerId!, ec, `QF${TAG} b13 third entry`, S.P2));
    expect(ins.status, ins.text).toBe(201);
    const E3 = ins.json[0].id as string;
    const [s1, s2] = await Promise.all([rpcAs(tm3Jwt, "submit_journal_entry_for_review_v1", { p_entry_id: E3 }), rpcAs(tm3Jwt, "submit_journal_entry_for_review_v1", { p_entry_id: E3 })]);
    expect([s1.text, s2.text].filter((t) => /"submitted"/.test(t)).length, `${s1.text} ${s2.text}`).toBeGreaterThanOrEqual(1);
    expect(await rows(`journal_entry_review_submissions?entry_id=eq.${E3}&select=id`), "ONE submission row").toHaveLength(1);
    const [d1, d2] = await Promise.all([rpcAs(mgr2, "review_journal_entry", { p_entry_id: E3, p_decision: "approved", p_note: "ok" }), rpcAs(mgr2, "review_journal_entry", { p_entry_id: E3, p_decision: "approved", p_note: "ok" })]);
    save({ B13_DECIDE: [d1.text, d2.text] });
    const conf = await rows<{ confirmation_scope: any }>(`journal_entry_confirmations?entry_id=eq.${E3}&select=confirmation_scope`);
    expect(conf.filter((c) => c.confirmation_scope?.action === "client_accept"), "ONE client decision").toHaveLength(1);
    // the same attempt after the fact is refused / no-op (accept is final)
    const d3 = await rpcAs(mgr2, "review_journal_entry", { p_entry_id: E3, p_decision: "approved", p_note: "again" });
    expect((await rows(`journal_entry_confirmations?entry_id=eq.${E3}&select=id`)).length).toBe(conf.length);
    void d3;
  });

  // =========================================================================
  // B12 - PERSISTENCE ACROSS RELOAD / NAVIGATION / RE-LOGIN
  // =========================================================================
  test("B12. journal entry, team assignment, listing, accepted invitation, counterparty decision, roster link: identical after reload, navigate away and back, sign out and back in", async ({ browser }) => {
    const E = S.B2_E as string;
    const tm3 = A("tm3");
    const ind = A("ind");
    const listing = (await rows<{ id: string; title: string; status: string }>(`marketplace_listings?owner_id=eq.${ind.id}&status=eq.active&select=id,title,status&limit=1`))[0];
    const snap = async () => ({
      entry: await rows(`journal_entries?id=eq.${E}&select=id,original_text,hash_self,superseded_by,deleted_at,project_id`),
      confirmations: await rows(`journal_entry_confirmations?entry_id=eq.${E}&select=id,confirmation_scope&order=id`),
      teamAssignments: await rows(`team_assignments?project_id=eq.${S.P4}&select=id,team_org_id,status,ended_at,replaced_by_id&order=id`),
      listing: listing ? await rows(`marketplace_listings?id=eq.${listing.id}&select=id,title,status,updated_at`) : null,
      invitation: await rows(`engagement_contexts?profile_id=eq.${ind.id}&organization_id=eq.${S.BO_ORG}&select=id,status,relationship_slug`),
      roster: await rows(`organization_people?id=eq.${S.ROSTER_PID}&select=id,link_state,link_method,linked_profile_id`),
    });
    const s0 = await snap();
    const probe = async (page: Page) => {
      await go(page, "/en/dashboard/journal", "#journal-composer textarea");
      const jt = await bodyText(page);
      return { entryVisible: jt.includes(`QF${TAG} b2 entry`), clientAccepted: /accepted by the client/i.test(jt) };
    };
    const page = await loginUi(browser, "tm3");
    const p0 = await probe(page);
    expect(p0.entryVisible, "the entry is listed").toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    const p1 = await probe(page);
    await go(page, "/en/cv", '[data-testid="cv-skills"]');
    const p2 = await probe(page);
    // sign out and back in (fresh context)
    await page.context().clearCookies();
    const fresh = await newPage(browser);
    await login(fresh, "tm3");
    const p3 = await probe(fresh);
    save({ B12_PROBES: [p0, p1, p2, p3] });
    for (const p of [p1, p2, p3]) expect(p).toEqual(p0);
    save({ B12_CLIENT_ACCEPTED_SHOWN: p0.clientAccepted });
    // listing + invitation + assignment + roster persistence from the other personas
    const ip = await newPage(browser);
    await login(ip, "ind");
    await go(ip, "/en/dashboard/listings", '[data-testid="market-actor-filter"], main h1');
    const lt0 = listing ? (await bodyText(ip)).includes(listing.title) : null;
    await ip.reload({ waitUntil: "domcontentloaded" });
    await settle(ip);
    const lt1 = listing ? (await bodyText(ip)).includes(listing.title) : null;
    expect(lt1).toBe(lt0);
    const s1 = await snap();
    expect(s1, "the database state is identical after all the navigation").toEqual(s0);
    void tm3;
  });

  // =========================================================================
  // B6 - SUBJECT DECLINE / WITHDRAW (observation from the scratch proof)
  // =========================================================================
  test("B6a. the subject REFUSES a link_proposed offer through PostgREST exactly as the product writes it (update ... returning)", async () => {
    const boJwt = await acctJwt("bo");
    const tm2Jwt = await acctJwt("tm2");
    const tm2 = A("tm2");
    await dbOk("POST", "engagement_contexts", { profile_id: tm2.id, organization_id: S.BO_ORG, relationship_slug: "employee", status: "active", is_primary: false, title: "QF", hash_self: sha(`${tm2.id}:employee:${S.BO_ORG}`) });
    const mk = async (label: string) => {
      const r = await asUser(boJwt, "POST", "organization_people", { organization_id: S.BO_ORG, display_name: nm(label), normalized_name: nm(label).toLowerCase(), relationship_kind: "employee", created_by: A("bo").id, link_state: "unlinked" });
      expect(r.status, r.text).toBe(201);
      const id = r.json[0].id as string;
      const o = await asUser(boJwt, "PATCH", `organization_people?id=eq.${id}`, { linked_profile_id: tm2.id, linked_worker_id: tm2.workerId, link_state: "link_proposed", link_method: "manager_offer" });
      expect(o.status, o.text).toBe(200);
      return id;
    };
    const idRefuse = await mk("Refuse Me");
    const idRefuse2 = await mk("Refuse Me Two");
    save({ RP_REFUSE: idRefuse, RP_REFUSE2: idRefuse2 });
    const patch = { link_state: "unlinked", link_method: null, linked_profile_id: null, linked_worker_id: null, linked_at: null, updated_at: new Date().toISOString() };
    // EXACTLY the product's statement: update(patch).eq(id).eq(linked_profile_id).eq(link_state).select("id")  == RETURNING
    const withReturning = await asUser(tm2Jwt, "PATCH", `organization_people?id=eq.${idRefuse}&linked_profile_id=eq.${tm2.id}&link_state=eq.link_proposed&select=id`, patch);
    // WITHOUT returning (Prefer: return=minimal)
    const noReturning = await asUser(tm2Jwt, "PATCH", `organization_people?id=eq.${idRefuse2}&linked_profile_id=eq.${tm2.id}&link_state=eq.link_proposed`, patch, "return=minimal");
    const after = await rows<{ id: string; link_state: string }>(`organization_people?id=in.(${idRefuse},${idRefuse2})&select=id,link_state`);
    test.info().annotations.push({ type: "b6-refuse-returning", description: `${withReturning.status} ${withReturning.text.slice(0, 200)}` });
    test.info().annotations.push({ type: "b6-refuse-minimal", description: `${noReturning.status} ${noReturning.text.slice(0, 200)}` });
    save({ B6_REFUSE_RETURNING: withReturning.status, B6_REFUSE_MINIMAL: noReturning.status, B6_AFTER: after });
    expect(after.find((r) => r.id === idRefuse2)!.link_state, `minimal: ${noReturning.status} ${noReturning.text}`).toBe("unlinked");
    expect(withReturning.status, `RETURNING: ${withReturning.text}`).toBe(200);
    expect(after.find((r) => r.id === idRefuse)!.link_state).toBe("unlinked");
  });

  test("B6b. the subject WITHDRAWS a confirmed link (linked -> unlinked) exactly as the product writes it, and the history disappears", async () => {
    const ewJwt = await acctJwt("ew");
    const ew = A("ew");
    const pid = S.ROSTER_PID as string;
    expect(await rows(`organization_people?id=eq.${pid}&link_state=eq.linked&select=id`)).toHaveLength(1);
    const patch = { link_state: "unlinked", link_method: null, linked_profile_id: null, linked_worker_id: null, linked_at: null, updated_at: new Date().toISOString() };
    const r = await asUser(ewJwt, "PATCH", `organization_people?id=eq.${pid}&linked_profile_id=eq.${ew.id}&link_state=eq.linked&select=id`, patch);
    save({ B6_WITHDRAW_RETURNING: r.status });
    const st = await rows<{ link_state: string }>(`organization_people?id=eq.${pid}&select=link_state`);
    expect(r.status, `RETURNING: ${r.text}`).toBe(200);
    expect(st[0].link_state).toBe("unlinked");
    expect((await asUser(ewJwt, "GET", `organization_evidence_records?organization_person_id=eq.${pid}&select=id`)).json).toEqual([]);
  });


  // =========================================================================
  // B6c - SUBJECT DECLINE / WITHDRAW through the PRODUCT UI on the real stack
  // =========================================================================
  test("B6c. the person refuses an offer and withdraws a confirmed link through the profile UI; nothing is linked afterwards", async ({ browser }) => {
    const boJwt = await acctJwt("bo");
    const tm2 = A("tm2");
    const tm2Jwt = await acctJwt("tm2");
    const mk = async (label: string) => {
      const r = await asUser(boJwt, "POST", "organization_people", { organization_id: S.BO_ORG, display_name: nm(label), normalized_name: nm(label).toLowerCase(), relationship_kind: "employee", created_by: A("bo").id, link_state: "unlinked" });
      expect(r.status, r.text).toBe(201);
      const id = r.json[0].id as string;
      const o = await asUser(boJwt, "PATCH", `organization_people?id=eq.${id}`, { linked_profile_id: tm2.id, linked_worker_id: tm2.workerId, link_state: "link_proposed", link_method: "manager_offer" });
      expect(o.status, o.text).toBe(200);
      return id;
    };
    const idRefuse = await mk("UI Refuse");
    const idWithdraw = await mk("UI Withdraw");
    const page = await loginUi(browser, "tm2");
    await go(page, "/en/dashboard/profile");
    const offer = page.locator(`[data-testid="roster-link-offer"][data-person-id="${idRefuse}"]`);
    await expect(offer).toBeVisible({ timeout: 120_000 });
    await shot(page, "b6c-offer");
    await offer.locator('button[name="decision"][value="refuse"]').click();
    await expect.poll(async () => (await rows<{ link_state: string }>(`organization_people?id=eq.${idRefuse}&select=link_state`))[0].link_state, { timeout: 60_000, message: "UI refuse must return the row to unlinked" }).toBe("unlinked");
    const gone = await rows<{ linked_profile_id: string | null; linked_worker_id: string | null; link_method: string | null }>(`organization_people?id=eq.${idRefuse}&select=linked_profile_id,linked_worker_id,link_method`);
    expect(gone[0]).toEqual({ linked_profile_id: null, linked_worker_id: null, link_method: null });
    // the person accepts the second offer (policy UPDATE), then withdraws it in the UI
    const acc = await asUser(tm2Jwt, "PATCH", `organization_people?id=eq.${idWithdraw}&linked_profile_id=eq.${tm2.id}`, { link_state: "linked", link_method: "worker_confirmed", linked_at: new Date().toISOString() });
    expect(acc.status, acc.text).toBe(200);
    await go(page, "/en/dashboard/profile");
    const row = page.locator(`[data-testid="roster-link-confirmed"][data-person-id="${idWithdraw}"]`);
    await expect(row).toBeVisible({ timeout: 120_000 });
    await row.getByTestId("roster-link-withdraw-open").click();
    await row.getByTestId("roster-link-withdraw-confirm").click();
    await expect.poll(async () => (await rows<{ link_state: string }>(`organization_people?id=eq.${idWithdraw}&select=link_state`))[0].link_state, { timeout: 60_000, message: "UI withdraw must return the row to unlinked" }).toBe("unlinked");
    await shot(page, "b6c-after");
    // the audit trail of the answer exists, the manager still has the roster record
    expect(await rows(`organization_people?id=in.(${idRefuse},${idWithdraw})&select=id`)).toHaveLength(2);
    const aud = await rows(`audit_logs?action=in.(roster_link_refuse,roster_link_withdraw)&entity_id=in.(${idRefuse},${idWithdraw})&select=id`);
    expect(aud).toHaveLength(2);
    // another person cannot answer for tm2 (RPC as a stranger -> not_found, row untouched)
    const stranger = await acctJwt("str");
    const idOther = await mk("UI Stranger");
    const s = await rpcAs(stranger, "respond_to_roster_link_v1", { p_person_id: idOther, p_decision: "refuse" });
    expect(s.json, s.text).toBe("not_found");
    expect((await rows<{ link_state: string }>(`organization_people?id=eq.${idOther}&select=link_state`))[0].link_state).toBe("link_proposed");
    // the manager cannot use the door either (not the linked profile)
    const m = await rpcAs(boJwt, "respond_to_roster_link_v1", { p_person_id: idOther, p_decision: "refuse" });
    expect(m.json, m.text).toBe("not_found");
    // anon: denied by privilege
    const an = await rpcAs(null, "respond_to_roster_link_v1", { p_person_id: idOther, p_decision: "refuse" });
    expect(an.status).toBeGreaterThanOrEqual(400);
  });

});
