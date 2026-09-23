import { expect as baseExpect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * "OPEN FULL SCREEN" EXPANDS — IT NEVER ESCAPES (owner P0/P1 §17,
 * 2026-09-23: "Open full screen may expand a contextual result when more
 * space is useful. It must not be an escape hatch into a second legacy
 * application").
 *
 * The owner's click path was: conversation → "Darbo kortelė" result →
 * "Atidaryti pilną ekraną" → the whole profile page, conversation gone. Now:
 *   - the panel's own expand control gives the SAME result the whole
 *     workspace, on the SAME address (`/dashboard?result=…&full=1`), with the
 *     conversation still mounted beside it on desktop;
 *   - the card's own button names its station ("Atidaryti profilį");
 *   - a result that cannot render inline offers no expansion at all, only its
 *     named station door.
 *
 * Needs the minted worker session (scripts/e2e-mint-session.ts). The lead
 * runs it; this lane does not start the local stack.
 */

const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);
test.skip(!HAS_SESSION, `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`);
test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });
test.setTimeout(180_000);

const expect = baseExpect.configure({ timeout: 40_000 });

test.describe("full screen is an expansion of the same result", () => {
  test("desktop: expand and collapse in place — no navigation, conversation stays", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/lt/dashboard?result=player-card");
    await expect(page.getByTestId("player-card-result")).toBeVisible();

    // The card's own door says where it goes.
    await expect(page.getByTestId("player-card-open-full")).toHaveText(/Atidaryti profilį/);

    const expand = page.getByTestId("context-panel-expand");
    await expect(expand).toHaveAttribute("aria-label", "Atidaryti pilną ekraną");
    await expand.click();

    await expect(page).toHaveURL(/\/lt\/dashboard\?(.*&)?result=player-card(&.*)?$/);
    await expect(page).toHaveURL(/[?&]full=1/);
    expect(new URL(page.url()).pathname).toBe("/lt/dashboard");
    await expect(page.getByTestId("context-panel")).toHaveAttribute("data-panel-width", "full");
    // The conversation is still mounted and on screen (docked, not gone).
    await expect(page.getByTestId("conversation-chat")).toBeVisible();
    await expect(page.locator("[data-docked='true']")).toBeVisible();
    // The SAME result, not another page.
    await expect(page.getByTestId("player-card-result")).toBeVisible();

    // One control brings it back.
    await expect(expand).toHaveAttribute("data-state", "full");
    await expand.click();
    await expect(page).not.toHaveURL(/[?&]full=1/);
    await expect(page.getByTestId("context-panel")).not.toHaveAttribute("data-panel-width", "full");
  });

  test("375 px: the expanded result takes the screen, and closes back", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/dashboard?result=player-card&full=1");
    const panel = page.getByTestId("context-panel");
    await expect(panel).toHaveAttribute("data-panel-width", "full");
    const box = await panel.boundingBox();
    expect(box, "panel rendered").not.toBeNull();
    expect(Math.round(box!.width)).toBe(375);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId("context-panel-expand").click();
    await expect(page).not.toHaveURL(/[?&]full=1/);
  });

  test("a fallback result offers no expansion — only its NAMED station door", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // `journal` is `unverified` in the registry: it cannot render inline.
    await page.goto("/lt/dashboard?result=journal&full=1");
    await expect(page.getByTestId("result-body-fallback")).toBeVisible();
    await expect(page.getByTestId("context-panel-expand")).toHaveCount(0);
    await expect(page.getByTestId("context-panel")).not.toHaveAttribute("data-panel-width", "full");
    const door = page.getByTestId("result-body-open-full");
    await expect(door).toHaveText(/Atidaryti darbo žurnalą/);
    await expect(door).toHaveAttribute("data-station", "/dashboard/journal");
  });
});
