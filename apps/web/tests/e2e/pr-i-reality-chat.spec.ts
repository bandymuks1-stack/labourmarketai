import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  getCountryMeta,
  getSubdivisions,
} from "../../lib/location/country-model";
import { resolveCity } from "../../lib/location/city-coordinates";

/**
 * PR-I E2E reality matrix — authenticated chat-first scenarios (1–5, 7).
 *
 * Runs with a REAL minted session (scripts/e2e-mint-session.ts) against the
 * LOCAL Supabase stack via `pnpm -C apps/web e2e:local` (docs/TESTING.md).
 * Every screenshot is written to docs/audits/evidence/pr-i-e2e-reality-v1/ so
 * the matrix document can reference stable paths.
 *
 * Scenario map (docs/audits/pr-i-e2e-reality-matrix-2026-07-27.md):
 *   S1  state-aware opening — /dashboard opens chat-first with a REAL
 *       server-derived profile-summary card, not an empty greeting;
 *   S2  criteria readback — "kokie kriterijai pas mane nurodyti?" answers with
 *       facts from the seeded workers row + NAMES missing criteria (never the
 *       generic fallback);
 *   S3  work log — a natural sentence → worklog flow → confirmed save →
 *       journal_entries row EXISTS in the local DB (SQL proof via the
 *       supabase_db container) → profile summary reflects the activity;
 *   S4  "ieškau darbo" — real board outcome from the seeded demand (or the
 *       honest empty message — the outcome is recorded either way);
 *   S5  contextual CTAs — chips after the criteria answer are contextual (not
 *       the four generic starters) and a blocked intent ("primink rytoj")
 *       renders NO chips;
 *   S7  world model — market-map surface renders the world map for the seeded
 *       user (browser-level) + GE (Tbilisi) and US (New York) resolve
 *       coordinates (model-level, via lib/location exports).
 *
 * Honesty rule: no assertion accepts a fabricated outcome; honest degraded
 * outcomes are recorded via annotations, never painted green as something else.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const EVIDENCE = join(
  REPO_ROOT,
  "docs",
  "audits",
  "evidence",
  "pr-i-e2e-reality-v1",
);
const DB_CONTAINER = "supabase_db_labourmarketai";
const LOCAL_STACK = !!process.env.E2E_LOCAL_STACK;

/** Copy read from the real catalog so the spec never hardcodes product copy. */
const LT = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "messages", "lt.json"), "utf8"),
) as {
  conversation: {
    chat: { fallback: string; reminderBlocked: string };
    criteria: { intro: string; introEmpty: string; missingIntro: string };
  };
};

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

function evidencePath(name: string): string {
  mkdirSync(EVIDENCE, { recursive: true });
  return join(EVIDENCE, name);
}

/** Run one read-only SQL statement against the LOCAL stack's db container.
 *  Failures are LOUD (status/stderr on stdout) — a silent null here once
 *  masqueraded as "the row does not exist" while the row was in the table. */
function sql(query: string): string | null {
  const res = spawnSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-qtA", "-c", query],
    { encoding: "utf8" },
  );
  if (res.error || res.status !== 0) {
    console.log(
      `[sql] FAILED status=${res.status} error=${res.error ?? ""} stderr=${(res.stderr ?? "").slice(0, 300)}`,
    );
    return null;
  }
  return (res.stdout ?? "").trim();
}

/**
 * Send a sentence in the composer and wait for the turn to be accepted.
 *
 * The composer is a CONTROLLED React textarea: a `fill()` that lands before
 * hydration finishes is silently reverted to "" when React mounts, and the
 * send button then stays disabled forever (observed on the first run of this
 * matrix — 5 tests timed out exactly there). `openDashboard` waits for the
 * hydration marker, and this helper additionally asserts the send button
 * actually ENABLED after the fill (i.e. React saw the value), retrying the
 * fill once if the first one was swallowed.
 */
async function say(page: Page, text: string): Promise<void> {
  const input = page.getByTestId("composer-input");
  const send = page.getByTestId("composer-send");
  await input.fill(text);
  try {
    await expect(send).toBeEnabled({ timeout: 10_000 });
  } catch {
    await input.fill(text); // first fill raced hydration — repeat once
    await expect(send).toBeEnabled({ timeout: 15_000 });
  }
  await send.click();
  await expect(page.getByTestId("msg-user").last()).toBeVisible();
}

/** Say something and wait until a NEW assistant turn (of any card kind) lands. */
async function sayAndWaitForReply(page: Page, text: string): Promise<void> {
  const before = await page.getByTestId("msg-assistant").count();
  const beforeSummary = await page.getByTestId("msg-profile-summary").count();
  const beforeMatch = await page.getByTestId("msg-employer-match").count();
  await say(page, text);
  await expect
    .poll(
      async () =>
        (await page.getByTestId("msg-assistant").count()) > before ||
        (await page.getByTestId("msg-profile-summary").count()) > beforeSummary ||
        (await page.getByTestId("msg-employer-match").count()) > beforeMatch,
      { timeout: 45_000 },
    )
    .toBe(true);
}

async function openDashboard(page: Page): Promise<void> {
  // Known local flake: the FIRST compile of /dashboard can exceed 5s. Wait on
  // the surface itself with a generous timeout instead of networkidle.
  await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("conversation-chat")).toBeVisible({
    timeout: 60_000,
  });
  // Hydration marker: the conversation chrome effect stamps the root element
  // once the client is interactive. Typing before this point is lost (the
  // controlled composer resets on mount).
  await page.waitForFunction(
    () => document.documentElement.dataset.surface === "conversation",
    null,
    { timeout: 60_000 },
  );
  // W2 OPENING SETTLE: the state-aware opening brief lands as an ASYNC
  // assistant message shortly after mount. If a test counts messages while it
  // is still in flight, the brief — not the actual reply — satisfies the
  // "new message arrived" wait and every assertion reads a transcript without
  // the answer. Wait for the assistant count to hold still for one interval.
  let last = -1;
  await expect
    .poll(
      async () => {
        const n = await page.getByTestId("msg-assistant").count();
        const stable = n === last && n > 0;
        last = n;
        return stable;
      },
      { timeout: 45_000, intervals: [1_200] },
    )
    .toBe(true);
}

test.describe("PR-I reality matrix — authenticated chat (desktop)", () => {
  test("S1: /dashboard opens chat-first with a state-aware opening (the W2 brief, not an empty greeting)", async ({ page }) => {
    test.setTimeout(180_000);
    await openDashboard(page);

    // Chat-first: the conversation surface, not the wide module dashboard.
    await expect(page.locator('[data-chrome="full"]')).toHaveCount(0);

    // State-aware opening (owner ruling 2026-07-29, W2): WITHOUT any input,
    // the opening BRIEF composes real lines from the person's own rows —
    // matches / conflicts / unlogged work / first profile gap. For the seeded
    // worker (one visible demand, availability pillar unmet) at least one
    // real line beyond the bare greeting must render, with 1–3 chips, and
    // NEVER the old six-chip button wall.
    // (The greeting itself renders as the surface HEADING, not as a message —
    // so the assistant messages must carry the real state lines.)
    const opening = (await page.getByTestId("msg-assistant").allInnerTexts()).join("\n");
    expect(
      opening.trim().length,
      `opening carries no real state line: ${opening}`,
    ).toBeGreaterThan(0);

    // §D cap: chips are 1–3, never a wall.
    const chips = await page
      .getByTestId("msg-assistant")
      .last()
      .locator('[data-testid^="chat-chip-"]')
      .count();
    const chipsAnywhere = await page.locator('[data-testid^="chat-chip-"]').count();
    expect(chipsAnywhere).toBeGreaterThan(0);
    expect(chips).toBeLessThanOrEqual(3);

    test.info().annotations.push({
      type: "s1-opening",
      description: `opening brief: ${opening.slice(0, 300).replace(/\n/g, " | ")}`,
    });
    await page.screenshot({
      path: evidencePath("s1-state-aware-opening.png"),
      fullPage: false,
    });
  });

  test("S2 + S5a: criteria question returns a REAL readback with named gaps and CONTEXTUAL chips", async ({ page }) => {
    test.setTimeout(180_000);
    await openDashboard(page);

    await sayAndWaitForReply(page, "kokie kriterijai pas mane nurodyti?");
    const reply = page.getByTestId("msg-assistant").last();
    const text = await reply.innerText();

    // NEVER the generic fallback — that would mean the intent was not routed.
    expect(text).not.toContain(LT.conversation.chat.fallback);
    // A real readback of the worker's persisted criteria: either listed facts
    // (intro) or the honest "none set yet" (introEmpty) — both are the REAL
    // database state. (The local fixture worker row is created empty by the
    // signup trigger, so introEmpty is the expected truthful variant there.)
    const factVariant = text.includes(LT.conversation.criteria.intro);
    const emptyVariant = text.includes(LT.conversation.criteria.introEmpty);
    expect(factVariant || emptyVariant).toBe(true);
    // Missing criteria are NAMED, not implied.
    expect(text).toContain(LT.conversation.criteria.missingIntro);
    test.info().annotations.push({
      type: "s2-variant",
      description: factVariant
        ? "criteria facts listed (intro variant)"
        : "no criteria set — honest empty readback with named gaps (introEmpty variant)",
    });

    // S5a — the chip row under the answer is CONTEXTUAL: the preferences form
    // + a search, and NOT the four generic starters.
    await expect(
      reply.getByTestId("chat-chip-f:worker.save-preferences"),
    ).toBeVisible();
    await expect(reply.getByTestId("chat-chip-jobs")).toBeVisible();
    await expect(reply.getByTestId("chat-chip-cv")).toHaveCount(0);
    await expect(reply.getByTestId("chat-chip-profile")).toHaveCount(0);
    await expect(reply.getByTestId("chat-chip-offers")).toHaveCount(0);

    test.info().annotations.push({
      type: "s2-criteria",
      description: text.slice(0, 400).replace(/\n/g, " | "),
    });
    await page.screenshot({
      path: evidencePath("s2-criteria-readback.png"),
      fullPage: false,
    });
  });

  test("S3: work-day sentence → work-log flow → confirmed save → journal_entries row in the DB → summary reflects activity", async ({ page }) => {
    test.setTimeout(240_000);
    await openDashboard(page);

    const marker = `PR-I-E2E-${Date.now()}`;
    await say(page, "šiandien dirbau 8 valandas, montavau duris objekte");

    // The seeded worker HAS an active employee engagement, so the real parse
    // preview must render (a blocker here would be a fixture defect).
    const flow = page.getByTestId("worklog-flow");
    await expect(flow).toBeVisible({ timeout: 45_000 });
    await page.screenshot({
      path: evidencePath("s3a-worklog-parse-preview.png"),
      fullPage: false,
    });

    // Tag the evidence notes with a unique marker so the DB proof below can
    // find EXACTLY this entry.
    const notes = page.getByTestId("worklog-notes");
    const parsed = await notes.inputValue();
    await notes.fill(`${parsed} [${marker}]`);

    // Save happens only after the explicit confirmation step.
    await page.getByTestId("worklog-save").click();
    await expect(page.getByTestId("worklog-confirm")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("worklog-confirm").click();
    await expect(page.getByTestId("worklog-done")).toBeVisible({
      timeout: 45_000,
    });
    await page.screenshot({
      path: evidencePath("s3b-worklog-saved.png"),
      fullPage: false,
    });

    // Backend proof: the row EXISTS in the local database (not a UI claim).
    if (LOCAL_STACK) {
      // NOTE: journal_entries has NO work_date column — the entry date lives
      // in journal_entry_metrics; created_at is proof enough of the row.
      const row = sql(
        `select id || '|' || worker_id || '|' || created_at from public.journal_entries where original_text like '%${marker}%';`,
      );
      expect(
        row,
        "journal_entries row with the marker must exist in the local DB",
      ).toBeTruthy();
      expect(row).toMatch(/^[0-9a-f-]{36}\|/);
      test.info().annotations.push({
        type: "s3-db-proof",
        description: `journal_entries: ${row}`,
      });
    } else {
      test.info().annotations.push({
        type: "s3-db-proof",
        description:
          "SKIPPED — not a local-stack run (E2E_LOCAL_STACK unset), DB not probed",
      });
    }

    // The profile summary now reflects real activity (server re-read).
    await sayAndWaitForReply(page, "Ką dar turiu padaryti?");
    const summary = page.getByTestId("msg-profile-summary").last();
    await expect(summary).toBeVisible({ timeout: 45_000 });
    await expect(summary.getByTestId("profile-summary-last")).toBeVisible();
    await page.screenshot({
      path: evidencePath("s3c-summary-reflects-activity.png"),
      fullPage: false,
    });
  });

  test("S4: 'ieškau darbo' runs the REAL search — seeded-demand matches or the honest empty message (outcome recorded)", async ({ page }) => {
    test.setTimeout(180_000);
    await openDashboard(page);

    await sayAndWaitForReply(page, "ieškau darbo");
    const matches = await page.getByTestId("msg-employer-match").count();

    if (matches > 0) {
      // Real board results — the seeded open public demand surfaces.
      const card = page.getByTestId("msg-employer-match").last();
      await expect(card).toBeVisible();
      test.info().annotations.push({
        type: "s4-outcome",
        description: `matches: ${matches} employer-match card(s) from seeded demands`,
      });
    } else {
      // Honest empty/blocked answer: not the generic fallback, and it must
      // not promise a notification that no mechanism can send.
      const text = await page.getByTestId("msg-assistant").last().innerText();
      expect(text).not.toContain(LT.conversation.chat.fallback);
      expect(text.toLowerCase()).not.toContain("pranešiu");
      test.info().annotations.push({
        type: "s4-outcome",
        description: `no matches — honest empty message: ${text.slice(0, 300)}`,
      });
    }
    await page.screenshot({
      path: evidencePath("s4-ieskau-darbo.png"),
      fullPage: false,
    });
  });

  test("S5b: blocked intent ('primink rytoj') answers honestly and shows NO chips", async ({ page }) => {
    test.setTimeout(180_000);
    await openDashboard(page);

    await sayAndWaitForReply(page, "primink rytoj");
    const reply = page.getByTestId("msg-assistant").last();
    const text = await reply.innerText();

    // The honest degradation copy — no fake reminder is created.
    expect(text).toContain(LT.conversation.chat.reminderBlocked);
    // And NO chip row under a blocked answer (contextual-CTA rule).
    await expect(reply.locator('[data-testid^="chat-chip-"]')).toHaveCount(0);

    await page.screenshot({
      path: evidencePath("s5-blocked-intent-no-chips.png"),
      fullPage: false,
    });
  });

  test("S7: market-map surface renders the world map (browser) + GE/US coordinates resolve (model-level)", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/lt/dashboard/market-map", { waitUntil: "domcontentloaded" });

    // Primary surface: the unified map base — the seeded user has no saved
    // location, so this IS the no-market-selected default view.
    await expect(page.getByTestId("market-map-base")).toBeVisible({
      timeout: 60_000,
    });

    // The world overview lives in the collapsed "advanced" disclosure
    // (progressive disclosure by design) — expand it, then assert.
    await page.getByTestId("market-map-advanced").locator("summary").click();
    await expect(page.getByTestId("labour-market-world-map")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("world-map-canvas")).toBeVisible();
    await expect(page.getByTestId("world-map-legend")).toBeVisible();
    await page.getByTestId("labour-market-world-map").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: evidencePath("s7-market-map-world.png"),
      fullPage: false,
    });

    // MODEL-LEVEL proof (not browser-level): the location model resolves a
    // GE (Tbilisi) and a US (New York) selection to real coordinates.
    const ge = getCountryMeta("GE");
    expect(ge).not.toBeNull();
    expect(getSubdivisions("GE").some((s) => s.name === "Tbilisi")).toBe(true);
    const tbilisi = resolveCity("GE", "Tbilisi");
    expect(tbilisi).not.toBeNull();
    expect(tbilisi!.lat).toBeGreaterThan(41);
    expect(tbilisi!.lat).toBeLessThan(42.5);

    const us = getCountryMeta("US");
    expect(us).not.toBeNull();
    expect(getSubdivisions("US").some((s) => s.name === "New York")).toBe(true);
    const ny = resolveCity("US", "New York");
    expect(ny).not.toBeNull();
    expect(ny!.lat).toBeGreaterThan(40);
    expect(ny!.lat).toBeLessThan(41.5);
    expect(ny!.lng).toBeLessThan(-73);

    test.info().annotations.push({
      type: "s7-model-proof",
      description: `GE/Tbilisi=${JSON.stringify(tbilisi)} US/New York=${JSON.stringify(ny)} (model-level, lib/location exports)`,
    });
  });
});
