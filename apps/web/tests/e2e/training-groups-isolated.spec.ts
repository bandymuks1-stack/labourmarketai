import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * TRAINING REACHES THE FOUR OWNER-DECIDED GROUPS — registry 11.8, on a THROWAWAY LOCAL Supabase
 * stack (.github/workflows/signup-isolated.yml, the same job as signup-isolated.spec.ts).
 *
 * Owner decision 2026-11-18: training is assigned to (1) employees / members, (2) interns,
 * (3) learners at a training provider, and (4) lawfully invited external people (collaborator,
 * consultant, freelancer engagements created through the invite flow). Migration
 * 20261118143000_training_assignment_engaged_groups_v1 is replayed by this job's stack.
 *
 *   TG-0 a training provider signs up, sets up its organization and adds two courses;
 *   TG-1 member   — invited as an employee, accepts; assigned through the picker, sees and
 *                   completes the course; the organization reads it done;
 *   TG-2 intern   — the same chain for an `intern` link;
 *   TG-3 learner  — the same chain for a `student` link;
 *   TG-4 external — the same chain for a `collaborator` link;
 *   TG-5 ended    — the organization ends the external person's link: a NEW assignment (a form
 *                   loaded while the link was active) is refused, the picker no longer offers the
 *                   person, the organization still reads the historical assignment and the person
 *                   still reads their own record.
 *
 * Every person is a fresh, run-unique address (`email()`), invited by link and registered through
 * it, so the relationship is the one the invite flow stores. It refuses to run anywhere but the
 * local stack. Outcomes are read back from that local database — the page saying "done" is not the
 * proof. Result class: PASS_CI_ONLY, never LIVE_VERIFIED.
 */

const BASE = process.env.E2E_BASE_URL ?? "";
const SB_URL = process.env.E2E_SUPABASE_URL ?? "";
const SB_SERVICE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+$/;

test.skip(
  process.env.SIGNUP_ISOLATED !== "1" || !LOCAL.test(BASE) || SB_URL !== "http://127.0.0.1:54321" || !SB_SERVICE,
  "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const PASSWORD = "Synthetic-Pass-2026!";
const email = (who: string) => `training.${who}.${RUN}@local.test`;

const OWNER = email("owner");
const ORG = `Synthetic Training Host ${RUN}`;
const COURSE = `Synthetic safety course ${RUN}`;
const FOLLOW_UP = `Synthetic follow-up course ${RUN}`;

type Group = { key: string; relationship: string; address: string; name: string };
const GROUPS = {
  member: { key: "member", relationship: "employee", address: email("member"), name: `Synthetic Employee ${RUN}` },
  intern: { key: "intern", relationship: "intern", address: email("intern"), name: `Synthetic Intern ${RUN}` },
  learner: { key: "learner", relationship: "student", address: email("learner"), name: `Synthetic Learner ${RUN}` },
  external: { key: "external", relationship: "collaborator", address: email("external"), name: `Synthetic Collaborator ${RUN}` },
} satisfies Record<string, Group>;

const s = {
  ownerId: "",
  orgId: "",
  courseId: "",
  followUpId: "",
  people: {} as Record<string, { profileId: string; engagementId: string; assignmentId: string }>,
};
/** Completed rows of COURSE the organization should read — one per finished group chain. */
let completedSoFar = 0;

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

// ── browser helpers (the same real forms as recognition-chain-isolated.spec.ts) ──

async function onboard(page: Page, intent: string, displayName: string): Promise<void> {
  const choice = page.getByTestId(`onboarding-intent-${intent}`);
  if ((await choice.getAttribute("aria-pressed")) !== "true") await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(displayName);
  await page.getByTestId("onboarding-country").click();
  await page.getByRole("option", { name: /Lithuania/ }).first().click();
  await page.getByTestId("onboarding-submit").click();
}

async function signIn(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/login`);
  await page.locator('input[name="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
}

/** One sign-in per person per run: the local auth server limits sign-ins per address and IP. */
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function as(browser: Browser, address: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const saved = sessions.get(address);
  const ctx = await browser.newContext({ timezoneId: "UTC", ...(saved ? { storageState: saved } : {}) });
  const page = await ctx.newPage();
  if (saved) {
    await page.goto(`${BASE}/en/dashboard`);
    await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  } else {
    await signIn(page, address);
  }
  return {
    page,
    close: async () => {
      sessions.set(address, await ctx.storageState());
      await ctx.close();
    },
  };
}

/** Submit a server-action form until the local database holds its result. */
async function submitUntil(button: Locator, stored: () => Promise<boolean>, timeout = 60_000): Promise<void> {
  await expect(async () => {
    if (await stored()) return;
    await button.click({ timeout: 5_000 });
    await expect.poll(stored, { timeout: 10_000 }).toBe(true);
  }).toPass({ timeout });
}

async function register(page: Page): Promise<Locator> {
  await page.goto(`${BASE}/en/dashboard/documents#training`);
  const reg = page.getByTestId("training-register");
  await expect(reg).toBeVisible({ timeout: 60_000 });
  return reg;
}

function courseRow(reg: Locator, title: string): Locator {
  return reg.getByTestId("training-program-row").filter({ hasText: title });
}

type Assignment = { id: string; status: string; organization_id: string; completion_note: string | null };
async function assignmentsOf(profileId: string, programId: string): Promise<Assignment[]> {
  return db<Assignment[]>(
    `training_assignments?assignee_profile_id=eq.${profileId}&program_id=eq.${programId}&select=id,status,organization_id,completion_note`,
  );
}

/** The owner invites one person by link in `relationship`; they register through it and accept. */
async function inviteAndJoin(browser: Browser, g: Group): Promise<void> {
  const owner = await as(browser, OWNER);
  const page = owner.page;
  await page.goto(
    `${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${s.orgId}&relationship=${g.relationship}#network-invite`,
  );
  const panel = page.getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const capacity = panel.getByTestId("invite-capacity");
  const open = panel.getByTestId("invite-panel-open");
  await expect(async () => {
    if (!(await capacity.isVisible().catch(() => false)) && (await open.isVisible().catch(() => false))) {
      await open.click({ timeout: 5_000 });
    }
    await expect(capacity).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(panel.getByTestId("invite-organization")).toHaveValue(s.orgId);
  await capacity.selectOption(g.relationship);
  await expect(capacity).toHaveValue(g.relationship);
  await expect(panel.getByTestId("invite-capacity-blocked")).toHaveCount(0);
  const linkMode = panel.getByTestId("invite-mode-link");
  if (await linkMode.isVisible().catch(() => false)) await linkMode.click();
  const name = panel.getByTestId("invite-name");
  if (await name.isVisible().catch(() => false)) await name.fill(g.name);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed to the organization").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  const u = new URL(raw!);
  const link = `${BASE}${u.pathname}${u.search}`;
  await owner.close();

  // The person: a fresh browser, no session, registers through the link.
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const p = await ctx.newPage();
  await p.goto(link);
  await p.getByTestId("invite-register").click();
  await p.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  const addressed = p.locator('input[aria-describedby="invited-email-note"]');
  if (!(await addressed.isVisible().catch(() => false))) await p.locator('input[type="email"]').fill(g.address);
  await p.locator('input[name="password"]').fill(PASSWORD);
  const confirm = p.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await p.locator('form button[type="submit"]').click();
  await p.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(p.url())) await onboard(p, "work", g.name);
  await p.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(p.url())) {
    const accept = p.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  sessions.set(g.address, await ctx.storageState());
  await ctx.close();

  const profileId = await userId(g.address);
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ relationship_slug: string; status: string }>>(
            `engagement_contexts?profile_id=eq.${profileId}&organization_id=eq.${s.orgId}&select=relationship_slug,status`,
          )
        ).map((e) => `${e.relationship_slug}:${e.status}`),
      { message: `registering through the link stores the ${g.relationship} link`, timeout: 30_000 },
    )
    .toContain(`${g.relationship}:active`);
  const [eng] = await db<Array<{ id: string }>>(
    `engagement_contexts?profile_id=eq.${profileId}&organization_id=eq.${s.orgId}&relationship_slug=eq.${g.relationship}&status=eq.active&select=id`,
  );
  s.people[g.key] = { profileId, engagementId: eng!.id, assignmentId: "" };
}

/** The owner picks the person in the course's picker and assigns. */
async function assignThroughPicker(page: Page, title: string, profileId: string): Promise<Locator> {
  const reg = await register(page);
  const form = courseRow(reg, title).getByTestId("training-assign-form");
  await expect(form).toBeVisible({ timeout: 30_000 });
  const picker = form.getByTestId("training-assign-person");
  await expect(picker.locator(`option[value="${profileId}"]`), "the picker offers this person").toHaveCount(1, {
    timeout: 30_000,
  });
  await picker.selectOption(profileId);
  return form;
}

/** One group's whole chain: assigned through the picker → sees it → completes it → the org reads it done. */
async function groupChain(browser: Browser, g: Group): Promise<void> {
  await inviteAndJoin(browser, g);
  const who = s.people[g.key]!;

  // ASSIGNED, through the picker.
  const owner = await as(browser, OWNER);
  const form = await assignThroughPicker(owner.page, COURSE, who.profileId);
  await submitUntil(form.getByRole("button"), async () => (await assignmentsOf(who.profileId, s.courseId)).length === 1);
  const [row] = await assignmentsOf(who.profileId, s.courseId);
  expect(row!.status, "stored as assigned").toBe("assigned");
  expect(row!.organization_id, "the organization's own record").toBe(s.orgId);
  who.assignmentId = row!.id;
  await owner.close();

  // SEES and COMPLETES it.
  const person = await as(browser, g.address);
  let mine = (await register(person.page)).getByTestId("training-mine-row").filter({ hasText: COURSE });
  await expect(mine, `the ${g.key} sees the course`).toHaveCount(1, { timeout: 30_000 });
  await expect(mine).toContainText("To do");
  const note = `${g.key} ${RUN}: done`;
  await mine.locator('input[name="note"]').fill(note);
  await submitUntil(
    mine.getByRole("button"),
    async () => (await assignmentsOf(who.profileId, s.courseId))[0]?.status === "completed",
  );
  mine = (await register(person.page)).getByTestId("training-mine-row").filter({ hasText: COURSE });
  await expect(mine).toContainText("Done", { timeout: 30_000 });
  await expect(mine).toContainText(note);
  await person.close();

  // The ORGANIZATION reads the completion: one more done row of this course, and the stored record.
  completedSoFar += 1;
  const back = await as(browser, OWNER);
  const done = (await register(back.page))
    .getByTestId("training-managed-row")
    .filter({ hasText: COURSE })
    .filter({ hasText: "Done" });
  await expect(done, `the organization reads the ${g.key}'s completion`).toHaveCount(completedSoFar, { timeout: 30_000 });
  await back.close();
  expect((await assignmentsOf(who.profileId, s.courseId))[0]?.completion_note).toBe(note);
}

// ── TG-0 … TG-5 ──────────────────────────────────────────────────────────────

test("TG-0. a training provider signs up, sets up its organization and adds two courses", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  const door = "/dashboard/start/company?capability=training_provider";
  await page.goto(`${BASE}/en/auth/signup?next=${encodeURIComponent(door)}`);
  await page.locator('input[type="email"]').fill(OWNER);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
  await expect(page.getByTestId("onboarding-intents")).toBeVisible({ timeout: 30_000 });
  await onboard(page, "education", `Synthetic Training Lead ${RUN}`);
  await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
  await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("company-setup-legal-name").fill(ORG);
  await page.getByTestId("company-setup-country").selectOption("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result").or(page.getByTestId("company-setup-next")).first()).toBeVisible({
    timeout: 30_000,
  });
  s.ownerId = await userId(OWNER);
  const orgs = await db<Array<{ id: string }>>(`organizations?owner_profile_id=eq.${s.ownerId}&select=id`);
  expect(orgs, "the organization is stored once").toHaveLength(1);
  s.orgId = orgs[0]!.id;

  for (const title of [COURSE, FOLLOW_UP]) {
    const reg = await register(page);
    const create = reg.getByTestId("training-create-form");
    await expect(create, "the owner may add a course").toBeVisible({ timeout: 30_000 });
    await create.locator('input[name="title"]').fill(title);
    await create.getByRole("button").click();
    // The action answers in the address: `trn=<outcome>`, or a stale-workspace `notice=`.
    await page.waitForURL(/[?&](trn|notice)=/, { timeout: 60_000, waitUntil: "commit" });
    const u = new URL(page.url());
    expect(u.searchParams.get("trn"), `adding "${title}" answered ${u.search}`).toBe("created");
    const stored = await db<Array<{ id: string }>>(
      `training_programs?organization_id=eq.${s.orgId}&title=eq.${encodeURIComponent(title)}&select=id`,
    );
    expect(stored, `"${title}" is stored once in this organization`).toHaveLength(1);
  }
  const programs = await db<Array<{ id: string; title: string }>>(
    `training_programs?organization_id=eq.${s.orgId}&select=id,title`,
  );
  s.courseId = programs.find((p) => p.title === COURSE)!.id;
  s.followUpId = programs.find((p) => p.title === FOLLOW_UP)!.id;
  sessions.set(OWNER, await ctx.storageState());
  await ctx.close();
});

test("TG-1 (member). an employee is assigned through the picker, sees and completes; the organization reads it", async ({
  browser,
}) => {
  test.skip(!s.courseId, "TG-0 did not add the course");
  await groupChain(browser, GROUPS.member);
});

test("TG-2 (intern). an intern is assigned through the picker, sees and completes; the organization reads it", async ({
  browser,
}) => {
  test.skip(!s.courseId, "TG-0 did not add the course");
  await groupChain(browser, GROUPS.intern);
});

test("TG-3 (learner). a learner is assigned through the picker, sees and completes; the organization reads it", async ({
  browser,
}) => {
  test.skip(!s.courseId, "TG-0 did not add the course");
  await groupChain(browser, GROUPS.learner);
});

test("TG-4 (external). an invited collaborator is assigned through the picker, sees and completes; the organization reads it", async ({
  browser,
}) => {
  test.skip(!s.courseId, "TG-0 did not add the course");
  await groupChain(browser, GROUPS.external);
});

test("TG-5 (ended). an ended link takes no new assignment; the history stays readable to the organization and the person", async ({
  browser,
}) => {
  const ext = s.people[GROUPS.external.key];
  test.skip(!ext?.assignmentId, "TG-4 did not complete the external person's course");

  // The owner opens the follow-up course with the person picked — while the link is still active.
  const owner = await as(browser, OWNER);
  const form = await assignThroughPicker(owner.page, FOLLOW_UP, ext!.profileId);

  // Meanwhile the organization ends the link (the people page, the existing audited door).
  const ender = await as(browser, OWNER);
  await ender.page.goto(`${BASE}/en/dashboard/company/people#org-members`);
  const fold = ender.page.getByTestId("people-more");
  await expect(fold).toBeAttached({ timeout: 30_000 });
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  const member = ender.page.getByTestId(`org-member-${ext!.engagementId}`);
  await expect(member, "the external person is listed among the organization's people").toBeVisible({ timeout: 30_000 });
  await member.getByTestId(`remove-member-${ext!.engagementId}`).click();
  await member.getByTestId(`confirm-remove-${ext!.engagementId}`).click();
  await expect
    .poll(
      async () =>
        (await db<Array<{ status: string }>>(`engagement_contexts?id=eq.${ext!.engagementId}&select=status`))[0]?.status,
      { message: "the link is ended", timeout: 30_000 },
    )
    .toBe("ended");
  await ender.close();

  // The form loaded before the end is submitted: the database refuses the NEW assignment.
  await form.getByRole("button").click();
  await owner.page.waitForURL(/[?&]trn=invalid_assignee/, { timeout: 30_000 });
  expect(await assignmentsOf(ext!.profileId, s.followUpId), "no new assignment is stored").toHaveLength(0);

  // The picker no longer offers the person, and the organization still reads the history.
  const reg = await register(owner.page);
  await expect(
    courseRow(reg, FOLLOW_UP).getByTestId("training-assign-form").locator(`option[value="${ext!.profileId}"]`),
    "an ended link is not offered",
  ).toHaveCount(0);
  await expect(
    reg.getByTestId("training-managed-row").filter({ hasText: COURSE }).filter({ hasText: "Done" }),
    "the organization still reads every completed record, the ended person's included",
  ).toHaveCount(4, { timeout: 30_000 });
  await owner.close();
  const [hist] = await assignmentsOf(ext!.profileId, s.courseId);
  expect(hist?.id, "the historical assignment is kept").toBe(ext!.assignmentId);
  expect(hist?.status).toBe("completed");

  // The person still reads their own record, with its course title.
  const person = await as(browser, GROUPS.external.address);
  const mine = (await register(person.page)).getByTestId("training-mine-row").filter({ hasText: COURSE });
  await expect(mine, "the person keeps their own record").toHaveCount(1, { timeout: 30_000 });
  await expect(mine).toContainText("Done");
  await expect(
    (await register(person.page)).getByTestId("training-mine-row").filter({ hasText: FOLLOW_UP }),
    "nothing new reached the person",
  ).toHaveCount(0);
  await person.close();
});
