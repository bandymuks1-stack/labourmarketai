import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";
import { makeDocx } from "../../lib/cv/__fixtures__/cv-fixtures";

/**
 * PRODUCTION — AI-DEPENDENT FUNCTIONS WITH THE AI RUNTIME OFF (owner order
 * 2026-10-25; registry rows whose AI half has no model in production). Each
 * step proves the DETERMINISTIC path works and that the AI half says, in
 * words, that it is off — never invented output:
 *
 *   4.1  demand intake      — the manual intake structures and posts the need (A-1)
 *   4.5  matching           — the worker's why-line + breakdown and Gama's
 *                             candidate card are rule-based (A-2, A-3)
 *   5.5 / 8.3 messages      — an English message reaches a Lithuanian reader as
 *                             its ORIGINAL words, labelled "no translation", on
 *                             the phone; nobody outside the thread reads it (A-4, A-5)
 *   2.19 work journal       — the journal's AI suggestions answer with the honest
 *                             off line and offer nothing to confirm (B-1)
 *   2.3  CV import          — a CV file is read deterministically into a
 *                             proposal; nothing is saved before a confirm (B-2)
 *   5.1  chat-first home    — a sentence the router knows gets its door; a
 *                             sentence it cannot read gets "I did not understand",
 *                             not an invented answer (B-3)
 *   10.6 / 10.13 assist     — /dashboard/assist states the AI provider state and,
 *                             when off, that nothing on it was written by a model (B-4)
 *   4.26 match preview      — signed out: the fit score is computed and the AI
 *                             explanation box says it was not generated (C-1, LT + EN, 390 px)
 *   7.14 / 8.3 vacancies    — a foreign-language advert keeps its own words; the
 *                             translate request answers with a note, never a
 *                             rendering, while translation is off (C-2)
 *
 * NOT here: 7.12 AI cost metering — the ledger is read only on the admin
 * telemetry page (no admin QA session exists).
 *
 * If production ever has a live provider, the assertions that depend on "off"
 * say so by name (the walk then fails honestly instead of passing on a model's
 * text). Cast (`lib/testing/prod-qa-guard.ts`, all synthetic): worker
 * (qa.worker+multiw), worker2 (qa.worker+goal3), manager ("QA-SYNTHETIC Gama"),
 * owner ("QA-SYNTHETIC Alfa"), agency (forbidden check). Real adverts are
 * opened read-only and never named in a log. Cleanup (afterAll, pass or fail):
 * this run's need is closed; the message and the contact stay as the thread's
 * history (QA-SYNTHETIC tagged); no journal entry, CV fact or saved item is
 * written by B-*.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const GAMA = "QA-SYNTHETIC Gama";
const ALFA = "QA-SYNTHETIC Alfa";
const TAG = `QA-SYNTHETIC ${RUN}`;
const NEED_ROLE = `QA-SYNTHETIC AI-off mūrininkai ${RUN}`;
/** An English message, so a Lithuanian reader is shown a foreign original. */
const MESSAGE = `${TAG} hello, are you available for bricklaying work on our site next month?`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["worker", "worker2", "manager", "owner", "agency"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

async function as(
  browser: Browser,
  slot: string | null,
  opts: { locale?: "lt-LT" | "en-GB"; phone?: boolean } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...(slot ? { storageState: state(slot) } : {}),
    locale: opts.locale ?? "lt-LT",
    ...(opts.phone ? PHONE : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/** The page content, never the streaming holder (prod-company-chain.spec.ts, #2729). */
const inMain = (page: Page): Locator => page.getByRole("main");
const settle = (page: Page) => page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

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
async function switchWorkspace(page: Page, orgName: string): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

/**
 * The worker's PERSONAL space (the CV, the journal and the chat answer the
 * person, not an organization they work for). Tolerant: a person with no
 * organization has no chip menu to open.
 */
async function personalSpace(page: Page): Promise<void> {
  await page.goto("/lt/dashboard");
  const chip = page.getByTestId("workspace-chip").first();
  if (!(await chip.isVisible({ timeout: 20_000 }).catch(() => false))) return;
  if ((await chip.innerText()).includes("Asmeninė erdvė")) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: "Asmeninė erdvė" }).first().click();
  await expect(chip).toContainText("Asmeninė erdvė", { timeout: 30_000 });
}

/** Words a model's output would be labelled with on these surfaces. Off = none of them claims a result. */
const AI_RESULT = /AI pasiūlymas:|DI pasiūlymas:|Sugeneruota DI|Generated by AI|AI-generated/i;
const firstLine = (e: unknown) => ((e as Error).message ?? String(e)).split("\n")[0].slice(0, 160);

let workerId = "";

test("A-0. the worker's own id (own row, own token)", async () => {
  const token = bearerOf("worker");
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, "own worker row answered").toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.length, "exactly one own worker row").toBe(1);
  workerId = rows[0].id;
});

// ═══════════════════════ need → matching → message (A): 4.1, 4.5, 5.5, 8.3

function requestIdOf(href: string | null): string {
  return /request=([0-9a-f-]{36})/.exec(href ?? "")?.[1] ?? "";
}

const closedHere = new Set<string>();

async function closeNeed(page: Page, id: string): Promise<void> {
  await page.goto(`/lt/dashboard/company/scouting?request=${id}`);
  const controls = inMain(page).getByTestId("demand-lifecycle-controls").first();
  const unstructured = inMain(page).getByTestId("scouting-not-structured").first();
  await expect(controls.or(unstructured).first()).toBeVisible({ timeout: 30_000 });
  if (await controls.isVisible()) {
    if ((await controls.getAttribute("data-demand-status")) !== "closed") {
      await controls.getByTestId("demand-close").click();
      await expect(controls).toHaveAttribute("data-demand-status", "closed", { timeout: 30_000 });
    }
    closedHere.add(id);
    return;
  }
  await page.goto(`/lt/dashboard?result=candidates&demand=${id}`);
  const close = inMain(page).getByTestId("candidates-close-demand").filter({ visible: true }).first();
  const reopen = inMain(page).getByTestId("candidates-reopen-demand").filter({ visible: true }).first();
  await expect(close.or(reopen).first()).toBeVisible({ timeout: 60_000 });
  if (await close.isVisible()) {
    await close.click();
    await expect(reopen).toBeVisible({ timeout: 30_000 });
  }
  closedHere.add(id);
}

async function submitNeed(page: Page): Promise<"done" | "limit"> {
  await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await settle(page);
  await inMain(page).getByTestId("demand-role").fill(NEED_ROLE);
  await inMain(page).getByTestId("demand-description").fill(`${TAG}: synthetic need for the AI-off walk, 1 mūrininkas.`);
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

/** Close QA-SYNTHETIC needs other runs left open (Gama's free plan holds one open need). */
async function closeSyntheticLeftovers(page: Page): Promise<number> {
  await page.goto("/lt/dashboard/company/scouting");
  await settle(page);
  const ids = new Set<string>();
  for (const a of await page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: "QA-SYNTHETIC" }).all()) {
    if ((await a.innerText().catch(() => "")).includes(RUN)) continue;
    const id = requestIdOf(await a.getAttribute("href"));
    if (id) ids.add(id);
  }
  for (const id of [...ids].slice(0, 5)) await closeNeed(page, id);
  console.info(`[ai-off] synthetic leftovers closed=${Math.min(ids.size, 5)}`);
  return ids.size;
}

let requestId = "";
let conversationId = "";

test("A-1 (4.1). Gama's need goes through the manual intake and is posted — no model in the way", async ({ browser }) => {
  test.setTimeout(480_000);
  const { ctx, page } = await as(browser, "manager");
  await switchWorkspace(page, GAMA);
  let outcome = await submitNeed(page);
  if (outcome === "limit" && (await closeSyntheticLeftovers(page)) > 0) outcome = await submitNeed(page);
  expect(outcome, "the open-need limit refused this run's need").toBe("done");
  const done = inMain(page).getByTestId("demand-done");
  expect(await done.innerText(), "the intake's readback is not presented as a model's output").not.toMatch(AI_RESULT);
  await page.goto("/lt/dashboard/company/scouting");
  const link = page.locator('a[href*="/dashboard/company/scouting?request="]', { hasText: RUN }).first();
  await expect(link, "this run's need is listed among Gama's needs").toBeVisible({ timeout: 30_000 });
  requestId = requestIdOf(await link.getAttribute("href"));
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  await ctx.close();
});

test("A-2 (4.5). the worker's why-line and breakdown are rule-based; the worker raises a hand", async ({ browser }) => {
  test.skip(!requestId, "A-1 did not post the need");
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/opportunities?view=all");
  await expect(inMain(page).getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
  const card = page.locator(`li[id="opp-${requestId}"]`);
  await expect(card.locator('[data-testid^="interest-"]').first(), "the need's card is on the board").toBeVisible({ timeout: 60_000 });
  await settle(page);
  const why = card.getByTestId("opportunity-why");
  await expect(why).toBeVisible();
  expect((await why.innerText()).trim().length, "the why-line says something").toBeGreaterThan(3);
  const details = card.getByTestId("opportunity-details");
  await details.getByRole("button").first().click();
  const breakdown = card.getByTestId("opportunity-match-breakdown");
  await expect(breakdown, "the full explanation opens").toBeVisible({ timeout: 30_000 });
  expect(await breakdown.innerText(), "the explanation is the rules' own, not a model's").not.toMatch(AI_RESULT);
  const withdraw = card.getByTestId("interest-withdraw");
  if (await withdraw.isVisible().catch(() => false)) {
    await withdraw.click();
    await expect(card.getByTestId("interest-express")).toBeVisible({ timeout: 30_000 });
  }
  await card.getByTestId("interest-express").click();
  await expect(card.getByTestId("interest-sent")).toHaveAttribute("data-interest-status", "interested", { timeout: 30_000 });
  await ctx.close();
});

test("A-3 (4.5, 5.5). Gama sees the candidate, contacts them and writes in English", async ({ browser }) => {
  test.skip(!requestId || !workerId, "A-0/A-1 did not run");
  const { ctx, page } = await as(browser, "manager");
  await switchWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${requestId}`);
  const candidate = inMain(page).getByTestId(`scout-candidate-${workerId}`);
  await expect(candidate, "the hand-raiser is on Gama's candidate list").toBeVisible({ timeout: 60_000 });
  expect(await candidate.innerText(), "the candidate card is not a model's output").not.toMatch(AI_RESULT);
  await settle(page);
  const ack = inMain(page).getByTestId(`interest-ack-${workerId}`);
  await ack.getByTestId("interest-ack-contacted").click();
  await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
  conversationId = (page.url().match(/\/dashboard\/communication\/([0-9a-f-]{36})/) ?? [])[1] ?? "";
  expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);
  await settle(page);
  const input = page.getByTestId("communication-composer-input");
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(MESSAGE);
  await input.locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  const sent = await expect(input).toHaveValue("", { timeout: 30_000 }).then(() => true, () => false);
  if (!sent) {
    const why = await page.getByTestId("communication-composer-error").innerText().catch(() => "(no error shown)");
    throw new Error(`Gama's message was not sent: ${why.slice(0, 120)}`);
  }
  await expect(page.locator("main")).toContainText(MESSAGE, { timeout: 30_000 });
  await ctx.close();
});

test("A-4 (5.5, 8.3). the Lithuanian reader sees the original English words, labelled 'no translation', on the phone", async ({ browser }) => {
  test.skip(!conversationId, "A-3 did not open the thread");
  const { ctx, page } = await as(browser, "worker", { phone: true });
  await page.goto(`/lt/dashboard/communication/${conversationId}`);
  await rendered(page, "thread (390 px)");
  const row = inMain(page).locator('[data-testid^="message-"]', { hasText: RUN }).filter({ has: page.locator('[data-testid^="message-text-"]') }).first();
  await expect(row, "the message is in the thread").toBeVisible({ timeout: 30_000 });
  const text = row.locator('[data-testid^="message-text-"]').first();
  await expect(text, "the words shown are the sender's own").toHaveText(MESSAGE);
  expect(await text.getAttribute("data-kind"), "nothing is presented as a translation").not.toBe("translated");
  await expect(row.locator('[data-testid^="message-original-"]'), "no 'show original' — nothing was translated").toHaveCount(0);
  const badge = row.locator('[data-testid^="message-lang-"]');
  if ((await badge.count()) > 0) {
    const st = (await badge.first().getAttribute("data-state")) ?? "";
    console.info(`[ai-off] message badge state=${st} kind=${await badge.first().getAttribute("data-kind")}`);
    expect(await badge.first().getAttribute("data-kind")).not.toBe("translated");
    // A foreign original is said to have no translation, in words.
    if (st === "original_foreign") await expect(badge.first()).toContainText("vertimo nėra");
  } else {
    console.info("[ai-off] the message carries no language badge (language not detected)");
  }
  await fitsPhone(page, "thread");
  await ctx.close();
});

test("A-5 (5.5). nobody outside the thread reads it; signed out is sent to sign in", async ({ browser }) => {
  test.skip(!conversationId, "A-3 did not open the thread");
  {
    const { ctx, page } = await as(browser, "agency");
    await page.goto(`/lt/dashboard/communication/${conversationId}`);
    await expect(page.getByText(MESSAGE), "another organization never reads the message").toHaveCount(0);
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, null);
    await page.goto(`/lt/dashboard/communication/${conversationId}`);
    await expect(page, "anonymous → sign-in").toHaveURL(/\/auth\/(login|sign-?in)/, { timeout: 30_000 });
    await ctx.close();
  }
});

test("A-6. Gama closes this run's need (the thread stays as history)", async ({ browser }) => {
  test.skip(!requestId, "A-1 did not post the need");
  const { ctx, page } = await as(browser, "manager");
  await switchWorkspace(page, GAMA);
  await closeNeed(page, requestId);
  await ctx.close();
});

// ════════════════════════════ worker surfaces (B): 2.19, 2.3, 5.1, 10.6, 10.13

test("B-1 (2.19). the journal's AI suggestions answer with the honest off line and offer nothing to confirm", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await personalSpace(page);
  await page.goto("/lt/dashboard/journal?compose=full#journal-composer");
  await rendered(page, "journal composer");
  await settle(page);
  const composer = inMain(page).getByTestId("journal-compose-full");
  const text = composer.locator("textarea").first();
  await expect(text, "the full composer is open").toBeVisible({ timeout: 60_000 });
  // The composer's second stage (where the optional AI suggestions live)
  // opens after "organize": the deterministic reading comes first.
  const organize = composer.getByTestId("journal-organize-text").filter({ visible: true }).first();
  await expect(async () => {
    await text.fill("");
    await text.fill(`${TAG}: šiandien 4 valandas klojau plyteles vonios kambaryje`);
    await expect(organize).toBeEnabled({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await organize.click();
  const cta = inMain(page).getByTestId("journal-ai-suggest-cta");
  await expect(cta, "the optional AI suggestions are offered beside the deterministic reading").toBeVisible({ timeout: 60_000 });
  await expect(cta).toBeEnabled({ timeout: 30_000 });
  await cta.click();
  const box = inMain(page).getByTestId("journal-ai-suggestions");
  const off = box.getByTestId("journal-ai-off-note");
  const confirmable = box.locator('[data-testid^="journal-ai-confirm-"]');
  await expect(off.or(confirmable.first()), "the suggestions answer").toBeVisible({ timeout: 60_000 });
  expect(await confirmable.count(), "AI is off in production: no suggestion is offered to confirm").toBe(0);
  await expect(off).toContainText("Automatinis įgūdžių atpažinimas");
  // Nothing was saved: the journal lists no entry of this run.
  await page.goto("/lt/dashboard/journal");
  await expect(inMain(page).locator('[data-testid^="journal-entry-card-"]', { hasText: RUN })).toHaveCount(0);
  await ctx.close();
});

test("B-2 (2.3). a CV file is read deterministically into a proposal; nothing is saved before a confirm", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  const company = `UAB QAAIOFF${RUN.replace(/[^0-9a-z]/gi, "").toUpperCase()}`;
  const lines = ["QA Synthetic Worker", `2018-2022 ${company}, murininkas`, "Anglu kalba B1"];
  await personalSpace(page);
  await page.goto("/lt/dashboard");
  await rendered(page, "chat");
  const composer = inMain(page).getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await settle(page);
  await composer.fill("Įkelk mano CV");
  await inMain(page).getByTestId("composer-send").click();
  await inMain(page).getByTestId("chat-chip-cv").filter({ visible: true }).last().click({ timeout: 60_000 });
  await expect(inMain(page).getByTestId("conversation-cv-flow").last()).toBeVisible({ timeout: 60_000 });
  const input = page.locator('[data-testid="cv-import-upload"] input[type="file"]').last();
  await input.waitFor({ state: "attached", timeout: 30_000 });
  await input.setInputFiles({
    name: "qa-synthetic-ai-off-cv.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(makeDocx(lines.join("\n"))),
  });
  const review = inMain(page).getByTestId("cv-import-section-review").last();
  const error = inMain(page).getByTestId("cv-import-error").last();
  await expect(review.or(error)).toBeVisible({ timeout: 60_000 });
  if (await error.isVisible()) throw new Error(`CV not read: ${(await error.innerText()).slice(0, 120)}`);
  await expect(inMain(page).getByTestId("cv-import-item-wh-0").last(), "the reader found the job line").toContainText(company, { timeout: 30_000 });
  expect(await review.innerText(), "the proposal is the reader's, not a model's").not.toMatch(AI_RESULT);
  // A proposal is not a save.
  await page.goto("/lt/cv");
  await expect(inMain(page).locator("h1").first()).toBeVisible({ timeout: 30_000 });
  await expect(inMain(page).getByText(company)).toHaveCount(0);
  await ctx.close();
});

test("B-3 (5.1). the chat opens the door for a sentence it knows and says 'not understood' for one it cannot read", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await personalSpace(page);
  await page.goto("/lt/dashboard");
  const composer = inMain(page).getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await settle(page);
  // The chat re-renders its history, so "what is new" is counted, not sliced.
  const main = async () => (await inMain(page).innerText()).replace(/\s+/g, " ");
  const count = (text: string, re: RegExp) => (text.match(new RegExp(re.source, "g")) ?? []).length;
  // conversation.chat.aiNotConfigured / aiTemporarilyUnavailable (the model is
  // off) or notUnderstood / understandClarify (the router could not read it).
  const honest = /Išplėstinis asistentas (šioje aplinkoje neįjungtas|šiuo metu neprieinamas)|Nesupratau|Ką tiksliai norėtum/;
  // An unreadable sentence: the honest fallback, never an invented answer.
  const honestBefore = count(await main(), honest);
  await composer.fill("zqxv brpt klmn");
  await inMain(page).getByTestId("composer-send").click();
  const answered = await expect
    .poll(async () => count(await main(), honest) > honestBefore, { timeout: 45_000, intervals: [1_000] })
    .toBe(true)
    .then(() => true, () => false);
  console.info(`[ai-off] unreadable sentence → ${answered ? "honest fallback" : "OTHER"}`);
  expect(answered, "the chat says, in words, that it could not read the sentence").toBe(true);
  // A sentence the deterministic router knows: an answer arrives, and none of it is a model's.
  const sentence = "Ieškau darbo mūrininku Lietuvoje";
  const asked = count(await main(), /Ieškau darbo mūrininku Lietuvoje/);
  const chipsBefore = await inMain(page).locator('[data-testid^="chat-chip-"]').count();
  await composer.fill(sentence);
  await inMain(page).getByTestId("composer-send").click();
  await expect.poll(async () => count(await main(), /Ieškau darbo mūrininku Lietuvoje/), { timeout: 45_000 }).toBeGreaterThan(asked);
  await expect
    .poll(async () => (await main()).split(sentence).pop()!.trim().length, { timeout: 45_000, intervals: [1_000] })
    .toBeGreaterThan(10);
  const reply = (await main()).split(sentence).pop()!;
  const chipsAfter = await inMain(page).locator('[data-testid^="chat-chip-"]').count();
  console.info(`[ai-off] known sentence → chips ${chipsBefore}→${chipsAfter}`);
  expect(reply, "the router's answer is not presented as a model's").not.toMatch(AI_RESULT);
  await ctx.close();
});

test("B-4 (10.6, 10.13). the assist page states the AI provider state and, when off, that no text on it came from a model (LT + EN)", async ({ browser }) => {
  for (const locale of ["lt", "en"] as const) {
    const { ctx, page } = await as(browser, "owner", { locale: locale === "lt" ? "lt-LT" : "en-GB" });
    if (locale === "lt") await switchWorkspace(page, ALFA);
    await page.goto(`/${locale}/dashboard/assist`);
    await rendered(page, `assist (${locale})`);
    await expect(inMain(page).getByTestId("assist-page")).toBeVisible({ timeout: 30_000 });
    const provider = inMain(page).getByTestId("assist-provider");
    await expect(provider).toBeVisible({ timeout: 30_000 });
    const stateId = (await provider.locator('[data-testid^="assist-provider-state-"]').first().getAttribute("data-testid")) ?? "";
    console.info(`[ai-off] assist provider ${stateId} (${locale})`);
    expect(stateId, "production runs with the AI provider off (10.6 BLOCKED on the owner's key)").toBe("assist-provider-state-disabled");
    await expect(provider.getByTestId("assist-provider-disabled"), "the off state is explained in words").toBeVisible();
    expect(await inMain(page).getByTestId("assist-summaries").innerText().catch(() => ""), "summaries are rule-based").not.toMatch(AI_RESULT);
    await ctx.close();
  }
});

// ═════════════════════════════════════════ public / reader surfaces (C)

test("C-1 (4.26). signed out: the match preview computes the fit and says the AI explanation was not generated (LT + EN, 390 + 1280 px)", async ({ browser }) => {
  const failures: string[] = [];
  for (const [locale, phone] of [
    ["lt", true],
    ["lt", false],
    ["en", false],
  ] as const) {
    const { ctx, page } = await as(browser, null, { locale: locale === "lt" ? "lt-LT" : "en-GB", phone });
    try {
      const res = await page.goto(`/${locale}/match-preview`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      expect(res?.status() ?? 0, "the preview page answers").toBeLessThan(400);
      const form = page.getByTestId("match-preview-form");
      await expect(form).toBeVisible({ timeout: 30_000 });
      await settle(page);
      for (const name of ["w_profession", "n_profession"]) {
        const select = form.locator(`select[name="${name}"]`);
        const value = await select.locator("option:not([disabled])").first().getAttribute("value");
        await select.selectOption(value ?? "");
      }
      await form.locator('input[name="n_country"]').fill("NL");
      await page.getByTestId("match-preview-submit").click();
      const result = page.getByTestId("match-preview-result");
      await expect(result, "the preview answers").toBeVisible({ timeout: 45_000 });
      const said = await result.innerText();
      const score = locale === "lt" ? "Atitikimas" : "Fit";
      const off = locale === "lt" ? "AI paaiškinimas dar nesukurtas" : "AI explanation not generated yet";
      const none = locale === "lt" ? "Paaiškinimas nesukurtas" : "No explanation was produced";
      if (!said.includes(score)) failures.push(`${locale}${phone ? " 390" : ""}: no fit score`);
      if (!said.includes(off) && !said.includes(none)) failures.push(`${locale}${phone ? " 390" : ""}: the AI box does not say it was not generated`);
      if (phone) await fitsPhone(page, "match preview");
      console.info(`[ai-off] match preview ${locale}${phone ? " 390" : " 1280"}: score=${said.includes(score)} off=${said.includes(off) || said.includes(none)}`);
    } finally {
      await ctx.close();
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("C-2 (7.14, 8.3). a foreign-language advert keeps its own words; asking for a translation answers with a note, not a rendering", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  // A Lithuanian reader; the Scandinavian boards carry adverts in their own language.
  const seen = new Set<string>();
  for (const board of ["/lt/jobs", "/lt/jobs?country=NO", "/lt/jobs?country=SE"]) {
    await page.goto(board);
    await rendered(page, "jobs");
    await settle(page);
    const found = await page
      .locator('main a[href^="/lt/jobs/"]')
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
    for (const h of found) if (/\/jobs\/[0-9a-f-]{36}$/.test(h)) seen.add(h);
  }
  const hrefs = [...seen].slice(0, 15);
  let found = false;
  for (const href of hrefs) {
    await page.goto(href);
    if (await page.getByTestId("vacancy-language").isVisible({ timeout: 10_000 }).catch(() => false)) {
      found = true;
      break;
    }
  }
  console.info(`[ai-off] adverts opened=${hrefs.length} foreign-language advert found=${found}`);
  test.skip(!found, "no foreign-language advert among the first job cards — nothing to translate");
  await expect(page.getByTestId("vacancy-source-language"), "the advert names its own language").toBeVisible();
  const before = (await page.locator("main").innerText()).length;
  await settle(page);
  await page.getByTestId("vacancy-translate-button").click();
  const note = page.getByTestId("vacancy-translate-note");
  const rendering = page.getByTestId("vacancy-translate-result");
  await expect(note.or(rendering).first(), "the request answers").toBeVisible({ timeout: 45_000 });
  expect(await rendering.count(), "translation is off in production: no rendering is shown").toBe(0);
  expect((await note.innerText()).trim().length, "the note says why, in words").toBeGreaterThan(5);
  expect((await page.locator("main").innerText()).length, "the publisher's own words stay on the page").toBeGreaterThanOrEqual(before - 5);
  await ctx.close();
});

// ═════════════════════════════════════════════════ cleanup, pass or fail

test.afterAll(async ({ browser }) => {
  test.setTimeout(150_000);
  if (!requestId || closedHere.has(requestId)) return;
  const { ctx, page } = await as(browser, "manager");
  try {
    await switchWorkspace(page, GAMA);
    await closeNeed(page, requestId);
  } catch (e) {
    console.info(`[cleanup] need close did not complete: ${firstLine(e)}`);
  } finally {
    await ctx.close();
  }
});
