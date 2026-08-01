import { expect as baseExpect, test } from "@playwright/test";

/**
 * MobileSheet link click-through (375px) — regression proof for the
 * AnchoredOverlay hidden-panel outside-close bug.
 *
 * THE BUG (found during W3 Package 4 e2e work): NotificationPanel mounts BOTH
 * presentations at once — the desktop AnchoredOverlay popover (CSS-hidden at
 * <md via `hidden md:block`) and the MobileSheet. The hidden popover's
 * document-level outside-`mousedown` listener stayed active, so a tap on any
 * link INSIDE the sheet counted as "outside the (invisible) panel":
 * `onClose()` unmounted the sheet between mousedown and click, the click
 * event never dispatched on the link, and the URL never changed — the sheet
 * just closed. Real phone taps failed identically (compatibility mousedown
 * fires before click). Deterministic proof from the live page:
 *
 *   mousedown on sheet link → link.isConnected === false one task later.
 *
 * THE FIX (components/ui/anchored-overlay.tsx): a CSS-hidden panel owns no
 * outside-close — the listener no-ops while the panel has no client rects.
 *
 * This spec drives the ALWAYS-PRESENT sheet footer link (view-all →
 * /dashboard/activity) instead of a seeded derived signal, so it stays
 * deterministic even while other suites clear/seed the shared fixture
 * booking state. Both input modes are covered: mouse click and a real touch
 * tap (hasTouch + isMobile).
 */

const expect = baseExpect.configure({ timeout: 15_000 });

const HAS_LOCAL_STACK = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("375px MobileSheet — a link inside the sheet actually navigates", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.setTimeout(180_000);

  for (const [label, ctxExtra] of [
    ["mouse click", {}],
    ["touch tap (phone semantics)", { hasTouch: true, isMobile: true }],
  ] as const) {
    test(`${label}: sheet view-all link navigates to /dashboard/activity`, async ({
      browser,
    }) => {
      const ctx = await browser.newContext({
        storageState: "tests/e2e/.storage-state.json",
        viewport: { width: 375, height: 812 },
        ...ctxExtra,
      });
      const page = await ctx.newPage();

      // Start OFF the destination so the navigation is observable as a URL
      // change.
      await page.goto("/lt/dashboard/bookings");
      await expect(page.getByTestId("bookings-page")).toBeVisible({
        timeout: 60_000,
      });

      await page
        .getByRole("button", { name: /pranešimai|notifications/i })
        .click();
      const sheet = page.locator('[role="dialog"][aria-modal="true"]');
      await expect(sheet).toBeVisible();

      const viewAll = page
        .locator('a[data-testid="notification-panel-view-all"]:visible')
        .first();
      await expect(viewAll).toBeVisible();
      await expect(viewAll).toHaveAttribute("href", /\/dashboard\/activity$/);

      if ("hasTouch" in ctxExtra) await viewAll.tap();
      else await viewAll.click();

      // Before the fix: the sheet closed here and the URL never changed.
      // (Generous timeout: the activity route's first dev compile can stall
      // the click navigation — build cost, not product cost.)
      await expect(page).toHaveURL(/\/lt\/dashboard\/activity/, {
        timeout: 60_000,
      });
      // Route change (the read event) closes the sheet — the product's own
      // close path, not the buggy mid-gesture unmount.
      await expect(sheet).toHaveCount(0);
      await ctx.close();
    });
  }
});
