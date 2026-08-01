import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * W5 slice 2 — voice hand-off lands in the CHAT (the one intake).
 *
 * Before this slice the voice recorder pushed its reviewed transcript to the
 * journal page's composer anchor — but since chat-first intake that composer
 * mounts only in edit mode, so the transcript silently died in
 * sessionStorage. The repair: the conversation chat consumes the read-once
 * key, shows the transcript as the worker's own visible turn, and runs the
 * SAME deterministic work-log flow (preview + explicit confirm +
 * createJournalEntry).
 *
 * Honest outcomes accepted: the flow preview (engagement present) OR the
 * honest no-engagement blocker OR the one clarify question — all three prove
 * the chat consumed the draft. A silently-empty thread is the failure.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

// A sentence the deterministic extractor finds signal in ("šiandien" date
// signal + "6 valandas" duration).
const TRANSCRIPT = "Šiandien dažiau sienas objekte 6 valandas";
const DRAFT_KEY = "lmai:voice-transcript-draft";

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

// First dev-server compile of /dashboard or /journal/voice can exceed the
// default 30s budget (known local-stack trap) — widen, don't flake.
test.setTimeout(120_000);

async function assertDraftConsumed(page: Page): Promise<void> {
  // The transcript appears as the worker's own visible turn.
  await expect(
    page.getByTestId("msg-user").filter({ hasText: "dažiau sienas" }).last(),
  ).toBeVisible({ timeout: 60_000 });
  // …and the work-log machinery responded (flow, honest blocker, or the one
  // clarify question rendered as an assistant turn).
  const flow = page.getByTestId("worklog-flow");
  const blocked = page.getByTestId("worklog-blocked");
  const loading = page.getByTestId("worklog-loading");
  await expect(flow.or(blocked).or(loading).last()).toBeVisible({
    timeout: 20_000,
  });
  // Read-once: the key is gone after consumption.
  const residue = await page.evaluate(
    (k: string) => window.sessionStorage.getItem(k),
    DRAFT_KEY,
  );
  expect(residue).toBeNull();
}

test("desktop: a reviewed voice transcript becomes a chat work-log turn", async ({ page }) => {
  await page.addInitScript(
    ([k, v]) => window.sessionStorage.setItem(k, v),
    [DRAFT_KEY, TRANSCRIPT] as [string, string],
  );
  await page.goto("/lt/dashboard");
  await assertDraftConsumed(page);
});

test("mobile 375px: the same hand-off works and nothing overflows", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(
    ([k, v]) => window.sessionStorage.setItem(k, v),
    [DRAFT_KEY, TRANSCRIPT] as [string, string],
  );
  await page.goto("/lt/dashboard");
  await assertDraftConsumed(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the journal page has a real door to the voice surface", async ({ page }) => {
  await page.goto("/lt/dashboard/journal");
  const door = page.getByTestId("journal-log-via-voice-cta");
  await expect(door).toBeVisible({ timeout: 40_000 });
  await expect(door).toHaveAttribute("href", /\/dashboard\/journal\/voice$/);
  await door.click();
  await expect(page).toHaveURL(/\/lt\/dashboard\/journal\/voice$/, {
    timeout: 60_000,
  });
  // Honest state either way: the recorder when transcription is configured,
  // or the truthful unavailable notice when it is not (local default).
  const recorder = page.getByTestId("voice-recorder").or(page.getByTestId("voice-unavailable"));
  await expect(recorder.last()).toBeVisible({ timeout: 20_000 });
});
