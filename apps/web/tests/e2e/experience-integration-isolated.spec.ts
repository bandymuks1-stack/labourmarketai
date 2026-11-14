import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import {
  BASE,
  PASSWORD,
  SB_ANON,
  SB_SERVICE,
  SB_URL,
  accessToken,
  isolatedStack,
  lit,
  setUpCompany,
  signIn,
  signUp,
  sql,
  stackMailLink,
  userId,
} from "./isolated-web-a-helpers";

/**
 * ONE PERSON, ONE CONTINUOUS PROFESSIONAL HISTORY — across surfaces and
 * organizations (issue #3354, decision 0025), on the THROWAWAY local stack of
 * .github/workflows/signup-isolated.yml. Synthetic people only, created in a
 * database that dies with the CI job; a pass here is PASS_CI_ONLY.
 *
 *   O  owns organization A (real sign-up + company setup) and is a MANAGER of
 *      organization B (a governance seat P offers and O accepts);
 *   P  owns organization B;
 *   W1 is an employee of A only; W2 is an employee of BOTH A and B (each joins
 *      through the organization's own invitation link).
 *   Journal: W1 8 h in A; W2 6 h in A and 5 h in B; O 3 h of own work in A.
 *   Imported history in A: roster person R1 (3 day records, 7 + 6 + 5 h) that
 *   O offers to W1 and W1 confirms on their own profile (worker_confirmed);
 *   roster person R2 (2 records, 4 + 4 h) that stays unlinked.
 *
 * The questions (EX-1..EX-5): leadership is a role WITHOUT hours, workers'
 * hours never land on the owner/manager, the personal CV and Living CV
 * (Work in Numbers) say the same totals, confirmed imported history joins the
 * person's own total, the company's own surfaces show roster people with a
 * person-page link only once confirmed, and another organization sees none of
 * it. Screenshots at 375 / 1440 px go to test-results/experience-integration/
 * and are uploaded by the job as the `experience-integration` artifact.
 *
 * Seeding: everything is done through the product's own forms, except the
 * IMPORTED history rows (organization_people + evidence_import_sessions +
 * organization_evidence_records), which are written with the local service
 * key exactly as integrated-product-chain.spec.ts 6d does — the CSV import UI
 * is not what this walk is about. The LINK is still offered and confirmed
 * through the real UI.
 */

test.skip(!isolatedStack() || !SB_ANON, "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const mail = (who: string) => `experience.${who}.${RUN}@local.test`;
const OUT = join(process.cwd(), "test-results", "experience-integration");

const O = mail("owner-a");
const P = mail("owner-b");
const W1 = mail("worker-one");
const W2 = mail("worker-two");

const ORG_A = `QA-SYNTHETIC Alpha Works ${RUN}`;
const ORG_B = `QA-SYNTHETIC Beta Services ${RUN}`;
const O_NAME = `Synthetic Owner Manager ${RUN}`;
const P_NAME = `Synthetic Owner Beta ${RUN}`;
const W1_NAME = `Synthetic Worker One ${RUN}`;
const W2_NAME = `Synthetic Worker Two ${RUN}`;
const R1_NAME = `Synthetic Roster Linked ${RUN}`;
const R2_NAME = `Synthetic Roster Unlinked ${RUN}`;

/** Journal texts: plain sentences with one stated duration, no "including". */
const MARK = {
  w1a: `QA-SYNTHETIC w1a ${RUN}`,
  w2a: `QA-SYNTHETIC w2a ${RUN}`,
  w2b: `QA-SYNTHETIC w2b ${RUN}`,
  oa: `QA-SYNTHETIC oa ${RUN}`,
};
const TEXT = {
  w1a: `${MARK.w1a}: plastered the hallway walls, 8 hours`,
  w2a: `${MARK.w2a}: painted the stairwell, 6 hours`,
  w2b: `${MARK.w2b}: serviced the boiler room pumps, 5 hours`,
  oa: `${MARK.oa}: priced the next renovation and ordered materials, 3 hours`,
};
const R1_RECORDS = [
  { date: "2025-03-10", hours: 7 },
  { date: "2025-03-11", hours: 6 },
  { date: "2025-03-12", hours: 5 },
] as const;
const R2_RECORDS = [
  { date: "2025-04-07", hours: 4 },
  { date: "2025-04-08", hours: 4 },
] as const;
const R1_HOURS = R1_RECORDS.reduce((s, r) => s + r.hours, 0); // 18
const R2_HOURS = R2_RECORDS.reduce((s, r) => s + r.hours, 0); // 8

const s = {
  oId: "",
  pId: "",
  w1Id: "",
  w2Id: "",
  w1WorkerId: "",
  orgA: "",
  orgB: "",
  r1: "",
  r2: "",
  membershipId: "",
};

// ── people: one browser context per person for the whole walk ──────────────
const people = new Map<string, { ctx: BrowserContext; page: Page }>();
async function fresh(browser: Browser, address: string): Promise<Page> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  people.set(address, { ctx, page });
  return page;
}
function as(address: string): Page {
  const p = people.get(address);
  if (!p) throw new Error("this person has no session in the walk (an earlier step failed)");
  return p.page;
}
test.afterAll(async () => {
  for (const { ctx } of people.values()) await ctx.close().catch(() => {});
});

/** Served locally, same path: the product may print its public origin. */
function local(link: string): string {
  const u = new URL(link);
  return `${BASE}${u.pathname}${u.search}`;
}

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

/** Service-role write on the LOCAL stack — imported history rows only. */
async function seed<T>(table: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SB_SERVICE,
      Authorization: `Bearer ${SB_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`local seed ${table} → ${r.status} ${await r.text()}`);
  return ((await r.json()) as T[])[0]!;
}

/** A REST read AS a signed-in person: what row-level security lets THEM see. */
async function readAs<T>(address: string, path: string): Promise<T[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await accessToken(address)}` },
  });
  if (r.status === 401 || r.status === 403) return [];
  if (!r.ok) throw new Error(`rls read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T[];
}

function ownedOrg(profileId: string): string {
  const orgs = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(profileId)} and organization_type <> 'team'`,
  );
  if (orgs.length !== 1) throw new Error(`expected one owned organization, found ${orgs.length}`);
  return orgs[0]!.id;
}

function engagementId(profileId: string, orgId: string, relationship: string): string {
  const rows = sql<{ id: string }>(
    `select id from public.engagement_contexts
      where profile_id = ${lit(profileId)} and organization_id = ${lit(orgId)}
        and relationship_slug = ${lit(relationship)} and status = 'active'`,
  );
  if (rows.length !== 1) throw new Error(`expected one active ${relationship} engagement, found ${rows.length}`);
  return rows[0]!.id;
}

/** Sign up and onboard through the real wizard; `intents` may be several. */
async function signUpAndOnboard(page: Page, address: string, name: string, intents: readonly string[]): Promise<void> {
  await signUp(page, BASE, address);
  for (const intent of intents) {
    await page.getByTestId(`onboarding-intent-${intent}`).click();
    await expect(page.getByTestId(`onboarding-intent-${intent}`)).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(name);
  await page.getByTestId("onboarding-country").click();
  await page.getByRole("option", { name: /Lithuania/ }).first().click();
  await page.getByTestId("onboarding-submit").click();
}

/** The person proves their mailbox the product's own way (a governance seat is
 *  addressed by e-mail and resolves only for a verified address). */
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

/** The organization's owner mints a single-use "join my organization" link. */
async function joinLink(owner: Page, orgId: string, name: string): Promise<string> {
  await owner.goto(`${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${orgId}#network-invite`);
  const panel = owner.getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId("invite-organization")).toHaveValue(orgId);
  await panel.getByTestId("invite-mode-link").click();
  await panel.getByTestId("invite-name").fill(name);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed to the owner").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  return local(raw!);
}

async function expectEmployee(profileId: string, orgId: string, message: string): Promise<void> {
  await expect
    .poll(
      () =>
        sql<{ n: number }>(
          `select count(*)::int as n from public.engagement_contexts
            where profile_id = ${lit(profileId)} and organization_id = ${lit(orgId)}
              and relationship_slug = 'employee' and status = 'active'`,
        )[0]?.n ?? 0,
      { message, timeout: 30_000 },
    )
    .toBe(1);
}

/** A new person registers through the link and becomes the organization's employee. */
async function registerThroughLink(browser: Browser, link: string, address: string, name: string, orgId: string): Promise<string> {
  const w = await fresh(browser, address);
  await w.goto(link);
  await w.getByTestId("invite-register").click();
  await w.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  await w.locator('input[type="email"]').fill(address);
  await w.locator('input[name="password"]').fill(PASSWORD);
  const confirm = w.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await w.locator('form button[type="submit"]').click();
  await w.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(w.url())) {
    await w.getByTestId("onboarding-intent-work").click();
    await w.getByTestId("onboarding-intents-continue").click();
    await w.getByTestId("onboarding-display-name").fill(name);
    await w.getByTestId("onboarding-country").click();
    await w.getByRole("option", { name: /Lithuania/ }).first().click();
    await w.getByTestId("onboarding-submit").click();
  }
  await w.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(w.url())) {
    const accept = w.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  const id = await userId(address);
  await expectEmployee(id, orgId, "registering through the link makes the person the organization's employee");
  return id;
}

/** One day of work through the journal's own flow, filed under a CHOSEN
 *  relationship; the stored row is checked, not the page's "done". */
async function recordWork(page: Page, profileId: string, text: string, mark: string, engagement: string): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  const box = main.getByTestId("journal-quick-record-text");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await box.fill(text);
  await expect(async () => {
    if (!(await main.getByTestId("worklog-flow").isVisible().catch(() => false))) {
      await main.getByTestId("journal-quick-record-understand").click({ timeout: 5_000 });
    }
    await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  const context = main.getByTestId("worklog-context");
  // Every worker also holds the personal (organization-less) context, so the
  // form asks; the honest answer is the organization the work was done for.
  if (await context.isVisible({ timeout: 10_000 }).catch(() => false)) await context.selectOption(engagement);
  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  const done = main.getByTestId("worklog-done");
  await expect(done.or(main.getByTestId("worklog-error")).or(main.getByTestId("worklog-blocked"))).toBeVisible({
    timeout: 60_000,
  });
  await expect(done, "the journal entry is saved").toBeVisible();
  await expect
    .poll(
      () =>
        sql<{ engagement_context_id: string }>(
          `select engagement_context_id from public.journal_entries
            where worker_id in (select id from public.workers where profile_id = ${lit(profileId)})
              and original_text like ${lit(`%${mark}%`)} and deleted_at is null`,
        ).map((r) => r.engagement_context_id),
      { message: "the entry is stored once, under the chosen relationship", timeout: 30_000 },
    )
    .toEqual([engagement]);
}

/** Imported history: one roster person, one session, chained day records. */
async function seedRosterPerson(
  ownerId: string,
  name: string,
  ref: string,
  records: readonly { date: string; hours: number }[],
): Promise<string> {
  const person = await seed<{ id: string }>("organization_people", {
    organization_id: s.orgA,
    display_name: name,
    normalized_name: name.toLowerCase(),
    external_ref: `qa-${ref}-${RUN}`,
    relationship_kind: "employee",
    source_note: `experience integration ${RUN}`,
    created_by: ownerId,
  });
  const file = `experience-${ref}-${RUN}.csv`;
  const session = await seed<{ id: string }>("evidence_import_sessions", {
    organization_id: s.orgA,
    source_kind: "manual",
    source_filename: file,
    source_fingerprint: sha(`experience-session:${ref}:${RUN}`),
    source_language: "en",
    supplied_by_organization_id: s.orgA,
    supplier_role: "employer",
    actor_kind: "human",
    created_by: ownerId,
    notes: `experience integration ${RUN}`,
  });
  const importedAt = new Date().toISOString();
  let prev: string | null = null;
  for (const r of records) {
    const fingerprint = sha(`experience-record:${s.orgA}:${person.id}:${r.date}:${r.hours}:${RUN}`);
    const self = sha(`work-history-chain:v1:${prev ?? ""}:${fingerprint}:${importedAt}`);
    await seed("organization_evidence_records", {
      organization_id: s.orgA,
      organization_person_id: person.id,
      activity_kind: "work",
      outcome_kind: "hours_worked",
      context_label: `QA-SYNTHETIC history ${ref} ${RUN}`,
      activity_date: r.date,
      hours: r.hours,
      original_text: `Recorded work ${r.date}`,
      original_language: "en",
      evidence_state: "LEGACY_IMPORTED",
      supplied_by_organization_id: s.orgA,
      supplier_role: "employer",
      supplied_by_profile_id: ownerId,
      imported_by_profile_id: ownerId,
      imported_at: importedAt,
      session_id: session.id,
      source_kind: "manual",
      source_filename: file,
      source_fact: { row: r.date },
      derived: {},
      record_fingerprint: fingerprint,
      hash_prev: prev,
      hash_self: self,
    });
    prev = self;
  }
  return person.id;
}

// ── surface readers ─────────────────────────────────────────────────────────

/** The Living CV's numbers page (all time), ready to read. */
async function openWorkInNumbers(page: Page): Promise<Locator> {
  await page.goto(`${BASE}/en/dashboard/work-in-numbers?period=all`);
  const exp = page.getByTestId("wi-experience");
  await expect(exp, "the professional-experience block").toBeAttached({ timeout: 60_000 });
  return exp;
}

function wiOrgRow(exp: Locator, orgId: string): Locator {
  return exp.locator(`[data-testid="wi-experience-org-row"][data-kind="organization"][data-organization="${orgId}"]`);
}

async function openCv(page: Page): Promise<Locator> {
  await page.goto(`${BASE}/en/cv`);
  const main = page.getByRole("main").first();
  await expect(main.getByTestId("cv-skills"), "the CV renders").toBeAttached({ timeout: 60_000 });
  return main;
}

/** The CV's own employment line for one organization (its journal figure). */
function cvHistoryNode(main: Locator, orgName: string): Locator {
  return main.getByTestId("cv-history-node").filter({ hasText: orgName });
}

// ── SETUP ───────────────────────────────────────────────────────────────────

test("EX-0. two organizations, two owners, two workers, the journal, and A's imported history — through the product's own doors", async ({ browser }) => {
  // O: a worker AND a company (one person, both identities), owner of A.
  const o = await fresh(browser, O);
  await signUpAndOnboard(o, O, O_NAME, ["work", "hire"]);
  await setUpCompany(o, ORG_A);
  s.oId = await userId(O);
  s.orgA = ownedOrg(s.oId);
  expect(
    sql<{ n: number }>(`select count(*)::int as n from public.workers where profile_id = ${lit(s.oId)}`)[0]?.n,
    "the owner is also a worker (keeps their own journal)",
  ).toBe(1);

  // P: owner of B.
  const p = await fresh(browser, P);
  await signUpAndOnboard(p, P, P_NAME, ["hire"]);
  await setUpCompany(p, ORG_B);
  s.pId = await userId(P);
  s.orgB = ownedOrg(s.pId);

  // W1 joins A; W2 joins A, then B (already signed in).
  s.w1Id = await registerThroughLink(browser, await joinLink(o, s.orgA, W1_NAME), W1, W1_NAME, s.orgA);
  s.w2Id = await registerThroughLink(browser, await joinLink(o, s.orgA, W2_NAME), W2, W2_NAME, s.orgA);
  const w2 = as(W2);
  await w2.goto(await joinLink(p, s.orgB, W2_NAME));
  await expect(w2.getByTestId("invite-page")).toBeVisible({ timeout: 30_000 });
  await expect(w2.getByTestId("invite-org"), "the invitation names B").toContainText(ORG_B);
  await w2.getByTestId("invite-accept").click();
  await expectEmployee(s.w2Id, s.orgB, "accepting B's link makes W2 B's employee too");
  await expect
    .poll(
      () =>
        sql<{ n: number }>(
          `select count(*)::int as n from public.engagement_contexts
            where profile_id = ${lit(s.w1Id)} and organization_id = ${lit(s.orgB)}`,
        )[0]?.n,
      { message: "W1 has nothing to do with B" },
    )
    .toBe(0);
  s.w1WorkerId = sql<{ id: string }>(`select id from public.workers where profile_id = ${lit(s.w1Id)}`)[0]!.id;

  // The journal.
  await recordWork(as(W1), s.w1Id, TEXT.w1a, MARK.w1a, engagementId(s.w1Id, s.orgA, "employee"));
  await recordWork(w2, s.w2Id, TEXT.w2a, MARK.w2a, engagementId(s.w2Id, s.orgA, "employee"));
  await recordWork(w2, s.w2Id, TEXT.w2b, MARK.w2b, engagementId(s.w2Id, s.orgB, "employee"));
  await recordWork(o, s.oId, TEXT.oa, MARK.oa, engagementId(s.oId, s.orgA, "owner"));

  // A's imported history: R1 (to be linked to W1) and R2 (stays unlinked).
  s.r1 = await seedRosterPerson(s.oId, R1_NAME, "r1", R1_RECORDS);
  s.r2 = await seedRosterPerson(s.oId, R2_NAME, "r2", R2_RECORDS);

  // O OFFERS R1 to W1 on the roster (the people page's import fold).
  await o.goto(`${BASE}/en/dashboard/company/people#people-import-section`);
  const pick = o.getByTestId(`roster-link-worker-${s.r1}`);
  await expect(pick, "the roster row offers the link").toBeAttached({ timeout: 60_000 });
  await pick.selectOption({ value: `${s.w1WorkerId}:${s.w1Id}` });
  await o.getByTestId(`roster-link-offer-${s.r1}`).locator('button[type="submit"]').click();
  await expect(o.getByTestId(`organization-roster-person-${s.r1}`).locator('[data-link-state="link_proposed"]')).toBeAttached({
    timeout: 60_000,
  });

  // W1 CONFIRMS it on their own profile.
  const w1 = as(W1);
  await w1.goto(`${BASE}/en/dashboard/profile`);
  const offer = w1.locator(`[data-testid="roster-link-offer"][data-person-id="${s.r1}"]`);
  await expect(offer, "the offer waits on W1's own profile").toBeVisible({ timeout: 60_000 });
  await offer.locator('button[name="decision"][value="accept"]').click();
  await expect
    .poll(
      () =>
        sql<{ link_state: string; link_method: string | null; linked_profile_id: string | null }>(
          `select link_state, link_method, linked_profile_id from public.organization_people where id = ${lit(s.r1)}`,
        )[0],
      { message: "R1 is linked to W1 by W1's own confirmation", timeout: 60_000 },
    )
    .toEqual({ link_state: "linked", link_method: "worker_confirmed", linked_profile_id: s.w1Id });
  expect(
    sql<{ link_state: string }>(`select link_state from public.organization_people where id = ${lit(s.r2)}`)[0]?.link_state,
  ).toBe("unlinked");

  // P gives O a MANAGER seat in B; O proves the address and accepts it.
  await verifyEmail(o, O);
  await p.goto(`${BASE}/en/dashboard/company/settings#organization-members`);
  const form = p.getByTestId("org-members-invite-form");
  await expect(form, "B's owner administers members").toBeVisible({ timeout: 30_000 });
  await form.getByTestId("org-members-invite-email").fill(O);
  await form.getByTestId("org-members-invite-role").selectOption("manager");
  await form.getByTestId("org-members-invite-submit").click();
  await expect(p.getByTestId("org-members-invite-result")).toBeVisible({ timeout: 30_000 });
  await expect(p.getByTestId("org-members-invite-no-account")).toHaveCount(0);
  const seat = sql<{ id: string; role: string; status: string }>(
    `select id, role, status from public.company_memberships
      where organization_id = ${lit(s.orgB)} and profile_id = ${lit(s.oId)}`,
  );
  expect(seat.map((m) => `${m.role}:${m.status}`), "the seat waits for O's own acceptance").toEqual(["manager:invited"]);
  s.membershipId = seat[0]!.id;
  let panelFound = false;
  for (const path of ["/en/dashboard/start", "/en/dashboard/company/settings"]) {
    await o.goto(`${BASE}${path}`);
    if (await o.getByTestId(`membership-accept-${s.membershipId}`).isVisible({ timeout: 20_000 }).catch(() => false)) {
      panelFound = true;
      break;
    }
  }
  expect(panelFound, "O meets the seat on their own start or settings page").toBe(true);
  await o.getByTestId(`membership-accept-${s.membershipId}`).click();
  await expect(o.getByTestId("membership-invitations-result")).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        sql<{ role: string; status: string }>(
          `select role, status from public.company_memberships where id = ${lit(s.membershipId)}`,
        ).map((m) => `${m.role}:${m.status}`),
      { message: "O is an active manager of B", timeout: 30_000 },
    )
    .toEqual(["manager:active"]);
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.engagement_contexts
        where profile_id = ${lit(s.oId)} and organization_id = ${lit(s.orgB)}
          and relationship_slug in ('employee','freelancer','consultant','collaborator','owner')`,
    )[0]?.n,
    "a manager seat is not a working relationship in B",
  ).toBe(0);
});

// ── EX-1 ────────────────────────────────────────────────────────────────────

test("EX-1. O's CV: A as owner, B as manager (no hours), only O's own 3 h — never W1's or W2's", async () => {
  expect(s.membershipId, "EX-0 set the walk up").toBeTruthy();
  const o = as(O);
  const main = await openCv(o);

  // Leadership: one row per organization, the relationship as a fact.
  const lead = main.getByTestId("organizations-leadership-row");
  await expect(lead.filter({ hasText: ORG_A }), "A is led as owner").toHaveAttribute("data-relationship", "owner");
  await expect(lead.filter({ hasText: ORG_B }), "B is led as manager").toHaveAttribute("data-relationship", "manager");

  // The CV's organizations/roles list: B is a stop with NO hours figure.
  const bStop = main.getByTestId("cv-organization-role").filter({ hasText: ORG_B });
  await expect(bStop, "B is on O's CV as a role").toHaveCount(1);
  const bStopText = ((await bStop.textContent()) ?? "").replace(ORG_B, "");
  expect(bStopText, "a leadership role carries no hours").not.toMatch(/\d\s*h\b/);

  // Hours: O's own journal only.
  await expect(main.getByTestId("cv-recorded-hours")).toContainText(/Recorded work: 3 h from the work journal/);
  await expect(cvHistoryNode(main, ORG_A).getByTestId("cv-history-recorded"), "A's line holds O's own 3 h").toContainText(
    /Work journal: 3 h, 1 entry/,
  );
  await expect(cvHistoryNode(main, ORG_B), "no employment line for B").toHaveCount(0);
  await expect(
    main.getByTestId("cv-professional-experience-total"),
    "no organization hours are attributed to O (the total line only shows when they are)",
  ).toHaveCount(0);
  const text = (await main.textContent()) ?? "";
  for (const mark of [MARK.w1a, MARK.w2a, MARK.w2b, R1_NAME, R2_NAME, W1_NAME, W2_NAME]) {
    expect(text, "nothing of the workers' records on O's CV").not.toContain(mark);
  }

  // The Living CV numbers agree: 3 h in total, 3 h in A, 0 h in B.
  const exp = await openWorkInNumbers(o);
  await expect(exp.getByTestId("wi-experience-total")).toHaveAttribute("data-hours", "3");
  await expect(exp.getByTestId("wi-experience-total")).toHaveAttribute("data-organization-hours", "0");
  await expect(exp.getByTestId("wi-experience-journal")).toHaveAttribute("data-hours", "3");
  await expect(exp.getByTestId("wi-experience-org"), "no organization ledger figure for O").toHaveCount(0);
  await expect(wiOrgRow(exp, s.orgA)).toHaveAttribute("data-hours", "3");
  await expect(wiOrgRow(exp, s.orgB), "B is a role of O's — with zero hours").toHaveAttribute("data-hours", "0");
});

// ── EX-2 ────────────────────────────────────────────────────────────────────

test("EX-2. W2's CV lists A (6 h) and B (5 h), 11 h in total, the same on the CV and the Living CV numbers", async () => {
  const w2 = as(W2);
  const main = await openCv(w2);
  await expect(cvHistoryNode(main, ORG_A).getByTestId("cv-history-recorded")).toContainText(/Work journal: 6 h, 1 entry/);
  await expect(cvHistoryNode(main, ORG_B).getByTestId("cv-history-recorded")).toContainText(/Work journal: 5 h, 1 entry/);
  await expect(main.getByTestId("cv-recorded-hours")).toContainText(/Recorded work: 11 h from the work journal/);
  await expect(main.getByTestId("cv-professional-experience-total"), "W2 has no organization history").toHaveCount(0);
  await expect(main.getByTestId("organizations-leadership-row"), "W2 leads nothing").toHaveCount(0);

  const exp = await openWorkInNumbers(w2);
  await expect(exp.getByTestId("wi-experience-total")).toHaveAttribute("data-hours", "11");
  await expect(exp.getByTestId("wi-experience-journal")).toHaveAttribute("data-hours", "11");
  await expect(wiOrgRow(exp, s.orgA)).toHaveAttribute("data-hours", "6");
  await expect(wiOrgRow(exp, s.orgB)).toHaveAttribute("data-hours", "5");
});

// ── EX-3 ────────────────────────────────────────────────────────────────────

test("EX-3. W1's CV joins the confirmed imported history to the journal: 8 + 18 = 26 h on both surfaces; R2's hours nowhere", async () => {
  const w1 = as(W1);
  const total = 8 + R1_HOURS;
  const main = await openCv(w1);
  const line = main.getByTestId("cv-professional-experience-total");
  await expect(line).toHaveAttribute("data-total-hours", String(total));
  await expect(line).toHaveAttribute("data-journal-hours", "8");
  await expect(line).toHaveAttribute("data-organization-hours", String(R1_HOURS));
  await expect(cvHistoryNode(main, ORG_A).getByTestId("cv-history-recorded")).toContainText(/Work journal: 8 h, 1 entry/);
  await expect(main.getByTestId("cv-recorded-hours")).toContainText(/Recorded work: 8 h from the work journal/);

  const exp = await openWorkInNumbers(w1);
  await expect(exp.getByTestId("wi-experience-total")).toHaveAttribute("data-hours", String(total));
  await expect(exp.getByTestId("wi-experience-total")).toHaveAttribute("data-organization-hours", String(R1_HOURS));
  await expect(exp.getByTestId("wi-experience-journal")).toHaveAttribute("data-hours", "8");
  await expect(exp.getByTestId("wi-experience-org")).toHaveAttribute("data-hours", String(R1_HOURS));
  await expect(wiOrgRow(exp, s.orgA)).toHaveAttribute("data-hours", String(total));
  await expect(wiOrgRow(exp, s.orgB), "W1 has nothing in B").toHaveCount(0);

  // The unlinked person's records reach no worker: not W1 (who confirmed a
  // DIFFERENT roster row), not W2. They stay in A's books only.
  for (const who of [W1, W2]) {
    expect(
      await readAs<{ id: string }>(who, `organization_evidence_records?organization_person_id=eq.${s.r2}&select=id`),
      "R2's records under a worker's own session",
    ).toEqual([]);
  }
  expect(
    await readAs<{ id: string }>(W1, `organization_evidence_records?organization_person_id=eq.${s.r1}&select=id`),
    "W1 reads exactly the records they confirmed",
  ).toHaveLength(R1_RECORDS.length);
  expect(R2_HOURS, "R2's hours exist in A's books").toBeGreaterThan(0);
});

// ── EX-4 ────────────────────────────────────────────────────────────────────

test("EX-4. A's company surfaces: R1 opens W1's own page (confirmed), R2 stays a name without one, W2 is A's person; B sees none of A's records", async () => {
  const o = as(O);

  // The history door, read for A by name.
  await o.goto(`${BASE}/en/dashboard/company/history?org=${s.orgA}`);
  const history = o.getByTestId("company-work-history");
  await expect(history).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  await expect(history, "every imported record of A, linked or not").toHaveAttribute(
    "data-records",
    String(R1_RECORDS.length + R2_RECORDS.length),
  );

  // The roster read back: R1 linked, R2 unlinked, each with A's own card.
  await o.goto(`${BASE}/en/dashboard/company/people#people-import-section`);
  await expect(o.getByTestId(`organization-roster-person-${s.r1}`).locator('[data-link-state="linked"]')).toBeAttached({
    timeout: 60_000,
  });
  await expect(o.getByTestId(`organization-roster-person-${s.r2}`).locator('[data-link-state="unlinked"]')).toBeAttached();
  await expect(o.getByTestId(`organization-roster-person-${s.r2}`)).toContainText(R2_NAME);
  const people = o.getByRole("main");
  await expect(people, "W1 is A's person").toContainText(W1_NAME);
  await expect(people, "W2 is A's person").toContainText(W2_NAME);

  // R1's card: confirmed → a door to W1's own page.
  await o.goto(`${BASE}/en/dashboard/company/people/${s.r1}`);
  const r1 = o.getByTestId("company-person");
  await expect(r1).toHaveAttribute("data-link-state", "linked", { timeout: 60_000 });
  await expect(r1.getByTestId("company-person-name")).toContainText(R1_NAME);
  await expect(r1.getByTestId("company-person-open-profile")).toHaveAttribute(
    "href",
    new RegExp(`/dashboard/people/${s.w1WorkerId}$`),
  );

  // R2's card: the name, the history, and NO person-page link.
  await o.goto(`${BASE}/en/dashboard/company/people/${s.r2}`);
  const r2 = o.getByTestId("company-person");
  await expect(r2).toHaveAttribute("data-link-state", "unlinked", { timeout: 60_000 });
  await expect(r2.getByTestId("company-person-name")).toContainText(R2_NAME);
  await expect(r2.getByTestId("company-person-open-profile"), "an unconfirmed name links to nobody").toHaveCount(0);

  // B: its own history holds none of A's records, and A's cards refuse P.
  const p = as(P);
  await p.goto(`${BASE}/en/dashboard/company/history`);
  const bHistory = p.getByTestId("company-work-history");
  await expect(bHistory, "B has no imported history of its own").toHaveAttribute("data-state", "empty", { timeout: 60_000 });
  const bText = (await p.getByRole("main").textContent()) ?? "";
  for (const secret of [ORG_A, R1_NAME, R2_NAME, W1_NAME]) expect(bText).not.toContain(secret);
  await p.goto(`${BASE}/en/dashboard/company/people/${s.r2}`);
  await expect(p.getByRole("main")).not.toContainText(R2_NAME, { timeout: 30_000 });
  expect(
    await readAs(P, `organization_evidence_records?organization_id=eq.${s.orgA}&select=id`),
    "B's owner reads none of A's records",
  ).toEqual([]);
  expect(await readAs(P, `organization_people?organization_id=eq.${s.orgA}&select=id`), "nor A's roster").toEqual([]);
});

// ── EX-5 ────────────────────────────────────────────────────────────────────

test("EX-5. screenshots at 375 and 1440: O's CV, W2's CV, company A's history", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const shots: { who: string; key: string; path: string }[] = [
    { who: O, key: "cv-owner-manager", path: "/en/cv" },
    { who: W2, key: "cv-worker-two-orgs", path: "/en/cv" },
    { who: O, key: "company-a-history", path: `/en/dashboard/company/history?org=${s.orgA}` },
  ];
  for (const shot of shots) {
    for (const size of [
      { label: "375", viewport: { width: 375, height: 812 } },
      { label: "1440", viewport: { width: 1440, height: 900 } },
    ]) {
      const ctx = await browser.newContext({ viewport: size.viewport, timezoneId: "UTC" });
      await ctx.addInitScript(() => {
        try {
          window.localStorage.setItem("theme", "light");
        } catch {
          /* storage blocked: the page's default theme is captured instead */
        }
      });
      const page = await ctx.newPage();
      try {
        await signIn(page, BASE, shot.who);
        await page.goto(`${BASE}${shot.path}`);
        await expect(page.getByRole("main").first()).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState("networkidle").catch(() => {});
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(over, `${shot.key} ${size.label}: no sideways scrolling`).toBeLessThanOrEqual(1);
        await page.screenshot({ path: join(OUT, `${shot.key}-${size.label}-light.png`), fullPage: true });
      } finally {
        await ctx.close();
      }
    }
  }
});
