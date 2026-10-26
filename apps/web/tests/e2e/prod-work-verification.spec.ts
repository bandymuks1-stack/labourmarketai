import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { answerNoProjectIfAsked, chooseWorkContextIfAsked } from "./worklog-context";

/**
 * PRODUCTION — WORK VERIFICATION STATE (registry row 2.21, register EVID-3).
 * A journal entry's verification state is derived on every read by
 * `deriveWorkVerificationState` (lib/journal/work-verification-state.ts) from
 * the entry's engagement context and the LATEST employer decision in the
 * append-only `journal_entry_confirmations` (lib/journal/review-status.ts).
 * The model has nine states; the ones this cast can reach are walked:
 *
 *   verification_pending  — saved in Alfa's employee context, review on (V-1)
 *   returned              — the owner asks for changes in the inbox (V-3, V-4)
 *   verification_pending  — the worker's correction is a NEW entry back in
 *                           the queue; the original keeps its decision row
 *                           and leaves the diary (V-4): one correction chain
 *                           is ONE card, read by its live correction
 *                           (counted once — lib/journal/journal-list-core.ts
 *                           `countedOnce`), so nothing is listed or counted
 *                           twice. "Returned" is read BEFORE the answer;
 *                           after it, the correction's card names the return
 *                           and quotes the owner's note (`journal-entry-
 *                           corrected-from-<id>`, V-4 and V-6) — provenance,
 *                           not a second state.
 *   verified              — the owner confirms the correction (V-5, V-6)
 *   disputed              — the owner rejects the second entry (V-5, V-6)
 *
 * NOT walked, by name: self_reported / verifier_not_identified /
 * verifier_available / not_applicable need another context shape (no
 * organization, an ended employer, review switched off, the person's own
 * organization) — switching Alfa's review off for the shared worker would
 * break every other journal walk; self_confirmed is unreachable by design
 * (self-review is refused by the RPC and the guard trigger).
 *
 * The label is read on BOTH sides: the worker's journal (`journal-entry-
 * verification-<id>` with `data-verification-state`, plus the evidence chip
 * and the decision timeline) and the manager's review queue (`/dashboard/
 * inbox`: the entry waits there while pending and leaves it once decided; the
 * decision's own result line is the manager's label). An outsider (the agency,
 * and a worker of no authority) sees neither entry in any queue (V-2).
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   worker   qa.worker+multiw — Vytas, employee of "QA-SYNTHETIC Alfa" (review on)
 *   owner    qa.owner+multiw  — owns Alfa: the reviewer
 *   worker2  qa.worker+goal3  — no authority over Vytas (refused check)
 *   agency   qa.agency+multiw — another organization (refused check)
 *
 * WHAT STAYS. A decided entry cannot be deleted (the RPC raises
 * `already_confirmed_use_correction_request`; decisions are append-only
 * evidence), so three entries tagged `QA-SYNTHETIC <run>` stay in Vytas's
 * journal: the returned original, its confirmed correction and the disputed
 * one, with their three decision rows (the diary lists two cards: the
 * returned original reads through its correction). `afterAll`, pass or fail, deletes every
 * entry of this run that is still undecided (a red step part-way). Failure
 * messages carry states only.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN}`;
const ALFA = "QA-SYNTHETIC Alfa";
/** Bracketed markers keep the three entries apart ("[v1]" is not a substring of "[v1-fix]"). */
const E1 = `${TAG} [v1]: šiandien 3 valandas tinkavau sieną objekte`;
const E1_FIX = `${TAG} [v1-fix]: šiandien 4 valandas tinkavau ir glaisčiau sieną objekte`;
const E2 = `${TAG} [v2]: šiandien 2 valandas montavau lentynas sandėlyje`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" && ["worker", "owner", "worker2", "agency"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

async function as(
  browser: Browser,
  slot: string,
  opts: { locale?: "lt-LT" | "en-GB"; phone?: boolean } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: opts.locale ?? "lt-LT",
    ...(opts.phone ? PHONE : {}),
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

const firstLine = (e: unknown) => ((e as Error).message ?? String(e)).split("\n")[0].slice(0, 160);

// ═══════════════════════════════════════════════════════ the worker's side

/** A FRESH journal document (a real reload when the tab is already on it). */
async function journal(page: Page, locale = "lt"): Promise<Locator> {
  const path = `/${locale}/dashboard/journal`;
  const already = (() => {
    try {
      return new URL(page.url()).pathname === path;
    } catch {
      return false;
    }
  })();
  await page.goto(path);
  if (already) await page.reload();
  await rendered(page, `journal (${locale})`);
  const main = inMain(page);
  await expect(main.getByTestId("journal-quick-record-text")).toBeVisible({ timeout: 60_000 });
  return main;
}

/** This run's card carrying `marker`; its day group is opened when it is folded (only the newest day opens by itself). */
async function card(page: Page, marker: string): Promise<{ id: string; card: Locator }> {
  const main = inMain(page);
  const c = main.locator('[data-testid^="journal-entry-card-"]', { hasText: marker });
  await expect(c, `exactly one card for ${marker}`).toHaveCount(1, { timeout: 30_000 });
  if (!(await c.isVisible())) {
    const group = main.locator('details[data-testid="journal-day-group"]', { has: c });
    await group.locator("summary").first().click();
    await expect(c).toBeVisible({ timeout: 10_000 });
  }
  const id = ((await c.getAttribute("data-testid")) ?? "").replace(/^journal-entry-card-/, "");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return { id, card: c };
}

/** The verification line of one entry: its state attribute and the chip's words. */
async function expectVerification(page: Page, id: string, stateName: string, chip: RegExp | string): Promise<void> {
  const line = inMain(page).getByTestId(`journal-entry-verification-${id}`);
  await expect(line, `entry verification state`).toHaveAttribute("data-verification-state", stateName, { timeout: 30_000 });
  await expect(line.getByTestId("ww-evidence-state")).toContainText(chip);
}

async function record(page: Page, text: string): Promise<void> {
  const main = await journal(page);
  await main.getByTestId("journal-quick-record-text").fill(text);
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await chooseWorkContextIfAsked(page, /QA-SYNTHETIC Alfa/);
  await answerNoProjectIfAsked(page);
  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  const done = main.getByTestId("worklog-done");
  const failed = main.getByTestId("worklog-error").or(main.getByTestId("worklog-blocked"));
  await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
  if (!(await done.isVisible())) throw new Error(`the entry was not saved: ${(await failed.innerText()).slice(0, 120)}`);
}

const ids: { e1: string; e1fix: string; e2: string } = { e1: "", e1fix: "", e2: "" };
const decided = new Set<string>();

test("V-1 (2.21). the worker records two pieces of work; each reads 'sent to manager' after a fresh load", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await record(page, E1);
  await record(page, E2);
  await journal(page);
  ids.e1 = (await card(page, `${TAG} [v1]:`)).id;
  ids.e2 = (await card(page, `${TAG} [v2]:`)).id;
  for (const id of [ids.e1, ids.e2]) {
    // Pending, and the next action is honest: nothing to do, it is in someone's queue.
    await expectVerification(page, id, "verification_pending", "Išsiųsta vadovui");
    await expect(inMain(page).getByTestId(`journal-entry-verification-${id}`)).toHaveAttribute("data-next-action", "await_verifier");
    // Undecided work is still the worker's own draft: it can be deleted.
    await expect(inMain(page).getByTestId(`journal-entry-delete-${id}`)).toHaveCount(1);
  }
  await ctx.close();
});

// ═══════════════════════════════════════════════════════ the manager's side

/** The review queue on a fresh load. */
async function inbox(page: Page): Promise<Locator> {
  await page.goto("/lt/dashboard/inbox");
  await rendered(page, "inbox");
  const main = inMain(page);
  await expect(main.getByTestId("inbox-summary").or(main.getByTestId("inbox-load-failed")).first()).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId("inbox-load-failed"), "the review queue was read").toHaveCount(0);
  return main;
}

async function leavesQueue(page: Page, id: string): Promise<void> {
  await expect
    .poll(async () => (await inbox(page)).getByTestId(`inbox-entry-${id}`).count(), { timeout: 60_000, intervals: [3_000] })
    .toBe(0);
}

test("V-2 (2.21). both entries wait in Alfa's review queue; nobody without authority sees them", async ({ browser }) => {
  test.skip(!ids.e1 || !ids.e2, "V-1 did not record the entries");
  {
    const { ctx, page } = await as(browser, "owner");
    await useWorkspace(page, ALFA);
    const main = await inbox(page);
    for (const id of [ids.e1, ids.e2]) {
      const item = main.getByTestId(`inbox-entry-${id}`);
      await expect(item, "the pending entry is in the reviewer's queue").toBeVisible({ timeout: 30_000 });
      await expect(item).toContainText(RUN);
      await expect(main.getByTestId(`journal-approve-entry-${id}`), "the reviewer may decide it").toBeVisible();
    }
    await ctx.close();
  }
  // REFUSED: another organization and a worker with no authority over Vytas.
  for (const slot of ["agency", "worker2"]) {
    const { ctx, page } = await as(browser, slot);
    await page.goto("/lt/dashboard/inbox");
    await rendered(page, `inbox (${slot})`);
    for (const id of [ids.e1, ids.e2]) {
      await expect(page.getByTestId(`inbox-entry-${id}`), `${slot} sees no Alfa entry in a queue`).toHaveCount(0);
    }
    await expect(page.getByText(RUN), `${slot} reads none of this run's text`).toHaveCount(0);
    await ctx.close();
  }
});

/** Ask for changes on / reject one entry through its note form; the manager reads the decision's own result line. */
async function decideWithNote(page: Page, id: string, decision: "changes" | "reject", note: string): Promise<void> {
  const main = await inbox(page);
  const item = main.getByTestId(`inbox-entry-${id}`);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await main.getByTestId(decision === "changes" ? `journal-review-request-changes-${id}` : `journal-review-reject-${id}`).click();
  await main.getByTestId(`journal-review-note-${id}`).fill(note);
  // The note form's submit carries no testid (journal-inbox-entry.tsx); it is
  // the only submit left in the card once the idle buttons are gone.
  await item.locator('form button[type="submit"]').last().click();
  await decisionAnswered(page, id, decision === "changes" ? /Paprašyta pataisymų/ : /Nepatvirtinta/);
}

/**
 * The manager's label of a decision: the card's own result line ("Įrašas
 * patvirtintas — …" / "Paprašyta pataisymų — …" / "Nepatvirtinta — …"). The
 * action revalidates the inbox, so the decided card may unmount before that
 * line paints; then the decision is read as the card leaving the queue (the
 * next step re-reads the queue on a fresh load either way). Failure states
 * (not authorized, review off, …) render in the same line and fail here.
 */
async function decisionAnswered(page: Page, id: string, ok: RegExp): Promise<void> {
  const main = inMain(page);
  const result = main.getByTestId(`journal-review-result-${id}`);
  let seen = "";
  await expect
    .poll(
      async () => {
        if (await result.isVisible().catch(() => false)) {
          seen = (await result.innerText().catch(() => "")).trim();
          if (seen) return "result";
        }
        return (await main.getByTestId(`inbox-entry-${id}`).count()) === 0 ? "gone" : "waiting";
      },
      { timeout: 45_000, intervals: [500] },
    )
    .not.toBe("waiting");
  if (seen) expect(seen, "the decision's result line").toMatch(ok);
  console.info(`[verification] decision answered by ${seen ? "its result line" : "the card leaving the queue"}`);
  decided.add(id);
}

test("V-3 (2.21). the owner asks for changes on the first entry; it leaves the queue", async ({ browser }) => {
  test.skip(!ids.e1, "V-1 did not record the entry");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await decideWithNote(page, ids.e1, "changes", `${TAG}: nurodyk, kiek kvadratinių metrų nutinkavai.`);
  await leavesQueue(page, ids.e1);
  await ctx.close();
});

test("V-4 (2.21). the worker reads 'returned', answers with a correction, and the correction is pending again", async ({ browser }) => {
  test.skip(!decided.has(ids.e1), "V-3 did not return the entry");
  const { ctx, page } = await as(browser, "worker");
  await journal(page);
  const { id } = await card(page, `${TAG} [v1]:`);
  await expectVerification(page, id, "returned", "Grąžinta");
  await expect(inMain(page).getByTestId(`journal-entry-verification-${id}`)).toHaveAttribute("data-next-action", "respond_to_decision");
  await expect(
    inMain(page).getByTestId(`journal-entry-status-${id}`).locator('li[data-step="changes_requested"]'),
    "the decision is on the entry's timeline",
  ).toHaveCount(1);
  await expect(inMain(page).getByTestId(`journal-entry-delete-${id}`), "a decided entry is not deletable").toHaveCount(0);
  // ACT: the correction the employer asked for (the one supersede path).
  await inMain(page).getByTestId(`journal-entry-edit-${id}`).click();
  const sheet = page.getByTestId(`journal-edit-sheet-${id}`);
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByTestId("journal-compact-text").fill(E1_FIX);
  await sheet.getByTestId("journal-compact-save").click();
  // A successful correction revalidates the journal, and the original's
  // correction launcher (and so this sheet) unmounts once the correction
  // exists (`correctedOriginalIds`) — the saved line may never paint. Wait for
  // the outcome either way: an error stays in the open sheet and fails here;
  // success is the saved line or the sheet going away. The fresh load below
  // is the proof.
  let outcome = "waiting";
  await expect
    .poll(
      async () => {
        if ((await sheet.getByTestId("journal-compact-error").count()) > 0) outcome = "error";
        else if ((await sheet.count()) === 0) outcome = "closed";
        else if (await sheet.getByTestId("journal-compact-saved").isVisible().catch(() => false)) outcome = "saved";
        return outcome;
      },
      { timeout: 60_000, intervals: [500] },
    )
    .not.toBe("waiting");
  expect(outcome, "the correction was saved").not.toBe("error");
  console.info(`[verification] correction answered by ${outcome === "closed" ? "the sheet closing" : "its saved line"}`);
  // Persistence on a fresh document: a NEW entry, pending; the original keeps its decision.
  await journal(page);
  ids.e1fix = (await card(page, `${TAG} [v1-fix]:`)).id;
  expect(ids.e1fix, "the correction is its own entry").not.toBe(ids.e1);
  await expectVerification(page, ids.e1fix, "verification_pending", "Išsiųsta vadovui");
  // The answered original is not a second card: the chain is counted once by
  // its live correction (walk 2026-10-25 run 40209944686 read the original's
  // verification line here and found no card — the canonical list read had
  // moved it to `correctedOriginals`, by design since #1689). Its decision row
  // is append-only and stays; the delete check above proved it was decided.
  await expect(
    inMain(page).locator(`[data-testid="journal-entry-card-${ids.e1}"]`),
    "the corrected original is not listed beside its correction",
  ).toHaveCount(0);
  // ...but what it answered is read on the correction's own card: the return,
  // its date and the owner's note (provenance, not a second state — the chip
  // above still reads the correction's own "Išsiųsta vadovui").
  await expectCorrectedFrom(page, ids.e1fix, "Pataisyta po grąžinimo");
  await ctx.close();
});

/** The correction's card names the decision it answered and quotes the owner's V-3 note. */
async function expectCorrectedFrom(page: Page, id: string, label: string): Promise<void> {
  await card(page, `${TAG} [v1-fix]:`);
  const line = inMain(page).getByTestId(`journal-entry-corrected-from-${id}`);
  await expect(line, "the correction says what it answered").toBeVisible({ timeout: 30_000 });
  await expect(line).toHaveAttribute("data-result", "changes_requested");
  await expect(line).toContainText(label);
  await expect(line, "the owner's note is quoted").toContainText("nurodyk, kiek kvadratinių metrų nutinkavai.");
}

test("V-5 (2.21). the owner confirms the correction and rejects the second entry; both leave the queue", async ({ browser }) => {
  test.skip(!ids.e2, "V-1 did not record the entries");
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  if (ids.e1fix) {
    const main = await inbox(page);
    await expect(main.getByTestId(`inbox-entry-${ids.e1fix}`), "the correction reached the queue").toBeVisible({ timeout: 30_000 });
    await main.getByTestId(`journal-approve-entry-${ids.e1fix}`).click();
    await decisionAnswered(page, ids.e1fix, /Įrašas patvirtintas/);
    await leavesQueue(page, ids.e1fix);
  }
  await decideWithNote(page, ids.e2, "reject", `${TAG}: šios dienos šiame objekte nedirbai.`);
  await leavesQueue(page, ids.e2);
  await ctx.close();
});

test("V-6 (2.21). the worker reads every state after a fresh load — in Lithuanian, in English and on the phone", async ({ browser }) => {
  test.skip(!decided.has(ids.e2), "V-5 did not decide the entries");
  // The returned original was answered in V-4, so its chain reads by the
  // correction (counted once); "returned" itself is read in V-4 before the
  // answer. Without a correction the original is still the chain's card.
  const expected: { id: string; marker: string; state: string; lt: string; en: string }[] = [
    ...(ids.e1fix ? [] : [{ id: ids.e1, marker: "[v1]:", state: "returned", lt: "Grąžinta", en: "Returned" }]),
    { id: ids.e2, marker: "[v2]:", state: "disputed", lt: "Ginčijama", en: "Disputed" },
    ...(decided.has(ids.e1fix) ? [{ id: ids.e1fix, marker: "[v1-fix]:", state: "verified", lt: "Vadovo patvirtinta", en: "Manager confirmed" }] : []),
  ];
  {
    const { ctx, page } = await as(browser, "worker");
    await journal(page);
    for (const e of expected) {
      await card(page, `${TAG} ${e.marker}`);
      await expectVerification(page, e.id, e.state, e.lt);
      await expect(inMain(page).getByTestId(`journal-entry-delete-${e.id}`), "a decided entry is not deletable").toHaveCount(0);
    }
    await expect(inMain(page).getByTestId(`journal-entry-status-${ids.e2}`).locator('li[data-step="rejected"]')).toHaveCount(1);
    if (ids.e1fix) {
      await expect(
        inMain(page).locator(`[data-testid="journal-entry-card-${ids.e1}"]`),
        "the corrected original is not listed beside its correction",
      ).toHaveCount(0);
    }
    if (decided.has(ids.e1fix)) {
      await expect(inMain(page).getByTestId(`journal-entry-status-${ids.e1fix}`).locator('li[data-step="approved"]')).toHaveCount(1);
    }
    if (ids.e1fix) await expectCorrectedFrom(page, ids.e1fix, "Pataisyta po grąžinimo");
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "worker", { locale: "en-GB" });
    await journal(page, "en");
    expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
    for (const e of expected) {
      await card(page, `${TAG} ${e.marker}`);
      await expectVerification(page, e.id, e.state, e.en);
    }
    if (ids.e1fix) await expectCorrectedFrom(page, ids.e1fix, "Corrected after it was returned");
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "worker", { phone: true });
    await journal(page);
    await card(page, `${TAG} [v2]:`);
    await expect(inMain(page).getByTestId(`journal-entry-verification-${ids.e2}`), "the label reads on the phone").toBeVisible();
    await expectVerification(page, ids.e2, "disputed", "Ginčijama");
    await fitsPhone(page, "journal with decided entries");
    await ctx.close();
  }
});

// ══════════════════════════════════════════════════ cleanup, pass or fail

test.afterAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await as(browser, "worker");
  try {
    let removed = 0;
    for (const marker of ["[v1]:", "[v1-fix]:", "[v2]:"]) {
      try {
        await journal(page);
        const c = inMain(page).locator('[data-testid^="journal-entry-card-"]', { hasText: `${TAG} ${marker}` });
        if ((await c.count()) !== 1) continue;
        const { id } = await card(page, `${TAG} ${marker}`);
        const del = inMain(page).getByTestId(`journal-entry-delete-${id}`);
        // Only an UNDECIDED entry offers delete; a decided one stays as evidence.
        if ((await del.count()) === 0) continue;
        const more = inMain(page).getByTestId(`journal-entry-more-${id}`);
        if (!(await del.isVisible())) await more.locator("summary").first().click();
        await del.click();
        await inMain(page).getByTestId(`journal-entry-delete-${id}-yes`).click();
        await expect(inMain(page).getByTestId(`journal-entry-deleted-${id}`)).toBeVisible({ timeout: 30_000 });
        removed += 1;
      } catch (e) {
        console.info(`[cleanup] ${marker} not removed: ${firstLine(e)}`);
      }
    }
    console.info(`[cleanup] undecided entries removed=${removed}`);
  } finally {
    await ctx.close();
  }
});
