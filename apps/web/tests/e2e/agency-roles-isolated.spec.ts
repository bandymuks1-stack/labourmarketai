import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * AGENCY ROLES AND PERMISSIONS, end to end, on a THROWAWAY LOCAL Supabase
 * stack (.github/workflows/signup-isolated.yml — the same job that runs
 * signup-isolated.spec.ts). Real browsers, real forms, real server actions:
 *
 *   A-1 an agency signs up and its organization is recorded as an agency;
 *   A-2 the agency owner invites a person by link, the person registers through
 *       it, and is then given a LIMITED governance seat (member) they accept;
 *   A-3 the member is refused the owner-only surfaces with the product's own
 *       notice; the owner administers members (changes the role to manager)
 *       and the manager is still refused invitation management;
 *   A-4 a person from ANOTHER organization sees none of the agency's people or
 *       needs — in the browser and under their own row-level security;
 *   A-5 the agency sees the person linked to it, never an unlinked worker.
 *
 * It refuses to run anywhere but the local stack: production synthetic
 * accounts are owner-dispatch only (owner decision 2026-10-28), so this spec
 * creates people ONLY in a database that dies with the CI job. Outcomes are
 * checked in that local database (the page saying "done" is not the proof; the
 * stored rows are).
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
test.setTimeout(240_000);

const RUN = Date.now().toString(36);
const PASSWORD = "Synthetic-Pass-2026!";
const email = (who: string) => `agency.${who}.${RUN}@local.test`;

const OWNER = email("owner");
const MEMBER = email("member");
const OUTSIDER = email("outsider");
const UNLINKED = email("unlinked");
const AGENCY_NAME = `Synthetic Roles Agency ${RUN}`;
const MEMBER_NAME = `Synthetic Agency Member ${RUN}`;
const UNLINKED_NAME = `Synthetic Unlinked Worker ${RUN}`;
const AGENCY_NEED = `Agency only need ${RUN}`;

/** Filled in as the serial walk proves each step. */
const state: { orgId: string; membershipId: string; memberId: string } = {
  orgId: "",
  membershipId: "",
  memberId: "",
};

// ── local helpers (service key: reads the local database only) ─────────────

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

/** A REST read AS a signed-in person (anon key + their own token) — what
 *  row-level security lets THEM see, not what the service key sees. */
async function readAs<T>(address: string, path: string): Promise<T> {
  const t = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: address, password: PASSWORD }),
  });
  if (!t.ok) throw new Error(`local sign-in for an RLS read → ${t.status}`);
  const { access_token } = (await t.json()) as { access_token: string };
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${access_token}` },
  });
  if (!r.ok) throw new Error(`rls read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
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

async function signIn(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/login`);
  await page.locator('input[name="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
}

/** A fresh browser context signed in as `address` (no shared cookies). */
async function as(browser: Browser, address: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, address);
  return { page, close: () => ctx.close() };
}

/** Everything the main region renders, folded sections included — read only
 *  once the page's own content has streamed in (until then `main` holds just
 *  the dashboard's quiet credit line, and an absence check would prove
 *  nothing). */
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

// ── A-1 ─────────────────────────────────────────────────────────────────────

test("A-1. an agency signs up through the form; its organization is recorded as a staffing agency", async ({ page }) => {
  await signUp(page, OWNER);
  await onboard(page, "agency", `Synthetic Agency Owner ${RUN}`);
  await setUpCompany(page, AGENCY_NAME);

  const ownerId = await userId(OWNER);
  const orgs = await db<Array<{ id: string; organization_type: string; legacy_company_id: string | null }>>(
    `organizations?owner_profile_id=eq.${ownerId}&select=id,organization_type,legacy_company_id`,
  );
  expect(orgs.length, "exactly one organization is created for the agency").toBe(1);
  const org = orgs[0]!;
  // An agency is a company TYPE (companies.company_type = 'staffing_agency');
  // the organization mirrors the company row (organization-authority.ts).
  expect(["company", "agency"]).toContain(org.organization_type);
  expect(org.legacy_company_id, "the organization is bound to its company record").toBeTruthy();
  const [company] = await db<Array<{ company_type: string; legal_name: string }>>(
    `companies?id=eq.${org.legacy_company_id}&select=company_type,legal_name`,
  );
  expect(company?.company_type, "the agency intent is recorded as a staffing agency").toBe("staffing_agency");
  expect(company?.legal_name).toBe(AGENCY_NAME);
  const owners = await db<Array<{ role: string; status: string }>>(
    `company_memberships?organization_id=eq.${org.id}&profile_id=eq.${ownerId}&select=role,status`,
  );
  expect(owners, "the person who signed up holds the owner seat").toEqual([{ role: "owner", status: "active" }]);
  state.orgId = org.id;

  // The organization's own settings say what it is.
  await page.goto(`${BASE}/en/dashboard/company/settings`);
  await expect(page.getByTestId("company-dashboard-type-note")).toBeVisible({ timeout: 30_000 });
});

// ── A-2 ─────────────────────────────────────────────────────────────────────

test("A-2. the owner invites a person by link; they register through it and accept a limited seat", async ({ browser }) => {
  expect(state.orgId, "A-1 recorded the agency").toBeTruthy();

  // The owner creates a single-use "join my organization" LINK.
  const owner = await as(browser, OWNER);
  await owner.page.goto(
    `${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${state.orgId}#network-invite`,
  );
  const panel = owner.page.getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId("invite-type")).toHaveValue("join_organization");
  await expect(panel.getByTestId("invite-organization")).toHaveValue(state.orgId);
  await panel.getByTestId("invite-mode-link").click();
  await panel.getByTestId("invite-name").fill(MEMBER_NAME);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed to the owner").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  const u = new URL(raw!);
  const link = `${BASE}${u.pathname}${u.search}`; // served locally, same path

  // The invited person: a fresh browser, no session, registers via the link.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link);
  await page.getByTestId("invite-register").click();
  await page.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  await page.locator('input[type="email"]').fill(MEMBER);
  await page.locator('input[name="password"]').fill(PASSWORD);
  const confirm = page.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(page.url())) await onboard(page, "work", MEMBER_NAME);
  await page.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(page.url())) {
    const accept = page.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  state.memberId = await userId(MEMBER);
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ relationship_slug: string; status: string }>>(
            `engagement_contexts?profile_id=eq.${state.memberId}&organization_id=eq.${state.orgId}&select=relationship_slug,status`,
          )
        ).map((e) => `${e.relationship_slug}:${e.status}`),
      { message: "registering through the link connects the person to the agency", timeout: 30_000 },
    )
    .toContain("employee:active");
  const invites = await db<Array<{ status: string; accepted_by_profile_id: string | null }>>(
    `invitations?organization_id=eq.${state.orgId}&invitation_type=eq.join_organization&select=status,accepted_by_profile_id`,
  );
  expect(invites.map((i) => i.accepted_by_profile_id), "the link was used by that person").toContain(state.memberId);

  // A governance seat is addressed by e-mail, and the database resolves only a
  // VERIFIED address (20261003151000_email_verified_boundary_v1: with Confirm
  // email off, a typed address proves nothing). The person proves their
  // mailbox the product's own way: the prompt on the network page → the mail
  // (local catcher) → the callback.
  await page.goto(`${BASE}/en/dashboard/network`);
  const prompt = page.getByTestId("network-email-unverified");
  await expect(prompt, "a new account is asked to confirm its address").toBeVisible({ timeout: 30_000 });
  await prompt.getByTestId("verify-email-send").click();
  await expect(prompt.getByTestId("verify-email-sent")).toBeVisible({ timeout: 30_000 });
  const proof = await lastMailLink(MEMBER);
  await page.goto(proof);
  await page.waitForURL((url) => url.host === new URL(BASE).host && !url.pathname.includes("/auth/callback"), {
    timeout: 60_000,
  });
  await page.goto(`${BASE}/en/dashboard/network`);
  await expect(page.getByTestId("network-email-unverified"), "the address is now proven").toHaveCount(0, {
    timeout: 30_000,
  });

  // The owner gives that person a LIMITED governance seat: member.
  await owner.page.goto(`${BASE}/en/dashboard/company/settings#organization-members`);
  const form = owner.page.getByTestId("org-members-invite-form");
  await expect(form, "the owner administers members").toBeVisible({ timeout: 30_000 });
  await form.getByTestId("org-members-invite-email").fill(MEMBER);
  await form.getByTestId("org-members-invite-role").selectOption("member");
  await form.getByTestId("org-members-invite-submit").click();
  await expect(owner.page.getByTestId("org-members-invite-result")).toBeVisible({ timeout: 30_000 });
  await expect(owner.page.getByTestId("org-members-invite-no-account")).toHaveCount(0);
  const [seat] = await db<Array<{ id: string; role: string; status: string }>>(
    `company_memberships?organization_id=eq.${state.orgId}&profile_id=eq.${state.memberId}&select=id,role,status`,
  );
  expect(seat?.role).toBe("member");
  expect(seat?.status, "the seat waits for the person's own acceptance").toBe("invited");
  state.membershipId = seat!.id;
  await owner.close();

  // The person accepts it from their own start page.
  await page.goto(`${BASE}/en/dashboard/start`);
  await expect(page.getByTestId("membership-invitations-panel")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(`membership-accept-${state.membershipId}`).click();
  await expect(page.getByTestId("membership-invitations-result")).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ role: string; status: string }>>(
            `company_memberships?id=eq.${state.membershipId}&select=role,status`,
          )
        ).map((m) => `${m.role}:${m.status}`),
      { message: "the person is an active member of the agency with the limited role", timeout: 30_000 },
    )
    .toEqual(["member:active"]);
  await ctx.close();
});

// ── A-3 ─────────────────────────────────────────────────────────────────────

/** Stand in the agency's workspace through the header's workspace switch. */
async function enterAgencyWorkspace(page: Page): Promise<void> {
  await page.goto(`${BASE}/en/dashboard`);
  const trigger = page
    .locator('[data-testid="workspace-chip"] button[aria-haspopup="menu"]')
    .filter({ visible: true })
    .first();
  await expect(trigger, "a person in two workspaces gets the switch").toBeVisible({ timeout: 30_000 });
  await trigger.click();
  await expect(page.getByTestId("workspace-chip-menu")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId(`workspace-option-${state.orgId}`).click();
  await expect(page.getByTestId("workspace-switch-failed")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ active_organization_id: string | null }>>(
            `profiles?id=eq.${state.memberId}&select=active_organization_id`,
          )
        )[0]?.active_organization_id ?? null,
      { message: "the switch stores the agency as the active workspace", timeout: 30_000 },
    )
    .toBe(state.orgId);
}

test("A-3. the member is refused owner-only surfaces; the owner administers roles; a manager still cannot invite", async ({ browser }) => {
  expect(state.membershipId, "A-2 created the member seat").toBeTruthy();
  const member = await as(browser, MEMBER);
  await enterAgencyWorkspace(member.page);

  // The People door: a `member` governs nothing — the product says so.
  await member.page.goto(`${BASE}/en/dashboard/company/people`);
  const refusal = member.page.getByTestId("company-membership-entry-notice");
  await expect(refusal, "the member reads the product's refusal notice").toBeVisible({ timeout: 30_000 });
  await expect(refusal).toHaveAttribute("data-reason", "company-not-owned");
  await expect(member.page.getByTestId("company-workers-invite-form")).toHaveCount(0);

  // Settings: the directory is readable (a member belongs) but member
  // management is not offered.
  await member.page.goto(`${BASE}/en/dashboard/company/settings`);
  await expect(member.page.getByTestId("org-members-section")).toBeVisible({ timeout: 30_000 });
  await expect(member.page.getByTestId("company-membership-entry-notice")).toBeVisible();
  await expect(member.page.getByTestId("org-members-invite-form"), "no member administration for a member").toHaveCount(0);
  await expect(member.page.getByTestId(`org-member-role-select-${state.membershipId}`)).toHaveCount(0);

  // The owner CAN administer members: they raise the seat to manager.
  const owner = await as(browser, OWNER);
  await owner.page.goto(`${BASE}/en/dashboard/company/settings#organization-members`);
  await expect(owner.page.getByTestId("org-members-invite-form")).toBeVisible({ timeout: 30_000 });
  await owner.page.getByTestId(`org-member-role-select-${state.membershipId}`).selectOption("manager");
  await owner.page.getByTestId(`org-member-role-save-${state.membershipId}`).click();
  await expect(owner.page.getByTestId("org-members-row-result")).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (await db<Array<{ role: string }>>(`company_memberships?id=eq.${state.membershipId}&select=role`))[0]?.role,
      { message: "the owner's role change is stored", timeout: 30_000 },
    )
    .toBe("manager");
  await owner.close();

  // A manager operates the People door but invitations stay the owner's.
  await member.page.goto(`${BASE}/en/dashboard/company/people`);
  await expect(member.page.getByTestId("company-membership-entry-notice")).toHaveCount(0, { timeout: 30_000 });
  await expect(
    member.page.getByTestId("company-invitations-managed-elsewhere"),
    "the manager is told who handles invitations",
  ).toBeVisible({ timeout: 30_000 });
  await expect(member.page.getByTestId("company-workers-invite-form")).toHaveCount(0);
  await expect(member.page.getByTestId("company-invite-link")).toHaveCount(0);
  await member.page.goto(`${BASE}/en/dashboard/company/settings`);
  await expect(member.page.getByTestId("org-members-section")).toBeVisible({ timeout: 30_000 });
  await expect(member.page.getByTestId("org-members-invite-form"), "no member administration for a manager").toHaveCount(0);
  await member.close();
});

// ── A-4 ─────────────────────────────────────────────────────────────────────

test("A-4. another organization sees none of the agency's people or needs", async ({ browser }) => {
  expect(state.orgId).toBeTruthy();

  // The agency publishes a need of its own.
  const owner = await as(browser, OWNER);
  await owner.page.goto(`${BASE}/en/dashboard/company/needs?audience=need#demand-intake`);
  const main = owner.page.getByRole("main");
  await main.getByTestId("demand-role").fill(AGENCY_NEED);
  await main.getByTestId("demand-description").fill("Three welders for a two-week shipyard job in Klaipeda.");
  await main.getByTestId("demand-next").click();
  const size = main.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("3");
  await main.getByTestId("demand-next").click();
  await main.getByTestId("demand-create").click();
  await expect(main.getByTestId("demand-done")).toBeVisible({ timeout: 30_000 });
  await owner.page.goto(`${BASE}/en/dashboard/company/needs`);
  await mainText(owner.page);
  await expect(owner.page.getByRole("main"), "the agency sees its own need").toContainText(AGENCY_NEED, {
    timeout: 30_000,
  });
  await owner.close();

  // A separate company signs up through the form.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, OUTSIDER);
  await onboard(page, "hire", `Synthetic Outsider Owner ${RUN}`);
  await setUpCompany(page, `Synthetic Outsider Co ${RUN}`);

  for (const path of [
    "/en/dashboard/company/people",
    `/en/dashboard/company/people?org=${state.orgId}`,
    "/en/dashboard/company/settings",
    "/en/dashboard/company/needs",
  ]) {
    await page.goto(`${BASE}${path}`);
    const text = await mainText(page);
    expect(text, `${path}: no agency member`).not.toContain(MEMBER_NAME);
    expect(text, `${path}: no agency member address`).not.toContain(MEMBER);
    expect(text, `${path}: no agency need`).not.toContain(AGENCY_NEED);
    expect(text, `${path}: not the agency's record`).not.toContain(AGENCY_NAME);
  }
  await ctx.close();

  // Under the outsider's OWN row-level security: nothing of the agency.
  const seats = await readAs<unknown[]>(OUTSIDER, `company_memberships?organization_id=eq.${state.orgId}&select=id`);
  expect(seats, "the agency's governance seats are invisible to an outsider").toEqual([]);
  const links = await readAs<unknown[]>(OUTSIDER, `engagement_contexts?organization_id=eq.${state.orgId}&select=id`);
  expect(links, "the agency's people are invisible to an outsider").toEqual([]);
  // The control: the agency owner, under the same rules, does see them.
  const ownSeats = await readAs<unknown[]>(OWNER, `company_memberships?organization_id=eq.${state.orgId}&select=id`);
  expect(ownSeats.length, "the owner reads the agency's own seats").toBeGreaterThanOrEqual(2);
});

// ── A-5 ─────────────────────────────────────────────────────────────────────

test("A-5. the agency sees the person linked to it and never an unlinked worker", async ({ browser }) => {
  expect(state.orgId).toBeTruthy();
  const ctx = await browser.newContext();
  const stranger = await ctx.newPage();
  await signUp(stranger, UNLINKED);
  await onboard(stranger, "work", UNLINKED_NAME);
  await stranger.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  await ctx.close();
  const unlinkedId = await userId(UNLINKED);

  const owner = await as(browser, OWNER);
  await owner.page.goto(`${BASE}/en/dashboard/company/people`);
  const people = await mainText(owner.page);
  await expect(owner.page.getByRole("main"), "the linked person is on the agency's people door").toContainText(
    MEMBER_NAME,
    { timeout: 30_000 },
  );
  expect(people, "an unlinked worker is not").not.toContain(UNLINKED_NAME);
  expect(people).not.toContain(UNLINKED);
  await owner.page.goto(`${BASE}/en/dashboard/company/settings`);
  const settings = await mainText(owner.page);
  expect(settings).not.toContain(UNLINKED_NAME);
  expect(settings).not.toContain(UNLINKED);
  await owner.close();

  // Under the owner's row-level security: no relationship row for the stranger.
  const links = await readAs<unknown[]>(
    OWNER,
    `engagement_contexts?profile_id=eq.${unlinkedId}&select=id`,
  );
  expect(links, "the agency reads no engagement of an unlinked worker").toEqual([]);
  const linked = await readAs<unknown[]>(
    OWNER,
    `engagement_contexts?profile_id=eq.${state.memberId}&organization_id=eq.${state.orgId}&select=id`,
  );
  expect(linked.length, "the control: it reads its own person's engagement").toBeGreaterThan(0);
});
