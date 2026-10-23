import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { inviteCapGate } from "./invite-cap";
import { chooseWorkContextIfAsked } from "./worklog-context";
import { bearerOf, qaApi } from "./prod-qa-api";
import { test, expect, type Browser, type BrowserContext, type Page } from "./prod-walk";

/**
 * PRODUCTION BRIGADE FORMATION — owner programme 2026-10-12, P0 §3.
 *
 * Runs ONLY inside `.github/workflows/prod-qa-walk.yml` (PROD_QA_WALK=1) against
 * https://labourmarket.ai with sessions minted for the hard-coded synthetic
 * cast (`lib/testing/prod-qa-guard.ts`). No service-role call is made here: every
 * step is what a person does in the browser, and every assertion is what that
 * person sees.
 *
 * Cast (all `app_metadata.qa_synthetic`, organizations named QA-SYNTHETIC):
 *   owner    qa.owner+multiw   — owns "QA-SYNTHETIC Alfa"; creates the brigade
 *   worker   qa.worker+multiw  — employee of Alfa; invited, accepts (desktop)
 *   worker2  qa.worker+goal3   — employee of Alfa; invited, accepts (mobile)
 *   manager  qa.manager+multiw — owns "QA-SYNTHETIC Gama", NOT Alfa → must not see it
 *
 * The brigade is named "QA-SYNTHETIC Brigada <run>", so every metric and
 * monitor classifies it TEST, never REAL market data.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TEAM = `QA-SYNTHETIC Brigada ${RUN}`;
const ALFA = "QA-SYNTHETIC Alfa";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["owner", "worker", "worker2", "manager"].every((s) => existsSync(state(s)));

test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
const cap = inviteCapGate();
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");

async function as(browser: Browser, slot: string, mobile = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: "lt-LT",
    ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
  });
  // A returning browser (time zone + lm_tz cookie) comes from ./prod-walk.
  return { ctx, page: await ctx.newPage() };
}

const PEOPLE = "/lt/dashboard/company/people";

/** Make `orgName` the active workspace through the real header chip, standing
 *  on `path` — the page the step works on (every dashboard page carries the
 *  chip). The heavy people page is opened only by the steps that use it. */
async function useWorkspace(page: Page, orgName: string, path: string = PEOPLE): Promise<void> {
  await page.goto(path);
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
  await page.goto(path);
}

const links: Record<string, string> = {};
let teamTestId = "";

/**
 * 0. DISBAND — the owner disbands earlier runs' synthetic brigades through the
 * panel's own two-step control (disband_team_v1, owner-approved 2026-10-15).
 *
 * Two reasons, both real: it exercises disbanding in production exactly as a
 * person does it, and it keeps this walk honest — create_team_v1 caps an owner
 * at 20 ACTIVE brigades, and every run of this walk forms one. A brigade that
 * still has open work answers "has open work" and is left alone; that answer
 * is itself a correct product outcome, not a failure.
 */
test("0. owner disbands earlier synthetic brigades, keeping their history", async ({ browser }) => {
  // Up to twenty disband answers, each followed by the panel's own refresh of
  // a heavy page.
  test.setTimeout(480_000);
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  // The people page is heavy (many reads); 30 s like every other step — the
  // 5 s default failed a run while another walk loaded production (run
  // 39475645864) though the panel rendered.
  await expect(page.getByTestId("team-brigades-panel")).toBeVisible({ timeout: 30_000 });
  const leftovers = page
    .locator('[data-testid^="team-brigade-"]', { hasText: "QA-SYNTHETIC Brigada" })
    .filter({ has: page.locator('[data-testid^="team-disband-"]') });
  let disbanded = 0;
  let refused = 0;
  const tried = new Set<string>();
  // A brigade with an accepted offer on a need its buyer closed is refused as
  // open work (run 39573517480: the first six cards were all such brigades
  // while eight others could be disbanded, so the owner stayed at the 20-team
  // cap). Walk the whole list, and stop once three slots are free.
  for (let i = 0; i < 20 && disbanded < 3; i += 1) {
    const cards = await leftovers.all();
    let teamId = "";
    for (const c of cards) {
      const id = (await c.getAttribute("data-testid")) ?? "";
      if (!tried.has(id)) {
        teamId = id.replace("team-brigade-", "");
        tried.add(id);
        break;
      }
    }
    if (!teamId) break;
    // Addressed by its id, not by its place in a list the panel re-renders.
    const card = page.getByTestId(`team-brigade-${teamId}`);
    await card.getByTestId(`team-disband-${teamId}`).click();
    await expect(card.getByTestId(`team-disband-explain-${teamId}`)).toBeVisible();
    await card.getByTestId(`team-disband-confirm-${teamId}`).click();
    const msg = page.getByTestId("team-brigades-msg");
    await expect(msg).toBeVisible({ timeout: 30_000 });
    const text = await msg.innerText();
    if (/išformuota\. Jos istorija|was disbanded\. Its history/i.test(text)) {
      disbanded += 1;
      // The panel refreshes itself after the answer (router.refresh): the
      // disbanded brigade leaves the ACTIVE list without a reload. This
      // replaces a full page reload per disband (one heavy render each,
      // prod-qa run 39795574869) and checks more: the list really updates.
      await expect(card, "a disbanded brigade leaves the active list").toHaveCount(0, { timeout: 30_000 });
    } else if (/atvirų darbų|still has open work/i.test(text)) refused += 1;
    else throw new Error(`unexpected disband answer: ${text}`);
    await expect(page.getByTestId("team-brigades-panel")).toBeVisible();
  }
  // History is kept: every disbanded brigade is listed as such — after a
  // reload, so the history is the server's, not the panel's memory.
  if (disbanded > 0) {
    await page.reload();
    await expect(page.getByTestId("team-brigades-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("team-brigades-disbanded")).toBeVisible({ timeout: 30_000 });
  }
  console.info(`disband step: disbanded=${disbanded} refused_open_work=${refused}`);
  await ctx.close();
});

test("1-2. owner creates the brigade in Alfa", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await expect(page.getByTestId("team-brigades-panel")).toBeVisible();
  await page.getByTestId("team-create-name").fill(TEAM);
  await page.getByTestId("team-create-submit").click();
  const card = page.locator('[data-testid^="team-brigade-"]', { hasText: TEAM });
  // The created brigade must appear WITHOUT a reload. If it does not, reload
  // once to tell "the list did not refresh" (a UI defect, reported) from "the
  // brigade is not listed at all" (the step fails).
  const shownInPlace = await expect(card)
    .toBeVisible({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!shownInPlace) {
    await page.reload();
    const shownAfterReload = await expect(card)
      .toBeVisible({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    console.info(`1-2 diagnostics: brigade shown in place=false, after reload=${shownAfterReload}`);
    // A brigade that appears only after a reload is still a defect: the step
    // FAILS, with the diagnostic saying which of the two it was.
    throw new Error(
      shownAfterReload
        ? "the created brigade appears only after a reload (the panel does not refresh)"
        : "the created brigade is not listed even after a reload",
    );
  }
  await expect(card).toBeVisible({ timeout: 5_000 });
  teamTestId = (await card.getAttribute("data-testid"))!;
  await ctx.close();
});

// Synthetic display names (profiles of the allowlisted cast) and the address
// each one accepts with — typed only if the product asks for it.
for (const [slot, who, email] of [
  ["worker", /Vytas Darbininkas/, "qa.worker+multiw@labourmarket.ai"],
  ["worker2", /QA-SYNTHETIC Worker/, "qa.worker+goal3@labourmarket.ai"],
] as const) {
  test(`3-4. owner invites ${slot} and gets a working link (e-mail is off)`, async ({ browser }) => {
    const { ctx, page } = await as(browser, "owner");
    await useWorkspace(page, ALFA);
    const card = page.getByTestId(teamTestId);
    const teamId = teamTestId.replace("team-brigade-", "");
    const select = page.locator(`[id="team-add-${teamId}"]`);
    await select.waitFor({ state: "attached", timeout: 30_000 }).catch(() => undefined);
    if (!(await select.count())) {
      throw new Error(`no addable-member picker on the brigade card; card ends: ${(await card.innerText()).slice(-700)}`);
    }
    const options = await select.locator("option").allInnerTexts();
    const pick = options.find((o) => who.test(o));
    expect(pick, `addable list offers ${slot}: ${options.join(" | ")}`).toBeTruthy();
    await select.selectOption({ label: pick! });
    await page.getByTestId(`team-invite-member-${teamId}`).click();
    // The owner may not be able to read the worker's address (profiles are
    // own-row only); the product then asks for it and the owner types it.
    const typed = page.getByTestId(`team-invite-email-${teamId}`);
    const asked = await Promise.race([
      typed.waitFor({ state: "visible", timeout: 20_000 }).then(() => true),
      page.getByTestId("team-invite-link").waitFor({ state: "visible", timeout: 20_000 }).then(() => false),
    ]).catch(() => false);
    if (asked) {
      await typed.fill(email);
      await page.getByTestId(`team-invite-member-${teamId}`).click();
    }
    const box = page.getByTestId("team-invite-link");
    if (!(await box.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false))) {
      const msg = await page.getByTestId("team-brigades-msg").innerText().catch(() => "(no message)");
      await ctx.close();
      cap.check(msg);
      throw new Error(`no invite link; the product said: ${msg}`);
    }
    const url = (await box.locator("code").innerText()).trim();
    expect(url).toMatch(/^https:\/\/labourmarket\.ai\/[a-z]{2}\/invite\//);
    links[slot] = url;
    await ctx.close();
  });
}

test("5-7. each worker opens the link, accepts, and is in the brigade (desktop + mobile)", async ({ browser }) => {
  for (const [slot, mobile] of [
    ["worker", false],
    ["worker2", true],
  ] as const) {
    const { ctx, page } = await as(browser, slot, mobile);
    await page.goto(links[slot]!);
    await expect(page.getByTestId("invite-page")).toBeVisible();
    await expect(page.getByTestId("invite-org")).toContainText("QA-SYNTHETIC Brigada");
    await page.getByTestId("invite-accept").click();
    // Accepting lands the person in their workspace with a notice.
    await page.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
    console.info(`[brigade] ${slot} landed on ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
    // Re-opening the same link is now closed, not a second membership.
    await page.goto(links[slot]!);
    await expect(page.getByTestId("invite-accepted-by-you").or(page.getByTestId("invite-closed"))).toBeVisible();
    await ctx.close();
  }
});

test("8-9. the owner sees both members, joined by their own acceptance", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const card = page.getByTestId(teamTestId);
  await expect(card).toContainText(/2/);
  await expect(card.locator("li .text-state-success")).toHaveCount(2);
  await ctx.close();
});

test("org isolation: the owner of another company does not see Alfa's brigade", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await page.goto("/lt/dashboard/company/people");
  await expect(page.locator("body")).not.toContainText(TEAM);
  await ctx.close();
});

test("14. persistence: a brand-new owner session still shows the brigade with both members", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  // A brand-new session renders the heavy people page cold: 30 s like every
  // other step (run 39582274844 failed at the 5 s default though step 8-9 of
  // the same run had shown the brigade with both members).
  await expect(page.getByTestId(teamTestId)).toContainText(TEAM, { timeout: 30_000 });
  await expect(page.getByTestId(teamTestId).locator("li .text-state-success")).toHaveCount(2, { timeout: 30_000 });
  await ctx.close();
});

// ── §4 B2B: a buyer's need → the brigade offers → both talk → agreed in principle ──
//
// The buyer is QA-SYNTHETIC Gama (qa.manager, verified). Its need is labelled
// with the run id so the brigade picks exactly this need and never a real
// company's. "Accepted" is AGREED IN PRINCIPLE, not a contract.
const NEED_ROLE = `QA-SYNTHETIC murininkai ${RUN}`;
const GAMA = "QA-SYNTHETIC Gama";
let needId = "";
let offerId = "";

test("B2B-1. buyer (Gama) posts a need through the company demand intake", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA, "/lt/dashboard/company/needs?audience=need#demand-intake");
  await page.getByTestId("demand-role").fill(NEED_ROLE);
  await page.getByTestId("demand-description").fill(`QA-SYNTHETIC ${RUN}: synthetic need for the production brigade walk, 2 people.`);
  await page.getByTestId("demand-next").click();
  const size = page.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("2");
  await page.getByTestId("demand-next").click();
  await page.getByTestId("demand-create").click();
  // Either the need is created, or the plan's open-need limit answers
  // honestly (a need from an earlier run is still open) — both are real.
  const done = page.getByTestId("demand-done");
  const limit = page.getByTestId("demand-open-need-limit");
  await expect(done.or(limit)).toBeVisible({ timeout: 30_000 });
  console.info(`[b2b] need: ${(await done.isVisible()) ? "created" : "open-need limit reached, the earlier need is used"}`);
  await ctx.close();
});

test("B2B-2. the brigade (2 members) offers itself against exactly that need", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const teamId = teamTestId.replace("team-brigade-", "");
  // The offer form is folded; opening it loads the offerable needs.
  await page.getByTestId(`team-demand-offer-section-${teamId}`).locator("summary").click();
  const select = page.getByTestId(`team-offer-demand-${teamId}`);
  await expect(select).toBeVisible({ timeout: 20_000 });
  // The free-text role is normalised to a profession slug, so the need is
  // found by its buyer, the only synthetic company that posts needs here.
  const option = select.locator("option:not([disabled])", { hasText: GAMA }).first();
  needId = (await option.getAttribute("value")) ?? "";
  expect(needId, "the brigade sees the buyer need by its name").not.toBe("");
  await select.selectOption(needId);
  await page.getByTestId(`team-offer-note-${teamId}`).fill("QA-SYNTHETIC offer: 2 people, from next month.");
  await page.getByTestId(`team-offer-submit-${teamId}`).click();
  await expect(page.getByTestId(`team-offer-sent-${teamId}`)).toContainText(GAMA, { timeout: 20_000 });
  await ctx.close();
});

const MSG = `QA-SYNTHETIC ${RUN}: can you start on the 3rd?`;

async function terms(page: Page, id: string) {
  const box = page.getByTestId(`team-offer-terms-${id}`);
  await box.locator("summary").click();
  return box;
}

test("B2B-3. buyer sees the offer and writes in its thread", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA, `/lt/dashboard/company/scouting?request=${needId}`);
  const received = page.locator('[data-testid^="team-offer-received-"]', { hasText: "QA-SYNTHETIC Brigada" }).first();
  await expect(received).toBeVisible({ timeout: 20_000 });
  offerId = (await received.getAttribute("data-testid"))!.replace("team-offer-received-", "");
  await page.getByTestId(`team-offer-message-${offerId}`).click();
  await page.waitForURL(/\/dashboard\/communication/, { timeout: 20_000 });
  // One thread per pair: opened from THIS offer, it names the need and the
  // offer's live status, so offers between the same two never blur together.
  await expect(page.getByTestId("thread-offer-context")).toBeVisible({ timeout: 20_000 });
  console.info(`[b2b] thread context: ${await page.getByTestId("thread-offer-context").innerText()}`);
  const input = page.getByTestId("communication-composer-input");
  await input.fill(MSG);
  await input.locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  // Sent = the composer is cleared; anything else is the product's answer.
  const sent = await expect(input).toHaveValue("", { timeout: 20_000 }).then(() => true, () => false);
  if (!sent) {
    const why = await page.getByTestId("communication-composer-error").innerText().catch(() => "(no error shown)");
    throw new Error(`the buyer's message was not sent: ${why}`);
  }
  await expect(page.locator("main")).toContainText(MSG, { timeout: 20_000 });
  console.info(`[b2b] thread ${new URL(page.url()).pathname}`);
  await ctx.close();
});

test("B2B-4. supplier proposes terms v1 (people, rate, dates, scope)", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const teamId = teamTestId.replace("team-brigade-", "");
  await page.getByTestId(`team-demand-offer-section-${teamId}`).locator("summary").click();
  const box = await terms(page, offerId);
  const form = box.getByTestId(`team-offer-terms-form-${offerId}`);
  await form.locator('input[type="number"]').fill("2");
  await form.locator('input[type="text"]').fill("32 EUR/h");
  await form.locator('input[type="date"]').nth(0).fill("2026-11-02");
  await form.locator('input[type="date"]').nth(1).fill("2026-12-18");
  await form.locator("textarea").first().fill("QA-SYNTHETIC: masonry, 2 people");
  await box.getByTestId(`team-offer-terms-propose-${offerId}`).click();
  await expect(box.getByTestId(`team-offer-terms-history-${offerId}`)).toContainText("32 EUR/h", { timeout: 20_000 });
  await ctx.close();
});

test("B2B-5. buyer counters with v2; it cannot accept its own counter", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA, `/lt/dashboard/company/scouting?request=${needId}`);
  const box = await terms(page, offerId);
  await expect(box.getByTestId(`team-offer-terms-history-${offerId}`)).toContainText("32 EUR/h", { timeout: 20_000 });
  const form = box.getByTestId(`team-offer-terms-form-${offerId}`);
  await form.locator('input[type="text"]').fill("30 EUR/h");
  await box.getByTestId(`team-offer-terms-propose-${offerId}`).click();
  await expect(box.getByTestId(`team-offer-terms-history-${offerId}`)).toContainText("30 EUR/h", { timeout: 20_000 });
  await expect(box.getByTestId(`team-offer-terms-agree-${offerId}`)).toHaveCount(0);
  await ctx.close();
});

test("B2B-6. supplier agrees to v2: agreed in principle, history kept, message visible", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const teamId = teamTestId.replace("team-brigade-", "");
  await page.getByTestId(`team-demand-offer-section-${teamId}`).locator("summary").click();
  const box = await terms(page, offerId);
  await box.getByTestId(`team-offer-terms-agree-${offerId}`).click();
  const history = box.getByTestId(`team-offer-terms-history-${offerId}`);
  await expect(history).toContainText("30 EUR/h", { timeout: 20_000 });
  await expect(history).toContainText("32 EUR/h");
  await expect(page.getByTestId(`team-offer-sent-${teamId}`)).toContainText(/iš esmės|in principle|priimt|sutart/i, { timeout: 20_000 });
  await page.getByTestId(`team-offer-sent-message-${offerId}`).click();
  await page.waitForURL(/\/dashboard\/communication/, { timeout: 20_000 });
  await expect(page.locator("body")).toContainText(MSG);
  await ctx.close();
});

// ONE reusable synthetic project for the buyer, created only when it is missing,
// so runs never pile projects up. The team assignment itself is per run.
const GAMA_PROJECT = "QA-SYNTHETIC Gama brigados projektas";
let gamaProjectId = "";
let journaledBefore = 0;

/** The project's journaled hours as the operations centre shows them (the
 *  buyer's own view of work done on its project). */
async function journaledHours(
  page: Page,
  projectId: string,
  opts: { readonly navigate?: boolean } = {},
): Promise<number> {
  if (opts.navigate !== false) await page.goto(`/lt/dashboard/projects/${projectId}/operations`);
  const chip = page.getByTestId("ops-centre-hours-journaled");
  await expect(chip).toBeVisible({ timeout: 30_000 });
  // "Žurnale: 1 002,5 val." — the value follows the label's colon; grouping
  // separators (space, no-break space, narrow no-break space) are dropped
  // before parsing, so totals past 1,000 read as one number.
  const text = await chip.innerText();
  const value = text.slice(text.lastIndexOf(":") + 1).replace(/[\s  ]/g, "");
  const match = value.match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : 0;
}

test("B2B-7. buyer hands the agreed brigade into its own project as ONE team assignment", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA, "/lt/dashboard/projects");
  // Self-healing: an earlier run that stopped before B2B-10 left its brigade
  // assigned, and step 0 cannot disband a brigade with open work. End those
  // leftovers here (history is kept) so brigades never pile up to the cap.
  for (let i = 0; i < 6; i += 1) {
    const leftover = page
      .getByTestId("project-team-row")
      .filter({ hasText: "QA-SYNTHETIC Brigada" })
      .filter({ hasNotText: TEAM })
      .first();
    if ((await leftover.count()) === 0) break;
    await leftover.getByTestId("project-team-end").click();
    await page.waitForTimeout(2_000);
    await page.reload();
  }
  if ((await page.getByText(GAMA_PROJECT, { exact: false }).count()) === 0) {
    const form = page.getByTestId("project-create");
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.locator('input[name="title"]').fill(GAMA_PROJECT);
    await form.locator('button[type="submit"]').click();
    await expect(page.getByText(GAMA_PROJECT, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
    console.info("[b2b] buyer project created");
  }
  await page.goto(`/lt/dashboard/company/scouting?request=${needId}`);
  const accept = page.getByTestId(`team-offer-accept-${offerId}`);
  if (await accept.isVisible().catch(() => false)) await accept.click();
  const assign = page.getByTestId(`team-offer-assign-${offerId}`);
  await expect(assign, "an accepted offer offers the hand-off into a project").toBeVisible({ timeout: 30_000 });
  const projectOption = assign.locator("select option", { hasText: GAMA_PROJECT }).first();
  gamaProjectId = (await projectOption.getAttribute("value")) ?? "";
  expect(gamaProjectId, "the buyer's project is offered for the hand-off").not.toBe("");
  journaledBefore = await journaledHours(page, gamaProjectId);
  await page.goto(`/lt/dashboard/company/scouting?request=${needId}`);
  await page.getByTestId(`team-offer-assign-${offerId}`).locator("select").selectOption(gamaProjectId);
  await page.getByTestId(`team-offer-assign-submit-${offerId}`).click();
  await expect(page.getByTestId(`team-offer-received-${offerId}`)).toContainText(/Priskirta|Assigned/i, { timeout: 30_000 });
  console.info("[b2b] hand-off: the brigade is one team assignment on the buyer's project");
  await ctx.close();
});

const WORK = `QA-SYNTHETIC ${RUN}: šiandien 6 valandas brigada mūrijo sieną užsakovo objekte`;

test("B2B-8. a brigade member sees the buyer's project through the team and records the day's work on it", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/projects");
  const card = page.getByTestId("worker-project-card").filter({ hasText: GAMA_PROJECT }).first();
  await expect(card, "the team assignment makes the project the member's work context").toBeVisible({ timeout: 30_000 });
  await expect(card.getByTestId("worker-project-via-team")).toBeVisible();
  await page.goto("/lt/dashboard/journal");
  // ONE fill, as a person types once. The button enables only when the
  // recorder's own state holds the sentence, so a sentence typed before the
  // page finished loading must be kept by the recorder itself (run
  // 39570461256 lost it; quick-record.tsx now takes the field's early text).
  const text = page.getByTestId("journal-quick-record-text");
  const understand = page.getByTestId("journal-quick-record-understand");
  await text.fill(WORK);
  await expect(understand, "the recorder kept the sentence typed once").toBeEnabled({ timeout: 30_000 });
  await understand.click();
  const flow = page.getByTestId("worklog-flow");
  try {
    await expect(flow).toBeVisible({ timeout: 30_000 });
  } catch (err) {
    // Name the stage the recorder stopped at, so the next failure is a fact.
    const seen: string[] = [];
    for (const id of ["worklog-loading", "worklog-blocked", "worklog-error", "journal-quick-record-text"]) {
      if (await page.getByTestId(id).isVisible().catch(() => false)) {
        seen.push(`${id}: ${(await page.getByTestId(id).innerText().catch(() => "")).slice(0, 160)}`);
      }
    }
    console.info(`[b2b-8] readback not shown; visible: ${seen.join(" | ") || "none"}; url ${page.url()}`);
    throw err;
  }
  // The buyer's project is reached THROUGH THE BRIGADE, so it is offered under
  // the brigade's own work context (addTeamProjects: team org + project org),
  // never under the member's employer Alfa — picking Alfa showed only Alfa's
  // own project (run 39301125551).
  await chooseWorkContextIfAsked(page, new RegExp(TEAM));
  const project = page.getByTestId("worklog-project");
  if (await project.isVisible().catch(() => false)) {
    await project.selectOption(gamaProjectId);
  } else {
    await expect(page.getByTestId("worklog-project-auto")).toContainText(GAMA_PROJECT, { timeout: 10_000 });
  }
  await page.getByTestId("worklog-save").click();
  await page.getByTestId("worklog-confirm").click();
  const done = page.getByTestId("worklog-done");
  const failed = page.getByTestId("worklog-error").or(page.getByTestId("worklog-blocked"));
  await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
  if (!(await done.isVisible())) throw new Error(`the member's work was not saved: ${await failed.innerText()}`);
  await ctx.close();
});

test("B2B-9. the buyer sees the brigade's work on its own project", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  const ops = `/lt/dashboard/projects/${gamaProjectId}/operations`;
  await useWorkspace(page, GAMA, ops);
  // The first read is the page useWorkspace already opened; each later read
  // reloads it after a BACKING-OFF wait (3, 6, 9, 15 s — the same ~33 s budget
  // as six reads 5 s apart, with fewer heavy renders while the hours land).
  let after = await journaledHours(page, gamaProjectId, { navigate: false });
  for (const waitMs of [3_000, 6_000, 9_000, 15_000]) {
    if (after >= journaledBefore + 6) break;
    await page.waitForTimeout(waitMs);
    after = await journaledHours(page, gamaProjectId);
  }
  console.info(`[b2b] journaled hours on the buyer's project: ${journaledBefore} → ${after}`);
  expect(after, "the member's 6 hours reach the buyer's project").toBeGreaterThanOrEqual(journaledBefore + 6);
  await ctx.close();
});

/** Hours the hours-only door returns to `token` for the buyer's project (counts only, never a field). */
async function teamDoor(token: string | null): Promise<{ status: number; rows: number; hours: number; textFields: number }> {
  const res = await qaApi("/rest/v1/rpc/project_team_journal_hour_rows_v1", token, {
    method: "POST",
    body: { p_project_id: gamaProjectId },
  });
  const data = res.ok ? ((await res.json()) as { metrics: { metric_slug: string; value_numeric: number | null; unit_slug: string | null; value_text: string | null }[] }[]) : [];
  let hours = 0;
  let textFields = 0;
  for (const r of data) {
    for (const m of r.metrics ?? []) {
      if (m.metric_slug === "fragment_time" && m.unit_slug === "hours") hours += Number(m.value_numeric ?? 0);
      if (m.value_text !== null && m.metric_slug !== "work_date" && m.metric_slug !== "fragment_time") textFields += 1;
    }
    for (const k of Object.keys(r)) if (!["entry_key", "correction_of_key", "created_at", "context_key", "metrics", "confirmations"].includes(k)) textFields += 1;
  }
  return { status: res.status, rows: data.length, hours, textFields };
}

test("B2B-9b. the same hours by API: the buyer reads them, a third organization and an anonymous caller read nothing", async () => {
  test.skip(!existsSync(state("agency")) || !process.env.PROD_QA_SUPABASE_URL, "needs the agency session and the API url");
  const buyer = await teamDoor(bearerOf("manager"));
  expect(buyer.status, "the buyer's API call answers").toBe(200);
  expect(buyer.hours, "the buyer reads the brigade's hours on its own project").toBeGreaterThanOrEqual(6);
  expect(buyer.textFields, "no free text and no extra field leaves the door").toBe(0);
  const third = await teamDoor(bearerOf("agency"));
  expect(third.status, "an unrelated organization is answered").toBe(200);
  expect(third.rows, "an unrelated organization gets no rows").toBe(0);
  const anon = await teamDoor(null);
  expect(anon.rows, "an anonymous caller gets no rows").toBe(0);
  expect(anon.status, "an anonymous caller is refused").not.toBe(200);
  console.info(`[b2b] API door: buyer ${buyer.rows} row(s) ${buyer.hours} h; third org ${third.rows}; anon ${anon.status}`);
});

test("B2B-10. the buyer ends this run's team assignment (history kept), so the next run can disband the brigade", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA, "/lt/dashboard/projects");
  const row =page.getByTestId("project-team-row").filter({ hasText: TEAM }).first();
  await expect(row, "this run's brigade is assigned on the buyer's project").toBeVisible({ timeout: 30_000 });
  await row.getByTestId("project-team-end").click();
  await expect(page.getByTestId("project-team-row").filter({ hasText: TEAM })).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
});
