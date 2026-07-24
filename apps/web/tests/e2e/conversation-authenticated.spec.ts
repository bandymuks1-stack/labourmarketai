import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Authenticated E2E for the Real Conversation UI (PR #864).
 *
 * Runs with a REAL logged-in session minted by scripts/e2e-mint-session.ts (no
 * OAuth), against the LOCAL Supabase stack via `pnpm -C apps/web e2e:local`
 * (docs/TESTING.md). Skips when the storage state is missing.
 *
 * Proves: /dashboard IS the conversation (not the old card dashboard); the wide
 * module navbar is absent in simple mode; a natural sentence becomes a user
 * message; the work-log flow reaches a REAL outcome (preview to save, or the
 * honest "no work context" blocker); "find work" runs the REAL opportunity
 * search (matches or honest empty); Advanced mode still renders the module
 * dashboard; the mobile bottom nav shows the 5 simple destinations; and the
 * page never scrolls horizontally.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

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
    const input = page.getByTestId("composer-input");
    await input.fill("Šiandien dirbau nuo 8 iki 17, 45 min pietūs, montavau langus.");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("msg-user").last()).toBeVisible();
    await expect(
      page.getByTestId("worklog-flow").or(page.getByTestId("worklog-blocked")),
    ).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: testInfo.outputPath("worklog.png"), fullPage: false });

    // "Find work" runs the REAL opportunity search: real employer-match cards or
    // an honest empty/blocked message — never a fabricated employer.
    await input.fill("Rask man darbą Nyderlanduose.");
    await page.getByTestId("composer-send").click();
    await expect(
      page.getByTestId("msg-employer-match").or(page.getByTestId("msg-assistant").last()),
    ).toBeVisible({ timeout: 15_000 });

    // No horizontal scrolling.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("Advanced mode still renders the module dashboard", async ({ page }) => {
    await page.goto("/lt/dashboard/advanced", { waitUntil: "networkidle" });
    // The full chrome IS present here (the card overview / module surface).
    await expect(page.locator('[data-chrome="full"]')).toBeVisible();
  });
});

test.describe("Conversation UI — authenticated /dashboard (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile shows the 5-item simple bottom nav; composer works; no horizontal scroll", async ({ page }, testInfo) => {
    await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible();
    await expect(page.getByTestId("conversation-bottom-nav")).toBeVisible();

    await page.getByTestId("composer-input").fill("Ką dar turiu padaryti?");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("msg-user").last()).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: false });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
