import { execFileSync } from "node:child_process";

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
