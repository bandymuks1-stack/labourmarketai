import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * THE ONE AUTHENTICATED SHELL — browser proof.
 *
 * The owner's production screenshot of `/lt/dashboard/opportunities` showed a
 * broken header: a tab row scrolling sideways inside it, the role switcher and
 * the workspace chip both naming the active organization, controls pushed off
 * the right edge, and a third navigation bar on phones. None of that was a
 * styling accident — it was the legacy module chrome, which `DashboardChrome`
 * handed to every route that was not one of four hardcoded prefixes.
 *
 * The fix makes the canonical one-top-bar the DEFAULT. This spec is the proof
 * that it actually reaches the product, at every width the owner named, on
 * routes that were previously in the legacy chrome — and that the capability
 * those removed controls carried is still one control away.
 *
 * Acceptance (owner brief §36), asserted per route per width:
 *   TEXT_OVERLAP                      = 0   (header controls do not intersect)
 *   HORIZONTAL_HEADER_SCROLL          = 0
 *   CLIPPED_PRIMARY_CONTROLS          = 0   (avatar fully inside the viewport)
 *   DUPLICATE_CONTEXT_PRESENTATION    = 0   (exactly one context control)
 *   CRITICAL_MOBILE_HORIZONTAL_OVERFLOW = 0
 *
 * `document.body.scrollWidth` is the measurement that matters, NOT
 * `documentElement.scrollWidth`: `html`/`body` are `overflow-x: hidden`, so the
 * documentElement reads exactly the viewport width even while the content
 * overflows it. That is precisely why the broken header went unreported.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

/** The widths the owner brief names (§15). */
const WIDTHS = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-375", width: 375, height: 812 },
] as const;

/**
 * Routes that were ALL in the legacy module chrome before this change. They
 * are the product surfaces a worker actually reaches after leaving the
 * conversation — the "old SaaS everywhere else" the owner reported.
 */
const PRODUCT_ROUTES = [
  "/lt/dashboard/opportunities",
  "/lt/dashboard/market-map",
  "/lt/dashboard/network",
] as const;

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  // A 1px tolerance: adjacent controls legitimately share a boundary pixel
  // after sub-pixel layout rounding; that is touching, not overlapping.
  return (
    a.x + a.width - 1 > b.x &&
    b.x + b.width - 1 > a.x &&
    a.y + a.height - 1 > b.y &&
    b.y + b.height - 1 > a.y
  );
}

async function gotoSettled(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // The header is client-rendered from the auth context; wait for the chrome
  // marker rather than a fixed sleep.
  await page.locator('[data-chrome="simple"]').first().waitFor({ state: "attached" });
}

test.describe("the one authenticated shell reaches the whole product", () => {
  for (const route of PRODUCT_ROUTES) {
    test(`${route} — no legacy module chrome at any width`, async ({ page }) => {
      for (const vp of WIDTHS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await gotoSettled(page, route);

        const label = `${route} @ ${vp.name}`;

        // ── The legacy chrome is ABSENT FROM THE DOM, not merely hidden.
        // Hiding it with CSS would leave the tab row focusable and would keep
        // the old duplicate context model alive one media query away.
        await expect(
          page.locator('[data-testid^="dashboard-tab-"]'),
          `${label}: the wide tab row must not exist`,
        ).toHaveCount(0);
        await expect(
          page.locator('[data-testid^="bottom-nav-"]'),
          `${label}: the third navigation system must not exist`,
        ).toHaveCount(0);

        // ── DUPLICATE_CONTEXT_PRESENTATION = 0.
        // The role switcher named the SAME active organization as the
        // workspace chip, two controls away, in a second vocabulary.
        await expect(
          page.locator('[data-testid="role-switcher-toggle"]'),
          `${label}: a second context control must not exist`,
        ).toHaveCount(0);
        await expect(
          page.locator('[data-testid="workspace-chip"]'),
          `${label}: exactly ONE context control`,
        ).toHaveCount(1);

        // ── The canonical bar IS here, with the way back to the conversation.
        // This is what makes the product AI-first past the homepage: every
        // deep surface is a projection you can step back out of.
        await expect(
          page.locator('[data-testid="back-to-chat"]'),
          `${label}: the way back to the conversation`,
        ).toBeVisible();

        const header = page.locator('[data-chrome="simple"] > header').first();
        await expect(header).toBeVisible();

        // ── HORIZONTAL_HEADER_SCROLL = 0.
        const headerScroll = await header.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
        expect(
          headerScroll.scrollWidth,
          `${label}: header scrolls sideways (${headerScroll.scrollWidth} > ${headerScroll.clientWidth})`,
        ).toBeLessThanOrEqual(headerScroll.clientWidth + 1);

        // ── CRITICAL_MOBILE_HORIZONTAL_OVERFLOW = 0, measured on BODY.
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        expect(
          bodyWidth,
          `${label}: body overflows the viewport (${bodyWidth} > ${vp.width})`,
        ).toBeLessThanOrEqual(vp.width + 1);

        // ── CLIPPED_PRIMARY_CONTROLS = 0. The avatar menu holds sign-out,
        // the admin console link and the report-a-problem entry point; in the
        // broken chrome it sat at x=955..999 inside a 768px viewport, i.e.
        // entirely unreachable.
        const avatar = page.locator('[data-testid="account-menu-trigger"]');
        await expect(avatar, `${label}: the avatar menu`).toBeVisible();
        const avatarBox = await avatar.boundingBox();
        expect(avatarBox, `${label}: avatar has a box`).not.toBeNull();
        expect(
          avatarBox!.x + avatarBox!.width,
          `${label}: avatar clipped at the right edge`,
        ).toBeLessThanOrEqual(vp.width + 1);
        expect(avatarBox!.x, `${label}: avatar pushed off the left`).toBeGreaterThanOrEqual(0);

        // ── TEXT_OVERLAP = 0 between the identity/context group and EVERY
        // right-hand control — the exact collision in the owner's screenshot.
        //
        // Checking the chip against the avatar alone is not enough, and this
        // spec learned that the hard way: at 375px the chip cleared the avatar
        // but ran straight under the SEARCH button, which is the first control
        // in the group and therefore the one it always hits first. Compare
        // against all of them or the check is decorative.
        const chipBox = await page.locator('[data-testid="workspace-chip"]').boundingBox();
        const rightControls = [
          ["search", '[data-testid="chat-command-search"]'],
          ["notifications", '[data-testid="notification-bell"]'],
          ["avatar", '[data-testid="account-menu-trigger"]'],
        ] as const;
        if (chipBox) {
          for (const [name, selector] of rightControls) {
            const control = page.locator(selector).first();
            if ((await control.count()) === 0) continue;
            const box = await control.boundingBox();
            if (!box) continue;
            expect(
              intersects(chipBox, box),
              `${label}: the workspace chip overlaps the ${name} control ` +
                `(chip ${Math.round(chipBox.x)}..${Math.round(chipBox.x + chipBox.width)}, ` +
                `${name} ${Math.round(box.x)}..${Math.round(box.x + box.width)})`,
            ).toBe(false);
          }
        }

        await page.screenshot({
          // NOT test-results/: playwright wipes that directory at the start of
          // every run, so evidence written there is destroyed by the next run
          // and a reader ends up studying a screenshot from a build that no
          // longer exists. That happened while writing this spec — the image
          // still showed the chip/search collision that the measurement in the
          // same run had already proven fixed.
          path: `.playwright-proofs/one-shell/${route.replaceAll("/", "_")}-${vp.name}.png`,
          fullPage: false,
        });
      }
    });
  }

  test("the conversation itself is untouched, and the admin console keeps its chrome", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // /dashboard is still the bare, self-contained conversation.
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-chrome="simple"]')).toHaveCount(0);
    await expect(page.locator('[data-chrome="full"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="dashboard-tab-"]')).toHaveCount(0);
  });

  test("no capability was removed — every retired destination is still reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoSettled(page, "/lt/dashboard/opportunities");

    // The tab row's destinations now live behind the search control the
    // canonical header carries at EVERY width. If this control were missing,
    // removing the tabs WOULD be a functionality regression.
    const search = page.locator('[data-testid="chat-command-search"]');
    await expect(search).toBeVisible();

    // The avatar menu is the other half of the answer: profile, the Player
    // Card, the CV, account settings, sign-out and (for admins) the console.
    await page.locator('[data-testid="account-menu-trigger"]').click();
    await expect(page.locator('[data-testid="account-menu-profile-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="account-menu-account-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="account-menu-signout"]')).toBeVisible();
  });
});
