import { appendFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { test, expect, type Browser, type Page } from "./prod-walk";

/**
 * SR-1, FIRST SEARCH (owner 2026-11-06): what a first search on the job board
 * takes, signed in and signed out, on production. READ-ONLY: it opens the board,
 * types a word and presses search. It saves, applies and writes nothing.
 *
 * WHAT THIS IS. Real Chrome through `channel: "chrome"`, HEADLESS AND SCRIPTED, on a
 * GitHub runner, so the network and machine are not a person's. Report its numbers
 * as that, never as a person's Chrome.
 *
 * ONE READING. A new browser context with an empty cache opens `/lt/jobs`, types one
 * word it has not used in this run, and presses search. `search_ms` runs from the
 * press to the answer on screen: the count line, or the honest "did not answer" line.
 *
 * Rounds alternate who goes first and are spaced apart, so the walk spans an import
 * when it is dispatched with one, and most readings follow a short idle. Each reading
 * carries its UTC time, to set against the import step's start and end.
 *
 * A SLOW OR UNAVAILABLE SEARCH IS A READING, NOT A FAILED TEST: this walk passing says
 * the readings were taken, not that they were fast. It fails only when a reading is
 * invalid. A signed-out reading that came out signed in stops the walk at once. A reading
 * whose session could not be confirmed is kept with `signed_in: null`, the walk goes on so
 * an import window isn't lost, and the run fails at the end. Only readings whose `signed_in`
 * matches their `actor` count.
 *
 * THE SESSION IS READ FROM THE SAVED-JOBS TAB, which the server renders only after it has
 * verified the user. The header's sign-in link is no proof: it is the guest slot until
 * hydration, and after that it only says a cookie exists, even an expired one. The tab also
 * needs the bookmark read to succeed, so its absence can't tell an expired session from a
 * failed read: for the signed-in actor it means unconfirmed, not signed out.
 *
 * TIMINGS NEVER REACH THE WALK LOG, THE RESULT JSON OR THE STEP SUMMARY: all three are
 * public and hold what the reporter captures from stdout, so nothing here prints a
 * number or names a step. Readings go only to SR1_READINGS_FILE, which the workflow
 * uploads as a separate artefact kept one day.
 *
 * Cast: `worker2` is qa.worker+goal3, minted from the allowlist in
 * `lib/testing/prod-qa-guard.ts`; signed out is a context with no session.
 */
const state = resolve(__dirname, ".storage-state.prod-qa.worker2.json");
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state);
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 900_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

type Actor = "signed_in" | "signed_out";

const OUT = process.env.SR1_READINGS_FILE ?? join(tmpdir(), "sr1-readings.jsonl");
const ROUNDS = Number(process.env.SR1_ROUNDS ?? 8);
const GAP_MS = 45_000;
const ANSWER_TIMEOUT_MS = 60_000;

/** Words a person types, not all of them profession names: some redirect to a profession filter, and the reading says so. */
const WORDS = [
  "byggarbetare",
  "lagerarbetare",
  "undersköterska",
  "lastbilschaufför",
  "montör",
  "lärare",
  "kock",
  "svetsare",
  "sjuksköterska",
  "snickare",
  "butiksäljare",
  "projektledare",
  "slaugytoja",
  "vairuotojas",
  "statybininkas",
  "virėja",
] as const;

const wordAt = (i: number): string => {
  const offset = Number(process.env.GITHUB_RUN_ID ?? 0) % WORDS.length;
  return WORDS[(i + offset) % WORDS.length]!;
};

const record = (line: Record<string, unknown>): void => {
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
};

const savedTab = (page: Page) => page.locator('main a[href="/lt/jobs?saved=1"]');
const countLine = (page: Page) => page.locator('main p[role="status"]:not([data-testid])').first();
const unavailable = (page: Page) => page.getByTestId("public-jobs-unavailable");

/** The board has answered, either way. False when nothing came within the limit. */
async function answered(page: Page): Promise<boolean> {
  return countLine(page)
    .or(unavailable(page))
    .first()
    .waitFor({ state: "visible", timeout: ANSWER_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
}

/** The session the server rendered, once the board has answered. Null: not confirmed. */
async function observedSession(page: Page, actor: Actor): Promise<boolean | null> {
  if (actor === "signed_out") return (await savedTab(page).count()) > 0;
  return savedTab(page)
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => null);
}

/** One reading. Returns the session it saw, or null when none was confirmed. */
async function reading(browser: Browser, actor: Actor, round: number, term: string): Promise<boolean | null> {
  let signedIn: boolean | null = null;
  const ctx = await browser.newContext({
    ...(actor === "signed_in" ? { storageState: state } : {}),
    locale: "lt-LT",
  });
  const page = await ctx.newPage();
  const base = { at: new Date().toISOString(), round, actor, term };
  try {
    const openedAt = Date.now();
    await page.goto("/lt/jobs", { waitUntil: "domcontentloaded", timeout: ANSWER_TIMEOUT_MS });
    const boardShown = await answered(page);
    const boardMs = Date.now() - openedAt;
    if (!boardShown) {
      record({ ...base, outcome: "board_timeout", board_ms: boardMs, signed_in: signedIn });
      return signedIn;
    }
    signedIn = await observedSession(page, actor);
    const form = page.locator('main form[method="get"]').first();
    await form.locator('input[name="q"]').fill(term);
    const pressedAt = Date.now();
    await form.locator('button[type="submit"]').click();
    const moved = await page
      .waitForURL((u) => u.searchParams.has("q") || u.searchParams.has("profession"), { timeout: ANSWER_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    const shown = moved && (await answered(page));
    const searchMs = Date.now() - pressedAt;
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return {
        ttfb_ms: Math.round(n?.responseStart ?? -1),
        dcl_ms: Math.round(n?.domContentLoadedEventEnd ?? -1),
        full_page_load: (n?.name ?? "").includes("?"),
      };
    });
    const isUnavailable = await unavailable(page).isVisible();
    const cards = await page.locator('main a[href^="/lt/jobs/"]').count();
    record({
      ...base,
      outcome: !shown ? "search_timeout" : isUnavailable ? "unavailable" : cards > 0 ? "results" : "no_results",
      board_ms: boardMs,
      search_ms: searchMs,
      ...nav,
      to_profession_filter: new URL(page.url()).searchParams.has("profession"),
      signed_in: signedIn,
    });
    return signedIn;
  } catch (error) {
    // The kind only: a message could carry a number or an address.
    record({ ...base, outcome: "error", kind: error instanceof Error ? error.name : "unknown", signed_in: signedIn });
    return signedIn;
  } finally {
    await ctx.close();
  }
}

test("SR-1 first searches, signed in and signed out, in scripted headless Chrome", async ({ browser }) => {
  record({ at: new Date().toISOString(), browser: `chrome ${browser.version()}`, mode: "headless scripted, GitHub runner", rounds: ROUNDS });
  let unverified = 0;
  for (let round = 0; round < ROUNDS; round += 1) {
    if (round > 0) await new Promise((r) => setTimeout(r, GAP_MS));
    const order = round % 2 === 0 ? (["signed_in", "signed_out"] as const) : (["signed_out", "signed_in"] as const);
    for (const [i, actor] of order.entries()) {
      const signedIn = await reading(browser, actor, round, wordAt(round * 2 + i));
      if (signedIn === null) {
        unverified += 1;
        continue;
      }
      expect(signedIn, `the ${actor} reading had the wrong session`).toBe(actor === "signed_in");
    }
  }
  expect(unverified, "readings whose session could not be confirmed").toBe(0);
});
