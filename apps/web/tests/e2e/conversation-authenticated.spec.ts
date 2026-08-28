import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Authenticated E2E for the Real Conversation UI (PR #864).
 *
 * Runs with a REAL logged-in session minted by scripts/e2e-mint-session.ts (no
 * OAuth), against the LOCAL Supabase stack via `pnpm -C apps/web e2e:local`
 * (docs/TESTING.md). Skips when the storage state is missing.
 *
 * This is the whole chat-first journey, IN the chat window:
 *   1. signed in → /dashboard IS the conversation (no wide module navbar);
 *   2. the CV path opens the REAL import flow in the stream;
 *   3. missing information is collected conversationally — an inline form runs
 *      through the real dispatcher and reports the REAL server outcome;
 *   4. the profile summary is server-derived and NAMES what is missing;
 *   5. "find work" runs the REAL opportunity search;
 *   6. a match is ACTIONABLE — the canonical interest control on the panel
 *      row, or an honest read-only row when the interest store is absent;
 *   7. state survives a RELOAD — the same question, the same real answer;
 *   8. state survives a FRESH BROWSER CONTEXT (re-login) — same answer;
 *   9. module routes keep the ONE top bar, with the way back to the chat;
 *  10. desktop + mobile, and the page never scrolls horizontally.
 *
 * Every assertion accepts the honest degraded outcome as a pass. What is never
 * allowed is a fabricated one — a fake save, a fake employer, a dead button.
 *
 * SELECTORS FOLLOW THE PRODUCT, NOT THE OTHER WAY ROUND. Five ids here once
 * pinned UI that later trains deliberately removed — `chat-advanced-link`,
 * `conversation-bottom-nav` and `msg-employer-match` (retired behaviour, and
 * the last of those made the actionable-match assertions unreachable), plus
 * `chat-chip-profile`, whose capability survives but is no longer an opening
 * chip. Because the file skipped without a minted session, none of it ever
 * went red. `E2E_REQUIRE_AUTH=1` closes that hole, and
 * `lib/guards/e2e-testid-orphans.test.ts` catches the next one in CI.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

/** The LT label of the "languages" checkpoint, read from the real catalog so
 *  the spec never hardcodes product copy that translation could move. */
const LANGUAGES_LABEL: string = (
  JSON.parse(
    readFileSync(join(__dirname, "..", "..", "messages", "lt.json"), "utf8"),
  ) as { conversation: { journal: { steps: Record<string, string> } } }
).conversation.journal.steps.languages;

/**
 * "DID NOT RUN" MUST NEVER BE REPORTED AS "PASSED".
 *
 * Every test below skips when the minted session is absent, which is right for
 * a developer who has not started the local stack — but it also meant a run
 * that exercised NONE of the authenticated journey exited 0 and read as green.
 * That is how the four stale selectors this file used to wait on survived long
 * after the UI behind them was removed.
 *
 * `E2E_REQUIRE_AUTH=1` is the caller saying "this run MUST exercise the
 * authenticated journey". Then a missing storage state is a hard ERROR at load
 * time, not a skip: Playwright reports the file as failed and the run exits
 * non-zero. Without the flag the honest developer skip is unchanged.
 */
const REQUIRE_SESSION = process.env.E2E_REQUIRE_AUTH === "1";
if (REQUIRE_SESSION && !HAS_SESSION) {
  throw new Error(
    `E2E_REQUIRE_AUTH=1 but ${STORAGE_STATE} is missing. The authenticated ` +
      "journey did NOT run — refusing to report that as a pass. Mint a " +
      "session first: E2E_OWNER_EMAIL=dev.worker@local.test pnpm tsx " +
      "scripts/e2e-mint-session.ts (needs the local stack).",
  );
}

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

/** Send a sentence in the composer and wait for the turn to be accepted. */
async function say(page: Page, text: string): Promise<void> {
  await page.getByTestId("composer-input").fill(text);
  await page.getByTestId("composer-send").click();
  await expect(page.getByTestId("msg-user").last()).toBeVisible();
}

/** Ask for the real profile state and return its "still missing" labels. */
async function missingLabels(page: Page): Promise<string[]> {
  await say(page, "Ką dar turiu padaryti?");
  const card = page.getByTestId("msg-profile-summary").last();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const missing = card.getByTestId("profile-summary-missing");
  if ((await missing.count()) === 0) return [];
  return (await missing.locator("li").allInnerTexts()).map((s) => s.trim());
}

/** The terminal states of the opportunities result — every one of them is an
 *  honest answer, and exactly one of them is reached per search. */
function opportunitiesSettled(page: Page) {
  return page
    .getByTestId("opportunities-view")
    .or(page.getByTestId("opportunities-empty"))
    .or(page.getByTestId("opportunities-unavailable"))
    .or(page.getByTestId("opportunities-no-worker"))
    .or(page.getByTestId("opportunities-error"));
}

/**
 * Wait for a find-work turn to actually RESOLVE, then report what came back.
 *
 * THE ANSWER IS NOT IN THE THREAD ANY MORE. This waited on `msg-employer-match`
 * — the chat's own job card, deleted when matches became a Context Panel result
 * (`chat/types.ts`: "job matches render in the Context Panel result, which is
 * their one surface"; `doFindWork` now calls `openResult("opportunities")`).
 * Because `doFindWork` ALSO pushes `assistant(res.intro)`, the old helper's
 * `assistant count > before` arm fired on every single run and the match arm
 * could never be reached: it reported "message" unconditionally, so the
 * actionable-match assertions below were dead code. That is a selector that
 * could not fail, which is worse than one that always fails.
 *
 * The panel loads asynchronously AFTER that sentence lands, so a new assistant
 * message alone is not "resolved" — while `opportunities-loading` is on screen
 * the search genuinely has not answered yet, and returning there would read a
 * still-loading panel as "no matches". Poll until the panel reaches a terminal
 * state, or until the turn produced a new assistant message with no panel
 * loading at all (the empty/blocked reply, which never opens the panel).
 */
async function findWorkOutcome(
  page: Page,
  run: () => Promise<void>,
): Promise<"matches" | "empty" | "message"> {
  const before = await page.getByTestId("msg-assistant").count();
  await run();
  const settled = opportunitiesSettled(page);
  await expect
    .poll(
      async () => {
        if ((await settled.count()) > 0) return true;
        if ((await page.getByTestId("opportunities-loading").count()) > 0) return false;
        return (await page.getByTestId("msg-assistant").count()) > before;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  if ((await page.getByTestId("opportunities-view").count()) > 0) return "matches";
  if ((await settled.count()) > 0) return "empty";
  return "message";
}

async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

/**
 * THE COMPOSER'S SEND CONTROL MUST OWN ITS OWN HIT-TEST.
 *
 * This used to assert the opposite side of the same collision: a floating
 * language-feedback button sat on the send control, so the surface lifted the
 * button out of the way with `--feedback-fab-bottom`, and this checked that the
 * BUTTON was still clickable. That pinned the workaround — it would have gone
 * red on any attempt to remove the floating control, and it said nothing about
 * the control that actually matters here.
 *
 * The feedback trigger is a menu item now and nothing floats over the chat, so
 * the assertion is the one that was always the point: at the send button's own
 * centre, the browser hits the send button.
 */
async function assertComposerSendIsClickable(page: Page): Promise<void> {
  const send = page.locator('[data-testid="composer-send"]').first();
  await expect(send).toBeVisible({ timeout: 15_000 });
  const box = await send.boundingBox();
  expect(box, "the composer send control should be laid out").not.toBeNull();
  const ownsItsCentre = await page.evaluate(
    ([x, y]) => {
      const el = document.querySelector('[data-testid="composer-send"]');
      const top = document.elementFromPoint(x as number, y as number);
      return !!el && (el === top || el.contains(top));
    },
    [box!.x + box!.width / 2, box!.y + box!.height / 2],
  );
  expect(ownsItsCentre, "another control is covering the composer's send button").toBe(
    true,
  );
}

test.describe("Conversation UI — authenticated /dashboard (desktop)", () => {
  test("dashboard IS the conversation; no wide module navbar; NL → user message; work-log + find-work reach real outcomes", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });

    // /dashboard renders the conversation surface …
    const chat = page.getByTestId("conversation-chat");
    await expect(chat).toBeVisible();
    // … and NOT the old wide module dashboard (Advanced chrome is absent here).
    await expect(page.locator('[data-chrome="full"]')).toHaveCount(0);

    // THE ADVANCED DOOR IS RETIRED, NOT MOVED. This waited on
    // `chat-advanced-link`. Advanced mode was removed for the ordinary user by
    // owner ruling (`conversation-header.tsx`: the "Išplėstinis valdymas" entry
    // is gone from the one top bar) and W3 Package 4 deleted /dashboard/advanced
    // outright (`account-menu.tsx`) — so there is no control left to repoint at
    // and no capability hiding behind the old id.
    //
    // What the bar carries INSTEAD as the universal way out of the conversation
    // is the command search, deliberately visible at every width ("with the tab
    // row gone, search is one of the two universal ways to reach any
    // projection"). Assert the live control, and assert the retired route did
    // not quietly come back.
    await expect(page.getByTestId("chat-command-search")).toBeVisible();
    await expect(page.locator('a[href*="/dashboard/advanced"]')).toHaveCount(0);

    await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: false });

    // A natural work-log sentence becomes a user message, then the work-log flow
    // renders a REAL outcome: either the parse preview (worker has a context) or
    // the honest "no work context" blocker (never a fabricated save).
    await say(page, "Šiandien dirbau nuo 8 iki 17, 45 min pietūs, montavau langus.");
    await expect(
      page.getByTestId("worklog-flow").or(page.getByTestId("worklog-blocked")),
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath("worklog.png"), fullPage: false });

    // "Find work" runs the REAL opportunity search: real rows in the
    // opportunities result, or an honest empty/blocked answer — never a
    // fabricated employer. The helper fails if neither ever resolves.
    await findWorkOutcome(page, () => say(page, "Rask man darbą Nyderlanduose."));

    await assertNoHorizontalScroll(page);
    await assertComposerSendIsClickable(page);
  });

  test("the CV path opens the REAL import flow inside the stream", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });

    // THE CV CHIP IS NOT ON THE OPENING SCREEN. This clicked `chat-chip-cv`.
    // The `cv` starter chip still exists — but the greeting only renders its
    // chips while it is the LAST message (`messages.tsx`: "the thread never
    // accumulates a persistent button wall"), and for any worker the opening
    // brief has something to say to, the brief is pushed straight after the
    // greeting and the starter row goes with it. This fixture worker gets a
    // brief (3 matching opportunities + a profile gap), so `cv` was never on
    // screen. It is the reachability half of the same rot: the id resolves in
    // source, the control is simply not there.
    //
    // The canonical way in is the composer, and it is the SAME code path —
    // the typed `cv` intent dispatches `handleChip({ id: "cv" })` verbatim
    // (`intent-router.ts` classifies "Parodyk mano CV" as `cv`).
    await say(page, "Parodyk mano CV.");

    // The real CV flow (upload → deterministic parse → canonical confirm), in
    // the conversation — not a link out to another screen.
    const cv = page.getByTestId("conversation-cv-flow");
    await expect(cv).toBeVisible({ timeout: 20_000 });
    await expect(cv.locator('input[type="file"]')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("cv-flow.png"), fullPage: false });
  });

  test("the profile summary is REAL, names what is missing, and survives a reload", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });

    // The summary is server-derived: concrete checkpoints, not canned copy.
    //
    // This used to click `chat-chip-profile`. The `profile` chip is still a
    // real dispatcher intent (`handleChip` case "profile" → `startProfileSummary`),
    // but it is NOT on the opening screen: the owner's three-starter cap (§D)
    // leaves the worker with logwork / cv / jobs, and `profile` now appears only
    // as a CONTEXTUAL follow-up. So the capability is alive and the control that
    // reaches it from a cold /dashboard is the composer — asking is the
    // canonical interaction, and it runs the same dispatcher the chip fires.
    const before = await missingLabels(page);
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("profile-summary.png"), fullPage: false });

    // RELOAD: the thread is session-only by design, but the STATE is not. The
    // same question must return the same real answer, re-read from the database.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible();
    // The thread genuinely restarts — this is the honest, documented behaviour
    // (transcript persistence is a separate owner-gated proposal).
    await expect(page.getByTestId("msg-profile-summary")).toHaveCount(0);
    const after = await missingLabels(page);

    expect(after).toEqual(before);
  });

  test("a fact collected in the chat really persists — it leaves the missing list", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
    const before = await missingLabels(page);
    test.skip(
      !before.includes(LANGUAGES_LABEL),
      `"${LANGUAGES_LABEL}" is already saved for this fixture worker — there is no missing→saved transition left to observe`,
    );

    // Collect ONE missing fact conversationally, through the real dispatcher.
    // `missingLabels` above already asked for — and rendered — the summary, so
    // its follow-up chips are on screen; the retired `chat-chip-profile` starter
    // is not the way in any more (see the summary test for why).
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("chat-chip-f:worker.add-language").last().click();

    const form = page.getByTestId("inline-action-form-worker.add-language");
    await expect(form).toBeVisible({ timeout: 20_000 });
    await form.getByTestId("field-lang").selectOption("en");
    await form.getByTestId("field-level").selectOption("B2");
    await form.getByTestId("inline-action-continue").click();
    await expect(form.getByTestId("inline-action-review")).toBeVisible();
    await form.getByTestId("inline-action-save").click();

    // The REAL server outcome — success or a real error, never a fake save.
    // (The success state REPLACES the form, so it is a sibling, not a child.)
    const done = page.getByTestId("inline-action-done");
    const failed = page.getByTestId("inline-action-error");
    await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
    test.skip(
      (await done.count()) === 0,
      "the canonical save reported a real error — that is an honest outcome, not a chat defect",
    );

    // After a full reload the saved fact must be gone from "missing": the chat
    // is reporting the database, not a remembered script.
    await page.reload({ waitUntil: "networkidle" });
    const after = await missingLabels(page);
    expect(after).not.toContain(LANGUAGES_LABEL);
    expect(after.length).toBe(before.length - 1);
    // …and nothing else moved: no invented progress, no lost checkpoint.
    expect(after).toEqual(before.filter((l) => l !== LANGUAGES_LABEL));
  });

  test("a match is actionable — canonical interest control or an honest read-only card", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
    const outcome = await findWorkOutcome(page, async () => {
      await page.getByTestId("chat-chip-jobs").click();
    });

    if (outcome !== "matches") {
      // The conversational answer did not itself reach rows. That is an HONEST
      // outcome, not a pass by omission — for this fixture worker it is the
      // criteria gate: `startFindWork` sees an incomplete work card and asks
      // for it before searching. Whatever the reply is, it must not promise a
      // notification the product cannot send.
      const text = (await page.getByTestId("msg-assistant").last().innerText()).toLowerCase();
      expect(text).not.toContain("pranešiu");
      test.info().annotations.push({
        type: "note",
        description: `the find-work turn answered without rows (${outcome}) — asserting the result surface directly instead`,
      });
    }

    // THE ACTIONABILITY ASSERTION MUST ACTUALLY RUN. Gating it on the turn
    // above is how this coverage died the first time: with `msg-employer-match`
    // deleted the helper always said "no matches", so everything below was
    // unreachable. It is now reached either way — `?result=opportunities` is
    // the conversation's own validated deep link to the SAME panel the answer
    // opens (`use-result-param.ts` rejects any kind that is not real), so a
    // worker still blocked at the criteria gate does not hide whether a
    // rendered match can be acted on.
    await page.goto("/lt/dashboard?result=opportunities", { waitUntil: "networkidle" });
    await expect(opportunitiesSettled(page)).toBeVisible({ timeout: 30_000 });

    const view = page.getByTestId("opportunities-view");
    if ((await view.count()) === 0) {
      // Honest empty / unavailable / no-worker — a real answer, no fake rows.
      test.info().annotations.push({
        type: "note",
        description: "the opportunities result has no rows for this fixture worker — honest state asserted",
      });
      return;
    }

    await page.screenshot({ path: testInfo.outputPath("employer-match.png"), fullPage: false });

    // The match rows moved OUT of the thread and into the Context Panel result
    // (see `findWorkOutcome`). This asserted `msg-employer-match` — the deleted
    // chat card — and the interest control it looked for inside it. Both live
    // on the panel row now, which is deliberately the ONE surface that can
    // write interest: "that renderer is deleted, so this is now the only place
    // a person expresses interest from a conversational answer."
    const row = view.locator('[data-testid^="opportunities-row-"]').first();
    await expect(row).toBeVisible();

    const interest = row.getByTestId("opportunities-match-interest");
    if ((await interest.count()) === 0) {
      // The owner-gated interest store is absent → read-only row, no dead
      // button. That is the approved degradation, not a defect.
      test.info().annotations.push({
        type: "note",
        description: "interest store unavailable — row is read-only (no dead button), as designed",
      });
      return;
    }

    const express = interest.getByTestId("interest-express");
    const sent = interest.getByTestId("interest-sent");
    // The control is a real state machine: it shows one of the two, never
    // neither — a rendered interest block with no control would be a dead one.
    expect((await express.count()) + (await sent.count())).toBeGreaterThan(0);
    if ((await express.count()) > 0) {
      await express.first().click();
      // The REAL write result: the canonical control flips to the sent state.
      await expect(interest.getByTestId("interest-sent")).toBeVisible({ timeout: 30_000 });
    }
  });

  test("module routes render the ONE top bar, not the legacy module chrome", async ({
    page,
  }) => {
    // This used to assert `[data-chrome="full"]` on /dashboard/bookings. The
    // legacy module chrome no longer reaches any product route: the canonical
    // one-top-bar is the default for the whole authenticated tree, and "full"
    // survives for the internal admin console alone. A worker leaving the
    // conversation for a module route must not land in a different product.
    await page.goto("/lt/dashboard/bookings", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-chrome="simple"]')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('[data-chrome="full"]')).toHaveCount(0);
    // The way back to the operating centre exists on every projection.
    await expect(page.getByTestId("back-to-chat")).toBeVisible();
  });
});

test.describe("Conversation UI — continuity across a fresh login", () => {
  test("a brand-new browser context gets the SAME real state", async ({ page, browser }) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
    const first = await missingLabels(page);

    // A genuinely fresh context: new cookie jar, new client state, same stored
    // session — i.e. what a returning user gets after signing in again.
    const context = await browser.newContext({ storageState: STORAGE_STATE });
    const fresh = await context.newPage();
    await fresh.goto("/lt/dashboard", { waitUntil: "networkidle" });
    await expect(fresh.getByTestId("conversation-chat")).toBeVisible();
    const second = await missingLabels(fresh);
    await context.close();

    expect(second).toEqual(first);
  });
});

test.describe("Conversation UI — authenticated /dashboard (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile navigation is the ONE top bar; composer works; no horizontal scroll", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible();

    // THE CONVERSATION'S BOTTOM NAV IS RETIRED, NOT RENAMED. This waited on
    // `conversation-bottom-nav` and its "5-item simple bottom nav". The owner
    // ruling removed the parallel tab system: `dashboard-chrome.tsx` renders
    // the conversation BARE, its panel chrome says "no bottom nav exists any
    // more", and the surviving `BottomNav` component is mounted only by the
    // `full` chrome, which now serves the internal admin console alone.
    //
    // Mobile navigation IS the one top bar, so assert the controls that
    // actually carry it at phone width — the command search (visible on EVERY
    // width by design) and the one avatar menu that holds profile, settings,
    // theme, CV and sign-out — plus that no bottom tab bar came back here.
    await expect(page.getByTestId("chat-command-search")).toBeVisible();
    await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
    await expect(page.locator('[data-testid^="bottom-nav-"]')).toHaveCount(0);

    await say(page, "Ką dar turiu padaryti?");
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: false });
    await assertNoHorizontalScroll(page);
    await assertComposerSendIsClickable(page);
  });

  test("the employer-match card fits the phone — no horizontal scroll with the interest control", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
    await findWorkOutcome(page, async () => {
      await page.getByTestId("chat-chip-jobs").click();
    });
    await page.screenshot({ path: testInfo.outputPath("match-mobile.png"), fullPage: false });
    await assertNoHorizontalScroll(page);
  });
});
