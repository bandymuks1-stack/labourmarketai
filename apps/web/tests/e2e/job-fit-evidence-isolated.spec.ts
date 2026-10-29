import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

/**
 * JOB FIT FROM EVIDENCE, end to end, on a THROWAWAY LOCAL Supabase stack
 * (.github/workflows/signup-isolated.yml — the stack replays every migration,
 * including the RED 20261029190000_worker_board_need_skill_slugs_v1 that is
 * PREPARED for the owner gate and NOT applied in production).
 *
 * Owner decision 2026-10-29: a worker's job fit comes from the work they
 * actually did, the skills derived from it and the need's requirements —
 * not from title matching alone.
 *
 *   F-1 a person whose OFFICIAL title is "warehouse worker" records a day of
 *       tiling in the Work Journal; the work is linked to the skills;
 *   F-2 a company posts a free-text need under a title that names no trade
 *       ("wet-room finishing specialist"); the need's required CATALOGUE
 *       skills are stored at intake — slugs only, none of the employer's text;
 *       a second organization's need requires a C driving licence;
 *   F-3 an organization that is a synthetic QA fixture posts a tiling need;
 *   F-4 the worker's gated reader returns the free-text need WITH its derived
 *       skills, projects no private column, hides the synthetic need, and the
 *       worker cannot read any organization's need rows under row-level
 *       security (nor can another organization);
 *   F-5 the worker's board shows the free-text need with a REAL fit band
 *       (assessed, not "not assessed"), and the licence need shows the
 *       licence as a missing FORMAL requirement — recorded work never meets it.
 *
 * It refuses to run anywhere but the local stack (owner decision 2026-10-28:
 * no synthetic accounts in production). Outcomes are read back from that
 * local database. Result class: PASS_CI_ONLY, never LIVE_VERIFIED.
 */

const BASE = process.env.E2E_BASE_URL ?? "";
const SB_URL = process.env.E2E_SUPABASE_URL ?? "";
const SB_SERVICE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+$/;

test.skip(
  process.env.SIGNUP_ISOLATED !== "1" ||
    !LOCAL.test(BASE) ||
    SB_URL !== "http://127.0.0.1:54321" ||
    !SB_SERVICE ||
    !SB_ANON,
  "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const PASSWORD = "Synthetic-Pass-2026!";
const email = (who: string) => `jobfit.${who}.${RUN}@local.test`;

const WORKER = email("worker");
const COMPANY = email("company");
const FIXTURE = email("fixture");
// A second real organization posts the licence need (one open need per
// organization on the free plan; the intake form is not offered for a second).
const LOGISTICS = email("logistics");
const ADMIN = email("admin");
const PRIVATE_WORD = `cottage${RUN}`;
const WORK_TEXT = `Tiled the bathroom floor, waterproofing in the shower at the ${PRIVATE_WORD}, 7 hours`;
// A real-looking organization (no fixture marker) — its needs are market reality.
const COMPANY_ORG = `Fit Proof Bathrooms ${RUN}`;
// A synthetic QA fixture organization (lib/qa/synthetic-fixture.ts marker).
const LOGISTICS_ORG = `Fit Proof Logistics ${RUN}`;
const FIXTURE_ORG = `QA-SYNTHETIC Fit Fixture ${RUN}`;
const FREE_ROLE = `Wet-room finishing specialist ${RUN}`;
const FREE_TEXT = `Tiling and waterproofing of bathrooms near the ${RUN}harbour`;
const LICENCE_ROLE = `Delivery crew member ${RUN}`;
const LICENCE_TEXT = "Deliveries of building materials between our sites";
const FIXTURE_ROLE = `Tiling crew ${RUN}`;

/** The reader's closed column whitelist after 20261029190000. */
const READER_COLUMNS = [
  "accommodation",
  "company_name",
  "country",
  "created_at",
  "id",
  "location_label",
  "need_skill_slugs",
  "need_skill_source",
  "required_tools",
  "role_text",
  "route_status",
  "start_period",
  "structured",
  "team_size",
  "transport",
];

const state: Record<string, string> = {};

// ── local helpers (service key / local database container only) ────────────

const DB_CONTAINER = "supabase_db_labourmarketai";
function sqlExec(statement: string): void {
  execFileSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c", statement], {
    encoding: "utf8",
  });
}
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

async function db<T>(path: string): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  if (!r.ok) throw new Error(`local db read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
}

async function userId(address: string): Promise<string> {
  const r = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  const body = (await r.json()) as { users?: Array<{ id: string; email?: string }> };
  const u = (body.users ?? []).find((x) => x.email === address);
  if (!u) throw new Error("no local auth user for the walk's address");
  return u.id;
}

async function tokenOf(address: string): Promise<string> {
  const t = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: address, password: PASSWORD }),
  });
  if (!t.ok) throw new Error(`local sign-in → ${t.status}`);
  return ((await t.json()) as { access_token: string }).access_token;
}

/** A REST read AS a signed-in person — what row-level security lets THEM see. */
async function readAs<T>(address: string, path: string): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await tokenOf(address)}` },
  });
  if (!r.ok) throw new Error(`rls read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
}

/** An RPC AS the person (their own token). */
async function rpcAs<T>(address: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await tokenOf(address)}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`rpc ${fn} → ${r.status}`);
  return (await r.json()) as T;
}

async function writeAs(address: string, path: string, body: unknown): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${await tokenOf(address)}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`own write ${path.split("?")[0]} → ${r.status}`);
}

/** The platform operator verifies a company (local admin identity, the
 *  operator RPC) — a need reaches the worker board only from a verified one. */
async function verifyCompany(ownerAddress: string): Promise<void> {
  if (!state.adminReady) {
    const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN, password: PASSWORD, email_confirm: true }),
    });
    if (!created.ok) throw new Error(`local admin identity → ${created.status}`);
    sqlExec(`insert into public.profile_roles (profile_id, role) values (${lit(await userId(ADMIN))}, 'admin')`);
    state.adminReady = "1";
  }
  const owner = await userId(ownerAddress);
  const companies = await db<Array<{ id: string }>>(`companies?profile_id=eq.${owner}&select=id`);
  const orgs = await db<Array<{ legacy_company_id: string | null }>>(
    `organizations?owner_profile_id=eq.${owner}&legacy_company_id=not.is.null&select=legacy_company_id`,
  );
  const companyId = companies[0]?.id ?? orgs[0]?.legacy_company_id;
  if (!companyId) throw new Error("the company record does not exist");
  await rpcAs(ADMIN, "admin_set_company_verification", { p_company_id: companyId, p_status: "verified", p_note: "isolated walk" });
  const [c] = await db<Array<{ verification_status: string }>>(`companies?id=eq.${companyId}&select=verification_status`);
  expect(c?.verification_status, "the company is verified by the operator act").toBe("verified");
}

// ── browser helpers (the same real forms as signup-isolated.spec.ts) ───────

async function signUp(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/signup`);
  await page.locator('input[type="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
  await expect(page.getByTestId("onboarding-intents")).toBeVisible({ timeout: 30_000 });
}

async function onboard(page: Page, intent: string, displayName: string): Promise<void> {
  await page.getByTestId(`onboarding-intent-${intent}`).click();
  await expect(page.getByTestId(`onboarding-intent-${intent}`)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(displayName);
  await page.getByTestId("onboarding-country").click();
  await page.getByRole("option", { name: /Lithuania/ }).first().click();
  await page.getByTestId("onboarding-submit").click();
}

async function setUpCompany(page: Page, legalName: string): Promise<void> {
  await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
  await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("company-setup-legal-name").fill(legalName);
  await page.getByTestId("company-setup-country").selectOption("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({ timeout: 30_000 });
}

async function signIn(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/login`);
  await page.locator('input[name="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
}

async function clickUntil(target: Locator, result: Locator, timeout = 60_000): Promise<void> {
  await expect(async () => {
    if (!(await result.isVisible().catch(() => false))) await target.click({ timeout: 5_000 });
    await expect(result).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout });
}

async function newCompany(browser: Browser, address: string, legalName: string): Promise<Page> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signUp(page, address);
  await onboard(page, "hire", `Synthetic Owner ${RUN}`);
  await setUpCompany(page, legalName);
  return page;
}

/** Post a need through the organization's own demand intake; return its id. */
async function postNeed(page: Page, role: string, description: string): Promise<string> {
  await page.goto(`${BASE}/en/dashboard/company/needs?audience=need#demand-intake`);
  const main = page.getByRole("main");
  await main.getByTestId("demand-role").fill(role);
  await main.getByTestId("demand-description").fill(description);
  await main.getByTestId("demand-next").click();
  const size = main.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await main.getByTestId("demand-next").click();
  await main.getByTestId("demand-create").click();
  await expect(main.getByTestId("demand-done")).toBeVisible({ timeout: 30_000 });
  let id = "";
  await expect
    .poll(
      async () => {
        const rows = await db<Array<{ id: string }>>(
          `customer_requests?title=eq.${encodeURIComponent(role)}&status=eq.submitted&select=id`,
        );
        id = rows[0]?.id ?? "";
        return rows.length;
      },
      { message: "the need is stored", timeout: 30_000 },
    )
    .toBe(1);
  return id;
}

type ReaderRow = Record<string, unknown> & { id: string; need_skill_slugs: string[] | null; need_skill_source: string | null };

// ── F-1 ─────────────────────────────────────────────────────────────────────

test("F-1. a 'warehouse worker' records a day of tiling; the work is linked to the skills", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signUp(page, WORKER);
  await onboard(page, "work", `Synthetic Worker ${RUN}`);
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  const [worker] = await db<Array<{ id: string }>>(`workers?profile_id=eq.${await userId(WORKER)}&select=id`);
  expect(worker?.id, "a worker record exists without any company").toBeTruthy();
  state.worker = worker!.id;

  // The OFFICIAL title: warehouse worker — the person's own declaration.
  const [warehouse] = await db<Array<{ id: string }>>(`professions?slug=eq.warehouse_worker&select=id`);
  expect(warehouse?.id, "the catalogue knows the title").toBeTruthy();
  await writeAs(WORKER, "worker_professions", { worker_id: worker!.id, profession_id: warehouse!.id, is_primary: true });

  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  const box = main.getByTestId("journal-quick-record-text");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await box.fill(WORK_TEXT);
  await clickUntil(main.getByTestId("journal-quick-record-understand"), main.getByTestId("worklog-flow"));
  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  const done = main.getByTestId("worklog-done");
  await expect(done.or(main.getByTestId("worklog-error")).or(main.getByTestId("worklog-blocked"))).toBeVisible({ timeout: 60_000 });
  await expect(done, "the entry is saved").toBeVisible();

  await expect
    .poll(
      async () => {
        const entries = await db<Array<{ id: string }>>(
          `journal_entries?worker_id=eq.${worker!.id}&original_text=ilike.*${PRIVATE_WORD}*&deleted_at=is.null&select=id`,
        );
        if (!entries[0]) return [];
        const links = await db<Array<{ skills: { slug: string } | null }>>(
          `journal_entry_skills?journal_entry_id=eq.${entries[0].id}&select=skills(slug)`,
        );
        return links.map((l) => l.skills?.slug).filter(Boolean).sort();
      },
      { message: "the entry is linked to the skills the work shows", timeout: 60_000 },
    )
    .toEqual(expect.arrayContaining(["tiling", "waterproofing"]));
  await ctx.close();
});

// ── F-2 ─────────────────────────────────────────────────────────────────────

test("F-2. a free-text need stores its required catalogue skills at intake — slugs only, no employer text", async ({ browser }) => {
  const page = await newCompany(browser, COMPANY, COMPANY_ORG);
  state.freeNeed = await postNeed(page, FREE_ROLE, FREE_TEXT);
  await page.context().close();
  const logistics = await newCompany(browser, LOGISTICS, LOGISTICS_ORG);
  state.licenceNeed = await postNeed(logistics, LICENCE_ROLE, LICENCE_TEXT);
  await logistics.context().close();

  const [row] = await db<Array<{ payload: { need_skills?: { slugs: string[]; source: string; contract: number } } }>>(
    `customer_requests?id=eq.${state.freeNeed}&select=payload`,
  );
  const stored = row?.payload?.need_skills;
  expect(stored, "the derived requirement set is stored").toBeTruthy();
  expect(stored!.slugs).toEqual(expect.arrayContaining(["tiling", "waterproofing"]));
  expect(stored!.source, "labelled as recognised from the text — a suggestion, not confirmed").toBe("recognized_from_text");
  expect(JSON.stringify(stored), "none of the employer's words are in the stored set").not.toContain(RUN);

  // The licence need: a C licence, stated in the need's structured cluster
  // (the field the advanced intake form writes; closed set B/BE/C/CE/D).
  sqlExec(
    `update public.customer_requests set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{structured_v2}',
       '{"meta":{"contract_version":2},"transport":{"licence_categories":["C"]}}'::jsonb)
     where id = ${lit(state.licenceNeed)}`,
  );

  await verifyCompany(COMPANY);
  await verifyCompany(LOGISTICS);
});

// ── F-3 ─────────────────────────────────────────────────────────────────────

test("F-3. a synthetic QA fixture organization posts a tiling need", async ({ browser }) => {
  const page = await newCompany(browser, FIXTURE, FIXTURE_ORG);
  state.fixtureNeed = await postNeed(page, FIXTURE_ROLE, "Tiling and waterproofing of bathrooms");
  await page.context().close();
  await verifyCompany(FIXTURE);
});

// ── F-4 ─────────────────────────────────────────────────────────────────────

test("F-4. the worker's reader carries the derived skills, no private column, no fixture; RLS stays closed", async () => {
  const rows = await rpcAs<ReaderRow[]>(WORKER, "list_open_demand_for_workers");
  const free = rows.find((r) => r.id === state.freeNeed);
  expect(free, "the free-text need reaches the worker").toBeTruthy();
  expect(free!.need_skill_slugs).toEqual(expect.arrayContaining(["tiling", "waterproofing"]));
  expect(free!.need_skill_source).toBe("recognized_from_text");
  expect(rows.find((r) => r.id === state.licenceNeed), "the licence need reaches the worker").toBeTruthy();
  // The closed whitelist — never the need text, notes or raw payload.
  for (const r of rows) expect(Object.keys(r).sort()).toEqual(READER_COLUMNS);
  expect(JSON.stringify(rows), "the employer's free text never leaves the reader").not.toContain(`${RUN}harbour`);
  // Another organization's synthetic need is not market reality for a real person.
  expect(rows.find((r) => r.id === state.fixtureNeed), "the fixture need stays hidden").toBeUndefined();

  // Row-level security: the worker reads no organization's need rows…
  expect(await readAs<unknown[]>(WORKER, `customer_requests?id=eq.${state.freeNeed}&select=id,payload`)).toEqual([]);
  // …and another organization reads none of this company's private need.
  expect(await readAs<unknown[]>(FIXTURE, `customer_requests?id=eq.${state.freeNeed}&select=id,payload`)).toEqual([]);
});

// ── F-5 ─────────────────────────────────────────────────────────────────────

test("F-5. the board: a real fit band from the work; the licence is a missing FORMAL requirement", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signIn(page, WORKER);
  await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);

  const free = page.locator(`li[id="opp-${state.freeNeed}"]`).first();
  await expect(free, "the need reaches the person its title would never have found").toBeVisible({ timeout: 60_000 });
  await expect(free, "assessed from the work — a real fit band, not 'not assessed'").toHaveAttribute(
    "data-band",
    /^(strong|possible)$/,
  );
  const skill = free.getByTestId("opportunity-skill-match");
  await expect(skill).toBeAttached();
  await expect(skill).toHaveAttribute("data-band", /^(strong|possible)$/);
  // Probable, not confirmed: the derived requirement set says so.
  await expect(skill).toContainText("not confirmed yet");
  test.info().annotations.push({ type: "free-text-need-band", description: (await free.getAttribute("data-band")) ?? "none" });

  const licence = page.locator(`li[id="opp-${state.licenceNeed}"]`).first();
  await expect(licence).toBeAttached({ timeout: 30_000 });
  const formal = licence.locator('[data-testid="opportunity-formal-requirement"][data-formal-kind="driving_licence"]');
  await expect(formal, "the licence is shown as a formal requirement").toBeAttached();
  await expect(formal, "not met by recorded work").toHaveAttribute("data-standing", "missing_requirement");
  await expect(formal).toContainText("Recorded work does not replace it");

  await expect(page.locator(`li[id="opp-${state.fixtureNeed}"]`), "no fixture need on a real person's board").toHaveCount(0);
  const text = (await page.getByRole("main").textContent()) ?? "";
  expect(text, "no employer free text on the worker board").not.toContain(`${RUN}harbour`);
  await ctx.close();
});

// ════════════════════════════════════════════════════════════════════════════
// MIGRATION PROOF (owner gate, 2026-10-29) — on the SAME throwaway stack.
//
//   G-1 the rollback (twice) restores production's current state: the reader
//       body (pg_get_functiondef md5 = production's), its ACL, the dependent
//       worker-insert policy (command / permissive / roles / WITH CHECK as
//       production deparses it);
//   G-2 in that production-equivalent state, needs of every relevant shape are
//       seeded and the "before" is captured: every customer_requests row
//       (count + md5), the worker reader's rows, and the board's fit per need;
//   G-3 the forward migration is applied TWICE in a row (it is idempotent):
//       no customer_requests row changes, the function / ACL / policy equal the
//       replayed forward state, and no OTHER function or policy changes;
//   G-4 after: old-shape needs keep their fit exactly, the confirmed need
//       changes, every pre-existing reader column is identical; the recreated
//       policy still lets a worker register interest in a visible real need
//       and refuses a synthetic or closed one;
//   G-5 the reader's only SQL dependant is that policy (pg_depend);
// The production-code compatibility walk (job-fit-main-compat-isolated.spec.ts)
// then runs a build of origin/main on this migrated database; it finds these
// needs by their run-unique titles in the local database (no hand-off file).
// ════════════════════════════════════════════════════════════════════════════

const PROD_FN_MD5 = "964b1b5405c59fa9578e4a7a2aefe27b";
const PROD_ACL = "{postgres=X/postgres,authenticated=X/postgres}";
/** production pg_policies.with_check of demand_interest_signals_worker_insert (2026-10-29). */
const PROD_POLICY_CHECK =
  "((worker_id IN ( SELECT w.id\n   FROM workers w\n  WHERE (w.profile_id = auth.uid()))) AND (status = 'interested'::text) AND (((request_id IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM list_open_demand_for_workers() b(id, role_text, country, team_size, start_period, accommodation, created_at, company_name, route_status, location_label, transport, required_tools, structured)\n  WHERE (b.id = demand_interest_signals.request_id)))) OR ((request_id IS NULL) AND (public_vacancy_id IS NOT NULL))))";
const FWD_POLICY_CHECK = PROD_POLICY_CHECK.replace("required_tools, structured)", "required_tools, structured, need_skill_slugs, need_skill_source)");
const MIGRATION_FILE = "../../supabase/migrations/20261029190000_worker_board_need_skill_slugs_v1.sql";
const ROLLBACK_FILE = "../../supabase/rollbacks/20261029190000_worker_board_need_skill_slugs_v1.down.sql";
const FN = "public.list_open_demand_for_workers()";

function sqlRows<T>(query: string): T[] {
  const wrapped = `select coalesce(json_agg(t), '[]'::json) from (${query}) t`;
  const out = execFileSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-tA", "-c", wrapped], { encoding: "utf8" });
  return JSON.parse(out.trim() || "[]") as T[];
}

/** Run one repo SQL file on the local database exactly as apply_migration would: one psql session, stop on error. */
function runFile(relPath: string): void {
  execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], {
    encoding: "utf8",
    input: readFileSync(join(process.cwd(), relPath), "utf8"),
  });
}

type DbState = { fnMd5: string; acl: string; cmd: string; permissive: boolean; roles: string; check: string; others: string };
function dbState(): DbState {
  const [s] = sqlRows<DbState>(`
    select md5(pg_get_functiondef('${FN}'::regprocedure)) as "fnMd5",
           (select proacl::text from pg_proc where oid = '${FN}'::regprocedure) as acl,
           p.polcmd::text as cmd, p.polpermissive as permissive,
           (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r where r.oid = any (p.polroles)) as roles,
           pg_get_expr(p.polwithcheck, p.polrelid) as check,
           md5(coalesce((select string_agg(pg_get_functiondef(f.oid), '|' order by f.oid::regprocedure::text)
                           from pg_proc f join pg_namespace n on n.oid = f.pronamespace
                          where n.nspname = 'public' and f.prokind = 'f' and f.oid <> '${FN}'::regprocedure), '')
               || coalesce((select string_agg(x.policyname || ':' || coalesce(x.qual, '') || ':' || coalesce(x.with_check, '') || ':' || x.roles::text,
                                              '|' order by x.tablename, x.policyname)
                              from pg_policies x
                             where not (x.tablename = 'demand_interest_signals' and x.policyname = 'demand_interest_signals_worker_insert')), '')) as others
      from pg_policy p
     where p.polname = 'demand_interest_signals_worker_insert'`);
  if (!s) throw new Error("the worker-insert policy is missing");
  return s;
}

function requestsFingerprint(): { n: number; md5: string } {
  return sqlRows<{ n: number; md5: string }>(
    `select count(*)::int as n, md5(coalesce(string_agg(t::text, '|' order by t.id), '')) as md5 from public.customer_requests t`,
  )[0]!;
}

/** The board's whole fit reading for one need, as the worker sees it. */
async function fitOf(page: Page, id: string): Promise<string | null> {
  const li = page.locator(`li[id="opp-${id}"]`).first();
  if ((await li.count()) === 0) return null;
  const text = async (testId: string) => {
    const el = li.getByTestId(testId).first();
    return (await el.count()) > 0 ? ((await el.textContent()) ?? "").replace(/\s+/g, " ").trim() : null;
  };
  return JSON.stringify({
    band: await li.getAttribute("data-band"),
    status: await li.getAttribute("data-status"),
    skill: await text("opportunity-skill-match"),
    matched: await text("opportunity-matched-skills"),
    missing: await text("opportunity-missing-skills"),
    tiers: await text("opportunity-match-tiers"),
    formal: await text("opportunity-formal-requirements"),
  });
}

async function boardFits(browser: Browser, ids: readonly string[]): Promise<Record<string, string | null>> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signIn(page, WORKER);
  await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
  await expect(page.locator(`li[id="opp-${state.freeNeed}"]`).first(), "the board rendered").toBeVisible({ timeout: 60_000 });
  const out: Record<string, string | null> = {};
  for (const id of ids) out[id] = await fitOf(page, id);
  await ctx.close();
  return out;
}

/** Clone a stored need (same verified company) with a changed title / summary / payload / status. */
function cloneNeed(fromId: string, patch: { role: string; summary: string; payloadSql: string; status?: string }): string {
  // A top-level INSERT (a data-modifying WITH cannot sit inside the JSON wrapper of sqlRows).
  const id = randomUUID();
  sqlExec(`
    insert into public.customer_requests
    select (jsonb_populate_record(null::public.customer_requests,
              to_jsonb(src) || jsonb_build_object(
                'id', ${lit(id)}::uuid, 'title', ${lit(patch.role)}, 'role_or_work_type', ${lit(patch.role)},
                'need_summary', ${lit(patch.summary)}, 'status', ${lit(patch.status ?? "submitted")},
                'created_at', now(), 'updated_at', now(),
                'payload', ${patch.payloadSql}))).*
      from public.customer_requests src
     where src.id = ${lit(fromId)}`);
  const [row] = sqlRows<{ id: string }>(`select id from public.customer_requests where id = ${lit(id)}`);
  if (!row) throw new Error("the seeded need was not stored");
  return row.id;
}

const before: { state?: DbState; fwd?: DbState; requests?: { n: number; md5: string }; rows?: ReaderRow[]; fits?: Record<string, string | null> } = {};

test("G-1. the rollback (run twice) restores production's current reader, ACL and dependent policy", async () => {
  before.fwd = dbState();
  expect(before.fwd.check, "replayed forward state: the policy reads the widened reader").toBe(FWD_POLICY_CHECK);
  runFile(ROLLBACK_FILE);
  runFile(ROLLBACK_FILE); // idempotent: drop … if exists, create or replace, create policy after its drop
  const s = dbState();
  test.info().annotations.push({ type: "rollback-acl", description: s.acl });
  expect(s.fnMd5, "the reader body equals production's (pg_get_functiondef md5)").toBe(PROD_FN_MD5);
  expect(s.acl, "the reader ACL equals production's").toBe(PROD_ACL);
  expect(s.cmd, "policy command: INSERT").toBe("a");
  expect(s.permissive, "policy: permissive").toBe(true);
  expect(s.roles, "policy role: authenticated").toBe("authenticated");
  expect(s.check, "policy WITH CHECK equals production's deparse").toBe(PROD_POLICY_CHECK);
  expect(s.others, "no other function or policy is touched by the rollback").toBe(before.fwd.others);
  before.state = s;
});

test("G-2. production-equivalent state: needs of every shape are seeded; the before is captured", async ({ browser }) => {
  // Old-shape need (no payload.need_skills — every production need today).
  state.oldNeed = cloneNeed(state.freeNeed, {
    role: `Tiler for bathrooms ${RUN}`,
    summary: "Bathroom renovation work",
    payloadSql: "coalesce(src.payload, '{}'::jsonb) - 'need_skills'",
  });
  // Old-shape need whose company CONFIRMED its requirement set (confirmRecognizedNeed).
  state.confirmedNeed = cloneNeed(state.freeNeed, {
    role: `General site help ${RUN}`,
    summary: "Help on site",
    payloadSql:
      "(coalesce(src.payload, '{}'::jsonb) - 'need_skills') || '{\"structured_need\":{\"skill_slugs\":[\"tiling\",\"waterproofing\"],\"confirmed_by\":\"company\",\"confirmed_at_source\":\"recognized_from_text\"}}'::jsonb",
  });
  // A closed need (never on a board).
  state.closedNeed = cloneNeed(state.freeNeed, {
    role: `Closed tiling need ${RUN}`,
    summary: "Tiling and waterproofing",
    payloadSql: "src.payload",
    status: "closed",
  });
  before.requests = requestsFingerprint();
  before.rows = await rpcAs<ReaderRow[]>(WORKER, "list_open_demand_for_workers");
  expect(Object.keys(before.rows[0] ?? {}), "the production reader has no need-skill columns").not.toContain("need_skill_slugs");
  const ids = before.rows.map((r) => r.id);
  for (const k of ["oldNeed", "confirmedNeed", "freeNeed", "licenceNeed"]) expect(ids, `${k} is visible`).toContain(state[k]);
  for (const k of ["fixtureNeed", "closedNeed"]) expect(ids, `${k} is not visible`).not.toContain(state[k]);
  before.fits = await boardFits(browser, [state.oldNeed, state.confirmedNeed, state.freeNeed, state.licenceNeed]);
  test.info().annotations.push({ type: "fits-before", description: JSON.stringify(before.fits) });
});

test("G-3. the forward migration applied twice in a row: nothing else changes, no row changes", async () => {
  runFile(MIGRATION_FILE);
  runFile(MIGRATION_FILE); // idempotent: it succeeds a second time and lands in the same state
  const s = dbState();
  expect(s.fnMd5, "the reader equals the replayed forward state").toBe(before.fwd!.fnMd5);
  expect(s.acl, "ACL unchanged by the migration").toBe(before.state!.acl);
  expect([s.cmd, s.permissive, s.roles], "policy command / permissive / roles unchanged").toEqual(["a", true, "authenticated"]);
  expect(s.check, "the policy is recreated verbatim (only the reader's column alias list grows)").toBe(FWD_POLICY_CHECK);
  expect(s.others, "no other function or policy changes").toBe(before.state!.others);
  expect(requestsFingerprint(), "no customer_requests row is changed or lost").toEqual(before.requests);
});

test("G-4. after: old needs keep their fit exactly, only confirmed (and newly derived) needs change; the policy still gates interest", async ({ browser }) => {
  const rows = await rpcAs<ReaderRow[]>(WORKER, "list_open_demand_for_workers");
  // Every pre-existing column of every row is identical; the order too.
  const strip = (r: ReaderRow) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => k !== "need_skill_slugs" && k !== "need_skill_source"));
  expect(rows.map(strip), "every pre-existing reader column is unchanged").toEqual(before.rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  expect(byId.get(state.oldNeed)?.need_skill_slugs, "an old-shape need carries no set").toBeNull();
  expect(byId.get(state.confirmedNeed)).toMatchObject({ need_skill_slugs: ["tiling", "waterproofing"], need_skill_source: "human_structured" });

  const after = await boardFits(browser, [state.oldNeed, state.confirmedNeed, state.freeNeed, state.licenceNeed]);
  test.info().annotations.push({ type: "fits-after", description: JSON.stringify(after) });
  expect(after[state.oldNeed], "an old-shape need keeps its fit exactly").toBe(before.fits![state.oldNeed]);
  expect(after[state.confirmedNeed], "the confirmed need changes").not.toBe(before.fits![state.confirmedNeed]);
  expect(JSON.parse(after[state.confirmedNeed]!).band, "…to a real band from the confirmed set").toMatch(/^(strong|possible)$/);
  if (!byId.get(state.licenceNeed)?.need_skill_slugs) {
    expect(after[state.licenceNeed], "a need with no stored set keeps its fit exactly").toBe(before.fits![state.licenceNeed]);
  }

  // The recreated worker-insert policy, exercised under the worker's own token.
  const workerId = state.worker;
  const insert = async (requestId: string) =>
    fetch(`${SB_URL}/rest/v1/demand_interest_signals`, {
      method: "POST",
      headers: {
        apikey: SB_ANON,
        Authorization: `Bearer ${await tokenOf(WORKER)}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ worker_id: workerId, request_id: requestId, status: "interested" }),
    });
  expect((await insert(state.confirmedNeed)).status, "interest in a visible real need is accepted").toBe(201);
  expect((await insert(state.fixtureNeed)).status, "interest in a hidden synthetic need is refused by the policy").toBe(403);
  expect((await insert(state.closedNeed)).status, "interest in a closed need is refused by the policy").toBe(403);
  const stored = sqlRows<{ request_id: string }>(
    `select request_id from public.demand_interest_signals where worker_id = ${lit(workerId)} order by request_id`,
  ).map((r) => r.request_id);
  expect(stored, "only the visible need's interest exists").toEqual([state.confirmedNeed]);
});

test("G-5. the reader's only SQL dependant is the worker-insert policy (pg_depend)", async () => {
  const deps = sqlRows<{ d: string }>(
    `select pg_describe_object(classid, objid, objsubid) as d from pg_depend
      where refobjid = '${FN}'::regprocedure and deptype = 'n' order by 1`,
  ).map((r) => r.d);
  expect(deps).toEqual(["policy demand_interest_signals_worker_insert on table demand_interest_signals"]);
});
