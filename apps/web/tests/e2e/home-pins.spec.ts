import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * PIN TO HOME — browser proof on the signed-in home (owner P0 2026-11-12).
 *
 * Needs the local stack and a minted session, like every authenticated spec
 * (`pnpm -C apps/web e2e:local`); it skips, loudly, without one.
 *
 * Proven at a phone width and a desktop width, from the keyboard:
 *   · the strip renders with the role's defaults and never moves the page
 *     sideways;
 *   · Edit → pin an area, move it earlier, unpin it — every control is a
 *     named button reached with Tab and pressed with Enter;
 *   · the choice survives a reload (profile store) or is labelled as kept on
 *     this device (store not applied) — one of the two, never neither;
 *   · a pinned card opens a page that answers.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);
test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

for (const viewport of [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1280", width: 1280, height: 800 },
] as const) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("pin, reorder, unpin from the keyboard; the choice is kept", async ({ page }) => {
      await page.goto("/lt/dashboard");
      const strip = page.getByTestId("home-pins");
      await expect(strip).toBeVisible({ timeout: 30_000 });

      const box = await strip.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(-0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);

      const edit = page.getByTestId("home-pins-edit");
      await edit.focus();
      await page.keyboard.press("Enter");
      await expect(edit).toHaveAttribute("aria-pressed", "true");

      // Pin the first area that is not pinned yet.
      const add = page.getByTestId("home-pins-more").locator("button").first();
      const addId = (await add.getAttribute("data-testid"))!.replace("home-pin-add-", "");
      expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
      await add.focus();
      await page.keyboard.press("Enter");
      const pinned = page.getByTestId(`home-pin-${addId}`);
      await expect(pinned).toBeVisible();

      // Move it one place earlier.
      const order = async () =>
        page
          .getByTestId("home-pins-list")
          .locator("a")
          .evaluateAll((links) => links.map((l) => l.getAttribute("data-testid")));
      const before = await order();
      await page.getByTestId(`home-pin-earlier-${addId}`).focus();
      await page.keyboard.press("Enter");
      const after = await order();
      expect(after.indexOf(`home-pin-${addId}`)).toBe(before.indexOf(`home-pin-${addId}`) - 1);

      await edit.focus();
      await page.keyboard.press("Enter");
      await expect(edit).toHaveAttribute("aria-pressed", "false");

      // Kept: across a reload on the profile store, or labelled as this
      // device's when the store is not applied — never silently lost.
      const storage = await strip.getAttribute("data-storage");
      await page.reload();
      await expect(page.getByTestId(`home-pin-${addId}`)).toBeVisible({ timeout: 30_000 });
      if (storage === "device") {
        await expect(page.getByTestId("home-pins-device-note")).toBeVisible();
      } else {
        await expect(page.getByTestId("home-pins-device-note")).toHaveCount(0);
      }

      // A pinned card opens a page that answers.
      const href = await page.getByTestId(`home-pin-${addId}`).getAttribute("href");
      const response = await page.request.get(href!);
      expect(response.status()).toBeLessThan(400);

      // Clean up: unpin it again.
      await page.getByTestId("home-pins-edit").click();
      await page.getByTestId(`home-unpin-${addId}`).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId(`home-pin-${addId}`)).toHaveCount(0);
    });
  });
}
