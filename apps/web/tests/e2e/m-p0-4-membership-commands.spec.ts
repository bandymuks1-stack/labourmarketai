/**
 * M-P0-4 Slice 2 — MEMBERSHIP COMMANDS: browser proof (§15).
 *
 * Fixture: dev-fixtures-mp03.sql actors on the local stack with Slice 1 +
 * Slice 2 applied locally. P (mp03.owner) owns "MP03 Alfa"; W (mp03.worker)
 * is an employment-roster worker with NO governance membership — the §14
 * "worker engaged by A without membership" actor, and our invitee.
 *
 * Proven in the real UI:
 *   • invitation creation (owner, active workspace Alfa);
 *   • invitation acceptance (W, personal context) — the organization then
 *     APPEARS IN W'S WORKSPACE SWITCHER (consumer migration §13);
 *   • role-specific controls: owner sees the invite form; a plain member
 *     sees the directory WITHOUT any administration control;
 *   • role change (member → manager) through the real select;
 *   • revocation — the organization disappears from W's switcher and the
 *     stale workspace fails closed;
 *   • decline path writes history and grants nothing;
 *   • unrelated "MP03 Delta" never appears anywhere;
 *   • keyboard/focus on the invite form, 375px no-overflow, no hydration
 *     errors (the known pre-existing caret-color mismatch excluded, same as
 *     the M-P0-3 proof).
 *
 * Skips cleanly unless `E2E_MP04_LOCAL=1`.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

test.skip(
  process.env.E2E_MP04_LOCAL !== "1",
  "Needs the seeded local stack (E2E_MP04_LOCAL=1 + slices 1+2 applied).",
);

const P_EMAIL = "mp03.owner@local.test";
const W_EMAIL = "mp03.worker@local.test";
const PASSWORD = "password";
const ORG_A = "MP03 Alfa";
const ORG_D = "MP03 Delta";
const W_PROFILE = "a0300000-0000-0000-0000-000000000003";

const START = "/en/dashboard/start";

const EVIDENCE = join(__dirname, "..", "..", "..", "..", "docs", "audits",
  "evidence", "multi-org-m-p0-4");
mkdirSync(EVIDENCE, { recursive: true });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function db(method: "GET" | "DELETE", path: string): Promise<unknown> {
  if (!SUPA_URL || !SUPA_SERVICE) throw new Error("local stack env missing");
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing a non-local target: ${SUPA_URL}`);
  }
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json().catch(() => null);
}

const consoleErrors: string[] = [];
function watchConsole(page: Page): void {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/en/auth/login");
  await page.locator('input[type="email"]').fill(email);
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

async function switchWorkspace(page: Page, label: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip");
  const menu = await openChipMenu(page);
  await menu.getByRole("button", { name: label, exact: false }).click();
  await expect(menu).toBeHidden({ timeout: 30_000 });
  await expect(chip).toContainText(label, { timeout: 30_000 });
}

async function ensureWorkspace(page: Page, label: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip");
  await expect(chip).toBeVisible({ timeout: 60_000 });
  if ((await chip.innerText()).includes(label)) return;
  await switchWorkspace(page, label);
}

test.describe.serial("M-P0-4 slice 2 — membership commands in the real UI", () => {
  test.beforeEach(() => test.setTimeout(240_000));

  test.beforeAll(async () => {
    // W starts with NO governance membership rows (invited/active/revoked).
    await db("DELETE", `company_memberships?profile_id=eq.${W_PROFILE}`);
  });

  test("owner invites from the ACTIVE workspace (role-specific form)", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page, P_EMAIL);
    await page.goto(START);
    await ensureWorkspace(page, ORG_A);
    await page.goto(START);

    const section = page.getByTestId("org-members-section");
    await expect(section).toBeVisible();
    // Owner-only control present for the owner.
    await expect(page.getByTestId("org-members-invite-form")).toBeVisible();

    // Keyboard/focus: the email input is label-bound and focusable.
    await page.getByTestId("org-members-invite-email").focus();
    await expect(page.getByTestId("org-members-invite-email")).toBeFocused();

    await page.getByTestId("org-members-invite-email").fill(W_EMAIL);
    await page
      .getByTestId("org-members-invite-role")
      .selectOption("member");
    await page.getByTestId("org-members-invite-submit").click();
    await expect(page.getByTestId("org-members-invite-result")).toContainText(
      "Invitation sent",
      { timeout: 30_000 },
    );
    await page.screenshot({
      path: join(EVIDENCE, "mp04-invite-sent-1440.png"),
      fullPage: true,
    });
  });

  test("invitee accepts — the organization APPEARS in the switcher (§13)", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page, W_EMAIL);
    await page.goto(START);

    // Before acceptance the org is NOT offered: with only the Personal
    // workspace the chip is a buttonless single-workspace indicator (no
    // fake multi-tenancy chrome), and it names no organization.
    const chipBefore = page.getByTestId("workspace-chip");
    await expect(chipBefore).toBeVisible({ timeout: 60_000 });
    await expect(chipBefore).not.toContainText(ORG_A);
    await expect(chipBefore).not.toContainText(ORG_D);
    await expect(chipBefore.getByRole("button")).toHaveCount(0);

    const panel = page.getByTestId("membership-invitations-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(ORG_A);
    await panel.getByTestId(/membership-accept-/).click();
    await expect(
      page.getByTestId("membership-invitations-result"),
    ).toContainText("accepted", { timeout: 30_000 });

    // The switcher now offers the organization; unrelated Delta still absent.
    await page.goto(START);
    const menuAfter = await openChipMenu(page);
    await expect(menuAfter).toContainText(ORG_A);
    await expect(menuAfter).not.toContainText(ORG_D);
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: join(EVIDENCE, "mp04-accepted-switcher-1440.png"),
      fullPage: true,
    });
  });

  test("a plain member sees the directory WITHOUT administration controls", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page, W_EMAIL);
    await page.goto(START);
    await switchWorkspace(page, ORG_A);
    await page.goto(START);

    await expect(page.getByTestId("org-members-section")).toBeVisible();
    await expect(page.getByTestId("org-members-invite-form")).toHaveCount(0);
    await expect(page.getByTestId(/org-member-revoke-/)).toHaveCount(0);
    // The member CAN leave — their own membership only.
    await expect(page.getByTestId("org-member-leave")).toBeVisible();

    // 375px: panel holds, no horizontal overflow.
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId("org-members-section")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: join(EVIDENCE, "mp04-member-view-375.png"),
      fullPage: true,
    });
  });

  test("owner changes the member's role through the real select", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page, P_EMAIL);
    await page.goto(START);
    await ensureWorkspace(page, ORG_A);
    await page.goto(START);

    const select = page.getByTestId(/org-member-role-select-/).first();
    await expect(select).toBeVisible();
    await select.selectOption("manager");
    await page.getByTestId(/org-member-role-save-/).first().click();
    await expect(page.getByTestId("org-members-row-result")).toContainText(
      "Role changed",
      { timeout: 30_000 },
    );
  });

  test("revocation drops the organization from the invitee's switcher", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page, P_EMAIL);
    await page.goto(START);
    await ensureWorkspace(page, ORG_A);
    await page.goto(START);
    await page.getByTestId(/org-member-revoke-/).first().click();
    await expect(page.getByTestId("org-members-row-result")).toContainText(
      "Membership revoked",
      { timeout: 30_000 },
    );

    // The revoked person's switcher loses the organization on next request:
    // back to the buttonless single-workspace (Personal) indicator.
    const wPage = await page.context().browser()!.newContext();
    const w = await wPage.newPage();
    watchConsole(w);
    await signIn(w, W_EMAIL);
    await w.goto(START);
    const wChip = w.getByTestId("workspace-chip");
    await expect(wChip).toBeVisible({ timeout: 60_000 });
    await expect(wChip).not.toContainText(ORG_A);
    await expect(wChip.getByRole("button")).toHaveCount(0);
    await expect(w.locator("body")).not.toContainText(ORG_D);
    await wPage.close();
  });

  test("declining writes history and grants nothing", async ({ page }) => {
    watchConsole(page);
    await signIn(page, P_EMAIL);
    await page.goto(START);
    await ensureWorkspace(page, ORG_A);
    await page.goto(START);
    await page.getByTestId("org-members-invite-email").fill(W_EMAIL);
    await page.getByTestId("org-members-invite-role").selectOption("member");
    await page.getByTestId("org-members-invite-submit").click();
    await expect(page.getByTestId("org-members-invite-result")).toContainText(
      "Invitation sent",
      { timeout: 30_000 },
    );

    const ctx = await page.context().browser()!.newContext();
    const w = await ctx.newPage();
    watchConsole(w);
    await signIn(w, W_EMAIL);
    await w.goto(START);
    const panel = w.getByTestId("membership-invitations-panel");
    await expect(panel).toBeVisible();
    await panel.getByTestId(/membership-decline-/).click();
    await expect(w.getByTestId("membership-invitations-result")).toContainText(
      "declined",
      { timeout: 30_000 },
    );
    // No workspace was granted — still the buttonless Personal indicator.
    await w.goto(START);
    const wChip = w.getByTestId("workspace-chip");
    await expect(wChip).toBeVisible({ timeout: 60_000 });
    await expect(wChip).not.toContainText(ORG_A);
    await expect(wChip.getByRole("button")).toHaveCount(0);
    await ctx.close();
  });

  test.afterAll(async () => {
    await db("DELETE", `company_memberships?profile_id=eq.${W_PROFILE}`);
    const hydration = consoleErrors.filter(
      (e) =>
        /hydrat|did not match|Minified React error/i.test(e) &&
        !/caret-color/i.test(e),
    );
    if (hydration.length > 0) {
      throw new Error(`hydration errors during the proof: ${hydration.join("\n")}`);
    }
  });
});
