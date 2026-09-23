/**
 * ACTIVE CONTEXT INTEGRITY — a workspace switch is visible WITHOUT a reload,
 * and a reload shows the same context (owner program 2026-09-23, P0 case 1/2).
 *
 * The defect this proves closed: the switch changed server state, but the ONE
 * conversation kept its client state across `router.refresh`, so the thread,
 * the opening line and an open result panel stayed the PREVIOUS workspace's
 * until a browser reload — and every earlier spec asserted only the chip text.
 * Here every step asserts the CONVERSATION BODY and the URL, not just the chip:
 *
 *   personal → Alfa → Beta → personal, with NO reload in between —
 *     • the chip names the new workspace (and no switch is left pending);
 *     • the conversation's opening names the new organization (or, back in
 *       the personal space, names no organization at all);
 *     • an open `?result=candidates&demand=<id>` loses the previous
 *       workspace's `demand=` depth;
 *     • the page was never reloaded (a window marker survives);
 *   then a hard reload after each step renders the SAME context.
 *
 * Fixture: dev-fixtures-mp03.sql — `mp03.owner@local.test` OWNS "MP03 Alfa" and
 * "MP03 Beta" (a real multi-organization account). Same gate as the M-P0-5
 * spec, which uses the same fixture. The lead runs it; it is not run here.
 */
import { test, expect, type Page } from "@playwright/test";

test.skip(
  process.env.E2E_MP05_LOCAL !== "1",
  "Needs the seeded local stack (E2E_MP05_LOCAL=1 + dev-fixtures-mp03.sql).",
);

const EMAIL = "mp03.owner@local.test";
const PASSWORD = "password";
const ORG_A = "MP03 Alfa";
const ORG_B = "MP03 Beta";
const HOME = "/en/dashboard";
/** A well-formed demand id no workspace owns — only its PRESENCE in the URL
 *  matters: the switch must drop it. */
const STALE_DEMAND = "d0000000-0000-4000-8000-00000000dead";

async function signIn(page: Page): Promise<void> {
  await page.goto("/en/auth/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

async function openChipMenu(page: Page) {
  const chip = page.getByTestId("workspace-chip");
  await expect(chip).toBeVisible({ timeout: 60_000 });
  const menu = page.getByTestId("workspace-chip-menu");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await chip.getByRole("button").first().click();
    try {
      await expect(menu).toBeVisible({ timeout: 4_000 });
      return menu;
    } catch {
      // hydration race — click again
    }
  }
  await expect(menu).toBeVisible();
  return menu;
}

/** Mark the document; a reload (or a full navigation) wipes the marker. */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __switchMarker?: number }).__switchMarker = 1;
  });
}
async function expectSameDocument(page: Page): Promise<void> {
  const marker = await page.evaluate(
    () => (window as unknown as { __switchMarker?: number }).__switchMarker ?? 0,
  );
  expect(marker, "the switch reloaded the page").toBe(1);
}

/** Pick a workspace in the chip WITHOUT reloading; returns once the chip is
 *  idle on the new workspace. `label` matches the option's visible text. */
async function pick(page: Page, label: RegExp | string): Promise<void> {
  const menu = await openChipMenu(page);
  await menu.getByRole("button", { name: label }).first().click();
  const chip = page.getByTestId("workspace-chip");
  // No switch left pending (the chip shows its pending copy while it runs).
  await expect(chip.getByRole("button").first()).not.toHaveAttribute("aria-busy", "true", {
    timeout: 60_000,
  });
  await expect(menu).toBeHidden({ timeout: 60_000 });
  await expect(page.getByTestId("workspace-switch-failed")).toHaveCount(0);
}

/** The conversation body — where the opening line lives. */
const thread = (page: Page) => page.getByTestId("conversation-thread");

async function expectOrgContext(page: Page, org: string, other: string): Promise<void> {
  await expect(page.getByTestId("workspace-chip")).toContainText(org, { timeout: 60_000 });
  // The OPENING of a fresh conversation names the organization it acts for.
  await expect(thread(page)).toContainText(org, { timeout: 60_000 });
  // …and nothing of the previous organization's opening survived.
  await expect(thread(page)).not.toContainText(other);
}

async function expectPersonalContext(page: Page): Promise<void> {
  const chip = page.getByTestId("workspace-chip");
  await expect(chip).not.toContainText(ORG_A, { timeout: 60_000 });
  await expect(chip).not.toContainText(ORG_B);
  await expect(thread(page)).not.toContainText(ORG_A);
  await expect(thread(page)).not.toContainText(ORG_B);
}

test.describe.serial("a workspace switch is visible without a reload", () => {
  test.beforeEach(() => test.setTimeout(300_000));

  test("personal → Alfa → Beta → personal, no reload; each step survives a reload", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(HOME);
    // Start from an explicit personal choice.
    await pick(page, /personal/i);
    await expectPersonalContext(page);

    // ── personal → Alfa ─────────────────────────────────────────────────────
    await page.goto(`${HOME}?result=candidates&demand=${STALE_DEMAND}`);
    await markDocument(page);
    await pick(page, ORG_A);
    await expectSameDocument(page);
    await expectOrgContext(page, ORG_A, ORG_B);
    // The previous workspace's object is no longer addressed.
    await expect(page).not.toHaveURL(/demand=/);
    await page.reload();
    await expectOrgContext(page, ORG_A, ORG_B);

    // ── Alfa → Beta ─────────────────────────────────────────────────────────
    await page.goto(`${HOME}?result=candidates&demand=${STALE_DEMAND}`);
    await markDocument(page);
    await pick(page, ORG_B);
    await expectSameDocument(page);
    await expectOrgContext(page, ORG_B, ORG_A);
    await expect(page).not.toHaveURL(/demand=/);
    // The result itself stays open and re-reads for the new workspace.
    await expect(page).toHaveURL(/result=candidates/);
    await page.reload();
    await expectOrgContext(page, ORG_B, ORG_A);

    // ── Beta → personal ─────────────────────────────────────────────────────
    await markDocument(page);
    await pick(page, /personal/i);
    await expectSameDocument(page);
    await expectPersonalContext(page);
    await page.reload();
    await expectPersonalContext(page);
  });

  test("the chip names the active workspace in its accessible label", async ({ page }) => {
    await signIn(page);
    await page.goto(HOME);
    await pick(page, ORG_A);
    const trigger = page.getByTestId("workspace-chip").getByRole("button").first();
    await expect(trigger).toHaveAttribute("aria-label", new RegExp(ORG_A));
    // Owned organizations carry no relationship sub-label; a non-owned row
    // would (`workspace-relationship-<id>`) — asserted only where it exists.
    const menu = await openChipMenu(page);
    await expect(menu.getByTestId(/^workspace-relationship-/)).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
});
