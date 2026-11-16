import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * A POSITIVE RECOGNITION FROM REAL EVIDENCE — THE WRITE PATH, on a THROWAWAY LOCAL Supabase stack
 * (.github/workflows/signup-isolated.yml, the same job as signup-isolated.spec.ts).
 *
 * Owner 2026-11-14, item 7: "Pripažinimo grandinės bandymo, kuris sukuria nuolatinį žurnalo įrašą,
 * nevykdyti. Parengti saugų izoliuotą testą be produkcijos duomenų užteršimo." Every row at the end
 * of this chain is permanent (a signed-off journal entry offers no delete, a sign-off is append-only,
 * a recognition can only be revoked), so the chain is written HERE, in a database that dies with the
 * job, and the production walk (prod-recognition-chain.spec.ts) only reads.
 *
 *   I-1 an education institution signs up through its own door and its organization trains people;
 *   I-2 it invites a person as a learner by link; the person registers through the link and the
 *       learning relationship is stored;
 *   I-3 the institution switches review on for that learner (the audited manual door — automatic
 *       review is for employees);
 *   I-4 the learner records a practice day in that learning relationship (the real quick record);
 *   I-5 the institution signs it off in its review queue — the confirmation is stored as approved;
 *   I-6 it records a recognition citing THAT signed-off entry, and the stored recognition names the
 *       entry as its evidence and the institution as its assessor;
 *   I-7 the learner sees the recognition among their own.
 *
 * Lane L (owner order 2026-11-16), the rest of the learner's chain, after I-7 so a failure here
 * cannot stop the steps above:
 *   I-8  the institution runs a programme, opens a cohort and places the learner in it;
 *   I-9  a separate employer signs up and invites the same person as an intern; they accept;
 *   I-10 the employer switches review on for the intern (the same audited manual door) —
 *        KNOWN BREAK, test.fail (see INTERN_REVIEW_DOOR_MISSING);
 *   I-11 the learner records a practice day in that intern relationship;
 *   I-12 the employer confirms it — blocked by the same break, test.fail;
 *   I-13 the learner's Living CV (/cv) shows the practice period and the recognition;
 *        I-13b the period stands as employer-confirmed — blocked by the same break, test.fail;
 *   I-14 least privilege: the institution's evidence list does not offer the employer's day;
 *   I-15 EDU-5: a skill the learner accepted reaches the reviewer's learning queue through the
 *        brief's door, and a human decision is recorded.
 *
 * It refuses to run anywhere but the local stack (owner decision 2026-10-28: no synthetic accounts in
 * production). Outcomes are read back from that local database — the page saying "done" is not the
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
const email = (who: string) => `recognition.${who}.${RUN}@local.test`;

const SCHOOL = email("school");
const LEARNER = email("learner");
const SCHOOL_ORG = `Synthetic Recognition College ${RUN}`;
const LEARNER_NAME = `Synthetic Learner ${RUN}`;
// Run-unique words: the entry is found by them, in the database and on the evidence list.
const PRACTICE_MARK = `practice${RUN}`;
const PRACTICE = `Practice day ${PRACTICE_MARK}: built a block partition wall under the master's supervision, 4 hours`;
const RECOGNITION_KEY = `isolated-practice-${RUN}`;
// Lane L (owner order 2026-11-16): programme and cohort, then practice at a separate employer.
const PROGRAM = `Synthetic Programme ${RUN}`;
const COHORT = `Synthetic Cohort ${RUN}`;
const EMPLOYER = email("employer");
const EMPLOYER_ORG = `Synthetic Practice Host ${RUN}`;
const INTERN_MARK = `intern${RUN}`;
const INTERN_PRACTICE = `Intern day ${INTERN_MARK}: assembled shelving units in the warehouse, 3 hours`;
// I-15 (EDU-5) needs a fuzzy catalogue offer. The words after the colon are the recogniser's own
// example of one (qa-testing, lib/journal/journal-recognition.test.ts).
const EDU5_MARK = `edufive${RUN}`;
const EDU5_PRACTICE = `Practice day ${EDU5_MARK}: testavau aplikaciją, radau klaidas, 2 val.`;
const EDU5_SKILL = "qa-testing";

/** learnerId is the profile (auth) id; learnerWorkerId is `workers.id`, which journal rows reference. */
const s = {
  schoolId: "",
  orgId: "",
  learnerId: "",
  learnerWorkerId: "",
  engagementId: "",
  entryId: "",
  employerId: "",
  employerOrgId: "",
  internEngagementId: "",
  internEntryId: "",
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

// ── browser helpers (same real forms as signup-isolated.spec.ts) ───────────

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

/**
 * One sign-in per person per run: later steps reuse that browser session. The local auth server
 * limits sign-ins per address and IP, and the walks in this job share one stack.
 */
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

/** Register through the plain sign-up form (no invitation); ends on onboarding. */
async function signUp(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/signup`);
  await page.locator('input[type="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
  await expect(page.getByTestId("onboarding-intents")).toBeVisible({ timeout: 30_000 });
}

/**
 * Submit a server-action form until the local database holds its result. A click before
 * hydration can be lost; a second click only happens when the first left nothing behind.
 */
async function submitUntil(button: Locator, stored: () => Promise<boolean>, timeout = 60_000): Promise<void> {
  await expect(async () => {
    if (await stored()) return;
    await button.click({ timeout: 5_000 });
    await expect.poll(stored, { timeout: 10_000 }).toBe(true);
  }).toPass({ timeout });
}

/** Click until the expected result shows: a click before hydration is a silent no-op. */
async function clickUntil(target: Locator, result: Locator, timeout = 60_000): Promise<void> {
  await expect(async () => {
    if (!(await result.isVisible().catch(() => false))) await target.click({ timeout: 5_000 });
    await expect(result).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout });
}

/** The institution's recognition form with the learner chosen, so the evidence list is theirs. */
async function recognitionForm(page: Page): Promise<Locator> {
  await page.goto(`${BASE}/en/dashboard/company/education`);
  const form = page.getByTestId("record-recognition");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.locator("summary").click();
  const subject = form.locator('select[name="subjectProfileId"]');
  const options = await subject.locator("option").evaluateAll((os) =>
    (os as HTMLOptionElement[]).filter((o) => o.value).map((o) => ({ v: o.value, t: (o.textContent ?? "").trim() })),
  );
  const pick = options.find((o) => o.v === s.learnerId) ?? options.find((o) => o.t.includes(LEARNER_NAME));
  expect(pick, `the learner is offered as the subject: ${options.map((o) => o.t).join(" | ")}`).toBeTruthy();
  await subject.selectOption(pick!.v);
  return form;
}

// ── I-1 … I-7 ───────────────────────────────────────────────────────────────

test("I-1. an education institution signs up through its own door, and its organization trains people", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  const door = "/dashboard/start/company?capability=training_provider";
  await page.goto(`${BASE}/en/auth/signup?next=${encodeURIComponent(door)}`);
  await page.locator('input[type="email"]').fill(SCHOOL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
  await expect(page.getByTestId("onboarding-intents")).toBeVisible({ timeout: 30_000 });
  await onboard(page, "education", `Synthetic Lecturer ${RUN}`);
  await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
  await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("company-setup-legal-name").fill(SCHOOL_ORG);
  await page.getByTestId("company-setup-country").selectOption("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-next")).toBeVisible({ timeout: 30_000 });
  s.schoolId = await userId(SCHOOL);
  const orgs = await db<Array<{ id: string }>>(`organizations?owner_profile_id=eq.${s.schoolId}&select=id`);
  expect(orgs, "the institution's organization is stored once").toHaveLength(1);
  s.orgId = orgs[0]!.id;
  // The training capability is proven by what it opens: the education home sends away any
  // organization that does not train people.
  await page.goto(`${BASE}/en/dashboard/company/education`);
  await expect(page.getByTestId("company-education"), "the education home opens for this organization").toBeVisible({ timeout: 30_000 });
  sessions.set(SCHOOL, await ctx.storageState());
  await ctx.close();
});

test("I-2. the institution invites a person as a learner by link; they register through it and the learning relationship is stored", async ({ browser }) => {
  const school = await as(browser, SCHOOL);
  await school.page.goto(`${BASE}/en/dashboard/company/education`);
  await school.page.getByTestId("institution-learners-invite").click();
  await school.page.waitForURL(/\/dashboard\/network/, { timeout: 30_000 });
  const open = school.page.getByTestId("invite-panel-open");
  const capacity = school.page.getByTestId("invite-capacity");
  await expect(open.or(capacity).first()).toBeVisible({ timeout: 30_000 });
  if (await open.isVisible().catch(() => false)) await open.click();
  await expect(capacity, "the institution invites in the learner capacity").toHaveValue("student", { timeout: 30_000 });
  const linkMode = school.page.getByTestId("invite-mode-link");
  if (await linkMode.isVisible().catch(() => false)) await linkMode.click();
  const name = school.page.getByTestId("invite-name");
  if (await name.isVisible().catch(() => false)) await name.fill(LEARNER_NAME);
  await school.page.getByTestId("invite-submit").click();
  const copy = school.page.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed to the institution").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  const u = new URL(raw!);
  const link = `${BASE}${u.pathname}${u.search}`; // served locally, same path
  await school.close();

  // The learner: a fresh browser, no session, registers through the link.
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await page.goto(link);
  await page.getByTestId("invite-register").click();
  await page.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  const addressed = page.locator('input[aria-describedby="invited-email-note"]');
  if (!(await addressed.isVisible().catch(() => false))) await page.locator('input[type="email"]').fill(LEARNER);
  await page.locator('input[name="password"]').fill(PASSWORD);
  const confirm = page.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(page.url())) await onboard(page, "work", LEARNER_NAME);
  await page.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(page.url())) {
    const accept = page.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  sessions.set(LEARNER, await ctx.storageState());
  await ctx.close();
  s.learnerId = await userId(LEARNER);
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ relationship_slug: string; status: string }>>(
            `engagement_contexts?profile_id=eq.${s.learnerId}&organization_id=eq.${s.orgId}&select=relationship_slug,status`,
          )
        ).map((e) => `${e.relationship_slug}:${e.status}`),
      { message: "registering through the link connects the person as a learner", timeout: 30_000 },
    )
    .toContain("student:active");
  const [eng] = await db<Array<{ id: string }>>(
    `engagement_contexts?profile_id=eq.${s.learnerId}&organization_id=eq.${s.orgId}&relationship_slug=eq.student&status=eq.active&select=id`,
  );
  s.engagementId = eng!.id;
});

test("I-3. the institution switches review on for the learner through the audited manual door", async ({ browser }) => {
  const { page, close } = await as(browser, SCHOOL);
  await page.goto(`${BASE}/en/dashboard/company/people#org-members`);
  // The members panel sits in the page's "more tools" fold; open it as a person would.
  const fold = page.getByTestId("people-more");
  await expect(fold).toBeAttached({ timeout: 30_000 });
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  // The row is the learning relationship itself (engagement_contexts.id from I-2).
  const row = page.getByTestId(`org-member-${s.engagementId}`);
  await expect(row, "the learner is listed among the institution's people").toBeVisible({ timeout: 30_000 });
  test.info().annotations.push({
    type: "learner-row",
    description: `role=${await row.getAttribute("data-role")} name=${((await row.innerText()) || "").split("\n")[0]}`,
  });
  if ((await row.getAttribute("data-review")) !== "on") {
    await row.getByTestId(`toggle-review-${s.engagementId}`).click();
  }
  await expect(row, "review is on for the learner").toHaveAttribute("data-review", "on", { timeout: 30_000 });
  await close();
});

test("I-4. the learner records a practice day in that learning relationship", async ({ browser }) => {
  const { page, close } = await as(browser, LEARNER);
  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  const box = main.getByTestId("journal-quick-record-text");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await box.fill(PRACTICE);
  await clickUntil(main.getByTestId("journal-quick-record-understand"), main.getByTestId("worklog-flow"));
  const context = main.getByTestId("worklog-context");
  if ((await context.count()) > 0) {
    const opts = await context.locator("option").evaluateAll((os) =>
      (os as HTMLOptionElement[]).map((o) => ({ v: o.value, t: (o.textContent ?? "").trim() })),
    );
    const learning = opts.find((o) => o.v && o.t.includes(SCHOOL_ORG));
    expect(learning, `the learning relationship is offered: ${opts.map((o) => o.t).join(" | ")}`).toBeTruthy();
    await context.selectOption(learning!.v);
  }
  await main.getByTestId("worklog-save").click();
  const confirmBtn = main.getByTestId("worklog-confirm");
  const early = main.getByTestId("worklog-error").or(main.getByTestId("worklog-blocked"));
  await expect(confirmBtn.or(early).first()).toBeVisible({ timeout: 60_000 });
  if (!(await confirmBtn.isVisible())) throw new Error(`practice not ready to confirm: ${await early.first().innerText()}`);
  await confirmBtn.click();
  const done = main.getByTestId("worklog-done");
  await expect(done.or(early).first()).toBeVisible({ timeout: 60_000 });
  await expect(done, "the practice day is saved").toBeVisible();
  await close();
  // journal_entries.worker_id references workers.id, not the profile id.
  const [w] = await db<Array<{ id: string }>>(`workers?profile_id=eq.${s.learnerId}&select=id`);
  expect(w?.id, "the learner has a worker record").toBeTruthy();
  s.learnerWorkerId = w!.id;
  await expect
    .poll(
      async () => {
        const rows = await db<Array<{ id: string }>>(
          `journal_entries?worker_id=eq.${s.learnerWorkerId}&original_text=ilike.*${PRACTICE_MARK}*&deleted_at=is.null&select=id`,
        );
        s.entryId = rows[0]?.id ?? "";
        return rows.length;
      },
      { message: "exactly one practice day is stored", timeout: 60_000 },
    )
    .toBe(1);
});

test("I-5. the institution signs the practice day off in its review queue", async ({ browser }) => {
  const { page, close } = await as(browser, SCHOOL);
  await page.goto(`${BASE}/en/dashboard/inbox`);
  const main = page.getByRole("main");
  await expect(main.getByTestId(`inbox-entry-${s.entryId}`), "the practice day reaches the institution's review queue").toBeVisible({
    timeout: 30_000,
  });
  await main.getByTestId(`journal-approve-entry-${s.entryId}`).click();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ confirmation_scope: { decision?: string } | null }>>(
            `journal_entry_confirmations?entry_id=eq.${s.entryId}&select=confirmation_scope`,
          )
        ).map((c) => c.confirmation_scope?.decision ?? "?"),
      { message: "the sign-off is stored", timeout: 30_000 },
    )
    .toContain("approved");
  await close();
});

test("I-6. the institution records a recognition citing THAT signed-off practice day", async ({ browser }) => {
  const { page, close } = await as(browser, SCHOOL);
  const form = await recognitionForm(page);
  const ours = form.locator("label", { hasText: PRACTICE_MARK }).getByTestId("recognition-evidence-option").first();
  await expect(ours, "the signed-off practice is offered as evidence").toBeVisible({ timeout: 30_000 });
  await ours.check();
  await form.locator('select[name="requirementKind"]').selectOption("skill");
  await form.locator('input[name="requirementKey"]').fill(RECOGNITION_KEY);
  await form.locator('input[name="requirementCountry"]').fill("LT");
  await form.locator('select[name="decision"]').selectOption("recognised");
  await form.locator('button[type="submit"]').click();
  const ok = form.getByTestId("recognition-ok");
  const alert = form.getByRole("alert");
  await expect(ok.or(alert).first()).toBeVisible({ timeout: 30_000 });
  if (!(await ok.isVisible())) throw new Error(`recognition not recorded: ${await alert.first().innerText()}`);
  await close();
  const rows = await db<Array<{ evidence_entry_ids: string[]; assessor_organization_id: string }>>(
    `competency_recognitions?subject_profile_id=eq.${s.learnerId}&requirement_key=eq.${RECOGNITION_KEY}&select=evidence_entry_ids,assessor_organization_id`,
  );
  expect(rows, "exactly one recognition is stored").toHaveLength(1);
  expect(rows[0]!.evidence_entry_ids, "it cites the signed-off practice day").toEqual([s.entryId]);
  expect(rows[0]!.assessor_organization_id, "the institution is the assessor").toBe(s.orgId);
});

test("I-7. the learner sees the recognition among their own", async ({ browser }) => {
  const { page, close } = await as(browser, LEARNER);
  await page.goto(`${BASE}/en/dashboard/documents`);
  const list = page.getByTestId("own-recognitions-list");
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list).toContainText(RECOGNITION_KEY, { timeout: 30_000 });
  await close();
});

// ── I-8 … I-15 (Lane L) ─────────────────────────────────────────────────────

test("I-8. the institution runs a programme, opens a cohort and places the learner in it", async ({ browser }) => {
  const { page, close } = await as(browser, SCHOOL);
  await page.goto(`${BASE}/en/dashboard/company/education`);
  await expect(page.getByTestId("institution-programs")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("institution-programs-unavailable")).toHaveCount(0);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  // The programme: the add form starts open while the institution has none.
  const create = page.getByTestId("create-program-form");
  const disclosure = page.locator("details").filter({ has: create }).first();
  if ((await disclosure.getAttribute("open")) === null) await disclosure.locator("summary").first().click();
  await create.getByTestId("program-name").fill(PROGRAM);
  const prof = create.getByTestId("program-profession");
  const value = await prof.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value).find((v) => v));
  if (value) await prof.selectOption(value);
  let programId = "";
  await submitUntil(create.getByTestId("program-create"), async () => {
    const rows = await db<Array<{ id: string }>>(
      `education_programs?organization_id=eq.${s.orgId}&name=eq.${encodeURIComponent(PROGRAM)}&select=id`,
    );
    programId = rows[0]?.id ?? "";
    return rows.length > 0;
  });

  // The cohort, inside that programme.
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.getByTestId(`program-${programId}`), "the programme is listed").toContainText(PROGRAM, { timeout: 30_000 });
  await page.getByTestId(`cohort-name-${programId}`).fill(COHORT);
  let cohortId = "";
  await submitUntil(page.getByTestId(`cohort-create-${programId}`), async () => {
    const rows = await db<Array<{ id: string }>>(
      `education_cohorts?program_id=eq.${programId}&name=eq.${encodeURIComponent(COHORT)}&select=id`,
    );
    cohortId = rows[0]?.id ?? "";
    return rows.length > 0;
  });

  // The learner who joined in I-2 is offered by the name the institution typed, and placed.
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const cohort = page.getByTestId(`cohort-${cohortId}`);
  await expect(cohort, "the cohort is listed").toContainText(COHORT, { timeout: 30_000 });
  const select = page.getByTestId(`assign-learner-select-${cohortId}`);
  await expect(select).toBeVisible({ timeout: 30_000 });
  const offered = await select.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
  expect(offered, "the joined learner can be placed").toContain(s.learnerId);
  await select.selectOption(s.learnerId);
  await submitUntil(page.getByTestId(`assign-learner-submit-${cohortId}`), async () => {
    const rows = await db<Array<{ status: string }>>(
      `education_cohort_members?cohort_id=eq.${cohortId}&profile_id=eq.${s.learnerId}&select=status`,
    );
    return rows.some((r) => r.status === "active");
  });
  await page.reload();
  await expect(page.getByTestId(`cohort-${cohortId}`), "the cohort shows its learner").toContainText(LEARNER_NAME, { timeout: 30_000 });
  await close();
});

test("I-9. a separate employer signs up and invites the same person as an intern; they accept", async ({ browser }) => {
  // The employer: its own sign-up, its own organization (not a training provider).
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signUp(page, EMPLOYER);
  await onboard(page, "hire", `Synthetic Practice Host Owner ${RUN}`);
  await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
  await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("company-setup-legal-name").fill(EMPLOYER_ORG);
  await page.getByTestId("company-setup-country").selectOption("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result").or(page.getByTestId("company-setup-next")).first()).toBeVisible({
    timeout: 30_000,
  });
  s.employerId = await userId(EMPLOYER);
  const orgs = await db<Array<{ id: string }>>(`organizations?owner_profile_id=eq.${s.employerId}&select=id`);
  expect(orgs, "the employer's organization is stored once").toHaveLength(1);
  s.employerOrgId = orgs[0]!.id;
  expect(s.employerOrgId, "a different organization from the institution").not.toBe(s.orgId);

  // The invitation: join the organization, in the intern capacity, as a link.
  await page.goto(
    `${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${s.employerOrgId}&relationship=intern#network-invite`,
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
  await expect(panel.getByTestId("invite-type")).toHaveValue("join_organization");
  await expect(panel.getByTestId("invite-organization")).toHaveValue(s.employerOrgId);
  await capacity.selectOption("intern");
  await expect(capacity, "the employer offers practice, not employment").toHaveValue("intern");
  await expect(panel.getByTestId("invite-capacity-blocked"), "an intern needs no training-provider status").toHaveCount(0);
  await panel.getByTestId("invite-mode-link").click();
  const name = panel.getByTestId("invite-name");
  if (await name.isVisible().catch(() => false)) await name.fill(LEARNER_NAME);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed to the employer").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  const u = new URL(raw!);
  const link = `${BASE}${u.pathname}${u.search}`; // served locally, same path
  sessions.set(EMPLOYER, await ctx.storageState());
  await ctx.close();

  // The learner, already signed in, opens the link and accepts.
  const learner = await as(browser, LEARNER);
  await learner.page.goto(link);
  await expect(learner.page.getByTestId("invite-page")).toBeVisible({ timeout: 30_000 });
  const accept = learner.page.getByTestId("invite-accept");
  await expect(accept, "the learner is asked to accept").toBeVisible({ timeout: 30_000 });
  await accept.click();
  await learner.page.waitForURL((url) => !url.pathname.includes("/invite/"), { timeout: 30_000 }).catch(() => undefined);
  await learner.close();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ relationship_slug: string; status: string }>>(
            `engagement_contexts?profile_id=eq.${s.learnerId}&organization_id=eq.${s.employerOrgId}&select=relationship_slug,status`,
          )
        ).map((e) => `${e.relationship_slug}:${e.status}`),
      { message: "accepting connects the person to the employer as an intern", timeout: 30_000 },
    )
    .toEqual(["intern:active"]);
  const [eng] = await db<Array<{ id: string }>>(
    `engagement_contexts?profile_id=eq.${s.learnerId}&organization_id=eq.${s.employerOrgId}&relationship_slug=eq.intern&status=eq.active&select=id`,
  );
  s.internEngagementId = eng!.id;
  // The learning relationship with the institution is untouched by the second one.
  const school = await db<Array<{ status: string }>>(`engagement_contexts?id=eq.${s.engagementId}&select=status`);
  expect(school.map((r) => r.status), "the person stays the institution's learner").toEqual(["active"]);
});

/**
 * KNOWN PRODUCT BREAK (found by this walk, CI 2026-11-16): the employer cannot switch review on for
 * an intern. `intern` is journal_reviewable (migration 20261012170000: "the host opens it through
 * the existing audited manual door"), but that door, the members panel on /dashboard/company/people,
 * lists only `MEMBERSHIP_SLUGS` (lib/operations/org-members.ts), which omits `intern`. The intern
 * row, and so its review toggle, never renders. I-10 and I-12 and I-13b fail until it is fixed.
 * Then they pass unexpectedly and fail the job, so remove these `test.fail` marks.
 */
const INTERN_REVIEW_DOOR_MISSING = "intern engagement absent from the members panel (MEMBERSHIP_SLUGS omits 'intern')";

test("I-10. the employer switches review on for the intern through the audited manual door", async ({ browser }) => {
  test.fail(true, INTERN_REVIEW_DOOR_MISSING);
  const { page, close } = await as(browser, EMPLOYER);
  await page.goto(`${BASE}/en/dashboard/company/people#org-members`);
  const fold = page.getByTestId("people-more");
  await expect(fold).toBeAttached({ timeout: 30_000 });
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  const row = page.getByTestId(`org-member-${s.internEngagementId}`);
  await expect(row, "the intern is listed among the employer's people").toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute("data-role", "intern");
  if ((await row.getAttribute("data-review")) !== "on") {
    await row.getByTestId(`toggle-review-${s.internEngagementId}`).click();
  }
  await expect(row, "review is on for the intern").toHaveAttribute("data-review", "on", { timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ journal_review_enabled: boolean }>>(
            `engagement_contexts?id=eq.${s.internEngagementId}&select=journal_review_enabled`,
          )
        )[0]?.journal_review_enabled,
      { message: "the switch is stored on the intern relationship", timeout: 30_000 },
    )
    .toBe(true);
  await close();
});

test("I-11. the learner records a practice day in the intern relationship", async ({ browser }) => {
  const { page, close } = await as(browser, LEARNER);
  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  const box = main.getByTestId("journal-quick-record-text");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await box.fill(INTERN_PRACTICE);
  await clickUntil(main.getByTestId("journal-quick-record-understand"), main.getByTestId("worklog-flow"));
  // Two relationships now (learner, intern): the record names the one it belongs to.
  const context = main.getByTestId("worklog-context");
  await expect(context, "the person chooses where the day was worked").toBeVisible({ timeout: 30_000 });
  const opts = await context.locator("option").evaluateAll((os) =>
    (os as HTMLOptionElement[]).map((o) => ({ v: o.value, t: (o.textContent ?? "").trim() })),
  );
  const intern = opts.find((o) => o.v && o.t.includes(EMPLOYER_ORG));
  expect(intern, `the intern relationship is offered: ${opts.map((o) => o.t).join(" | ")}`).toBeTruthy();
  await context.selectOption(intern!.v);
  await main.getByTestId("worklog-save").click();
  const confirmBtn = main.getByTestId("worklog-confirm");
  const early = main.getByTestId("worklog-error").or(main.getByTestId("worklog-blocked"));
  await expect(confirmBtn.or(early).first()).toBeVisible({ timeout: 60_000 });
  if (!(await confirmBtn.isVisible())) throw new Error(`practice not ready to confirm: ${await early.first().innerText()}`);
  await confirmBtn.click();
  const done = main.getByTestId("worklog-done");
  await expect(done.or(early).first()).toBeVisible({ timeout: 60_000 });
  await expect(done, "the practice day is saved").toBeVisible();
  await close();

  await expect
    .poll(
      async () => {
        const rows = await db<Array<{ id: string; engagement_context_id: string | null }>>(
          `journal_entries?worker_id=eq.${s.learnerWorkerId}&original_text=ilike.*${INTERN_MARK}*&deleted_at=is.null&select=id,engagement_context_id`,
        );
        s.internEntryId = rows[0]?.id ?? "";
        return rows.map((r) => r.engagement_context_id);
      },
      { message: "exactly one practice day is stored, in the intern relationship", timeout: 60_000 },
    )
    .toEqual([s.internEngagementId]);
});

test("I-12. the employer confirms the intern's practice day", async ({ browser }) => {
  // Blocked by the same break: with review off (I-10) the day never reaches the employer's queue.
  test.fail(true, INTERN_REVIEW_DOOR_MISSING);
  const { page, close } = await as(browser, EMPLOYER);
  await page.goto(`${BASE}/en/dashboard/inbox`);
  const main = page.getByRole("main");
  await expect(main.getByTestId(`inbox-entry-${s.internEntryId}`), "the day reaches the employer's review queue").toBeVisible({
    timeout: 30_000,
  });
  await main.getByTestId(`journal-approve-entry-${s.internEntryId}`).click();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ confirmer_id: string; confirmation_scope: { decision?: string } | null }>>(
            `journal_entry_confirmations?entry_id=eq.${s.internEntryId}&select=confirmer_id,confirmation_scope`,
          )
        ).map((c) => `${c.confirmer_id === s.employerId ? "employer" : "other"}:${c.confirmation_scope?.decision ?? "?"}`),
      { message: "the employer's confirmation is stored", timeout: 30_000 },
    )
    .toContain("employer:approved");
  await close();
});

async function openCv(page: Page): Promise<Locator> {
  await page.goto(`${BASE}/en/cv`);
  const main = page.getByRole("main").first();
  await expect(main.getByTestId("cv-skills"), "the CV renders").toBeAttached({ timeout: 60_000 });
  return main;
}

test("I-13. the learner's Living CV shows the practice period and the recognition", async ({ browser }) => {
  const { page, close } = await as(browser, LEARNER);
  const main = await openCv(page);
  // Practice has its own heading and is never claimed as a job (cv-practice-history).
  const practice = main.getByTestId("cv-practice-history");
  await expect(practice, "the CV has a practice section").toBeVisible({ timeout: 30_000 });
  const internship = practice.getByTestId("cv-history-node").filter({ hasText: EMPLOYER_ORG });
  await expect(internship, "the practice period at the employer is on the CV").toHaveCount(1, { timeout: 30_000 });
  await expect(internship, "it carries the recorded practice day").toHaveAttribute("data-standing", /^(recorded|confirmed)$/);
  await expect(main.getByTestId("cv-work-history").getByText(EMPLOYER_ORG), "practice is not listed as employment").toHaveCount(0);
  // The institution's practice, signed off in I-5, stands as confirmed.
  await expect(practice.getByTestId("cv-history-node").filter({ hasText: SCHOOL_ORG })).toHaveAttribute("data-standing", "confirmed");
  // I-7's recognition is on the CV too, not only in the document centre.
  const recognised = main.getByTestId("recognised-by");
  await expect(recognised, "the recognition is on the CV").toBeVisible({ timeout: 30_000 });
  await expect(recognised).toHaveAttribute("data-evidence-class", "assessor_recognition");
  await expect(recognised.getByTestId("recognised-by-item").filter({ hasText: RECOGNITION_KEY })).toHaveCount(1);
  await expect(recognised, "it names the institution that recognised it").toContainText(SCHOOL_ORG);
  await close();
});

test("I-13b. the practice period on the CV stands as confirmed by the employer", async ({ browser }) => {
  // Blocked by the same break: without review the employer cannot confirm the day (I-12).
  test.fail(true, INTERN_REVIEW_DOOR_MISSING);
  const { page, close } = await as(browser, LEARNER);
  const main = await openCv(page);
  const internship = main.getByTestId("cv-practice-history").getByTestId("cv-history-node").filter({ hasText: EMPLOYER_ORG });
  await expect(internship, "it stands as confirmed by the employer").toHaveAttribute("data-standing", "confirmed", { timeout: 15_000 });
  await close();
});

test("I-14. least privilege: the institution's evidence list does not offer the employer's intern day", async ({ browser }) => {
  // While I-12 is blocked the intern day is not yet confirmed. The boundary is asserted either
  // way, and it becomes the full "employer-CONFIRMED day" proof as soon as I-12 passes.
  const conf = await db<Array<{ confirmation_scope: { decision?: string } | null }>>(
    `journal_entry_confirmations?entry_id=eq.${s.internEntryId}&select=confirmation_scope`,
  );
  test.info().annotations.push({
    type: "intern-day-confirmed",
    description: String(conf.some((c) => c.confirmation_scope?.decision === "approved")),
  });

  const { page, close } = await as(browser, SCHOOL);
  const form = await recognitionForm(page);
  const evidence = form.getByTestId("recognition-evidence");
  // Control: the list is the learner's, and it reads.
  await expect(
    evidence.locator("label", { hasText: PRACTICE_MARK }).getByTestId("recognition-evidence-option"),
    "the institution's own signed-off practice is offered",
  ).toHaveCount(1, { timeout: 30_000 });
  await expect(evidence.getByRole("alert")).toHaveCount(0);
  // RULE (SKL-9, lib/education/recognition-evidence.ts): an assessor may cite only entries recorded
  // in ITS OWN organization's student relationships, read under its own RLS. A day the learner
  // recorded, and an employer confirmed, in the employer's intern relationship stays invisible to
  // the institution, even though the same person is its learner.
  await expect(
    evidence.locator("label", { hasText: INTERN_MARK }),
    "the employer-confirmed intern day is not offered to the institution",
  ).toHaveCount(0);
  await expect(evidence, "no trace of the intern day on the evidence list").not.toContainText(INTERN_MARK);
  await close();
});

/**
 * I-15 runs where review is really on today: the learner's relationship with the institution (I-3).
 * The same producer serves the intern host once the I-10 break is fixed. That leg is not written
 * twice: it cannot start while the host cannot switch review on.
 */
test("I-15. EDU-5: the learner's accepted skill reaches the reviewer's learning queue, and a human decides", async ({ browser }) => {
  // The learner records a practice day for the institution and stands behind the recognised skill.
  const learner = await as(browser, LEARNER);
  const main = learner.page.getByRole("main");
  await learner.page.goto(`${BASE}/en/dashboard/journal`);
  const box = main.getByTestId("journal-quick-record-text");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await box.fill(EDU5_PRACTICE);
  await clickUntil(main.getByTestId("journal-quick-record-understand"), main.getByTestId("worklog-flow"));
  const context = main.getByTestId("worklog-context");
  await expect(context).toBeVisible({ timeout: 30_000 });
  const opts = await context.locator("option").evaluateAll((os) =>
    (os as HTMLOptionElement[]).map((o) => ({ v: o.value, t: (o.textContent ?? "").trim() })),
  );
  const learning = opts.find((o) => o.v && o.t.includes(SCHOOL_ORG));
  expect(learning, `the learning relationship is offered: ${opts.map((o) => o.t).join(" | ")}`).toBeTruthy();
  await context.selectOption(learning!.v);
  await main.getByTestId("worklog-save").click();
  const confirmBtn = main.getByTestId("worklog-confirm");
  const early = main.getByTestId("worklog-error").or(main.getByTestId("worklog-blocked"));
  await expect(confirmBtn.or(early).first()).toBeVisible({ timeout: 60_000 });
  if (!(await confirmBtn.isVisible())) throw new Error(`practice not ready to confirm: ${await early.first().innerText()}`);
  await confirmBtn.click();
  await expect(main.getByTestId("worklog-done"), "the practice day is saved").toBeVisible({ timeout: 60_000 });
  const offer = main.locator(`[data-testid="worklog-pending-candidate"][data-candidate-slug="${EDU5_SKILL}"]`);
  await expect(offer, "the recogniser offers the skill on this day").toBeVisible({ timeout: 30_000 });
  await clickUntil(offer.getByTestId("worklog-candidate-confirm"), offer.getByTestId("worklog-candidate-confirmed"));
  await learner.close();

  let entryId = "";
  await expect
    .poll(
      async () => {
        const rows = await db<Array<{ id: string; engagement_context_id: string | null }>>(
          `journal_entries?worker_id=eq.${s.learnerWorkerId}&original_text=ilike.*${EDU5_MARK}*&deleted_at=is.null&select=id,engagement_context_id`,
        );
        entryId = rows[0]?.id ?? "";
        return rows.map((r) => r.engagement_context_id);
      },
      { message: "the day is stored in the learning relationship", timeout: 60_000 },
    )
    .toEqual([s.engagementId]);

  // The signal: an observation naming the institution, because review is on in that relationship.
  const [skill] = await db<Array<{ id: string }>>(`skills?slug=eq.${EDU5_SKILL}&select=id`);
  expect(skill?.id, "the catalogue knows the skill").toBeTruthy();
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ organization_id: string | null; subject_skill_id: string | null }>>(
            `learning_signals?source_object_id=eq.${entryId}&source=eq.skill_claim&signal_kind=eq.skill_candidate&select=organization_id,subject_skill_id`,
          )
        ).map((r) => `${r.organization_id === s.orgId ? "institution" : r.organization_id}:${r.subject_skill_id === skill!.id}`),
      { message: "the accepted skill is observed for the reviewer", timeout: 30_000 },
    )
    .toEqual(["institution:true"]);

  // The producer runs in the manager's own session when the brief loads. The brief's one door to
  // the review page appears only while something waits there. No menu link (owner-parked).
  const { page, close } = await as(browser, SCHOOL);
  await page.goto(`${BASE}/en/dashboard/company`);
  const attention = page.getByTestId("company-home-attention");
  await expect(attention, "the manager's home states what needs them").toBeVisible({ timeout: 60_000 });
  const door = attention.locator('a[href*="/dashboard/learning"]');
  await expect(door, "the brief offers the learning review").toHaveCount(1, { timeout: 30_000 });
  const [item] = await db<Array<{ id: string; status: string; organization_id: string }>>(
    `learning_review_queue?journal_entry_id=eq.${entryId}&select=id,status,organization_id`,
  );
  expect(item, "the suggestion is queued").toBeTruthy();
  expect(item!.status).toBe("pending");
  expect(item!.organization_id, "in the institution's queue").toBe(s.orgId);

  await door.click();
  await page.waitForURL(/\/en\/dashboard\/learning/, { timeout: 30_000 });
  const actions = page.getByTestId(`learning-item-actions-${item!.id}`);
  await expect(actions, "the suggestion is offered for a decision").toBeVisible({ timeout: 30_000 });
  await actions.locator("button").first().click(); // approve: the first decision, before reject
  await expect
    .poll(
      async () => {
        const [row] = await db<Array<{ status: string; reviewed_by: string | null }>>(
          `learning_review_queue?id=eq.${item!.id}&select=status,reviewed_by`,
        );
        return `${row?.status}:${row?.reviewed_by === s.schoolId ? "institution" : row?.reviewed_by}`;
      },
      { message: "the manager's decision is recorded", timeout: 30_000 },
    )
    .toBe("approved:institution");
  await close();
});

