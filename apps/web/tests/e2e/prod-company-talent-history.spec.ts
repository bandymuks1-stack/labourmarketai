import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION — A COMPANY'S TALENT AND HISTORY CHAINS (registry rows that had
 * no production walk, 2026-10-25). Every step is what a person does in the
 * browser; every assertion is what they see after a fresh load.
 *
 *   4.12 Shortlist + notes — Gama posts a need, the worker raises a hand, Gama
 *        marks the person "saved" with an internal note; both persist; the
 *        worker and another organization read none of it (K-*).
 *   1.15 Org history + claim — Alfa's roster holds a person card BEFORE anyone
 *        claimed it; Alfa offers the link to its employee, the employee accepts
 *        on their own profile (phone), the roster says linked, and the employee
 *        withdraws it again; another organization and another worker see none
 *        of it (H-*).
 *   6.19 Team enquiries — Alfa forms a team, Gama finds it in the network
 *        directory and sends a structured enquiry, Alfa's owner accepts it in the
 *        team's inbox, and Gama sees the answer; an outside organization cannot
 *        see the team's inbox (T-*).
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   owner    qa.owner+multiw   — owns "QA-SYNTHETIC Alfa"
 *   worker   qa.worker+multiw  — Vytas, employee of Alfa
 *   worker2  qa.worker+goal3   — another worker (forbidden checks)
 *   manager  qa.manager+multiw — runs "QA-SYNTHETIC Gama"
 *   agency   qa.agency+multiw  — runs "QA-SYNTHETIC Agentūra" (forbidden checks)
 *
 * Locales: LT by default; the roster and the person card are re-read in
 * English (H-4). Widths: 1280 px; the employee answers the offer at 390 px.
 *
 * CLEANUP, pass or fail (`afterAll`, swept by tag): this run's need is closed
 * (the shortlist row stays as the closed need's history, its note cleared);
 * the roster link is withdrawn or refused; an open team enquiry is withdrawn;
 * every team named `QA-SYNTHETIC Komanda` is disbanded (history kept). The
 * imported roster person has one fixed synthetic name and is reused, like
 * prod-org-roster's. The one API call per chain reads with the caller's OWN
 * token. Failure messages carry states and counts only.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const GAMA = "QA-SYNTHETIC Gama";
const TAG = `QA-SYNTHETIC ${RUN}`;
const NEED_ROLE = `QA-SYNTHETIC atranka mūrininkai ${RUN}`;
const SHORTLIST_NOTE = `${TAG} vidinė pastaba: tinka objektui`;
/** One fixed roster name, reused by every run (an import of it is idempotent). */
const ROSTER_PERSON = "QA-SYNTHETIC Istorijos Asmuo";
const TEAM_PREFIX = "QA-SYNTHETIC Komanda";
const TEAM = `${TEAM_PREFIX} ${RUN}`;
// Enquiry messages refuse phone-like digit runs, and the run id is one: the
// marker spells the run id in letters.
const RUN_WORD = RUN.replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
const ENQUIRY = `QA-SYNTHETIC ${RUN_WORD} komandos užklausa objektui kitą mėnesį`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["owner", "worker", "worker2", "manager", "agency"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(
  browser: Browser,
  slot: string | null,
  opts: { locale?: "lt-LT" | "en-GB"; phone?: boolean } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...(slot ? { storageState: state(slot) } : {}),
    locale: opts.locale ?? "lt-LT",
    ...(opts.phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/** The page content, never the streaming holder (prod-company-chain.spec.ts, #2729). */
const inMain = (page: Page): Locator => page.getByRole("main");

async function rendered(page: Page, label: string): Promise<void> {
  expect(/\/auth\/(login|sign-?in)/.test(page.url()), `${label}: bounced to sign-in`).toBe(false);
  await expect(page.getByTestId("error-boundary-message"), `${label}: error boundary`).toHaveCount(0);
  await expect(page.getByTestId("global-error-message"), `${label}: global error`).toHaveCount(0);
}

async function fitsPhone(page: Page, label: string): Promise<void> {
  const { doc, body, inner } = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(Math.max(doc, body), `${label}: wider than the phone (innerWidth ${inner})`).toBeLessThanOrEqual(inner + 1);
}

/** Make `orgName` the active workspace through the real header chip. */
async function useWorkspace(page: Page, orgName: string): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

/** The caller's own ids, read with the caller's own token. */
async function ownIds(slot: string): Promise<{ workerId: string; profileId: string }> {
  const token = bearerOf(slot);
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id,profile_id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, `${slot}: own worker row answered`).toBe(200);
  const rows = (await res.json()) as { id: string; profile_id: string }[];
  expect(rows.length, `${slot}: exactly one own worker row`).toBe(1);
  return { workerId: rows[0].id, profileId: rows[0].profile_id };
}

/**
 * Let the page hydrate before a click that only React handles: a click that
 * lands before React attaches does nothing (found smoking these walks on the
 * local stack). Network idle is the cheap proxy; never fatal.
 */
const settle = (page: Page) => page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

const firstLine = (e: unknown) => ((e as Error).message ?? String(e)).split("\n")[0].slice(0, 160);

let workerId = "";

test("C-0. the worker's own ids (own row, own token)", async () => {
  ({ workerId } = await ownIds("worker"));
  expect(workerId).toMatch(/^[0-9a-f-]{36}$/);
});

// ═════════════════════════════════════════════ 4.12 shortlist + notes (K)

function requestIdOf(href: string | null): string {
  return /request=([0-9a-f-]{36})/.exec(href ?? "")?.[1] ?? "";
}

/** Needs this run already closed — afterAll never revisits them. */
const closedHere = new Set<string>();

/** Close one need through its own lifecycle controls (Gama is the active workspace). */
async function closeNeed(page: Page, id: string): Promise<"closed" | "already-closed"> {
  await page.goto(`/lt/dashboard/company/scouting?request=${id}`);
  const controls = inMain(page).getByTestId("demand-lifecycle-controls").first();
  const unstructured = inMain(page).getByTestId("scouting-not-structured").first();
  await expect(controls.or(unstructured).first()).toBeVisible({ timeout: 30_000 });
  if (await controls.isVisible()) {
    if ((await controls.getAttribute("data-demand-status")) === "closed") return "already-closed";
    await controls.getByTestId("demand-close").click();
    await expect(controls).toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
    closedHere.add(id);
    return "closed";
  }
  // A need that names no trade is closed where the product offers that for
  // every need: the chat workspace's candidates result (prod-company-chain).
  await page.goto(`/lt/dashboard?result=candidates&demand=${id}`);
  const close = inMain(page).getByTestId("candidates-close-demand").filter({ visible: true }).first();
  const reopen = inMain(page).getByTestId("candidates-reopen-demand").filter({ visible: true }).first();
  await expect(close.or(reopen).first(), "the need's own close/reopen action").toBeVisible({ timeout: 60_000 });
  if (await reopen.isVisible()) return "already-closed";
  await close.click();
  await expect(reopen).toBeVisible({ timeout: 30_000 });
  closedHere.add(id);
  return "closed";
}

async function submitNeed(page: Page): Promise<"done" | "limit"> {
  await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await inMain(page).getByTestId("demand-role").fill(NEED_ROLE);
  await inMain(page).getByTestId("demand-description").fill(`${TAG}: synthetic need for the production talent walk, 1 mūrininkas.`);
  await inMain(page).getByTestId("demand-next").click();
  const size = inMain(page).getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await inMain(page).getByTestId("demand-next").click();
  await inMain(page).getByTestId("demand-create").click();
  const done = inMain(page).getByTestId("demand-done");
  const limit = inMain(page).getByTestId("demand-open-need-limit");
  await expect(done.or(limit)).toBeVisible({ timeout: 30_000 });
  return (await limit.isVisible()) ? "limit" : "done";
}

/**
 * Gama is on the free plan (one open need): a walk that stopped before its
 * cleanup leaves a QA-SYNTHETIC need open and refuses the next one (the limit
 * is the product working). Close those leftovers — never this run's need.
 */
async function closeSyntheticLeftovers(page: Page): Promise<number> {
  await page.goto("/lt/dashboard/company/scouting");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const ids = new Set<string>();
  for (const a of await page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: "QA-SYNTHETIC" }).all()) {
    if ((await a.innerText().catch(() => "")).includes(RUN)) continue;
    const id = requestIdOf(await a.getAttribute("href"));
    if (id) ids.add(id);
  }
  let closed = 0;
  for (const id of [...ids].slice(0, 5)) if ((await closeNeed(page, id)) === "closed") closed += 1;
  console.info(`[talent] synthetic leftovers seen=${ids.size} closed=${closed}`);
  return closed;
}

let requestId = "";

test("K-1 (4.12). Gama posts this run's need through the demand intake", async ({ browser }) => {
  test.setTimeout(480_000); // room for the leftover cleanup
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  let outcome = await submitNeed(page);
  if (outcome === "limit" && (await closeSyntheticLeftovers(page)) > 0) outcome = await submitNeed(page);
  expect(outcome, "the open-need limit refused this run's need").toBe("done");
  await page.goto("/lt/dashboard/company/scouting");
  const link = page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: RUN }).first();
  await expect(link, "this run's need is listed among Gama's needs").toBeVisible({ timeout: 30_000 });
  requestId = requestIdOf(await link.getAttribute("href"));
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  await ctx.close();
});

test("K-2 (4.12). the worker raises a hand on that need", async ({ browser }) => {
  test.skip(!requestId, "K-1 did not create this run's need");
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/opportunities?view=all");
  await expect(inMain(page).getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
  const card = page.locator(`li[id="opp-${requestId}"]`);
  await expect(card.locator('[data-testid^="interest-"]').first(), "the need's card offers interest").toBeVisible({ timeout: 60_000 });
  await settle(page);
  const withdraw = card.getByTestId("interest-withdraw");
  if (await withdraw.isVisible().catch(() => false)) {
    await withdraw.click();
    await expect(card.getByTestId("interest-express")).toBeVisible({ timeout: 30_000 });
  }
  await card.getByTestId("interest-express").click();
  await expect(card.getByTestId("interest-sent")).toHaveAttribute("data-interest-status", "interested", { timeout: 30_000 });
  await ctx.close();
});

let noteWritten = false;

/** The shortlist block of the worker's candidate card on this run's need. */
async function shortlistBlock(page: Page): Promise<Locator> {
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  await rendered(page, "scouting");
  await settle(page);
  const block = inMain(page).getByTestId(`scout-shortlist-${workerId}`);
  await expect(block, "the hand-raiser's card carries the shortlist controls").toBeVisible({ timeout: 60_000 });
  return block;
}

test("K-3 (4.12). Gama shortlists the person as 'saved' with an internal note; both persist", async ({ browser }) => {
  test.skip(!requestId || !workerId, "K-1/C-0 did not run");
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  let block = await shortlistBlock(page);
  // ACT 1: the decision.
  const saved = block.getByRole("button", { name: "Išsaugota", exact: true });
  await saved.click();
  await expect(saved, "the decision is shown as the stored one").toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  // ACT 2: the internal note, through the inline editor.
  await block.getByTestId(`scout-shortlist-note-toggle-${workerId}`).click();
  await block.getByTestId(`scout-shortlist-note-input-${workerId}`).fill(SHORTLIST_NOTE);
  await block.getByTestId(`scout-shortlist-note-save-${workerId}`).click();
  await expect(block.getByTestId(`scout-shortlist-note-${workerId}`)).toContainText(SHORTLIST_NOTE, { timeout: 30_000 });
  noteWritten = true;
  // Persistence: a brand-new load shows the same decision and note.
  block = await shortlistBlock(page);
  await expect(block.getByRole("button", { name: "Išsaugota", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(block.getByTestId(`scout-shortlist-note-${workerId}`)).toContainText(SHORTLIST_NOTE);
  await ctx.close();
});

test("K-4 (4.12). the note is internal: the worker reads no shortlist row, another organization sees no candidate", async ({ browser }) => {
  test.skip(!requestId || !noteWritten, "K-3 did not write the note");
  // The worker's OWN token on the shortlist table: RLS answers nothing (or refuses).
  const res = await qaApi(`/rest/v1/demand_shortlist?select=note,status&request_id=eq.${encodeURIComponent(requestId)}`, bearerOf("worker"));
  const body = res.status === 200 ? ((await res.json()) as unknown[]) : [];
  console.info(`[forbidden] worker → demand_shortlist HTTP ${res.status} rows=${body.length}`);
  expect([200, 401, 403, 404], "the read is answered or refused, never an error").toContain(res.status);
  expect(body.length, "the worker reads no shortlist row about themselves").toBe(0);
  // The worker's own board never shows the note either.
  {
    const { ctx, page } = await as(browser, "worker");
    await page.goto("/lt/dashboard/opportunities?view=all");
    await expect(inMain(page).getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(SHORTLIST_NOTE)).toHaveCount(0);
    await ctx.close();
  }
  // Another organization (Alfa) opening Gama's need sees no candidate and no note.
  {
    const { ctx, page } = await as(browser, "owner");
    await useWorkspace(page, ALFA);
    await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
    await rendered(page, "scouting (Alfa on Gama's need)");
    await expect(inMain(page).getByTestId(`scout-candidate-${workerId}`), "no candidate of Gama's need").toHaveCount(0);
    await expect(page.getByText(SHORTLIST_NOTE)).toHaveCount(0);
    await ctx.close();
  }
});

/** Clear this run's note (the internal note is not left behind) and close the need. */
async function cleanShortlist(page: Page): Promise<void> {
  if (noteWritten && !closedHere.has(requestId)) {
    const block = await shortlistBlock(page);
    const note = block.getByTestId(`scout-shortlist-note-${workerId}`);
    if (await note.isVisible().catch(() => false)) {
      await block.getByTestId(`scout-shortlist-note-toggle-${workerId}`).click();
      await block.getByTestId(`scout-shortlist-note-input-${workerId}`).fill("");
      await block.getByTestId(`scout-shortlist-note-save-${workerId}`).click();
      await expect(note).toHaveCount(0, { timeout: 30_000 });
    }
    noteWritten = false;
  }
  if (requestId && !closedHere.has(requestId)) await closeNeed(page, requestId);
}

test("K-5 (4.12). Gama clears the note and closes the need (the decision stays as history)", async ({ browser }) => {
  test.skip(!requestId, "K-1 did not create this run's need");
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await cleanShortlist(page);
  expect(closedHere.has(requestId), "this run's need is closed").toBe(true);
  await ctx.close();
});

// ═══════════════════════════════════════ 1.15 org history before claim (H)

let personId = "";
let linkTouched = false;

test("H-1 (1.15). Alfa's roster holds the person card before anyone claims it", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/company/people#people-more");
  let person = page.locator('[data-testid^="organization-roster-person-"]', { hasText: ROSTER_PERSON }).first();
  if (!(await person.isVisible({ timeout: 20_000 }).catch(() => false))) {
    // First run: the person reaches the roster through the people file import.
    console.info("[history] importing the synthetic roster person once");
    await page.goto("/lt/dashboard/company/people#people-import-section");
    const panel = page.getByTestId("people-import");
    await expect(panel, "the import panel (inside 'more tools')").toBeVisible({ timeout: 30_000 });
    await panel.getByTestId("people-import-relationship").selectOption("employee");
    await panel.getByTestId("people-import-file").setInputFiles({
      name: "qa-synthetic-history-person.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`vardas\n${ROSTER_PERSON}\n`, "utf8"),
    });
    const preview = panel.getByTestId("people-import-preview");
    const error = panel.getByTestId("people-import-error");
    await expect(preview.or(error)).toBeVisible({ timeout: 30_000 });
    if (await error.isVisible()) throw new Error(`preview refused: ${await error.innerText()}`);
    const confirm = panel.getByTestId("people-import-confirm");
    if (await confirm.isEnabled()) {
      await confirm.click();
      await expect(panel.getByTestId("people-import-receipt").or(error)).toBeVisible({ timeout: 30_000 });
      if (await error.isVisible()) throw new Error(`commit refused: ${await error.innerText()}`);
    }
    await page.goto("/lt/dashboard/company/people#people-more");
    person = page.locator('[data-testid^="organization-roster-person-"]', { hasText: ROSTER_PERSON }).first();
    await expect(person, "the imported person is on the roster").toBeVisible({ timeout: 30_000 });
  }
  personId = ((await person.getAttribute("data-testid")) ?? "").replace(/^organization-roster-person-/, "");
  expect(personId).toMatch(/^[0-9a-f-]{36}$/);
  const linkState = (await person.locator("[data-link-state]").first().getAttribute("data-link-state")) ?? "";
  console.info(`[history] roster person link_state=${linkState}`);
  // The organization's own card for the person — history BEFORE any claim.
  await person.getByTestId(`organization-roster-history-${personId}`).click();
  await page.waitForURL(new RegExp(`/dashboard/company/people/${personId}`), { timeout: 30_000 });
  await rendered(page, "person card");
  await expect(inMain(page).getByTestId("company-person")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(inMain(page).getByTestId("company-person-name")).toContainText(ROSTER_PERSON);
  // The organization's history view answers too.
  await page.goto("/lt/dashboard/company/history");
  await rendered(page, "company history");
  await expect(inMain(page).getByTestId("company-history")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

/** The employee's own answer controls for this person id, on their profile. */
async function profileOffer(page: Page): Promise<Locator> {
  await page.goto("/lt/dashboard/profile");
  await rendered(page, "profile");
  await settle(page);
  return inMain(page).locator(`[data-testid="roster-link-offer"][data-person-id="${personId}"]`);
}

/** The employee's confirmed link for this person id (inside the folded history). */
async function profileConfirmed(page: Page): Promise<Locator> {
  await page.goto("/lt/dashboard/profile");
  await rendered(page, "profile");
  await settle(page);
  const disclosure = inMain(page).getByTestId("organization-history-disclosure");
  if ((await disclosure.count()) > 0 && (await disclosure.first().getAttribute("open")) === null) {
    await disclosure.first().locator("summary").first().click();
  }
  return inMain(page).locator(`[data-testid="roster-link-confirmed"][data-person-id="${personId}"]`);
}

/** Put the link back to `unlinked` from whatever state an earlier run left (the employee's own answers). */
async function resetLink(browser: Browser): Promise<void> {
  const { ctx, page } = await as(browser, "worker");
  try {
    const offer = await profileOffer(page);
    if (await offer.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await offer.locator('button[name="decision"][value="refuse"]').click();
      await expect(offer).toHaveCount(0, { timeout: 30_000 }).catch(() => undefined);
    }
    const confirmed = await profileConfirmed(page);
    if (await confirmed.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await confirmed.getByTestId("roster-link-withdraw-open").click();
      await confirmed.getByTestId("roster-link-withdraw-confirm").click();
      await expect(confirmed.getByTestId("roster-link-withdrawn")).toBeVisible({ timeout: 30_000 });
    }
  } finally {
    await ctx.close();
  }
}

test("H-2 (1.15). Alfa offers the roster record to its employee", async ({ browser }) => {
  test.skip(!personId, "H-1 did not find the roster person");
  await resetLink(browser);
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/company/people#people-more");
  const row = page.getByTestId(`organization-roster-person-${personId}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await expect(row.locator("[data-link-state]").first()).toHaveAttribute("data-link-state", "unlinked", { timeout: 30_000 });
  const select = row.getByTestId(`roster-link-worker-${personId}`);
  await expect(select, "the offer names a person in a relationship with Alfa").toBeVisible({ timeout: 30_000 });
  const value = await select
    .locator("option")
    .evaluateAll((opts, w) => (opts as HTMLOptionElement[]).map((o) => o.value).find((v) => v.startsWith(`${w}:`)) ?? "", workerId);
  expect(value, "Alfa's employee is offered as a link candidate").not.toBe("");
  await select.selectOption(value);
  await row.getByTestId(`roster-link-offer-${personId}`).getByRole("button").click();
  linkTouched = true;
  const offered = row.getByTestId(`roster-link-offered-${personId}`);
  const error = row.getByTestId(`roster-link-error-${personId}`);
  await expect(offered.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`offer refused: ${(await error.getAttribute("data-code")) ?? "?"}`);
  // Persistence: the roster now says the link is proposed.
  await page.goto("/lt/dashboard/company/people#people-more");
  await expect(page.getByTestId(`organization-roster-person-${personId}`).locator("[data-link-state]").first()).toHaveAttribute(
    "data-link-state",
    "link_proposed",
    { timeout: 30_000 },
  );
  await ctx.close();
});

test("H-3 (1.15). the employee sees the offer on their own profile (phone) and accepts it", async ({ browser }) => {
  test.skip(!linkTouched, "H-2 did not offer the link");
  const { ctx, page } = await as(browser, "worker", { phone: true });
  const offer = await profileOffer(page);
  await expect(offer, "the offer waits on the employee's profile").toBeVisible({ timeout: 30_000 });
  await expect(offer).toContainText(ROSTER_PERSON);
  await fitsPhone(page, "profile with the history offer");
  await offer.locator('button[name="decision"][value="accept"]').click();
  // Persistence: a fresh load lists it among the person's confirmed links.
  await expect
    .poll(async () => (await profileConfirmed(page)).count(), { timeout: 45_000, intervals: [3_000] })
    .toBe(1);
  await expect(await profileOffer(page)).toHaveCount(0);
  await ctx.close();
});

test("H-4 (1.15). Alfa's roster says linked — also read in English", async ({ browser }) => {
  test.skip(!linkTouched, "H-2 did not offer the link");
  const { ctx, page } = await as(browser, "owner", { locale: "en-GB" });
  await useWorkspace(page, ALFA);
  await page.goto("/en/dashboard/company/people#people-more");
  await rendered(page, "people (en)");
  expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
  await expect(page.getByTestId(`organization-roster-person-${personId}`).locator("[data-link-state]").first()).toHaveAttribute(
    "data-link-state",
    "linked",
    { timeout: 30_000 },
  );
  await ctx.close();
});

test("H-5 (1.15). another organization and another worker see none of it", async ({ browser }) => {
  test.skip(!personId, "H-1 did not find the roster person");
  {
    const { ctx, page } = await as(browser, "manager");
    await useWorkspace(page, GAMA);
    await page.goto("/lt/dashboard/company/people#people-more");
    await rendered(page, "people (Gama)");
    await expect(page.getByTestId(`organization-roster-person-${personId}`), "Alfa's roster person is not on Gama's roster").toHaveCount(0);
    await page.goto(`/lt/dashboard/company/people/${personId}`);
    await expect(page.getByText(ROSTER_PERSON), "Gama cannot open Alfa's person card").toHaveCount(0);
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "worker2");
    const offer = await profileOffer(page);
    await expect(offer, "the offer is addressed to one person only").toHaveCount(0);
    await expect(await profileConfirmed(page)).toHaveCount(0);
    await ctx.close();
  }
});

test("H-6 (1.15). the employee withdraws the link; the roster returns to unlinked", async ({ browser }) => {
  test.skip(!linkTouched, "H-2 did not offer the link");
  await resetLink(browser);
  linkTouched = false;
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/company/people#people-more");
  await expect(page.getByTestId(`organization-roster-person-${personId}`).locator("[data-link-state]").first()).toHaveAttribute(
    "data-link-state",
    "unlinked",
    { timeout: 30_000 },
  );
  await ctx.close();
});

// ═══════════════════════════════════════════════ 6.19 team enquiries (T)

let teamId = "";
let enquiryId = "";
let enquiryOpen = false;

/** The team's card on Alfa's people page (Alfa is the active workspace). */
function teamCard(page: Page): Locator {
  return page.locator('[data-testid^="team-brigade-"]', { hasText: TEAM }).first();
}

test("T-1 (6.19). Alfa's owner forms a team", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await expect(page.getByTestId("team-brigades-panel")).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await page.getByTestId("team-create-name").fill(TEAM);
  await page.getByTestId("team-create-submit").click();
  await expect(teamCard(page), "the new team is listed").toBeVisible({ timeout: 30_000 });
  teamId = ((await teamCard(page).getAttribute("data-testid")) ?? "").replace(/^team-brigade-/, "");
  expect(teamId).toMatch(/^[0-9a-f-]{36}$/);
  await ctx.close();
});

test("T-2 (6.19). Gama finds the team in the network directory and sends a structured enquiry", async ({ browser }) => {
  test.skip(!teamId, "T-1 did not form the team");
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto("/lt/dashboard/network");
  await rendered(page, "network");
  // ACT: search through the page's own search box.
  const input = inMain(page).getByTestId("network-search-input");
  await input.fill(TEAM);
  await input.press("Enter");
  await page.waitForURL(/[?&]q=/, { timeout: 30_000 });
  const row = inMain(page).getByTestId(`network-company-${teamId}`);
  await expect(row, "the team is findable by its name").toBeVisible({ timeout: 30_000 });
  await settle(page);
  await row.getByTestId(`team-enquiry-open-${teamId}`).click();
  await row.getByTestId(`team-enquiry-message-${teamId}`).fill(ENQUIRY);
  await row.getByTestId(`team-enquiry-submit-${teamId}`).click();
  await expect(row.getByTestId(`team-enquiry-msg-${teamId}`)).toContainText(/Užklausa išsiųsta|Jau turi atvirą užklausą/, { timeout: 30_000 });
  enquiryOpen = true;
  // Persistence: a fresh load of the network page lists Gama's own enquiry, waiting.
  await page.goto("/lt/dashboard/network");
  const mine = inMain(page).locator('li[data-testid^="my-team-enquiry-"]', { hasText: RUN_WORD });
  await expect(mine, "Gama's enquiry is in its own list").toHaveCount(1, { timeout: 30_000 });
  enquiryId = ((await mine.getAttribute("data-testid")) ?? "").replace(/^my-team-enquiry-/, "");
  await expect(mine).toContainText("Laukia atsakymo");
  await ctx.close();
});

/** Open the team card's folded enquiry inbox and return it. */
async function teamInbox(page: Page): Promise<Locator> {
  await page.goto("/lt/dashboard/company/people");
  const card = page.getByTestId(`team-brigade-${teamId}`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await settle(page);
  const fold = card.locator("details").filter({ has: page.locator('[data-testid^="team-enquir"]') }).first();
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  const off = page.getByTestId(`team-enquiries-not-enabled-${teamId}`);
  expect(await off.count(), "team enquiries are installed").toBe(0);
  return page.getByTestId(`team-enquiries-${teamId}`);
}

test("T-3 (6.19). Alfa's owner finds the enquiry in the team's inbox and accepts it", async ({ browser }) => {
  test.skip(!enquiryId, "T-2 did not send the enquiry");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const inbox = await teamInbox(page);
  const item = inbox.getByTestId(`team-enquiry-${enquiryId}`);
  await expect(item, "the enquiry reached the team's owner").toBeVisible({ timeout: 30_000 });
  await expect(item).toContainText(RUN_WORD);
  await item.getByTestId(`team-enquiry-accept-${enquiryId}`).click();
  await expect(item.getByTestId(`team-enquiry-accept-${enquiryId}`), "an answered enquiry has no answer buttons").toHaveCount(0, {
    timeout: 30_000,
  });
  enquiryOpen = false;
  // Persistence: a fresh load shows it accepted.
  const again = (await teamInbox(page)).getByTestId(`team-enquiry-${enquiryId}`);
  await expect(again).toContainText("Priimta", { timeout: 30_000 });
  await ctx.close();
});

test("T-4 (6.19). Gama sees the answer; an outside organization sees neither the team inbox nor the enquiry", async ({ browser }) => {
  test.skip(!enquiryId, "T-2 did not send the enquiry");
  {
    const { ctx, page } = await as(browser, "manager");
    await useWorkspace(page, GAMA);
    await page.goto("/lt/dashboard/network");
    const mine = inMain(page).getByTestId(`my-team-enquiry-${enquiryId}`);
    await expect(mine).toContainText("Priimta", { timeout: 30_000 });
    // The proposer is never offered the team's own answer controls.
    await expect(page.getByTestId(`team-enquiry-accept-${enquiryId}`)).toHaveCount(0);
    await page.goto("/lt/dashboard/company/people");
    await expect(page.getByTestId(`team-brigade-${teamId}`), "Gama does not manage Alfa's team").toHaveCount(0);
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "agency");
    await page.goto("/lt/dashboard/network");
    await rendered(page, "network (agency)");
    await expect(page.getByTestId(`my-team-enquiry-${enquiryId}`), "another organization never sees Gama's enquiry").toHaveCount(0);
    await page.goto("/lt/dashboard/company/people");
    await expect(page.getByTestId(`team-enquiry-${enquiryId}`)).toHaveCount(0);
    await ctx.close();
  }
});

/** Disband every team named TEAM_PREFIX on Alfa's people page; returns how many. */
async function disbandSyntheticTeams(page: Page): Promise<number> {
  let disbanded = 0;
  const tried = new Set<string>();
  for (let i = 0; i < 10; i += 1) {
    await page.goto("/lt/dashboard/company/people");
    await expect(page.getByTestId("team-brigades-panel")).toBeVisible({ timeout: 30_000 });
    await settle(page);
    let id = "";
    for (const c of await page.locator('[data-testid^="team-brigade-"]', { hasText: TEAM_PREFIX }).all()) {
      const tid = ((await c.getAttribute("data-testid")) ?? "").replace(/^team-brigade-/, "");
      if (/^[0-9a-f-]{36}$/.test(tid) && !tried.has(tid)) {
        id = tid;
        break;
      }
    }
    if (!id) break;
    tried.add(id);
    const card = page.getByTestId(`team-brigade-${id}`);
    await card.getByTestId(`team-disband-${id}`).click();
    await card.getByTestId(`team-disband-confirm-${id}`).click();
    await expect(page.getByTestId("team-brigades-msg")).toBeVisible({ timeout: 30_000 });
    if ((await card.count()) === 0 || (await expect(card).toHaveCount(0, { timeout: 20_000 }).then(() => true).catch(() => false))) {
      disbanded += 1;
    }
  }
  return disbanded;
}

test("T-5 (6.19). Alfa's owner disbands the walk's team (history kept)", async ({ browser }) => {
  test.skip(!teamId, "T-1 did not form the team");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const n = await disbandSyntheticTeams(page);
  console.info(`[team] disbanded=${n}`);
  await page.goto("/lt/dashboard/company/people");
  await expect(page.getByTestId(`team-brigade-${teamId}`), "the disbanded team leaves the active list").toHaveCount(0, { timeout: 30_000 });
  teamId = "";
  await ctx.close();
});

// ══════════════════════════════════════════════════ cleanup, pass or fail

test.afterAll(async ({ browser }) => {
  test.setTimeout(300_000);
  const step = async (label: string, slot: string, fn: (page: Page) => Promise<void>) => {
    const { ctx, page } = await as(browser, slot);
    try {
      await fn(page);
    } catch (e) {
      console.info(`[cleanup] ${label} did not complete: ${firstLine(e)}`);
    } finally {
      await ctx.close();
    }
  };
  if (requestId && !closedHere.has(requestId)) {
    await step("shortlist note + need", "manager", async (page) => {
      await useWorkspace(page, GAMA);
      await cleanShortlist(page);
    });
  }
  if (linkTouched) {
    try {
      await resetLink(browser);
    } catch (e) {
      console.info(`[cleanup] roster link reset did not complete: ${firstLine(e)}`);
    }
  }
  if (enquiryOpen && enquiryId) {
    await step("open enquiry", "manager", async (page) => {
      await useWorkspace(page, GAMA);
      await page.goto("/lt/dashboard/network");
      const w = page.getByTestId(`my-team-enquiry-withdraw-${enquiryId}`);
      if (await w.isVisible().catch(() => false)) await w.click();
    });
  }
  // Swept by tag: every synthetic team a run of this walk formed.
  await step("teams", "owner", async (page) => {
    await useWorkspace(page, ALFA);
    console.info(`[cleanup] teams disbanded=${await disbandSyntheticTeams(page)}`);
  });
});
