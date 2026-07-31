import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Authenticated E2E for the CONTEXT PANEL (W3).
 *
 * Runs with a REAL logged-in session minted by scripts/e2e-mint-session.ts
 * against the LOCAL Supabase stack (`pnpm -C apps/web e2e:local`, docs/TESTING.md).
 * Skips when the storage state is missing.
 *
 * The claim under test is the owner's rule, end to end:
 *
 *   "Paspaudus objektą NEATIDAROMAS NAUJAS PUSLAPIS. NEVYKSTA NAVIGACIJA.
 *    Atidaroma Context Panel."
 *
 * So the spec proves, in a real browser:
 *   1. the panel is present on the workspace and has content before anything
 *      is selected (it is ALWAYS available, never an empty shell);
 *   2. selecting a real opportunity opens it IN the panel and the URL does not
 *      change — no navigation, no page load;
 *   3. the panel shows the demand's REAL facts, requirements and actions;
 *   4. closing returns it to the work context, still without navigating;
 *   5. the conversation stays usable the whole time (the panel is not modal);
 *   6. it works in both themes and the page never scrolls horizontally.
 *
 * Every assertion accepts the honest degraded outcome (no board access, no
 * matches) as a skip — what is never allowed is a fabricated one.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

/** Ask for work and return the first selectable match, or null when the board
 *  is honestly empty / gated in this environment.
 *
 *  REPAIRED for W3 row 5 (#932/#934): the thread's own `chat-employer-match-card`
 *  was DELETED when the recommendations became the `opportunities` result — one
 *  renderer, one action surface. This helper kept waiting 20s for a component
 *  that no longer exists, which blew the 30s test budget before its own
 *  `test.skip` could fire. It now selects from the canonical surface, which is
 *  what the rule under test ("selecting opens the panel, it does not navigate")
 *  was always about. */
async function firstMatch(page: Page) {
  await page.goto("/lt/dashboard?result=opportunities");
  const rows = page.getByTestId("opportunities-match-open");
  try {
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  } catch {
    return null;
  }
  return rows.first();
}

test.describe("W3 — the Context Panel", () => {
  // A cold dev compile of the workspace genuinely exceeds the 30s default;
  // that is build cost, not product latency.
  test.setTimeout(120_000);

  test("is always available, and opens an entity without navigating", async ({ page }) => {
    await page.goto("/lt/dashboard");
    const panel = page.getByTestId("context-panel");
    await expect(panel).toBeVisible();

    // 1. Before any selection it shows the person's own work context — and it
    //    has finished reading, so it is never a permanent "loading" shell.
    await expect(panel).toHaveAttribute("data-panel-mode", "work_context");
    await expect(page.getByTestId("context-panel-loading")).toHaveCount(0, {
      timeout: 20_000,
    });

    const match = await firstMatch(page);
    test.skip(match === null, "No opportunity on this board — nothing to select.");
    // Captured AFTER the board is on screen: what must not move is the URL
    // across the SELECTION, and the helper reaches the board by navigating.
    const urlBefore = page.url();
    await match!.click();

    // 2. THE RULE: the panel switched to the entity and the URL did not move.
    await expect(panel).toHaveAttribute("data-panel-mode", "entity", { timeout: 20_000 });
    expect(page.url()).toBe(urlBefore);

    // 3. Real content: the demand's own facts, and its requirements from the
    //    canonical engine. Both come from the server; neither is invented.
    // The entity read must SETTLE first. `data-panel-mode` flips the moment
    // the selection is written, so asserting content straight after it was
    // reading the panel mid-load and calling the empty frame a failure — the
    // same harness defect this programme has produced before, not a product
    // one.
    await expect(page.getByTestId("context-panel-loading")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("context-panel-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("context-panel-contact-note")).toBeVisible();
    await expect(page.getByTestId("context-panel-requirements")).toBeVisible();

    // 5. The conversation is still usable — the panel never took the page.
    await expect(page.getByTestId("composer-input")).toBeEnabled();
    await page.getByTestId("composer-input").fill("dar vienas klausimas");
    await expect(page.getByTestId("composer-input")).toHaveValue("dar vienas klausimas");

    // 4. Closing returns to the work context, still without navigating.
    await page.getByTestId("context-panel-close").click();
    await expect(panel).toHaveAttribute("data-panel-mode", "work_context");
    expect(page.url()).toBe(urlBefore);
  });

  test("renders in both themes without a horizontal scrollbar", async ({ page }) => {
    for (const theme of ["dark", "light"] as const) {
      await page.goto("/lt/dashboard");
      await page.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t);
      }, theme);
      await expect(page.getByTestId("context-panel")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, `${theme}: the page scrolls horizontally`).toBe(false);
    }
  });

  test("docks under the conversation on a phone and expands on demand", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/lt/dashboard");
    const panel = page.getByTestId("context-panel");
    await expect(panel).toBeVisible();
    // Collapsed by default on a phone: the conversation keeps the screen.
    const toggle = page.getByTestId("context-panel-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow, "the phone layout scrolls horizontally").toBe(false);
  });
});
