import { createHash, randomBytes } from "node:crypto";

import { test, expect, type Browser, type Page } from "@playwright/test";

import { db, dbOk, HAS_LOCAL_STACK, SUPA_SERVICE, SUPA_URL } from "./market-map-db-state";
import { fixtureCompanyOrgId, FIXTURE_PROFILES } from "./fixture-ids";

/**
 * "INVITE TO CLAIM THIS HISTORY" - the whole loop, with TWO real identities and
 * the no-auto-link design held to account (PR #2147).
 *
 *   manager invites a roster name by e-mail          -> an INVITATION, nothing linked
 *   a new account with the SAME name and the SAME     -> inherits NOTHING
 *     e-mail as the invitation signs up
 *   the person accepts the organisation invitation   -> an engagement, still NOTHING
 *   the manager OFFERS the link (existing control)   -> link_proposed, still NOTHING
 *   the person ACCEPTS on their own profile          -> linked (worker_confirmed)
 *                                                       ONLY NOW the history appears
 *
 * Every step is asserted in the UI AND read back from the database. A name and
 * an e-mail address are not an identity: the only thing that moves history is a
 * human decision by the person it is about.
 *
 * LOCAL STACK ONLY. `db()` refuses a non-loopback target; every URL here comes
 * from `SUPABASE_TEST_URL` set by `scripts/e2e-local.ts`, which itself refuses
 * non-local stacks. The spec skips cleanly when that env is absent.
 *
 * SEEDING. The roster person, the import session, the evidence records and the
 * one WITHDRAWN record are written with the LOCAL service role using the exact
 * column set `import-core` writes (hash chain included - the formula is
 * `chainHash` in lib/organization-evidence/fingerprint.ts, re-stated here only
 * because that module is `server-only` and cannot be imported by Playwright).
 * Everything is tagged with a per-run value and removed in `afterAll`.
 */
const HAS = HAS_LOCAL_STACK && !!process.env.SUPABASE_TEST_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PASSWORD = "Pw-claim-qa-1!";
const MANAGER = { email: "dev.company@local.test", password: "password" };

const TAG = randomBytes(4).toString("hex");
const ROSTER_NAME = `Klaim${TAG} Testauskas`;
const OTHER_NAME = `Svetim${TAG} Kitas`;
const THIRD_NAME = `Treci${TAG} Atskiras`;
const INVITEE_EMAIL = `claim.${TAG}@local.test`;
const OTHER_EMAIL = `other.${TAG}@local.test`;
const STRANGER_EMAIL = `stranger.${TAG}@local.test`;

/** Live: 8 + 6.5 = 14.5 h. Withdrawn: 5 h, which must count nowhere. */
const LIVE = [
  { date: "2025-03-10", hours: 8, label: `QA Site A ${TAG}` },
  { date: "2025-03-11", hours: 6.5, label: `QA Site B ${TAG}` },
];
const WITHDRAWN = { date: "2025-03-12", hours: 5, label: `QA Site W ${TAG}` };
const LIVE_HOURS = LIVE.reduce((s, r) => s + r.hours, 0);

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const chainHash = (prev: string | null, fp: string, at: string) =>
  sha(`work-history-chain:v1:${prev ?? ""}:${fp}:${at}`);

async function rows<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const res = await db("GET", path);
  if (!res.ok) throw new Error(`read ${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

async function authAdmin(method: string, path: string, body?: unknown): Promise<Response> {
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error("refusing non-local auth admin call");
  }
  return fetch(`${SUPA_URL}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type Account = { id: string; email: string; jwt: string; workerId: string };
const created: string[] = [];

/** A brand-new person: auth user -> profile (trigger) -> worker row. */
async function createAccount(email: string, fullName: string): Promise<Account> {
  const res = await authAdmin("POST", "admin/users", {
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "worker", locale: "lt" },
  });
  if (!res.ok) throw new Error(`create user ${email}: ${res.status} ${await res.text()}`);
  const id = ((await res.json()) as { id: string }).id;
  created.push(id);
  // The person completes onboarding through the product's own RPC, AS themselves.
  const jwt = await jwtFor(email, PASSWORD);
  const ob = await rpcAsUser(jwt, "complete_onboarding", {
    p_role: "worker",
    p_display_name: fullName,
    p_country: "LT",
    p_role_data: {},
  });
  if (ob.status >= 300) throw new Error(`complete_onboarding ${email}: ${ob.status} ${JSON.stringify(ob.json)}`);
  const w = await rows<{ id: string }>(`workers?profile_id=eq.${id}&select=id`);
  if (w.length !== 1) throw new Error(`worker row missing for ${email}`);
  return { id, email, jwt, workerId: w[0].id };
}

async function jwtFor(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** A PostgREST call AS a person (their JWT, their RLS) - never the service role. */
async function asUser(
  jwt: string,
  method: "GET" | "PATCH",
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function rpcAsUser(jwt: string, fn: string, args: unknown) {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function loginUi(browser: Browser, creds: { email: string; password: string }): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 90_000, waitUntil: "domcontentloaded" });
  return page;
}

/** What the person's three history surfaces say, read from the rendered DOM. */
async function settle(page: Page, anchor?: string) {
  // An "absent" assertion is only worth anything on a page that finished
  // rendering: wait for a known anchor, then for the network to go quiet.
  if (anchor) await expect(page.locator(anchor).first()).toBeVisible({ timeout: 120_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
}

async function readSurfaces(page: Page) {
  await page.goto("/lt/dashboard/profile", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 120_000 });
  await settle(page);
  const summary = page.getByTestId("organization-history-summary");
  const profileRecords = (await summary.count()) ? Number(await summary.first().getAttribute("data-records")) : 0;
  // The history disclosure is closed on arrival; open it so its cards are text.
  const disclosure = page.getByTestId("organization-history-disclosure");
  if (await disclosure.count()) {
    await disclosure.locator("summary").first().click();
  }
  const profileText = await page.locator("body").innerText();

  await page.goto("/lt/dashboard/work-in-numbers?period=all", { waitUntil: "domcontentloaded" });
  await settle(page, '[data-testid="work-in-numbers"]');
  const ledger = page.getByTestId("wi-org-records");
  const ledgerHours = (await ledger.count()) ? Number(await ledger.first().getAttribute("data-all-hours")) : null;
  const winText = await page.locator("body").innerText();

  await page.goto("/lt/cv", { waitUntil: "domcontentloaded" });
  await settle(page, '[data-testid="cv-skills"]');
  const cvText = await page.locator("body").innerText();
  return { profileRecords, profileText, ledgerHours, winText, cvText };
}

test.describe.configure({ mode: "serial", timeout: 600_000 });

test.describe("roster claim history - invite, offer, accept (PR #2147)", () => {
  test.skip(!HAS, "local Supabase env absent - run via `pnpm -C apps/web e2e:local` (docs/TESTING.md)");

  let ORG = "";
  let personId = "";
  let otherPersonId = "";
  let thirdPersonId = "";
  let sessionId = "";
  let inviteLink = "";
  let otherInviteLink = "";
  let invitee: Account;
  let stranger: Account;
  let manager: Page;
  let inviteePage: Page;

  test.beforeAll(async () => {
    ORG = await fixtureCompanyOrgId();
    const norm = (n: string) => n.toLowerCase();
    const mk = async (name: string, ref: string) => {
      const r = await dbOk("POST", "organization_people", {
        organization_id: ORG,
        display_name: name,
        normalized_name: norm(name),
        external_ref: `qa-${ref}-${TAG}`,
        relationship_kind: "employee",
        source_note: `roster-claim-history spec ${TAG}`,
        created_by: FIXTURE_PROFILES.company,
      });
      return ((await r.json()) as { id: string }[])[0].id;
    };
    personId = await mk(ROSTER_NAME, "a");
    otherPersonId = await mk(OTHER_NAME, "b");
    thirdPersonId = await mk(THIRD_NAME, "c");

    const s = await dbOk("POST", "evidence_import_sessions", {
      organization_id: ORG,
      source_kind: "manual",
      source_filename: `roster-claim-${TAG}.csv`,
      source_fingerprint: sha(`session:${TAG}`),
      source_language: "lt",
      supplied_by_organization_id: ORG,
      supplier_role: "employer",
      actor_kind: "human",
      created_by: FIXTURE_PROFILES.company,
      notes: `roster-claim-history spec ${TAG}`,
    });
    sessionId = ((await s.json()) as { id: string }[])[0].id;

    let prev: string | null = null;
    const importedAt = new Date().toISOString();
    const recordIds: string[] = [];
    for (const r of [...LIVE, WITHDRAWN]) {
      const fingerprint = sha(`record:${ORG}:${personId}:${r.date}:${r.hours}:${TAG}`);
      const self = chainHash(prev, fingerprint, importedAt);
      const res = await dbOk("POST", "organization_evidence_records", {
        organization_id: ORG,
        organization_person_id: personId,
        activity_kind: "work",
        context_label: r.label,
        activity_date: r.date,
        hours: r.hours,
        original_text: `Darbas ${r.label}`,
        original_language: "lt",
        evidence_state: "LEGACY_IMPORTED",
        supplied_by_organization_id: ORG,
        supplier_role: "employer",
        supplied_by_profile_id: FIXTURE_PROFILES.company,
        imported_by_profile_id: FIXTURE_PROFILES.company,
        imported_at: importedAt,
        session_id: sessionId,
        source_kind: "manual",
        source_filename: `roster-claim-${TAG}.csv`,
        source_fact: { row: r.date },
        derived: {},
        record_fingerprint: fingerprint,
        hash_prev: prev,
        hash_self: self,
      });
      prev = self;
      recordIds.push(((await res.json()) as { id: string }[])[0].id);
    }
    // One live record for the SECOND roster name (the stranger scenario).
    {
      const fingerprint = sha(`record:${ORG}:${otherPersonId}:2025-04-01:4:${TAG}`);
      await dbOk("POST", "organization_evidence_records", {
        organization_id: ORG,
        organization_person_id: otherPersonId,
        activity_kind: "work",
        context_label: `QA Site O ${TAG}`,
        activity_date: "2025-04-01",
        hours: 4,
        original_text: `Darbas QA Site O ${TAG}`,
        original_language: "lt",
        evidence_state: "LEGACY_IMPORTED",
        supplied_by_organization_id: ORG,
        supplier_role: "employer",
        supplied_by_profile_id: FIXTURE_PROFILES.company,
        imported_by_profile_id: FIXTURE_PROFILES.company,
        imported_at: importedAt,
        session_id: sessionId,
        source_kind: "manual",
        source_filename: `roster-claim-${TAG}.csv`,
        source_fact: { row: "other" },
        derived: {},
        record_fingerprint: fingerprint,
        hash_prev: prev,
        hash_self: chainHash(prev, fingerprint, importedAt),
      });
    }
    // The WITHDRAWN one: an append-only lifecycle event, exactly as the
    // withdrawal control writes it.
    await dbOk("POST", "organization_evidence_events", {
      organization_id: ORG,
      record_id: recordIds[recordIds.length - 1],
      event_type: "withdrawn",
      actor_profile_id: FIXTURE_PROFILES.company,
      note: `spec ${TAG}`,
    });
  });

  test.afterAll(async () => {
    // Best effort, tag-scoped. Events/records go with the people's session.
    for (const q of [
      `organization_evidence_records?session_id=eq.${sessionId}`,
      `evidence_import_sessions?id=eq.${sessionId}`,
      `organization_people?source_note=eq.${encodeURIComponent(`roster-claim-history spec ${TAG}`)}`,
      `invitations?invited_email=in.(${[INVITEE_EMAIL, OTHER_EMAIL].join(",")})`,
    ]) {
      if (q.endsWith("eq.")) continue;
      await db("DELETE", q).catch(() => undefined);
    }
    for (const id of created) {
      await db("DELETE", `engagement_contexts?profile_id=eq.${id}`).catch(() => undefined);
      await authAdmin("DELETE", `admin/users/${id}`).catch(() => undefined);
    }
    await manager?.context().close().catch(() => undefined);
    await inviteePage?.context().close().catch(() => undefined);
  });

  test("SETUP: the seeded history is real, unlinked and has one withdrawn record", async () => {
    const people = await rows<{ link_state: string; linked_profile_id: string | null }>(
      `organization_people?id=eq.${personId}&select=link_state,linked_profile_id`,
    );
    expect(people[0]).toEqual({ link_state: "unlinked", linked_profile_id: null });
    const recs = await rows(`organization_evidence_records?organization_person_id=eq.${personId}&select=id`);
    expect(recs).toHaveLength(3);
    const ev = await rows(`organization_evidence_events?event_type=eq.withdrawn&organization_id=eq.${ORG}&select=id,note&note=eq.${encodeURIComponent(`spec ${TAG}`)}`);
    expect(ev).toHaveLength(1);
  });

  test("1. manager invites the roster name to claim - an invitation, nothing linked", async ({ browser }, testInfo) => {
    manager = await loginUi(browser, MANAGER);
    await manager.goto("/lt/dashboard/company/people", { waitUntil: "domcontentloaded" });
    const row = manager.getByTestId(`organization-roster-person-${personId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row).toContainText(ROSTER_NAME);

    await manager.getByTestId(`roster-claim-email-${personId}`).fill(INVITEE_EMAIL);
    await manager.getByTestId(`roster-claim-invite-${personId}`).locator('button[type="submit"]').click();
    const done = manager.getByTestId(`roster-claim-invited-${personId}`);
    await expect(done).toBeVisible({ timeout: 30_000 });
    const outcome = await done.getAttribute("data-outcome");
    expect(["created", "sent"]).toContain(outcome);
    const link = manager.getByTestId(`roster-claim-link-${personId}`);
    if (await link.count()) inviteLink = await link.inputValue();
    await manager.screenshot({ path: testInfo.outputPath("1-manager-invited.png"), fullPage: true });

    const inv = await rows<Record<string, unknown>>(
      `invitations?invited_email=eq.${encodeURIComponent(INVITEE_EMAIL)}&select=id,invitation_type,organization_id,invited_name,status,inviter_profile_id,relationship_slug`,
    );
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({
      invitation_type: "join_as_employee",
      organization_id: ORG,
      invited_name: ROSTER_NAME,
      status: "pending",
      inviter_profile_id: FIXTURE_PROFILES.company,
    });
    const p = await rows<Record<string, unknown>>(`organization_people?id=eq.${personId}&select=link_state,linked_profile_id,linked_worker_id,link_method`);
    expect(p[0]).toEqual({ link_state: "unlinked", linked_profile_id: null, linked_worker_id: null, link_method: null });

    // Delivery is not configured locally: the link is returned in the UI. If
    // it was delivered instead, fail loudly - the spec needs the token.
    expect(inviteLink, "invite link must be shown when e-mail delivery is not configured").toMatch(/\/invite\//);
  });

  test("2. NEGATIVE: same name + same e-mail inherits nothing", async ({ browser }, testInfo) => {
    invitee = await createAccount(INVITEE_EMAIL, ROSTER_NAME);
    inviteePage = await loginUi(browser, { email: INVITEE_EMAIL, password: PASSWORD });
    const s = await readSurfaces(inviteePage);
    await inviteePage.screenshot({ path: testInfo.outputPath("2-newcomer-cv.png"), fullPage: true });
    expect(s.profileRecords).toBe(0);
    expect(s.ledgerHours).toBeNull();
    for (const t of [s.profileText, s.winText, s.cvText]) {
      for (const r of [...LIVE, WITHDRAWN]) expect(t).not.toContain(r.label);
    }

    // DB / RLS as THEM
    const p = await rows<Record<string, unknown>>(`organization_people?id=eq.${personId}&select=link_state,linked_profile_id`);
    expect(p[0]).toEqual({ link_state: "unlinked", linked_profile_id: null });
    const recs = await asUser(invitee.jwt, "GET", `organization_evidence_records?select=id&organization_id=eq.${ORG}`);
    expect(recs.status).toBe(200);
    expect(recs.json).toEqual([]);
    const evs = await asUser(invitee.jwt, "GET", `organization_evidence_events?select=id&organization_id=eq.${ORG}`);
    expect(evs.json).toEqual([]);
    const ppl = await asUser(invitee.jwt, "GET", `organization_people?select=id&id=eq.${personId}`);
    expect(ppl.json).toEqual([]);
    // and they cannot link themselves by writing: the row is invisible, so 0 rows change
    const selfLink = await asUser(invitee.jwt, "PATCH", `organization_people?id=eq.${personId}`, {
      linked_profile_id: invitee.id,
      linked_worker_id: invitee.workerId,
      link_state: "linked",
      link_method: "worker_confirmed",
    });
    expect(selfLink.json).toEqual([]);
    const after = await rows<Record<string, unknown>>(`organization_people?id=eq.${personId}&select=link_state`);
    expect(after[0].link_state).toBe("unlinked");
  });

  test("3. the person accepts the invitation by its link - engagement, still no history", async ({}, testInfo) => {
    await inviteePage.goto(inviteLink.replace(/^https?:\/\/[^/]+/, ""), { waitUntil: "domcontentloaded" });
    await expect(inviteePage.getByTestId("invite-accept")).toBeVisible({ timeout: 60_000 });
    await expect(inviteePage.getByTestId("invite-addressed-to-other")).toHaveCount(0);
    await inviteePage.screenshot({ path: testInfo.outputPath("3-invite-page.png"), fullPage: true });
    await inviteePage.getByTestId("invite-accept").click();
    await inviteePage.waitForURL((u) => !/\/invite\//.test(u.pathname) || /notice=/.test(u.search), { timeout: 60_000 });

    await expect
      .poll(async () =>
        (await rows(`engagement_contexts?profile_id=eq.${invitee.id}&organization_id=eq.${ORG}&status=eq.active&select=id`)).length,
      )
      .toBe(1);
    const inv = await rows<{ status: string; accepted_by_profile_id: string }>(
      `invitations?invited_email=eq.${encodeURIComponent(INVITEE_EMAIL)}&select=status,accepted_by_profile_id`,
    );
    expect(inv[0]).toMatchObject({ status: "accepted", accepted_by_profile_id: invitee.id });

    const p = await rows<Record<string, unknown>>(`organization_people?id=eq.${personId}&select=link_state,linked_profile_id`);
    expect(p[0]).toEqual({ link_state: "unlinked", linked_profile_id: null });
    const s = await readSurfaces(inviteePage);
    expect(s.profileRecords).toBe(0);
    expect(s.ledgerHours).toBeNull();
    for (const r of [...LIVE, WITHDRAWN]) expect(s.cvText + s.winText + s.profileText).not.toContain(r.label);
    invitee.jwt = await jwtFor(INVITEE_EMAIL, PASSWORD);
    expect((await asUser(invitee.jwt, "GET", `organization_evidence_records?select=id&organization_id=eq.${ORG}`)).json).toEqual([]);
  });

  test("4. the manager offers the link - proposed, the person sees the offer, still no history", async ({}, testInfo) => {
    await manager.goto("/lt/dashboard/company/people", { waitUntil: "domcontentloaded" });
    const sel = manager.getByTestId(`roster-link-worker-${personId}`);
    await expect(sel).toBeVisible({ timeout: 60_000 });
    await sel.selectOption({ value: `${invitee.workerId}:${invitee.id}` });
    await manager.getByTestId(`roster-link-offer-${personId}`).locator('button[type="submit"]').click();
    // The action revalidates the roster, so the row itself flips to "link
    // proposed" (the inline "offered" note is replaced along with the form).
    await expect(
      manager.getByTestId(`organization-roster-person-${personId}`).locator('[data-link-state="link_proposed"]'),
    ).toBeVisible({ timeout: 30_000 });
    await manager.screenshot({ path: testInfo.outputPath("4-manager-offered.png"), fullPage: true });

    const p = await rows<Record<string, unknown>>(
      `organization_people?id=eq.${personId}&select=link_state,linked_profile_id,linked_worker_id,link_method,linked_by`,
    );
    expect(p[0]).toMatchObject({
      link_state: "link_proposed",
      linked_profile_id: invitee.id,
      linked_worker_id: invitee.workerId,
    });
    expect(p[0].link_method).not.toBe("worker_confirmed");

    await inviteePage.goto("/lt/dashboard/profile", { waitUntil: "domcontentloaded" });
    const offer = inviteePage.locator(`[data-testid="roster-link-offer"][data-person-id="${personId}"]`);
    await expect(offer).toBeVisible({ timeout: 60_000 });
    await expect(offer).toContainText(ROSTER_NAME);
    await inviteePage.screenshot({ path: testInfo.outputPath("4-person-sees-offer.png"), fullPage: true });
    const s = await readSurfaces(inviteePage);
    expect(s.profileRecords).toBe(0);
    expect(s.ledgerHours).toBeNull();
    expect((await asUser(invitee.jwt, "GET", `organization_evidence_records?select=id&organization_id=eq.${ORG}`)).json).toEqual([]);
  });

  test("6a. the manager cannot confirm on the person's behalf (42501, subject-consent guard)", async () => {
    // A SECOND roster name, offered to the same person through the manager's own
    // session, then confirmed by the manager - the one write the trigger refuses.
    const mgrJwt = await jwtFor(MANAGER.email, MANAGER.password);
    const offered = await asUser(mgrJwt, "PATCH", `organization_people?id=eq.${thirdPersonId}`, {
      linked_profile_id: invitee.id,
      linked_worker_id: invitee.workerId,
      link_state: "link_proposed",
      link_method: "manager_offer",
    });
    expect(offered.status).toBe(200);
    const forced = await asUser(mgrJwt, "PATCH", `organization_people?id=eq.${thirdPersonId}`, {
      link_state: "linked",
      link_method: "worker_confirmed",
    });
    expect(forced.status).toBe(403);
    expect(JSON.stringify(forced.json)).toContain("42501");
    expect(JSON.stringify(forced.json)).toContain("subject");
    const p = await rows<Record<string, unknown>>(`organization_people?id=eq.${thirdPersonId}&select=link_state,link_method,linked_by`);
    expect(p[0]).toMatchObject({ link_state: "link_proposed", link_method: "manager_offer" });
    expect(p[0].linked_by).toBeNull();
    // The same attempt on the person's REAL pending row, naming the manager as confirmer:
    const real = await asUser(mgrJwt, "PATCH", `organization_people?id=eq.${personId}`, {
      link_state: "linked",
      link_method: "worker_confirmed",
      linked_by: FIXTURE_PROFILES.company,
    });
    expect(real.status).toBe(403);
    const still = await rows<Record<string, unknown>>(`organization_people?id=eq.${personId}&select=link_state`);
    expect(still[0].link_state).toBe("link_proposed");
  });

  test("5. the person accepts on their own profile - ONLY NOW the history appears", async ({}, testInfo) => {
    await inviteePage.goto("/lt/dashboard/profile", { waitUntil: "domcontentloaded" });
    const offer = inviteePage.locator(`[data-testid="roster-link-offer"][data-person-id="${personId}"]`);
    await expect(offer).toBeVisible({ timeout: 60_000 });
    await offer.locator('button[name="decision"][value="accept"]').click();

    await expect
      .poll(async () => (await rows<{ link_state: string }>(`organization_people?id=eq.${personId}&select=link_state`))[0].link_state, { timeout: 30_000 })
      .toBe("linked");
    const p = await rows<Record<string, unknown>>(
      `organization_people?id=eq.${personId}&select=link_state,link_method,linked_by,linked_profile_id,linked_worker_id`,
    );
    expect(p[0]).toMatchObject({
      link_state: "linked",
      link_method: "worker_confirmed",
      linked_by: invitee.id,
      linked_profile_id: invitee.id,
      linked_worker_id: invitee.workerId,
    });

    // RLS now admits the subject branch - to the SUBJECT only.
    const visible = await asUser(invitee.jwt, "GET", `organization_evidence_records?select=id,hours&organization_person_id=eq.${personId}`);
    expect((visible.json as unknown[]).length).toBe(3);

    const s = await readSurfaces(inviteePage);
    await inviteePage.screenshot({ path: testInfo.outputPath("5-person-cv-after-accept.png"), fullPage: true });
    await testInfo.attach("surfaces.txt", {
      body: JSON.stringify({ profileRecords: s.profileRecords, ledgerHours: s.ledgerHours, win: s.winText.slice(0, 3000), cv: s.cvText.slice(0, 3000), profile: s.profileText.slice(0, 4000) }, null, 1),
      contentType: "text/plain",
    });
    // profile: the history summary counts the records the person can see
    expect.soft(s.profileRecords).toBeGreaterThanOrEqual(LIVE.length);
    // Work in Numbers: the organization's ledger equals the LIVE records only
    expect.soft(s.ledgerHours, "Work in Numbers org ledger must exist after the link").not.toBeNull();
    expect.soft(s.ledgerHours).toBe(LIVE_HOURS);
    // the withdrawn record is excluded from every hour figure
    expect.soft(s.ledgerHours).not.toBe(LIVE_HOURS + WITHDRAWN.hours);
    // profile: the live records' cards are there (disclosure opened)
    for (const r of LIVE) expect.soft(s.profileText).toContain(r.label);
    // Living CV: the organization's ledger line carries the LIVE total only
    expect.soft(s.cvText).toContain("Dev Construction");
    expect.soft(s.cvText).toMatch(/14,5 val\./);
    expect.soft(s.cvText).not.toMatch(/19,5/);
    expect.soft(s.winText).not.toMatch(/19,5/);
    // Report (not assert) how the profile presents the withdrawn record.
    testInfo.annotations.push({
      type: "withdrawn-on-profile",
      description: s.profileText.includes(WITHDRAWN.label) ? "listed (marked withdrawn by standing)" : "not listed",
    });
  });

  test("6b. an unrelated account cannot use someone else's invite link to link", async ({ browser }, testInfo) => {
    // A SECOND invitation, for a SECOND roster name, created by the manager UI.
    await manager.goto("/lt/dashboard/company/people", { waitUntil: "domcontentloaded" });
    await manager.getByTestId(`roster-claim-email-${otherPersonId}`).fill(OTHER_EMAIL);
    await manager.getByTestId(`roster-claim-invite-${otherPersonId}`).locator('button[type="submit"]').click();
    const done = manager.getByTestId(`roster-claim-invited-${otherPersonId}`);
    await expect(done).toBeVisible({ timeout: 30_000 });
    otherInviteLink = await manager.getByTestId(`roster-claim-link-${otherPersonId}`).inputValue();

    stranger = await createAccount(STRANGER_EMAIL, `Stranger ${TAG}`);
    const page = await loginUi(browser, { email: STRANGER_EMAIL, password: PASSWORD });
    await page.goto(otherInviteLink.replace(/^https?:\/\/[^/]+/, ""), { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid="invite-accept"], [data-testid="invite-addressed-to-other"], [data-testid="invite-email-mismatch"]').first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: testInfo.outputPath("6-stranger-on-someone-elses-link.png"), fullPage: true });
    // FINDING (documented, pre-existing, not widened by #2147): the invitation
    // primitive treats the token as the only capability. The "addressed to
    // another e-mail" refusal exists for agency-client invitations only, so for
    // a join_as_employee invitation a stranger holding the link is offered
    // "accept". Record what the page does; the security claim below does not
    // depend on it: accepting an invitation is NOT a roster link.
    // Integrated tree (#2155 staff-invitation-email-binding): the stranger gets
    // the mismatch page and NO accept control; the invitation stays pending.
    const strangerSeesMismatch = (await page.getByTestId("invite-email-mismatch").count()) > 0;
    if (strangerSeesMismatch) {
      await expect(page.getByTestId("invite-accept")).toHaveCount(0);
      const still = await rows<{ status: string }>(`invitations?invited_email=eq.${encodeURIComponent(OTHER_EMAIL)}&select=status`);
      expect(still[0].status).toBe("pending");
    }
    const strangerSeesAccept = (await page.getByTestId("invite-accept").count()) > 0;
    testInfo.annotations.push({ type: "stranger-on-token", description: strangerSeesAccept ? "accept offered (token is the only capability)" : "addressed-to-other refusal" });
    if (strangerSeesAccept) {
      await page.getByTestId("invite-accept").click();
      await page.waitForURL((u) => !/\/invite\//.test(u.pathname) || /notice=/.test(u.search), { timeout: 60_000 });
    }

    // Even after the stranger USED the token, NOTHING links: the roster row
    // stays unlinked, the history stays unreadable to them, and they cannot
    // write the link themselves (the manager has not offered, the subject
    // consent gate has not been passed).
    const p = await rows<Record<string, unknown>>(`organization_people?id=eq.${otherPersonId}&select=link_state,linked_profile_id`);
    expect(p[0]).toEqual({ link_state: "unlinked", linked_profile_id: null });
    const patch = await asUser(stranger.jwt, "PATCH", `organization_people?id=eq.${otherPersonId}`, {
      linked_profile_id: stranger.id,
      linked_worker_id: stranger.workerId,
      link_state: "linked",
      link_method: "worker_confirmed",
    });
    expect(patch.json).toEqual([]);
    const strangerRecs = await asUser(stranger.jwt, "GET", `organization_evidence_records?select=id&organization_id=eq.${ORG}`);
    expect(strangerRecs.json).toEqual([]);
    // ... while the history they would be after really exists:
    expect(await rows(`organization_evidence_records?organization_person_id=eq.${otherPersonId}&select=id`)).toHaveLength(1);
    // The one thing that DOES need a second human decision is still absent: no
    // roster row names the stranger.
    expect(await rows(`organization_people?linked_profile_id=eq.${stranger.id}&select=id`)).toEqual([]);
    const s = await readSurfaces(page);
    expect(s.profileRecords).toBe(0);
    expect(s.ledgerHours).toBeNull();
    // and the first person's linked history did not move
    const first = await rows<Record<string, unknown>>(`organization_people?id=eq.${personId}&select=linked_profile_id`);
    expect(first[0].linked_profile_id).toBe(invitee.id);
    await page.context().close();
  });
});
