import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { clickUntilVisible } from "./click-until-visible";
import { BASE, isolatedStack, lit, onboard, recordJournal, signIn, signUp, sql, userId } from "./isolated-web-a-helpers";

/**
 * "CV SKILLS AND WORK EXPERIENCE SHOWN TWICE" (owner P0 2026-11-23), on the
 * THROWAWAY local stack of .github/workflows/signup-isolated.yml. Synthetic
 * person only; a pass here is PASS_CI_ONLY.
 *
 * One person holds overlapping evidence for the same work, every piece
 * through the product's own doors:
 *   - a journal entry that shows tiling (journal-derived skill + hours);
 *   - the free-label skill claim "tiling" typed on the profile (the same
 *     skill, self-declared — two real records, one skill);
 *   - a self-declared job on the profile, saved TWICE with the same title and
 *     dates (the database folds an identical statement into one row).
 *
 * The questions:
 *   CV2-1 the stored rows: one catalogue skill row, one claim row, ONE
 *         self-declared engagement for the job (genuinely two records for the
 *         skill, one record for the job);
 *   CV2-2 on the Living CV every skill and every job is listed ONCE on the
 *         screen — the claim folded into the skill it already is (its variant
 *         count says so), the job once, potential capabilities kept
 *         (decision 0023); screenshots at 375 / 390 / 768 / 1440 px go to
 *         test-results/cv-shown-twice/ (artifact `cv-shown-twice`).
 *
 * THE CV SURVIVES SIGNING OUT (owner P0 "real use today", 2026-11-23). The
 * production walk uses minted sessions and never signs out; here a NEW
 * synthetic worker, at 375 × 667 (a phone: touch) and at 1440 px, through the
 * product's own doors only:
 *   CV3-1 fills the summary, a language, a job, an education entry, a skill
 *         claim and the work card; each save answers on screen and each row
 *         is read back from the database (superuser, read-only);
 *   CV3-2 signs out through the account menu's own sign-out control; a
 *         dashboard address then sends them to sign in (the session is gone);
 *   CV3-3 signs back in with e-mail and password on the real login form; the
 *         database still holds every row once; the profile and the Living CV
 *         show every saved item exactly once;
 *   CV3-4 edits the education entry again; the save answers on screen, the
 *         row is replaced in place, and the CV shows the edit once.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const WORKER = `cv-twice.worker.${RUN}@local.test`;
const NAME = `Synthetic Twice Worker ${RUN}`;
const PRIVATE = `atrium${RUN}`;
const JOURNAL = `Tiled the bathroom floor at the ${PRIVATE}, 6 hours`;
const JOB = `QA-SYNTHETIC tiling job ${RUN}`;
const CLAIM = "tiling";
const OUT = join(process.cwd(), "test-results", "cv-shown-twice");

let ctx: BrowserContext | null = null;
let page: Page | null = null;
test.afterAll(async () => {
  await ctx?.close().catch(() => {});
});
function me(): Page {
  if (!page) throw new Error("the walk's person has no session (an earlier step failed)");
  return page;
}

async function openCapabilities(p: Page) {
  await p.goto(`${BASE}/en/dashboard/profile#capabilities`);
  const main = p.getByRole("main");
  await expect(main.locator("#capabilities").first()).toBeVisible({ timeout: 60_000 });
  await clickUntilVisible(main.locator("#capabilities > summary").first(), main.getByTestId("capability-profile-manual-add"), {
    what: "the capability disclosure",
  });
  return main;
}

async function addJob(p: Page): Promise<void> {
  const main = await openCapabilities(p);
  await clickUntilVisible(main.getByTestId("add-experience-open"), main.getByTestId("add-experience-form"), {
    what: "the add-experience form",
  });
  const form = main.getByTestId("add-experience-form");
  await form.getByTestId("add-experience-title").fill(JOB);
  await form.getByTestId("add-experience-start-year").fill("2019");
  await form.getByTestId("add-experience-current").check();
  await form.getByTestId("add-experience-save").click();
  const row = main.getByTestId("capability-experience-row").filter({ hasText: JOB });
  await expect(row.or(form.getByTestId("add-experience-error")).first()).toBeVisible({ timeout: 30_000 });
  await expect(form.getByTestId("add-experience-error"), "the job is saved").toHaveCount(0);
}

// Each group is serial on its own, so a CV2 failure hides no CV3 walk (and
// one CV3 screen's failure hides no other).
test.describe("CV2 — overlapping evidence, shown once", () => {
  test.describe.configure({ mode: "serial" });

  test("CV2-1. overlapping evidence through the product's own doors; the stored rows", async ({ browser }: { browser: Browser }) => {
    ctx = await browser.newContext({ timezoneId: "UTC" });
    page = await ctx.newPage();
    await signUp(page, BASE, WORKER);
    await onboard(page, "work", NAME);
    await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
    const profileId = await userId(WORKER);
    const [worker] = sql<{ id: string }>(`select id from public.workers where profile_id = ${lit(profileId)}`);
    expect(worker?.id, "a worker record exists without any company").toBeTruthy();

    // 1. Journal → skill evidence.
    await recordJournal(page, BASE, JOURNAL);
    await expect
      .poll(
        () =>
          sql<{ source: string }>(
            `select ws.source from public.worker_skills ws join public.skills s on s.id = ws.skill_id
              where ws.worker_id = ${lit(worker!.id)} and s.slug = 'tiling'`,
          )[0]?.source ?? null,
        { message: "tiling is evidenced by the journal", timeout: 60_000 },
      )
      .toBe("work_journal");

    // 2. The same skill typed as a free label on the profile.
    const main = await openCapabilities(page);
    const form = main.getByTestId("capability-profile-manual-add");
    await form.getByTestId("capability-profile-manual-input").fill(CLAIM);
    await form.getByTestId("capability-profile-manual-add-button").click();
    await expect
      .poll(
        () =>
          sql<{ n: number }>(
            `select count(*)::int as n from public.profile_skill_claims
              where profile_id = ${lit(profileId)} and lower(label) = ${lit(CLAIM)}`,
          )[0]?.n ?? 0,
        { message: "the claim is stored as the person typed it", timeout: 30_000 },
      )
      .toBe(1);

    // 3. The same job stated twice, identically.
    await addJob(page);
    await addJob(page);
    const jobs = sql<{ id: string }>(
      `select id from public.engagement_contexts
        where profile_id = ${lit(profileId)} and organization_id is null and title = ${lit(JOB)}`,
    );
    expect(jobs.length, "an identical self-declared job is ONE record (the RPC returns the existing row)").toBe(1);

    // Two real records for the skill (catalogue row + claim row) — nothing is
    // merged or deleted in the data; the presentation folds them.
    const skillRows = sql<{ n: number }>(
      `select count(*)::int as n from public.worker_skills ws join public.skills s on s.id = ws.skill_id
        where ws.worker_id = ${lit(worker!.id)} and s.slug = 'tiling'`,
    );
    expect(skillRows[0]?.n, "one catalogue row for tiling").toBe(1);
  });

  test("CV2-2. the Living CV lists every skill and every job once on the screen", async () => {
    const p = me();
    mkdirSync(OUT, { recursive: true });
    for (const width of [375, 390, 768, 1440] as const) {
      await p.setViewportSize({ width, height: 900 });
      await p.goto(`${BASE}/en/cv`);
      const cv = p.getByRole("main");
      const skills = cv.getByTestId("cv-skills");
      await expect(skills, "the skills section renders").toBeVisible({ timeout: 60_000 });
      await p.screenshot({ path: join(OUT, `cv-${width}.png`), fullPage: true });

      // THE SKILL. Every list entry on the screen that names it — any list item
      // or skill chip anywhere in the page, outside the career-journey DIAGRAM
      // (its legend is a key to the drawing, not a list of skills). Before the
      // fix the hero's "What you can do" list made this 2.
      const tilingChips = skills.locator("[data-magnitude]", { hasText: /^\s*Tiling/ });
      const anyListing = cv.locator(':is(li, [data-magnitude]):not([data-testid="cv-journey"] *)', { hasText: /^\s*Tiling/ });
      const skillShown = await anyListing.count();
      expect.soft(skillShown, `${width}px: tiling is listed once`).toBe(1);
      await expect(tilingChips, `${width}px: the one listing is the canonical skill presentation`).toHaveCount(1);
      // The claim "tiling" is folded into the skill it already is — said, not hidden.
      await expect(tilingChips.first(), "the claim stands inside the skill").toHaveAttribute("data-variants", "2");
      await expect(cv.getByTestId("cv-tier-evidence").locator("[data-magnitude]", { hasText: /^\s*Tiling/ })).toHaveCount(1);
      // Decision 0023: inference kept — a potential capability from recorded tiling.
      await expect(cv.getByTestId("cv-potential"), "potential capabilities are still derived").toBeVisible();

      // THE JOB. Every list item on the screen that names it, outside the
      // journey diagram. Before the fix the hero's "Where you have worked" list
      // made this 2.
      const historyNodes = cv.getByTestId("cv-history-node").filter({ hasText: JOB });
      const jobShown = await cv.locator('li:not([data-testid="cv-journey"] *)', { hasText: JOB }).count();
      expect.soft(jobShown, `${width}px: the job is listed once`).toBe(1);
      await expect(historyNodes, `${width}px: the one listing is the work history`).toHaveCount(1);
      await expect(historyNodes.first()).toBeVisible();

      // No sideways scroll at any width.
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width}px: no horizontal scroll`).toBeLessThanOrEqual(1);
    }
  });
});

// ── CV3: the CV survives signing out ────────────────────────────────────────

const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const SCREENS = [
  { name: "375", touch: true, viewport: { width: 375, height: 667 } },
  { name: "1440", touch: false, viewport: { width: 1440, height: 900 } },
] as const;

/**
 * How many times `needle` is SHOWN: visible text nodes (outside pickers,
 * options and screen-reader-only text) plus visible fields holding it. The
 * career-journey diagram is excluded, as above (a drawing, not a listing).
 */
async function shownCount(p: Page, needle: string): Promise<number> {
  return p.evaluate((n) => {
    const visible = (el: Element) => {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const skip = 'option, select, script, style, template, [role="option"], [role="listbox"], [data-testid="cv-journey"]';
    let count = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      if (!el || !t.textContent?.includes(n) || el.closest(skip) || !visible(el)) continue;
      count += 1;
    }
    for (const f of Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))) {
      if (f.type !== "hidden" && f.value.includes(n) && !f.closest(skip) && visible(f)) count += 1;
    }
    return count;
  }, needle);
}

for (const screen of SCREENS) {
  test.describe(`CV3 at ${screen.viewport.width} × ${screen.viewport.height}`, () => {
    test.describe.configure({ mode: "serial" });
    const tag = `${RUN}-${screen.name}`;
    const address = `cv-signout.worker.${tag}@local.test`;
    const v = {
      headline: `QA-SYNTHETIC headline ${tag}`,
      bio: `QA-SYNTHETIC bio ${tag}`,
      language: "Українська",
      level: "B2",
      job: `QA-SYNTHETIC job ${tag}`,
      school: `QA-SYNTHETIC school ${tag}`,
      schoolEdited: `QA-SYNTHETIC school ${tag} edited`,
      claim: `QA-SYNTHETIC claim ${tag}`,
      status: "available",
      countries: "LT,NO",
    };
    const who: { profileId: string; workerId: string } = { profileId: "", workerId: "" };
    let sctx: BrowserContext | null = null;
    let sp: Page | null = null;
    test.afterAll(async () => {
      await sctx?.close().catch(() => {});
    });
    const person = (): Page => {
      if (!sp) throw new Error("the walk's person has no page (an earlier step failed)");
      return sp;
    };
    const press = (l: Locator) => (screen.touch ? l.tap() : l.click());
    /** Press until the result shows: a press before hydration is a silent no-op. */
    const pressUntil = async (target: Locator, result: Locator) => {
      await expect(async () => {
        if (!(await result.isVisible().catch(() => false))) await press(target);
        await expect(result).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 60_000 });
    };
    const pickOption = async (scope: Locator, testId: string, option: string) => {
      await press(scope.getByTestId(testId));
      await press(person().getByRole("option", { name: option, exact: true }).first());
    };
    const profileAt = async (hash: string): Promise<Locator> => {
      const p = person();
      await p.goto(`${BASE}/en/dashboard/profile#${hash}`);
      await p.reload();
      const main = p.getByRole("main");
      const target = main.locator(`#${hash}`).first();
      await expect(target, `#${hash} is on the page`).toBeVisible({ timeout: 60_000 });
      if ((await target.evaluate((el) => el.tagName)) === "DETAILS") await expect(target, `#${hash} is open`).toHaveAttribute("open", "", { timeout: 30_000 });
      return main;
    };

    /** Every row the walk saved, read back from the local database (superuser, read-only). */
    const stored = () => {
      const w = sql<{ headline: string | null; bio: string | null; status: string | null; countries: string | null }>(
        `select headline, bio, availability_status as status, array_to_string(preferred_countries, ',') as countries
           from public.workers where profile_id = ${lit(who.profileId)}`,
      );
      return {
        workers: w.length,
        headline: w[0]?.headline ?? null,
        bio: w[0]?.bio ?? null,
        status: w[0]?.status ?? null,
        countries: w[0]?.countries ?? null,
        languages: sql<{ v: string }>(`select lang || ':' || level as v from public.worker_languages where worker_id = ${lit(who.workerId)} order by v`).map((r) => r.v),
        jobs: sql<{ v: string }>(
          `select title as v from public.engagement_contexts where profile_id = ${lit(who.profileId)} and organization_id is null order by v`,
        ).map((r) => r.v),
        schools: sql<{ v: string }>(`select institution_name as v from public.worker_education where profile_id = ${lit(who.profileId)} order by v`).map((r) => r.v),
        claims: sql<{ v: string }>(`select label as v from public.profile_skill_claims where profile_id = ${lit(who.profileId)} order by v`).map((r) => r.v),
      };
    };
    const everything = (school: string) => ({
      workers: 1,
      headline: v.headline,
      bio: v.bio,
      status: v.status,
      countries: v.countries,
      languages: [`uk:${v.level}`],
      jobs: [v.job],
      schools: [school],
      claims: [v.claim],
    });
    const proof = (what: string) => console.info(`[cv-signout] ${screen.name} px ${what}`);

    test(`CV3-1 (${screen.name}). a new worker fills six CV sections; every save answers and is stored`, async ({ browser }) => {
      sctx = await browser.newContext({
        viewport: screen.viewport,
        timezoneId: "UTC",
        ...(screen.touch ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: PHONE_UA } : {}),
      });
      sp = await sctx.newPage();
      const p = person();
      await signUp(p, BASE, address);
      await onboard(p, "work", `Synthetic Sign-out Worker ${tag}`);
      await p.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
      who.profileId = await userId(address);
      who.workerId = sql<{ id: string }>(`select id from public.workers where profile_id = ${lit(who.profileId)}`)[0]?.id ?? "";
      expect(who.workerId, "a worker record exists without any company").toBeTruthy();

      // 1. The summary (headline + bio).
      {
        const main = await profileAt("profile-public-summary");
        const section = main.getByTestId("profile-public-summary");
        const save = section.getByTestId("profile-public-summary-save");
        await expect(async () => {
          await section.getByTestId("profile-public-headline").fill(v.headline);
          await section.getByTestId("profile-public-bio").fill(v.bio);
          await expect(save).toBeEnabled({ timeout: 2_000 });
        }, "the typed summary is taken").toPass({ timeout: 30_000 });
        await press(save);
        await expect(section.getByTestId("profile-public-summary-saved"), "the summary save answers").toBeVisible({ timeout: 30_000 });
        await expect.poll(() => [stored().headline, stored().bio], { message: "the summary is stored", timeout: 30_000 }).toEqual([v.headline, v.bio]);
        proof("summary: answered, stored");
      }

      // 2. A language.
      {
        const main = await profileAt("cv-languages");
        const sec = main.getByTestId("worker-languages");
        const form = sec.getByTestId("worker-languages-add-form");
        await pickOption(form, "worker-languages-lang", v.language);
        await pickOption(form, "worker-languages-level", v.level);
        await press(form.getByTestId("worker-languages-add"));
        await expect(
          sec.getByTestId("worker-languages-status").and(person().locator('[data-state="added"]')).or(sec.getByTestId("worker-languages-error")),
          "the language save answers",
        ).toBeVisible({ timeout: 30_000 });
        await expect(sec.getByTestId("worker-languages-error"), "the language save is not refused").toHaveCount(0);
        await expect(sec.getByTestId("worker-language-uk")).toContainText(v.level, { timeout: 30_000 });
        await expect.poll(() => stored().languages, { message: "the language is stored once", timeout: 30_000 }).toEqual([`uk:${v.level}`]);
        proof("language: answered, stored once");
      }

      // 3. A work-history entry.
      {
        const main = await profileAt("capabilities");
        await pressUntil(main.getByTestId("add-experience-open").filter({ visible: true }).first(), main.getByTestId("add-experience-form"));
        const form = main.getByTestId("add-experience-form");
        await form.getByTestId("add-experience-title").fill(v.job);
        await form.getByTestId("add-experience-start-year").fill("2019");
        await form.getByTestId("add-experience-current").check();
        await press(form.getByTestId("add-experience-save"));
        const row = main.getByTestId("capability-experience-row").filter({ hasText: v.job });
        await expect(row.or(form.getByTestId("add-experience-error")).first(), "the job save answers").toBeVisible({ timeout: 30_000 });
        await expect(form.getByTestId("add-experience-error"), "the job save is not refused").toHaveCount(0);
        await expect.poll(() => stored().jobs, { message: "the job is stored once", timeout: 30_000 }).toEqual([v.job]);
        proof("work history: answered, stored once");
      }

      // 4. An education entry.
      {
        const main = await profileAt("cv-education");
        const sec = main.getByTestId("worker-education");
        await pressUntil(sec.getByTestId("worker-education-add-open"), sec.getByTestId("worker-education-form"));
        const form = sec.getByTestId("worker-education-form");
        await form.getByTestId("worker-education-institution").fill(v.school);
        await pickOption(form, "worker-education-type", "Vocational");
        await press(form.getByTestId("worker-education-save"));
        const row = sec.getByTestId("worker-education-row").filter({ hasText: v.school });
        await expect(row.or(sec.getByTestId("worker-education-error")).first(), "the education save answers").toBeVisible({ timeout: 30_000 });
        await expect(sec.getByTestId("worker-education-error"), "the education save is not refused").toHaveCount(0);
        await expect.poll(() => stored().schools, { message: "the education entry is stored once", timeout: 30_000 }).toEqual([v.school]);
        proof("education: answered, stored once");
      }

      // 5. A skill claim, in the person's own words.
      {
        const main = await profileAt("capabilities");
        const form = main.getByTestId("capability-profile-manual-add");
        const input = form.getByTestId("capability-profile-manual-input");
        await input.scrollIntoViewIfNeeded();
        await input.fill(v.claim);
        await press(form.getByTestId("capability-profile-manual-add-button"));
        await expect.poll(() => input.inputValue(), { message: "the claim save answered", timeout: 30_000 }).toBe("");
        await expect(main.getByTestId("capability-profile-claim").filter({ hasText: v.claim }), "the claim chip shows").toBeVisible({ timeout: 30_000 });
        await expect.poll(() => stored().claims, { message: "the claim is stored once", timeout: 30_000 }).toEqual([v.claim]);
        proof("skill claim: answered, stored once");
      }

      // 6. The work card (availability and countries).
      {
        const main = await profileAt("cv-availability");
        const toggle = main.getByTestId("work-card-editor-toggle");
        const form = main.getByTestId("work-card-editor");
        await expect(async () => {
          if ((await toggle.getAttribute("aria-expanded")) !== "true") await press(toggle);
          await expect(form).toBeVisible({ timeout: 2_000 });
        }, "the work card editor opens").toPass({ timeout: 30_000 });
        await form.locator('select[name="availability_status"]').selectOption(v.status);
        await form.locator('input[name="preferred_countries"]').fill("LT, NO");
        await press(form.getByTestId("work-card-save"));
        await expect(form.getByTestId("work-card-saved").or(form.getByTestId("work-card-error")), "the work card save answers").toBeVisible({ timeout: 30_000 });
        await expect(form.getByTestId("work-card-error"), "the work card save is not refused").toHaveCount(0);
        await expect.poll(() => [stored().status, stored().countries], { message: "the work card is stored", timeout: 30_000 }).toEqual([v.status, v.countries]);
        proof("work card: answered, stored");
      }

      expect(stored(), "every saved row, once").toEqual(everything(v.school));
    });

    test(`CV3-2 (${screen.name}). sign-out through the account menu; the session is gone`, async () => {
      const p = person();
      await p.goto(`${BASE}/en/dashboard/profile`);
      const trigger = p.getByTestId("account-menu-trigger").filter({ visible: true }).first();
      const signOut = p.getByTestId("account-menu-signout");
      await pressUntil(trigger, signOut);
      await press(signOut);
      await p.waitForURL(/\/en\/auth\/login/, { timeout: 30_000 });
      await p.goto(`${BASE}/en/dashboard/profile`);
      await p.waitForURL(/\/en\/auth\/login/, { timeout: 30_000 });
      await expect(p.locator('input[name="email"]'), "the login form is shown, not the profile").toBeVisible({ timeout: 30_000 });
      proof("signed out: a dashboard address sends them to sign in");
    });

    test(`CV3-3 (${screen.name}). signed back in: every item stored once and shown once on the profile and the Living CV`, async () => {
      const p = person();
      await signIn(p, BASE, address);
      expect(stored(), "nothing lost or doubled in the database across sign-out").toEqual(everything(v.school));

      // THE PROFILE, every disclosure opened (all a person can reveal).
      await p.goto(`${BASE}/en/dashboard/profile`);
      const main = p.getByRole("main");
      await expect(main.getByTestId("profile-public-summary")).toBeAttached({ timeout: 60_000 });
      await p.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await p.evaluate(() => document.querySelectorAll("main details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
      await expect(main.getByTestId("profile-public-headline"), "the headline is back").toHaveValue(v.headline, { timeout: 30_000 });
      await expect(main.getByTestId("profile-public-bio"), "the bio is back").toHaveValue(v.bio);
      await expect(main.getByTestId("worker-language-uk"), "the language is back, once").toHaveCount(1);
      await expect(main.getByTestId("worker-language-uk")).toContainText(v.level);
      await expect(main.getByTestId("capability-experience-row").filter({ hasText: v.job }), "the job is back, once").toHaveCount(1);
      await expect(main.getByTestId("worker-education-row").filter({ hasText: v.school }), "the education entry is back, once").toHaveCount(1);
      await expect(main.getByTestId("capability-profile-claim").filter({ hasText: v.claim }), "the claim is back, once").toHaveCount(1);
      const toggle = main.getByTestId("work-card-editor-toggle");
      const card = main.getByTestId("work-card-editor");
      await expect(async () => {
        if ((await toggle.getAttribute("aria-expanded")) !== "true") await press(toggle);
        await expect(card).toBeVisible({ timeout: 2_000 });
      }, "the work card editor opens").toPass({ timeout: 30_000 });
      await expect(card.locator('select[name="availability_status"]'), "the availability is back").toHaveValue(v.status);
      await expect(card.locator('input[name="preferred_countries"]'), "the countries are back").toHaveValue(/LT,\s*NO/);
      for (const [what, needle] of [
        ["headline", v.headline],
        ["bio", v.bio],
        ["language", v.language],
        ["job", v.job],
        ["education", v.school],
        ["skill claim", v.claim],
      ] as const) {
        const n = await shownCount(p, needle);
        proof(`profile after sign-in: ${what} shown ${n}x`);
        expect.soft(n, `${screen.name}px profile: the ${what} is shown exactly once`).toBe(1);
      }

      // THE LIVING CV.
      await p.goto(`${BASE}/en/cv`);
      const cv = p.getByRole("main");
      await expect(cv.getByTestId("cv-skills"), "the Living CV renders").toBeVisible({ timeout: 60_000 });
      await expect(cv.getByTestId("cv-languages"), "the language is on the CV").toContainText(`${v.language} · ${v.level}`);
      await expect(cv.getByTestId("cv-history-node").filter({ hasText: v.job }), "the job is on the CV, once").toHaveCount(1);
      await expect(cv.getByTestId("cv-education-row").filter({ hasText: v.school }), "the education entry is on the CV, once").toHaveCount(1);
      await expect(cv.locator('[data-testid="cv-tier-declared"]', { hasText: v.claim }).first(), "the claim is declared on the CV").toBeVisible();
      for (const [what, needle] of [
        ["language", v.language],
        ["job", v.job],
        ["education", v.school],
        ["skill claim", v.claim],
      ] as const) {
        const n = await shownCount(p, needle);
        proof(`Living CV after sign-in: ${what} shown ${n}x`);
        expect.soft(n, `${screen.name}px Living CV: the ${what} is shown exactly once`).toBe(1);
      }
    });

    test(`CV3-4 (${screen.name}). an item edited again after sign-in: the answer shows, stored in place, shown once`, async () => {
      const main = await profileAt("cv-education");
      const sec = main.getByTestId("worker-education");
      const rowOf = (text: string) => sec.getByTestId("worker-education-row").filter({ hasText: text });
      await press(rowOf(v.school).getByRole("button", { name: "Edit", exact: true }));
      const form = sec.getByTestId("worker-education-form");
      await expect(form.getByTestId("worker-education-institution"), "the edit opens with the saved text").toHaveValue(v.school, { timeout: 30_000 });
      await form.getByTestId("worker-education-institution").fill(v.schoolEdited);
      await press(form.getByTestId("worker-education-save"));
      await expect(rowOf(v.schoolEdited).or(sec.getByTestId("worker-education-error")).first(), "the edit answers on screen").toBeVisible({ timeout: 30_000 });
      await expect(sec.getByTestId("worker-education-error"), "the edit is not refused").toHaveCount(0);
      await expect.poll(() => stored().schools, { message: "the edit replaced the row", timeout: 30_000 }).toEqual([v.schoolEdited]);
      expect(stored(), "everything else untouched").toEqual(everything(v.schoolEdited));
      const p = person();
      await p.goto(`${BASE}/en/cv`);
      const cv = p.getByRole("main");
      await expect(cv.getByTestId("cv-education-row").filter({ hasText: v.schoolEdited }), "the edit is on the CV, once").toHaveCount(1, { timeout: 60_000 });
      expect(await shownCount(p, v.schoolEdited), `${screen.name}px Living CV: the edited entry is shown exactly once`).toBe(1);
      proof("edited after sign-in: answered, stored in place, on the CV once");
    });
  });
}
