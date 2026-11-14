import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

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

const s: { schoolId: string; orgId: string; learnerId: string; entryId: string } = {
  schoolId: "",
  orgId: "",
  learnerId: "",
  entryId: "",
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

async function as(browser: Browser, address: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signIn(page, address);
  return { page, close: () => ctx.close() };
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
});

test("I-3. the institution switches review on for the learner through the audited manual door", async ({ browser }) => {
  const { page, close } = await as(browser, SCHOOL);
  await page.goto(`${BASE}/en/dashboard/company/people#org-members`);
  const row = page.locator('[data-testid^="org-member-"][data-role="student"]', { hasText: LEARNER_NAME }).first();
  await expect(row, "the learner is listed among the institution's people").toBeVisible({ timeout: 30_000 });
  if ((await row.getAttribute("data-review")) !== "on") {
    await row.locator('[data-testid^="toggle-review-"]').click();
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
  await expect
    .poll(
      async () => {
        const rows = await db<Array<{ id: string }>>(
          `journal_entries?worker_id=eq.${s.learnerId}&original_text=ilike.*${PRACTICE_MARK}*&deleted_at=is.null&select=id`,
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
