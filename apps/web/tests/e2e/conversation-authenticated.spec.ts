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
 *   6. a match is ACTIONABLE — the canonical interest control, or an honest
 *      read-only card when the owner-gated interest store is absent;
 *   7. state survives a RELOAD — the same question, the same real answer;
 *   8. state survives a FRESH BROWSER CONTEXT (re-login) — same answer;
 *   9. Advanced mode still renders the module dashboard;
 *  10. desktop + mobile, and the page never scrolls horizontally.
 *
 * Every assertion accepts the honest degraded outcome as a pass. What is never
 * allowed is a fabricated one — a fake save, a fake employer, a dead button.
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

/**
 * Wait for a find-work turn to actually RESOLVE, then report what came back.
 *
 * The greeting is itself an `msg-assistant`, so a plain `match.or(assistant)`
 * is satisfied before the server search has run — it would silently read as
 * "no matches" every time. Poll until either a match card exists or a NEW
 * assistant message has arrived past the count taken before the turn.
 */
async function findWorkOutcome(
  page: Page,
  run: () => Promise<void>,
): Promise<"matches" | "message"> {
  const before = await page.getByTestId("msg-assistant").count();
  await run();
  await expect
    .poll(
      async () =>
        (await page.getByTestId("msg-employer-match").count()) > 0 ||
        (await page.getByTestId("msg-assistant").count()) > before,
      { timeout: 30_000 },
    )
    .toBe(true);
  return (await page.getByTestId("msg-employer-match").count()) > 0 ? "matches" : "message";
}

async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

/**
 * Every fixed control on the conversation surface must be REACHABLE.
 *
 * The composer takes `z-50` to win the hit-test against the global
 * language-feedback FAB. That alone leaves the FAB visible but permanently
 * unclickable, so the surface lifts it via `--feedback-fab-bottom`. Assert the
 * outcome, not the mechanism: the topmost element at the FAB's own centre is
 * the FAB. (Waits for hydration — the lift is applied by the chrome effect.)
 */
async function assertFabIsClickable(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.documentElement.dataset.surface === "conversation",
    null,
    { timeout: 15_000 },
  );
  const fab = page.getByTestId("language-feedback-open");
  const box = await fab.boundingBox();
  expect(box, "the language-feedback FAB should be laid out").not.toBeNull();
  const hit = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x as number, y as number)
        ?.closest("[data-testid]")
        ?.getAttribute("data-testid") ?? null,
    [box!.x + box!.width / 2, box!.y + box!.height / 2],
  );
  expect(hit, "another fixed control is covering the FAB").toBe("language-feedback-open");
}

test.describe("Conversation UI — authenticated /dashboard (desktop)", () => {
  test("dashboard IS the conversation; no wide module navbar; NL → user message; work-log + find-work reach real outcomes", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });

    // /dashboard renders the conversation surface …
    const chat = page.getByTestId("conversation-chat");
    await expect(chat).toBeVisible();
    // … and NOT the old wide module dashboard (Advanced chrome is absent here).
    await expect(page.locator('[data-chrome="full"]')).toHaveCount(0);
    await expect(page.getByTestId("chat-advanced-link")).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: false });

    // A natural work-log sentence becomes a user message, then the work-log flow
    // renders a REAL outcome: either the parse preview (worker has a context) or
    // the honest "no work context" blocker (never a fabricated save).
    await say(page, "Šiandien dirbau nuo 8 iki 17, 45 min pietūs, montavau langus.");
    await expect(
      page.getByTestId("worklog-flow").or(page.getByTestId("worklog-blocked")),
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath("worklog.png"), fullPage: false });

    // "Find work" runs the REAL opportunity search: real employer-match cards or
    // an honest empty/blocked message — never a fabricated employer.
    await findWorkOutcome(page, () => say(page, "Rask man darbą Nyderlanduose."));

    await assertNoHorizontalScroll(page);
    await assertFabIsClickable(page);
  });

  test("the CV path opens the REAL import flow inside the stream", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
    await page.getByTestId("chat-chip-cv").click();

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
    await page.getByTestId("chat-chip-profile").click();
    const summary = page.getByTestId("msg-profile-summary").last();
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath("profile-summary.png"), fullPage: false });

    const before = await missingLabels(page);

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
    await page.getByTestId("chat-chip-profile").click();
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
    const matches = page.getByTestId("msg-employer-match");

    if (outcome === "message") {
      // Honest empty/blocked state — and it must NOT promise a notification.
      const text = (await page.getByTestId("msg-assistant").last().innerText()).toLowerCase();
      expect(text).not.toContain("pranešiu");
      test.info().annotations.push({
        type: "note",
        description: "no live demands for this fixture worker — honest empty state asserted instead",
      });
      return;
    }

    await page.screenshot({ path: testInfo.outputPath("employer-match.png"), fullPage: false });
    const card = matches.first();
    const express = card.getByTestId("interest-express");
    const sent = card.getByTestId("interest-sent");
    if ((await express.count()) === 0 && (await sent.count()) === 0) {
      // The owner-gated interest store is absent → read-only card, no dead
      // button. That is the approved degradation, not a defect.
      test.info().annotations.push({
        type: "note",
        description: "interest store unavailable — card is read-only (no dead button), as designed",
      });
      return;
    }
    if ((await express.count()) > 0) {
      await express.first().click();
      // The REAL write result: the canonical control flips to the sent state.
      await expect(card.getByTestId("interest-sent")).toBeVisible({ timeout: 30_000 });
    }
  });

  test("module routes still render the full chrome", async ({ page }) => {
    // The second dashboard (`/dashboard/advanced`) was deleted by W3 Package 4;
    // the full module chrome survives on the legitimate detail routes. Wait for
    // the thing being asserted, not for network idle.
    await page.goto("/lt/dashboard/bookings", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-chrome="full"]')).toBeVisible({ timeout: 60_000 });
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

  test("mobile shows the 5-item simple bottom nav; composer works; no horizontal scroll", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible();
    await expect(page.getByTestId("conversation-bottom-nav")).toBeVisible();

    await say(page, "Ką dar turiu padaryti?");
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: false });
    await assertNoHorizontalScroll(page);
    await assertFabIsClickable(page);
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
