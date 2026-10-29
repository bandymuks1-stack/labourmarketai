import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * WORK JOURNAL → SKILLS → LIVING CV → TWO-WAY MATCHING → DISPUTE, end to end,
 * on a THROWAWAY LOCAL Supabase stack (.github/workflows/signup-isolated.yml,
 * the same job as signup-isolated.spec.ts). Owner requirement 2026-10-29: the
 * Work Journal is the primary source of real professional experience.
 *
 *   K-1 a tiler and K-2 a welder (two people, two trades, NO stated
 *       profession or title) sign up, let employers find them (the
 *       profile_discoverability consent) and record one day of work each in
 *       the journal; the skills the work shows land as journal evidence —
 *       never as confirmed, never as a qualification;
 *   K-3 the Living CV shows those skills at the "recorded" level with their
 *       basis (the recorded hours);
 *   K-4 a company posts a need under a DIFFERENT title ("wet-room finishing
 *       specialist") — the tiler sees it as a fitting opportunity, and the
 *       company finds the tiler by skill, without the private journal text,
 *       the name, or any row of the journal under its own row-level security;
 *   K-5 an agency posts a welding need and finds the welder the same way;
 *   K-6 the tiler disputes one reading of their entry ("flooring"): the
 *       dispute is recorded on the entry (basis kept), the evidence link is
 *       withdrawn, the tier falls back, a re-run of recognition does not put
 *       it back, and the Living CV no longer shows it as recorded work;
 *   K-7 the tiler's work points at professional directions their skills
 *       already apply to.
 *
 * It refuses to run anywhere but the local stack (owner decision 2026-10-28:
 * no synthetic accounts in production). Outcomes are read back from that
 * local database — the page saying "done" is not the proof.
 * Result class: PASS_CI_ONLY, never LIVE_VERIFIED.
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
const email = (who: string) => `skills.${who}.${RUN}@local.test`;

const TILER = email("tiler");
const WELDER = email("welder");
const COMPANY = email("company");
const AGENCY = email("agency");
const TILER_NAME = `Synthetic Tiler ${RUN}`;
const WELDER_NAME = `Synthetic Welder ${RUN}`;
// Run-unique, private words inside each entry: if they ever reach an
// employer surface, the journal leaked.
const TILER_PRIVATE = `cottage${RUN}`;
const WELDER_PRIVATE = `hangar${RUN}`;
const TILER_TEXT = `Tiled the bathroom floor, waterproofing in the shower at the ${TILER_PRIVATE}, 7 hours`;
const WELDER_TEXT = `MIG welding of steel frames for the ${WELDER_PRIVATE} warehouse, worked 8 hours`;
const COMPANY_ROLE = `Wet-room finishing specialist ${RUN}`;
const AGENCY_ROLE = `Steel structure crew member ${RUN}`;

const state: Record<string, string> = {};

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

/** A REST read AS a signed-in person — what row-level security lets THEM see. */
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

async function skillId(slug: string): Promise<string> {
  const [row] = await db<Array<{ id: string }>>(`skills?slug=eq.${slug}&select=id`);
  if (!row) throw new Error(`catalogue has no ${slug}`);
  return row.id;
}

type WorkerSkill = { skill_id: string; source: string; verified: boolean };
async function workerSkills(workerId: string): Promise<Map<string, WorkerSkill>> {
  const rows = await db<Array<WorkerSkill & { skills: { slug: string } | null }>>(
    `worker_skills?worker_id=eq.${workerId}&select=skill_id,source,verified,skills(slug)`,
  );
  return new Map(rows.filter((r) => r.skills?.slug).map((r) => [r.skills!.slug, r]));
}

async function entryLinks(entryId: string): Promise<Map<string, string | null>> {
  const rows = await db<Array<{ provenance: string | null; skills: { slug: string } | null }>>(
    `journal_entry_skills?journal_entry_id=eq.${entryId}&select=provenance,skills(slug)`,
  );
  return new Map(rows.filter((r) => r.skills?.slug).map((r) => [r.skills!.slug, r.provenance]));
}

// ── browser helpers (same real forms as signup-isolated.spec.ts) ───────────

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

async function as(browser: Browser, address: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signIn(page, address);
  return { page, close: () => ctx.close() };
}

/** React owns the element (a fill before hydration is a silent no-op). */
async function hydrated(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps") || k.startsWith("__reactFiber"));
    },
    selector,
    { timeout: 120_000 },
  );
}

/** Everything the main region renders, once the page's own content streamed in. */
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

/** A new worker: form sign-up → onboarding → the employer-visibility consent. */
async function newDiscoverableWorker(browser: Browser, address: string, name: string): Promise<Page> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signUp(page, address);
  await onboard(page, "work", name);
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });

  // Employers may find this person only through their own consent.
  await page.goto(`${BASE}/en/dashboard/privacy#visibility`);
  const section = page.getByTestId("privacy-visibility");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await hydrated(page, '[data-testid="discoverability-open"]');
  await section.getByTestId("discoverability-open").click();
  await section.getByTestId("discoverability-grant").click();
  await expect(section.getByTestId("discoverability-granted")).toBeVisible({ timeout: 30_000 });
  return page;
}

/** One day of work through the journal composer: read back → save → confirm. */
async function recordWork(page: Page, text: string): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/journal`);
  const box = page.locator("#journal-composer textarea").first();
  await expect(box).toBeVisible({ timeout: 120_000 });
  await hydrated(page, "#journal-composer textarea");
  await box.fill(text);
  await page.getByRole("button", { name: /Read it back/i }).first().click();
  const save = page.getByTestId("worklog-save").first();
  await expect(save, "the read-back offers to save").toBeVisible({ timeout: 60_000 });
  await save.click();
  await page.getByTestId("worklog-confirm").first().click();
  await expect(page.getByTestId("worklog-done").first(), "the entry is saved").toBeVisible({ timeout: 90_000 });
}

async function onlyEntry(workerId: string, privateWord: string): Promise<string> {
  let id = "";
  await expect
    .poll(
      async () => {
        const rows = await db<Array<{ id: string }>>(
          `journal_entries?worker_id=eq.${workerId}&original_text=ilike.*${privateWord}*&deleted_at=is.null&select=id`,
        );
        id = rows[0]?.id ?? "";
        return rows.length;
      },
      { message: "exactly one journal entry was stored", timeout: 60_000 },
    )
    .toBe(1);
  return id;
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
        const [byTitle, byRole] = await Promise.all([
          db<Array<{ id: string }>>(`customer_requests?title=eq.${encodeURIComponent(role)}&select=id`),
          db<Array<{ id: string }>>(`customer_requests?role_or_work_type=eq.${encodeURIComponent(role)}&select=id`),
        ]);
        const ids = [...new Set([...byTitle, ...byRole].map((r) => r.id))];
        id = ids[0] ?? "";
        return ids.length;
      },
      { message: "the need is stored", timeout: 30_000 },
    )
    .toBe(1);
  return id;
}

/** The organization scouts its need: the worker is found, and nothing private shows. */
async function scoutFinds(
  page: Page,
  requestId: string,
  workerId: string,
  forbidden: readonly string[],
): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/company/scouting?request=${requestId}`);
  const main = page.getByRole("main");
  const card = main.getByTestId(`scout-candidate-${workerId}`);
  await expect(card, "the person is found by what their work shows").toBeVisible({ timeout: 60_000 });
  // Found BY SKILL: at least one required skill matched (never "0 of N").
  await expect(card.getByTestId(`scout-skill-count-${workerId}`)).toHaveText(/^[1-9]\d* of \d+ required skills/);
  const text = await mainText(page);
  for (const f of forbidden) expect(text, "no private journal text or identity on the employer surface").not.toContain(f);
}

// ── K-1 / K-2 ───────────────────────────────────────────────────────────────

test("K-1. a tiler records a day of work; the skills it shows land as journal evidence, never as confirmed", async ({ browser }) => {
  const page = await newDiscoverableWorker(browser, TILER, TILER_NAME);
  const profileId = await userId(TILER);
  const [consent] = await db<Array<{ action: string }>>(
    `privacy_consent_events?user_id=eq.${profileId}&purpose=eq.profile_discoverability&select=action&order=created_at.desc&limit=1`,
  );
  expect(consent?.action, "the person's own consent is recorded").toBe("granted");
  const [worker] = await db<Array<{ id: string }>>(`workers?profile_id=eq.${profileId}&select=id`);
  expect(worker?.id, "a worker record exists without any company").toBeTruthy();
  state.tilerWorker = worker!.id;
  // No stated profession or title: anything found later is found by work.
  expect(await db<unknown[]>(`worker_professions?worker_id=eq.${worker!.id}&select=worker_id`)).toEqual([]);

  await recordWork(page, TILER_TEXT);
  await expect(page.getByTestId("worklog-added-tiling").first(), "the person is told what the work showed").toBeVisible();
  state.tilerEntry = await onlyEntry(worker!.id, TILER_PRIVATE);

  await expect
    .poll(async () => [...(await entryLinks(state.tilerEntry)).keys()].sort(), {
      message: "the entry is linked to the skills it shows",
      timeout: 60_000,
    })
    .toEqual(expect.arrayContaining(["flooring", "tiling", "waterproofing"]));
  const links = await entryLinks(state.tilerEntry);
  expect(links.get("tiling"), "the link says it was recognised from the text").toBe("recognized");
  const skills = await workerSkills(worker!.id);
  for (const slug of ["tiling", "waterproofing", "flooring"]) {
    expect(skills.get(slug), `${slug}: evidence tier = recorded in the journal`).toMatchObject({
      source: "work_journal",
      verified: false,
    });
  }
  await page.context().close();
});

test("K-2. a welder (another trade) records a day of work; same honest evidence tier", async ({ browser }) => {
  const page = await newDiscoverableWorker(browser, WELDER, WELDER_NAME);
  const [worker] = await db<Array<{ id: string }>>(`workers?profile_id=eq.${await userId(WELDER)}&select=id`);
  state.welderWorker = worker!.id;
  await recordWork(page, WELDER_TEXT);
  state.welderEntry = await onlyEntry(worker!.id, WELDER_PRIVATE);
  await expect
    .poll(async () => (await workerSkills(worker!.id)).get("mig-mag-welding")?.source ?? null, {
      message: "welding is evidenced by the journal",
      timeout: 60_000,
    })
    .toBe("work_journal");
  const skills = await workerSkills(worker!.id);
  expect(skills.has("tiling"), "the welder's work shows no tiling").toBe(false);
  expect([...skills.values()].every((s) => s.verified === false), "nothing is confirmed by the person's own entry").toBe(true);
  await page.context().close();
});

// ── K-3 ─────────────────────────────────────────────────────────────────────

test("K-3. the Living CV shows the skills as recorded work, with their basis", async ({ browser }) => {
  const tiler = await as(browser, TILER);
  await tiler.page.goto(`${BASE}/en/cv`);
  const caps = tiler.page.getByTestId("premium-cv-capabilities");
  await expect(caps).toBeVisible({ timeout: 60_000 });
  const tiling = caps.locator("li", { hasText: /^\s*Tiling/ }).first();
  await expect(tiling, "tiling is on the Living CV").toBeVisible();
  await expect(tiling, "at the recorded level — not confirmed").toHaveAttribute("data-level", "recorded");
  await expect(caps.locator('li[data-level="confirmed"]'), "nothing reads as confirmed").toHaveCount(0);
  await expect(tiling, "the basis is the recorded hours").toContainText(/\d/);
  await tiler.close();
});

// ── K-4 ─────────────────────────────────────────────────────────────────────

test("K-4. a company needs a 'wet-room finishing specialist': the tiler sees the fit, the company finds the tiler by skill", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signUp(page, COMPANY);
  await onboard(page, "hire", `Synthetic Company Owner ${RUN}`);
  await setUpCompany(page, `Synthetic Bathrooms Co ${RUN}`);
  state.companyNeed = await postNeed(page, COMPANY_ROLE, "Tiling and waterproofing of bathrooms in Vilnius");

  // WORKER → JOB: the tiler sees the need as a fitting opportunity.
  const tiler = await as(browser, TILER);
  await tiler.page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
  const card = tiler.page.locator(`li[id="opp-${state.companyNeed}"]`).first();
  await expect(card, "the need reaches the person its title would never have found").toBeVisible({ timeout: 60_000 });
  await expect(card).toHaveAttribute("data-band", /^(strong|possible)$/);
  await tiler.close();

  // EMPLOYER → PERSON: found by skill, despite no title, without private text.
  await scoutFinds(page, state.companyNeed, state.tilerWorker, [TILER_PRIVATE, TILER_NAME, TILER]);
  await ctx.close();

  // Under the company's OWN row-level security: none of the journal.
  const seen = await readAs<unknown[]>(COMPANY, `journal_entries?worker_id=eq.${state.tilerWorker}&select=id`);
  expect(seen, "a match never opens the person's private journal").toEqual([]);
  const seenText = await readAs<unknown[]>(COMPANY, `journal_entries?original_text=ilike.*${TILER_PRIVATE}*&select=id`);
  expect(seenText).toEqual([]);
});

// ── K-5 ─────────────────────────────────────────────────────────────────────

test("K-5. an agency needs a 'steel structure crew member' and finds the welder by skill", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signUp(page, AGENCY);
  await onboard(page, "agency", `Synthetic Agency Owner ${RUN}`);
  await setUpCompany(page, `Synthetic Crew Agency ${RUN}`);
  state.agencyNeed = await postNeed(page, AGENCY_ROLE, "MIG welding of steel frames on a warehouse site");
  await scoutFinds(page, state.agencyNeed, state.welderWorker, [WELDER_PRIVATE, WELDER_NAME, WELDER]);
  await ctx.close();
  const seen = await readAs<unknown[]>(AGENCY, `journal_entries?worker_id=eq.${state.welderWorker}&select=id`);
  expect(seen, "the agency reads none of the welder's journal").toEqual([]);
});

// ── K-6 ─────────────────────────────────────────────────────────────────────

test("K-6. the tiler disputes a wrong reading ('flooring'); it is withdrawn, the basis is kept, and it stays withdrawn", async ({ browser }) => {
  const flooring = await skillId("flooring");
  const tiler = await as(browser, TILER);
  const page = tiler.page;
  await page.goto(`${BASE}/en/dashboard/journal`);
  const cardEl = page.getByTestId(`journal-entry-card-${state.tilerEntry}`).first();
  await expect(cardEl, "the entry is on the person's journal").toBeVisible({ timeout: 120_000 });
  const more = page.getByTestId(`journal-entry-more-${state.tilerEntry}`).first();
  await more.evaluate((d) => ((d as HTMLDetailsElement).open = true));
  const chip = page
    .getByTestId(`entry-skill-links-${state.tilerEntry}`)
    .first()
    .getByTestId(`entry-skill-toggle-${state.tilerEntry}-${flooring}`);
  await expect(chip, "the reading is shown on the entry it came from").toHaveAttribute("aria-pressed", "true", {
    timeout: 60_000,
  });
  await hydrated(page, `[data-testid="entry-skill-toggle-${state.tilerEntry}-${flooring}"]`);
  await chip.click();

  // Recorded: the dispute is an append-only marker on THIS entry.
  await expect
    .poll(
      async () =>
        (
          await db<Array<{ value_text: string }>>(
            `journal_entry_metrics?entry_id=eq.${state.tilerEntry}&metric_slug=eq.skill_rejected&select=value_text`,
          )
        ).map((m) => m.value_text),
      { message: "the dispute is recorded on the entry", timeout: 60_000 },
    )
    .toContain("flooring");
  // Withdrawn: the link is gone, the other readings stay, the tier falls.
  let links = await entryLinks(state.tilerEntry);
  expect(links.has("flooring"), "the disputed evidence link is withdrawn").toBe(false);
  expect(links.has("tiling"), "the undisputed readings stay").toBe(true);
  const skills = await workerSkills(state.tilerWorker);
  expect(skills.get("flooring")?.source, "no longer journal evidence").toBe("self_declared");
  expect(skills.get("tiling")?.source).toBe("work_journal");
  // The basis is kept: the person's own words are untouched.
  const [entry] = await db<Array<{ original_text: string; deleted_at: string | null }>>(
    `journal_entries?id=eq.${state.tilerEntry}&select=original_text,deleted_at`,
  );
  expect(entry).toEqual({ original_text: TILER_TEXT, deleted_at: null });

  // It STAYS withdrawn: a re-run of recognition over the same text.
  await page.goto(`${BASE}/en/dashboard/journal`);
  await page.getByTestId(`journal-entry-more-${state.tilerEntry}`).first().evaluate((d) => ((d as HTMLDetailsElement).open = true));
  const rerun = page.getByTestId(`journal-entry-reprocess-${state.tilerEntry}`).first();
  await hydrated(page, `[data-testid="journal-entry-reprocess-${state.tilerEntry}"]`);
  await rerun.click();
  await expect(
    page
      .getByTestId(`journal-entry-reprocess-result-${state.tilerEntry}`)
      .or(page.getByTestId(`journal-entry-reprocess-failed-${state.tilerEntry}`))
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  links = await entryLinks(state.tilerEntry);
  expect(links.has("flooring"), "re-running recognition does not bring the disputed reading back").toBe(false);
  expect((await workerSkills(state.tilerWorker)).get("flooring")?.source).toBe("self_declared");

  // The Living CV follows: flooring is no longer shown as recorded work.
  await page.goto(`${BASE}/en/cv`);
  const caps = page.getByTestId("premium-cv-capabilities");
  await expect(caps).toBeVisible({ timeout: 60_000 });
  await expect(caps.locator('li[data-level="recorded"]', { hasText: /^\s*Flooring/ })).toHaveCount(0);
  await expect(caps.locator('li[data-level="recorded"]', { hasText: /^\s*Tiling/ })).toHaveCount(1);
  await tiler.close();
});

// ── K-7 ─────────────────────────────────────────────────────────────────────

test("K-7. the tiler's recorded work points at professional directions the skills already apply to", async ({ browser }) => {
  const tiler = await as(browser, TILER);
  await tiler.page.goto(`${BASE}/en/dashboard/work-in-numbers`);
  const directions = tiler.page.getByTestId("wi-directions").first();
  await expect(directions, "suitable directions are derived from the work, not from a title").toBeVisible({
    timeout: 60_000,
  });
  await expect(directions.locator('[data-testid^="wi-direction-"]').first()).toBeVisible();
  await tiler.close();
});
