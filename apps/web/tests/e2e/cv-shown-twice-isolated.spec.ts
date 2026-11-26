import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { clickUntilVisible } from "./click-until-visible";
import { BASE, isolatedStack, lit, onboard, recordJournal, signUp, sql, userId } from "./isolated-web-a-helpers";

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
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
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
  await p.goto(`${BASE}/en/dashboard/profile?tab=skills#capabilities`);
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
    await p.goto(`${BASE}/en/cv?tab=experience`);
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


test("CV2-3. chat CV import proposes skills and saves only the explicitly selected claim", async () => {
  const p = me();
  const profileId = await userId(WORKER);
  const labels = ["Programavimas", "Namų statyba"];
  const stored = () => sql<{ label: string }>(
    `select label from public.profile_skill_claims where profile_id = ${lit(profileId)}
       and label in (${labels.map(lit).join(",")}) order by label`,
  ).map(row => row.label);
  expect(stored(), "neither imported claim exists before the review").toEqual([]);

  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/lt/dashboard`);
  const composer = p.getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await composer.fill("Įkelk mano CV");
  await p.getByTestId("composer-send").click();
  await p.getByTestId("chat-chip-cv").last().click({ timeout: 60_000 });
  const flow = p.getByTestId("conversation-cv-flow");
  await expect(flow).toBeVisible({ timeout: 60_000 });
  await flow.locator('input[type="file"]').setInputFiles({
    name: "skills.txt", mimeType: "text/plain",
    buffer: Buffer.from("Įgūdžiai\nMoku programuoti ir statyti namus, kloju plyteles, dažau sienas."),
  });
  const claims = flow.getByTestId("conversation-cv-skill-claims");
  await expect(claims).toBeVisible({ timeout: 30_000 });
  for (const label of labels) await expect(claims.getByText(label, { exact: true })).toBeVisible();
  const save = flow.getByTestId("conversation-cv-skill-apply");
  await expect(save, "upload is a proposal, never consent to save").toBeDisabled();
  expect(stored(), "reading the file saved no claim").toEqual([]);
  for (const width of [1440, 390]) {
    await p.setViewportSize({ width, height: 900 });
    await flow.screenshot({ path: join(OUT, `cv-import-review-${width}.png`) });
    expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await claims.getByRole("listitem").filter({ hasText: labels[0] })
    .getByRole("button", { name: "Pridėti", exact: true }).click();
  await expect(save).toBeEnabled();
  expect(stored(), "selecting a suggestion still needs the save action").toEqual([]);
  await save.click();
  await expect(flow.getByTestId("conversation-cv-skill-applied")).toBeVisible({ timeout: 30_000 });
  expect(stored(), "only the selected claim was stored").toEqual([labels[0]]);
  await p.goto(`${BASE}/lt/cv?tab=experience`);
  await expect(p.getByRole("main").getByTestId("cv-skills").getByText(labels[0]!, { exact: true }))
    .toBeVisible({ timeout: 60_000 });
});
