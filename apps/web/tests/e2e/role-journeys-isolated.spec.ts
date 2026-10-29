import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * CROSS-ROLE INTEGRATION JOURNEYS, end to end, on a THROWAWAY LOCAL Supabase
 * stack (.github/workflows/signup-isolated.yml — the same job and the same
 * contract as signup-isolated.spec.ts and agency-roles-isolated.spec.ts). Real
 * browsers, real forms, real server actions; every step is proven in the
 * local database (the page saying "done" is not the proof; the stored rows are):
 *
 *   J-EMP a company signs up, invites a worker by link, the worker registers
 *         through it and is connected; the company posts a need (QA-SYNTHETIC)
 *         and it is stored as submitted;
 *   J-AGY an agency (with a worker on its roster) is connected to the company,
 *         sees the need the company shares with it, proposes its worker; the
 *         company accepts, the worker accepts the booking, and the engagement
 *         row exists for the COMPANY;
 *   J-WRK the company puts the placed worker on its project; the worker records
 *         the day in the Work Journal for that project; the company confirms
 *         it; the confirmation is stored and the Living CV counts it;
 *   J-ISO an unrelated company sees none of it (browser + its own row-level
 *         security); the company ends its employee's membership and the
 *         employee's access goes with it;
 *   J-DUP a double-submitted need and a double-clicked confirmation each store
 *         ONE row.
 *
 * The agency reaches the need through the client's explicit SHARE (Model B,
 * owner decision 2026-09-14). The Model A open-demand board
 * (`list_open_demand_for_agencies` / `mark_agency_can_offer`) has no surface
 * by that decision and is not walked here.
 *
 * It refuses to run anywhere but the local stack: production synthetic
 * accounts are owner-dispatch only (owner decision 2026-10-28), so this spec
 * creates people ONLY in a database that dies with the CI job. A pass here is
 * PASS_CI_ONLY — never a production verification.
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
const email = (who: string) => `journeys.${who}.${RUN}@local.test`;

const CO = email("company"); // the company (client) owner
const EMP = email("employee"); // invited by the company's link
const AG = email("agency"); // the staffing agency owner
const PW = email("placed"); // the agency's roster worker, placed with the company
const OUT = email("outsider"); // an unrelated company owner

const CO_ORG = `QA-SYNTHETIC Journeys Client ${RUN}`;
const AG_ORG = `QA-SYNTHETIC Journeys Agency ${RUN}`;
const OUT_ORG = `QA-SYNTHETIC Journeys Outsider ${RUN}`;
const EMP_NAME = `Synthetic Journey Employee ${RUN}`;
const PW_NAME = `Synthetic Placed Worker ${RUN}`;
const NEED_ROLE = `QA-SYNTHETIC tilers ${RUN}`;
const DUP_ROLE = `QA-SYNTHETIC double submit ${RUN}`;
const OFFER_NOTE = `QA-SYNTHETIC offer ${RUN}: can start on Monday`;
const PROJECT = `QA-SYNTHETIC journey project ${RUN}`;
const ENTRY_MARK = `QA-SYNTHETIC entry ${RUN}`;
const ENTRY = `${ENTRY_MARK}: tiled 14 m2 of bathroom wall, 6 hours`;
const SITE = `QA-SYNTHETIC journey site ${RUN}`;
const ENTRY2_MARK = `QA-SYNTHETIC second entry ${RUN}`;
const ENTRY2 = `${ENTRY2_MARK}: grouted the bathroom floor, 4 hours`;

/** Filled in as the serial walk proves each step. */
const s = {
  coId: "",
  coOrgId: "",
  coCompanyId: "",
  empId: "",
  empEngagementId: "",
  needId: "",
  agOrgId: "",
  agCompanyId: "",
  pwId: "",
  pwWorkerId: "",
  connectionId: "",
  offerId: "",
  bookingId: "",
  projectId: "",
  collabEngagementId: "",
  entryId: "",
};

// ── local helpers (service key: READS the local database only) ─────────────

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
  if (!u) throw new Error(`no auth user for ${address}`);
  return u.id;
}

/** One password grant per person per run (the local auth rate limit counts them). */
const tokens = new Map<string, string>();
async function tokenOf(address: string): Promise<string> {
  const cached = tokens.get(address);
  if (cached) return cached;
  const t = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: address, password: PASSWORD }),
  });
  if (!t.ok) throw new Error(`local sign-in for an RLS read → ${t.status}`);
  const { access_token } = (await t.json()) as { access_token: string };
  tokens.set(address, access_token);
  return access_token;
}

/** A REST read AS a signed-in person (anon key + their own token): what
 *  row-level security lets THEM see. A refusal (401/403) counts as "nothing". */
async function readAs<T>(address: string, path: string): Promise<T[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await tokenOf(address)}` },
  });
  if (r.status === 401 || r.status === 403) return [];
  if (!r.ok) throw new Error(`rls read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T[];
}

const MAIL = "http://127.0.0.1:54324"; // the local stack's mail catcher (Mailpit)

/** The newest link in the newest local mail to `address` (nothing leaves the runner). */
async function lastMailLink(address: string): Promise<string> {
  for (let i = 0; i < 30; i += 1) {
    const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    const list = (await r.json()) as { messages?: Array<{ ID: string }> };
    const id = list.messages?.[0]?.ID;
    if (id) {
      const m = (await (await fetch(`${MAIL}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
      const urls = `${m.Text ?? ""} ${m.HTML ?? ""}`.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
      const link = urls.find((u) => /verify|callback|token/.test(u));
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`no mail for ${address} arrived in the local mail catcher`);
}

// ── people: one browser context per person for the whole walk ──────────────
// A context is created when the person signs up (the sign-up leaves them
// signed in) and reused by every later journey, so the walk never signs the
// same person in twice.

const people = new Map<string, { ctx: BrowserContext; page: Page }>();

async function fresh(browser: Browser, address: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  people.set(address, { ctx, page });
  return page;
}

function as(address: string): Page {
  const p = people.get(address);
  if (!p) throw new Error(`${address} has no session in this walk (an earlier journey failed)`);
  return p.page;
}

test.afterAll(async () => {
  for (const { ctx } of people.values()) await ctx.close().catch(() => {});
});

/** The public sign-up form → the onboarding wizard (Confirm email is OFF locally). */
async function signUp(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/signup`);
  await page.locator('input[type="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
  await expect(page.getByTestId("onboarding-intents")).toBeVisible({ timeout: 30_000 });
}

/** Step 1: what they came for. Step 2: name, country, then submit. */
async function onboard(page: Page, intent: string, displayName: string): Promise<void> {
  await page.getByTestId(`onboarding-intent-${intent}`).click();
  await expect(page.getByTestId(`onboarding-intent-${intent}`)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(displayName);
  await page.getByTestId("onboarding-country").click();
  await page.getByRole("option", { name: /Lithuania/ }).first().click();
  await page.getByTestId("onboarding-submit").click();
}

/** The company setup a fresh employer lands on: name, country, save. */
async function setUpCompany(page: Page, legalName: string): Promise<void> {
  await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
  await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("company-setup-legal-name").fill(legalName);
  await page.getByTestId("company-setup-country").selectOption("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({ timeout: 30_000 });
}

/** The organization (and its company record) a person's setup created. */
async function ownOrg(ownerId: string): Promise<{ orgId: string; companyId: string }> {
  const orgs = await db<Array<{ id: string; legacy_company_id: string | null }>>(
    `organizations?owner_profile_id=eq.${ownerId}&select=id,legacy_company_id`,
  );
  expect(orgs.length, "exactly one organization is created by the setup").toBe(1);
  expect(orgs[0]!.legacy_company_id, "the organization is bound to its company record").toBeTruthy();
  return { orgId: orgs[0]!.id, companyId: orgs[0]!.legacy_company_id! };
}

/** The person proves their mailbox the product's own way (network prompt →
 *  local mail → callback). The database resolves addressed invitations only
 *  for a VERIFIED address (20261003151000_email_verified_boundary_v1). */
async function verifyEmail(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/network`);
  const prompt = page.getByTestId("network-email-unverified");
  await expect(prompt, "a new account is asked to confirm its address").toBeVisible({ timeout: 30_000 });
  await prompt.getByTestId("verify-email-send").click();
  await expect(prompt.getByTestId("verify-email-sent")).toBeVisible({ timeout: 30_000 });
  const proof = await lastMailLink(address);
  await page.goto(proof);
  await page.waitForURL((url) => url.host === new URL(BASE).host && !url.pathname.includes("/auth/callback"), {
    timeout: 60_000,
  });
  await page.goto(`${BASE}/en/dashboard/network`);
  await expect(page.getByTestId("network-email-unverified"), "the address is now proven").toHaveCount(0, {
    timeout: 30_000,
  });
}

/** The company's need intake (the same form S-8 and A-4 walk). */
async function postNeed(page: Page, role: string, opts: { doubleSubmit?: boolean } = {}): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/company/needs?audience=need#demand-intake`);
  const main = page.getByRole("main");
  await main.getByTestId("demand-role").fill(role);
  await main.getByTestId("demand-description").fill(`${role}: two tilers for a 3-week bathroom renovation in Vilnius.`);
  await main.getByTestId("demand-next").click();
  const size = main.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("2");
  await main.getByTestId("demand-next").click();
  if (opts.doubleSubmit) await main.getByTestId("demand-create").dblclick();
  else await main.getByTestId("demand-create").click();
  await expect(main.getByTestId("demand-done"), "the need is accepted").toBeVisible({ timeout: 30_000 });
}

type NeedRow = {
  id: string;
  status: string;
  organization_id: string | null;
  title: string | null;
  role_or_work_type: string | null;
  payload: { role?: string } | null;
};
async function needsNamed(ownerId: string, role: string): Promise<NeedRow[]> {
  const rows = await db<NeedRow[]>(
    `customer_requests?profile_id=eq.${ownerId}&select=id,status,organization_id,title,role_or_work_type,payload`,
  );
  return rows.filter((r) => [r.payload?.role, r.role_or_work_type, r.title].some((v) => (v ?? "").includes(role)));
}

/** Everything the main region renders, read only once the page's own content
 *  has streamed in (an absence check on an empty shell would prove nothing). */
async function mainText(page: Page): Promise<string> {
  const main = page.getByRole("main");
  await expect(main).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  let text = "";
  await expect
    .poll(
      async () => {
        text = ((await main.textContent()) ?? "").replace(/Built together:.*$/s, "").trim();
        return text.length;
      },
      { message: "the page content rendered", timeout: 30_000 },
    )
    .toBeGreaterThan(40);
  return text;
}

/** Open a page's folded "more tools" section (`<details>`) when the hash did
 *  not: the member list (#org-members) lives in the People fold, the sites
 *  (#company-locations) in the Projects fold. */
async function openFold(page: Page, which: "people" | "projects"): Promise<void> {
  const main = page.getByRole("main");
  const fold = (which === "people" ? main.getByTestId("people-more") : main.getByTestId("projects-more")).first();
  await expect(fold).toBeAttached({ timeout: 30_000 });
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  await expect(fold).toHaveAttribute("open", /.*/);
}

/** The worker records a day in the Work Journal against a chosen relationship
 *  and project; returns the stored entry id. */
async function recordWork(page: Page, text: string, mark: string): Promise<string> {
  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  await main.getByTestId("journal-quick-record-text").fill(text);
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  const context = main.getByTestId("worklog-context");
  if (await context.count()) {
    // The placed worker holds two relationships (the agency and the client):
    // the form asks, and the honest answer is the client's collaboration.
    await context.selectOption(s.collabEngagementId);
  }
  const project = main.getByTestId("worklog-project").filter({ visible: true });
  if (await project.count()) await project.last().selectOption(s.projectId);
  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  const done = main.getByTestId("worklog-done");
  await expect(done.or(main.getByTestId("worklog-error")).or(main.getByTestId("worklog-blocked"))).toBeVisible({
    timeout: 30_000,
  });
  await expect(done, "the entry is saved").toBeVisible();
  let id = "";
  await expect
    .poll(
      async () => {
        const rows = await db<Array<{ id: string }>>(
          `journal_entries?original_text=ilike.*${encodeURIComponent(mark)}*&select=id`,
        );
        id = rows[0]?.id ?? "";
        return rows.length;
      },
      { message: "the journal entry is stored once", timeout: 30_000 },
    )
    .toBe(1);
  return id;
}

/** The company approves one entry from its review queue. */
async function approveEntry(page: Page, entryId: string, opts: { doubleClick?: boolean } = {}): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/inbox`);
  const main = page.getByRole("main");
  await expect(main.getByTestId(`inbox-entry-${entryId}`), "the entry waits in the company's queue").toBeVisible({
    timeout: 30_000,
  });
  const approve = main.getByTestId(`journal-approve-entry-${entryId}`);
  if (opts.doubleClick) await approve.dblclick();
  else await approve.click();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ confirmation_scope: { decision?: string } | null }>>(
            `journal_entry_confirmations?entry_id=eq.${entryId}&select=confirmation_scope`,
          )
        ).map((c) => c.confirmation_scope?.decision ?? "?"),
      { message: "the confirmation is stored", timeout: 30_000 },
    )
    .toContain("approved");
}

// ── J-EMP ───────────────────────────────────────────────────────────────────

test("J-EMP. a company signs up, invites a worker by link, the worker joins; the company posts a need", async ({
  browser,
}) => {
  // The company signs up and sets up its organization.
  const co = await fresh(browser, CO);
  await signUp(co, CO);
  await onboard(co, "hire", `Synthetic Journey Owner ${RUN}`);
  await setUpCompany(co, CO_ORG);
  s.coId = await userId(CO);
  ({ orgId: s.coOrgId, companyId: s.coCompanyId } = await ownOrg(s.coId));
  const [company] = await db<Array<{ company_type: string | null; legal_name: string }>>(
    `companies?id=eq.${s.coCompanyId}&select=company_type,legal_name`,
  );
  expect(company?.legal_name).toBe(CO_ORG);
  expect(company?.company_type, "a hiring company, not an agency").not.toBe("staffing_agency");

  // It creates a single-use "join my organization" LINK.
  await co.goto(`${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${s.coOrgId}#network-invite`);
  const panel = co.getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId("invite-type")).toHaveValue("join_organization");
  await panel.getByTestId("invite-mode-link").click();
  await panel.getByTestId("invite-name").fill(EMP_NAME);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed to the company").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  const u = new URL(raw!);
  const link = `${BASE}${u.pathname}${u.search}`; // served locally, same path

  // The worker: a fresh browser, no session, registers through the link.
  const emp = await fresh(browser, EMP);
  await emp.goto(link);
  await emp.getByTestId("invite-register").click();
  await emp.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  await emp.locator('input[type="email"]').fill(EMP);
  await emp.locator('input[name="password"]').fill(PASSWORD);
  const confirm = emp.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await emp.locator('form button[type="submit"]').click();
  await emp.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(emp.url())) await onboard(emp, "work", EMP_NAME);
  await emp.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(emp.url())) {
    const accept = emp.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  s.empId = await userId(EMP);
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ relationship_slug: string; status: string }>>(
            `engagement_contexts?profile_id=eq.${s.empId}&organization_id=eq.${s.coOrgId}&select=relationship_slug,status`,
          )
        ).map((e) => `${e.relationship_slug}:${e.status}`),
      { message: "registering through the link connects the worker to the company", timeout: 30_000 },
    )
    .toContain("employee:active");
  const [eng] = await db<Array<{ id: string }>>(
    `engagement_contexts?profile_id=eq.${s.empId}&organization_id=eq.${s.coOrgId}&relationship_slug=eq.employee&status=eq.active&select=id`,
  );
  s.empEngagementId = eng!.id;
  const invites = await db<Array<{ status: string; accepted_by_profile_id: string | null }>>(
    `invitations?organization_id=eq.${s.coOrgId}&invitation_type=eq.join_organization&select=status,accepted_by_profile_id`,
  );
  expect(
    invites.filter((i) => i.status === "accepted").map((i) => i.accepted_by_profile_id),
    "the link is accepted, by that worker",
  ).toEqual([s.empId]);

  // The company sees its new person on its people door.
  await co.goto(`${BASE}/en/dashboard/company/people`);
  await mainText(co);
  await expect(co.getByRole("main"), "the joined worker is on the company's people door").toContainText(EMP_NAME, {
    timeout: 30_000,
  });

  // The company posts a need — stored as SUBMITTED, for its organization.
  await postNeed(co, NEED_ROLE);
  const needs = await needsNamed(s.coId, NEED_ROLE);
  expect(needs.length, "exactly one need row").toBe(1);
  expect(needs[0]!.status, "the need is stored as submitted").toBe("submitted");
  expect(needs[0]!.organization_id, "for the company's own organization").toBe(s.coOrgId);
  s.needId = needs[0]!.id;
  await co.goto(`${BASE}/en/dashboard/company/needs`);
  await mainText(co);
  await expect(co.getByRole("main"), "the company sees its need").toContainText(NEED_ROLE, { timeout: 30_000 });
});

// ── J-AGY ───────────────────────────────────────────────────────────────────

test("J-AGY. an agency sees the shared need, proposes its worker; the company accepts; the engagement is the company's", async ({
  browser,
}) => {
  expect(s.needId, "J-EMP stored the need").toBeTruthy();

  // The agency signs up and is recorded as a staffing agency.
  const ag = await fresh(browser, AG);
  await signUp(ag, AG);
  await onboard(ag, "agency", `Synthetic Journey Agency Owner ${RUN}`);
  await setUpCompany(ag, AG_ORG);
  const agId = await userId(AG);
  ({ orgId: s.agOrgId, companyId: s.agCompanyId } = await ownOrg(agId));
  const [agCompany] = await db<Array<{ company_type: string }>>(`companies?id=eq.${s.agCompanyId}&select=company_type`);
  expect(agCompany?.company_type).toBe("staffing_agency");

  // The agency's worker signs up and proves their address.
  const pw = await fresh(browser, PW);
  await signUp(pw, PW);
  await onboard(pw, "work", PW_NAME);
  await pw.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  s.pwId = await userId(PW);
  const [worker] = await db<Array<{ id: string }>>(`workers?profile_id=eq.${s.pwId}&select=id`);
  expect(worker?.id, "the worker has a worker record").toBeTruthy();
  s.pwWorkerId = worker!.id;
  await verifyEmail(pw, PW);

  // The agency puts that worker on its roster; the worker accepts.
  await ag.goto(`${BASE}/en/dashboard/company/people#company-team`);
  await ag.getByTestId("company-workers-invite-email").fill(PW);
  await ag.getByTestId("company-workers-invite-submit").click();
  await expect(ag.getByTestId("company-workers-invite-result")).toBeVisible({ timeout: 30_000 });
  // A pending invitation leads the worker's home context panel (W3 row 6).
  await pw.goto(`${BASE}/en/dashboard`);
  const accept = pw.locator(`[data-testid^="worker-invitation-accept-company-"]`).filter({ visible: true }).first();
  await expect(accept, "the worker sees the agency's invitation").toBeVisible({ timeout: 30_000 });
  await accept.click();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ status: string }>>(
            `company_workers?company_id=eq.${s.agCompanyId}&worker_id=eq.${s.pwWorkerId}&select=status`,
          )
        ).map((r) => r.status),
      { message: "the worker is on the agency's roster", timeout: 30_000 },
    )
    .toEqual(["active"]);

  // The company proves its address (an agency connection is accepted only by
  // a verified owner), then the agency connects it as a client.
  const co = as(CO);
  await verifyEmail(co, CO);
  await ag.goto(`${BASE}/en/dashboard/company/partners`);
  await expect(ag.getByTestId("agency-bridge-section")).toBeVisible({ timeout: 30_000 });
  await expect(ag.getByTestId("agency-bridge-gated")).toHaveCount(0);
  await ag.getByTestId("agency-bridge-invite-form").locator('input[name="email"]').fill(CO);
  await ag.getByTestId("agency-bridge-invite-submit").click();
  await expect(ag.getByTestId("agency-bridge-delivery")).toBeVisible({ timeout: 30_000 });
  const conns = await db<Array<{ id: string; status: string }>>(
    `agency_client_connections?agency_company_id=eq.${s.agCompanyId}&select=id,status`,
  );
  expect(conns.length, "one connection is recorded").toBe(1);
  s.connectionId = conns[0]!.id;

  // The company accepts the connection and shares THIS need with the agency.
  await co.goto(`${BASE}/en/dashboard/company/partners`);
  const invite = co.getByTestId("client-bridge-invite-row").filter({ hasText: AG_ORG }).first();
  await expect(invite, "the company sees the agency's invitation").toBeVisible({ timeout: 30_000 });
  await co.getByTestId(`client-bridge-accept-${s.connectionId}`).click();
  const active = co.getByTestId("client-bridge-active-row").filter({ hasText: AG_ORG }).first();
  await expect(active).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ status: string; client_company_id: string | null }>>(
            `agency_client_connections?id=eq.${s.connectionId}&select=status,client_company_id`,
          )
        ).map((c) => `${c.status}:${c.client_company_id}`),
      { message: "the connection is active, for the company", timeout: 30_000 },
    )
    .toEqual([`active:${s.coCompanyId}`]);
  const share = active.getByTestId("client-bridge-share-form");
  await share.locator('select[name="requestId"]').selectOption(s.needId);
  await share.getByTestId("client-bridge-share-submit").click();
  await expect(active.getByTestId("client-bridge-shared-row").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ status: string }>>(
            `agency_client_request_shares?connection_id=eq.${s.connectionId}&request_id=eq.${s.needId}&select=status`,
          )
        ).map((r) => r.status),
      { message: "the need is shared with the agency", timeout: 30_000 },
    )
    .toEqual(["active"]);

  // The agency sees the shared need on its board and proposes its worker.
  await ag.goto(`${BASE}/en/dashboard/company/partners`);
  const row = ag.getByTestId("agency-bridge-shared-row").first();
  await expect(row, "the shared need is on the agency's board").toBeVisible({ timeout: 30_000 });
  const form = row.getByTestId("agency-bridge-offer-form");
  await expect(form, "the roster worker can be proposed").toBeVisible({ timeout: 30_000 });
  await form.locator('select[name="workerId"]').selectOption(s.pwWorkerId);
  await form.locator('input[name="note"]').fill(OFFER_NOTE);
  await form.getByTestId("agency-bridge-offer-submit").click();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ id: string; status: string; client_company_id: string }>>(
            `agency_candidate_offers?request_id=eq.${s.needId}&worker_id=eq.${s.pwWorkerId}&select=id,status,client_company_id`,
          )
        ).map((o) => `${o.status}:${o.client_company_id}`),
      { message: "the proposal is stored, addressed to the company", timeout: 30_000 },
    )
    .toEqual([`offered:${s.coCompanyId}`]);
  const [offer] = await db<Array<{ id: string }>>(
    `agency_candidate_offers?request_id=eq.${s.needId}&worker_id=eq.${s.pwWorkerId}&select=id`,
  );
  s.offerId = offer!.id;

  // The company sees the proposal on the need's scouting page and accepts it.
  await co.goto(`${BASE}/en/dashboard/company/scouting?request=${s.needId}`);
  const offers = co.getByTestId("scouting-agency-offers");
  await expect(offers, "the company sees the agency's proposal").toBeVisible({ timeout: 30_000 });
  await expect(offers.getByTestId("scout-offer-status-offered")).toBeVisible();
  await offers.getByTestId(`offer-accept-${s.offerId}`).click();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ status: string; booking_id: string | null }>>(
            `agency_candidate_offers?id=eq.${s.offerId}&select=status,booking_id`,
          )
        ).map((o) => `${o.status}:${o.booking_id ? "booking" : "none"}`),
      { message: "the acceptance is stored and proposes a booking to the worker", timeout: 30_000 },
    )
    .toEqual(["accepted:booking"]);
  const [decided] = await db<Array<{ booking_id: string }>>(`agency_candidate_offers?id=eq.${s.offerId}&select=booking_id`);
  s.bookingId = decided!.booking_id;
  const [booking] = await db<Array<{ status: string; worker_id: string; request_id: string }>>(
    `booking_requests?id=eq.${s.bookingId}&select=status,worker_id,request_id`,
  );
  expect(booking, "the booking addresses the proposed worker for this need").toEqual({
    status: "proposed",
    worker_id: s.pwWorkerId,
    request_id: s.needId,
  });

  // The worker accepts the booking on their own bookings page.
  await pw.goto(`${BASE}/en/dashboard/bookings`);
  const card = pw.getByTestId(`booking-${s.bookingId}`).filter({ visible: true }).first();
  await expect(card, "the worker sees the booking").toBeVisible({ timeout: 30_000 });
  await card.getByTestId("booking-accept-open").click();
  await card.getByTestId("booking-accept-confirm").click();
  await expect
    .poll(
      async () =>
        (await db<Array<{ status: string }>>(`booking_requests?id=eq.${s.bookingId}&select=status`)).map((b) => b.status),
      { message: "the worker's acceptance is stored", timeout: 30_000 },
    )
    .toEqual(["accepted"]);
  const engagements = await db<Array<{ company_id: string; status: string }>>(
    `company_worker_engagements?source_booking_id=eq.${s.bookingId}&select=company_id,status`,
  );
  expect(engagements, "one engagement, for the COMPANY that accepted (not the agency)").toEqual([
    { company_id: s.coCompanyId, status: "active" },
  ]);

  // The agency sees the outcome of its proposal.
  await ag.goto(`${BASE}/en/dashboard/company/partners`);
  await expect(ag.getByTestId("agency-bridge-decision-accepted").first()).toBeVisible({ timeout: 30_000 });
});

// ── J-WRK ───────────────────────────────────────────────────────────────────

test("J-WRK. the placed worker records work on the company's project; the company confirms; the Living CV counts it", async () => {
  expect(s.bookingId, "J-AGY placed the worker").toBeTruthy();
  const co = as(CO);
  const pw = as(PW);

  // The company creates its project…
  await co.goto(`${BASE}/en/dashboard/company/projects/new`);
  const main = co.getByRole("main");
  await main.getByTestId("project-name-input").fill(PROJECT);
  await main.getByTestId("project-create-submit").click();
  const ok = main.getByTestId("project-context-created");
  const err = main.getByTestId("project-create-error");
  await expect(ok.or(err)).toBeVisible({ timeout: 30_000 });
  if (await err.isVisible()) throw new Error(`project not created: ${await err.getAttribute("data-code")}`);
  const projects = await db<Array<{ id: string }>>(`projects?title=eq.${encodeURIComponent(PROJECT)}&select=id`);
  expect(projects.length, "the project is stored once").toBe(1);
  s.projectId = projects[0]!.id;

  // …and puts the placed worker on it (the accepted booking offers them).
  await co.goto(`${BASE}/en/dashboard/projects`);
  const assign = co.getByRole("main").getByTestId("project-assign");
  await expect(assign, "the company's assign form").toBeVisible({ timeout: 30_000 });
  await assign.locator('select[name="project_id"]').selectOption(s.projectId);
  await assign.getByTestId("assign-worker-select").selectOption(s.pwId);
  await assign.locator("#assign-worker-submit").click();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ status: string }>>(
            `project_worker_assignments?project_id=eq.${s.projectId}&worker_id=eq.${s.pwWorkerId}&select=status`,
          )
        ).length,
      { message: "the worker is assigned to the project", timeout: 30_000 },
    )
    .toBe(1);
  // The placement opens the worker's operational relationship with the CLIENT
  // (20260928220000_placement_opens_client_collaboration_v1).
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ id: string }>>(
            `engagement_contexts?profile_id=eq.${s.pwId}&organization_id=eq.${s.coOrgId}&status=eq.active&select=id`,
          )
        ).length,
      { message: "the worker now works with the company (collaborator relationship)", timeout: 30_000 },
    )
    .toBe(1);
  const [collab] = await db<Array<{ id: string; relationship_slug: string }>>(
    `engagement_contexts?profile_id=eq.${s.pwId}&organization_id=eq.${s.coOrgId}&status=eq.active&select=id,relationship_slug`,
  );
  expect(collab?.relationship_slug).toBe("collaborator");
  s.collabEngagementId = collab!.id;

  // The company opens that relationship's journal for review.
  await co.goto(`${BASE}/en/dashboard/company/people#org-members`);
  await openFold(co, "people");
  const toggle = co.getByRole("main").getByTestId(`toggle-review-${s.collabEngagementId}`);
  await expect(toggle, "journal review is offered for the placed worker").toBeVisible({ timeout: 30_000 });
  await toggle.click();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ journal_review_enabled: boolean | null }>>(
            `engagement_contexts?id=eq.${s.collabEngagementId}&select=journal_review_enabled`,
          )
        )[0]?.journal_review_enabled ?? null,
      { message: "review is on for that relationship", timeout: 30_000 },
    )
    .toBe(true);

  // The worker records the day — for the company, on its project.
  s.entryId = await recordWork(pw, ENTRY, ENTRY_MARK);
  const [entry] = await db<Array<{ engagement_context_id: string; project_id: string | null; worker_id: string }>>(
    `journal_entries?id=eq.${s.entryId}&select=engagement_context_id,project_id,worker_id`,
  );
  expect(entry, "the entry belongs to the worker, the company relationship and the project").toEqual({
    engagement_context_id: s.collabEngagementId,
    project_id: s.projectId,
    worker_id: s.pwWorkerId,
  });

  // The company confirms it from its review queue.
  await approveEntry(co, s.entryId);
  const confirmations = await db<Array<{ confirmer_id: string }>>(
    `journal_entry_confirmations?entry_id=eq.${s.entryId}&select=confirmer_id`,
  );
  expect(confirmations.map((c) => c.confirmer_id), "confirmed once, by the company owner").toEqual([s.coId]);

  // The worker sees it confirmed; the Living CV door counts confirmed work.
  await pw.goto(`${BASE}/en/dashboard/journal`);
  await expect(
    pw.getByRole("main").getByTestId(`journal-entry-status-${s.entryId}`).locator('li[data-step="approved"]'),
  ).toHaveCount(1, { timeout: 30_000 });
  await pw.goto(`${BASE}/en/cv`);
  const confirmed = pw.getByTestId("cv-confirmed-work").filter({ visible: true });
  await expect(confirmed, "the Living CV shows confirmed work").toBeVisible({ timeout: 30_000 });
  expect(Number(await confirmed.getAttribute("data-entries"))).toBeGreaterThan(0);
});

// ── J-ISO ───────────────────────────────────────────────────────────────────

test("J-ISO. an unrelated company sees nothing of it; ending the employee's membership ends their access", async ({
  browser,
}) => {
  expect(s.coOrgId && s.needId).toBeTruthy();

  // An unrelated company signs up through the form.
  const out = await fresh(browser, OUT);
  await signUp(out, OUT);
  await onboard(out, "hire", `Synthetic Journey Outsider Owner ${RUN}`);
  await setUpCompany(out, OUT_ORG);

  const secrets = [EMP_NAME, EMP, PW_NAME, PW, NEED_ROLE, OFFER_NOTE, PROJECT, ENTRY_MARK, CO_ORG, AG_ORG];
  for (const path of [
    "/en/dashboard/company/people",
    `/en/dashboard/company/people?org=${s.coOrgId}`,
    "/en/dashboard/company/needs",
    "/en/dashboard/company/partners",
    `/en/dashboard/company/scouting?request=${s.needId}`,
    "/en/dashboard/projects",
    "/en/dashboard/inbox",
  ]) {
    await out.goto(`${BASE}${path}`);
    const text = await mainText(out);
    for (const secret of secrets) expect(text, `${path}: shows nothing of the other company`).not.toContain(secret);
  }

  // Under the outsider's OWN row-level security: zero rows of the company.
  const counts = {
    need: (await readAs(OUT, `customer_requests?id=eq.${s.needId}&select=id`)).length,
    offers: (await readAs(OUT, `agency_candidate_offers?request_id=eq.${s.needId}&select=id`)).length,
    booking: (await readAs(OUT, `booking_requests?id=eq.${s.bookingId}&select=id`)).length,
    engagements: (await readAs(OUT, `company_worker_engagements?company_id=eq.${s.coCompanyId}&select=id`)).length,
    people: (await readAs(OUT, `engagement_contexts?organization_id=eq.${s.coOrgId}&select=id`)).length,
    project: (await readAs(OUT, `projects?id=eq.${s.projectId}&select=id`)).length,
    journal: (await readAs(OUT, `journal_entries?id=eq.${s.entryId}&select=id`)).length,
    confirmations: (await readAs(OUT, `journal_entry_confirmations?entry_id=eq.${s.entryId}&select=id`)).length,
  };
  expect(counts, "the outsider reads none of the company's rows").toEqual({
    need: 0,
    offers: 0,
    booking: 0,
    engagements: 0,
    people: 0,
    project: 0,
    journal: 0,
    confirmations: 0,
  });
  // The control: the company itself, under the same rules, does read them.
  expect((await readAs(CO, `customer_requests?id=eq.${s.needId}&select=id`)).length, "control: own need").toBe(1);
  expect(
    (await readAs(CO, `engagement_contexts?organization_id=eq.${s.coOrgId}&select=id`)).length,
    "control: own people",
  ).toBeGreaterThanOrEqual(2);

  // Revocation. The protected read: a work site of the company, which RLS
  // shows only to its active members and engaged people
  // (work_objects_select → is_org_member_or_engaged_v1). The company adds one.
  const coPage = as(CO);
  await coPage.goto(`${BASE}/en/dashboard/projects#company-locations`);
  await openFold(coPage, "projects");
  const add = coPage.getByRole("main").getByTestId("work-object-add-form");
  await expect(add, "the company's site form").toBeVisible({ timeout: 30_000 });
  await add.locator('input[name="name"]').fill(SITE);
  await add.getByTestId("work-object-add-submit").click();
  let siteId = "";
  await expect
    .poll(
      async () => {
        const rows = await db<Array<{ id: string; organization_id: string }>>(
          `work_objects?name=eq.${encodeURIComponent(SITE)}&select=id,organization_id`,
        );
        siteId = rows[0]?.id ?? "";
        return rows.map((r) => r.organization_id);
      },
      { message: "the site is stored for the company", timeout: 30_000 },
    )
    .toEqual([s.coOrgId]);
  // Before: the employee, with their OWN token, reads it; the outsider does not.
  expect(
    (await readAs(EMP, `work_objects?id=eq.${siteId}&select=id`)).length,
    "before: the employee reads the company's site",
  ).toBe(1);
  expect((await readAs(OUT, `work_objects?id=eq.${siteId}&select=id`)).length, "the outsider never does").toBe(0);

  const co = as(CO);
  await co.goto(`${BASE}/en/dashboard/company/people#org-members`);
  await openFold(co, "people");
  const main = co.getByRole("main");
  await main.getByTestId(`remove-member-${s.empEngagementId}`).click();
  await main.getByTestId(`remove-reason-${s.empEngagementId}`).fill(`QA-SYNTHETIC ${RUN}: contract ended`);
  await main.getByTestId(`confirm-remove-${s.empEngagementId}`).click();
  await expect
    .poll(
      async () =>
        (await db<Array<{ status: string }>>(`engagement_contexts?id=eq.${s.empEngagementId}&select=status`))[0]?.status,
      { message: "the membership is ended (an update, the row stays)", timeout: 30_000 },
    )
    .toBe("ended");
  // After: the SAME token's next request is refused by RLS — access went with
  // the membership, not just the row's status.
  expect(
    await readAs(EMP, `work_objects?id=eq.${siteId}&select=id`),
    "after: the employee no longer reads the company's site",
  ).toEqual([]);
  // The control: the company still reads it.
  expect((await readAs(CO, `work_objects?id=eq.${siteId}&select=id`)).length, "control: the company reads its site").toBe(1);
  // And the journal no longer offers the ended relationship for new work.
  const emp = as(EMP);
  await emp.goto(`${BASE}/en/dashboard/journal`);
  const em = emp.getByRole("main");
  await em.getByTestId("journal-quick-record-text").fill(`QA-SYNTHETIC ${RUN}: after the end, 2 hours`);
  await em.getByTestId("journal-quick-record-understand").click();
  await expect(em.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  const ctxSelect = em.getByTestId("worklog-context");
  if (await ctxSelect.count()) {
    const values = await ctxSelect.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
    expect(values, "the ended relationship is not offered for new work").not.toContain(s.empEngagementId);
  }
});

// ── J-DUP ───────────────────────────────────────────────────────────────────

test("J-DUP. a double-submitted need and a double-clicked confirmation each store one row", async () => {
  expect(s.collabEngagementId, "J-WRK set up the reviewed relationship").toBeTruthy();
  const co = as(CO);

  await postNeed(co, DUP_ROLE, { doubleSubmit: true });
  await co.waitForTimeout(3_000); // let a second submission, if any, land
  const needs = await needsNamed(s.coId, DUP_ROLE);
  expect(needs.length, "a double-submitted need is stored once").toBe(1);

  const pw = as(PW);
  const second = await recordWork(pw, ENTRY2, ENTRY2_MARK);
  await approveEntry(co, second, { doubleClick: true });
  await co.waitForTimeout(3_000); // let a second decision, if any, land
  const confirmations = await db<Array<{ id: string }>>(`journal_entry_confirmations?entry_id=eq.${second}&select=id`);
  expect(confirmations.length, "a double-clicked confirmation is stored once").toBe(1);
});
