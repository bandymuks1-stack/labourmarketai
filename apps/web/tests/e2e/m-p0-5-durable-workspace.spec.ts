/**
 * M-P0-5 — DURABLE ACTIVE WORKSPACE AUTHORITY: browser proof (§18).
 *
 * Contract: docs/architecture/DURABLE_ACTIVE_WORKSPACE_AUTHORITY.md.
 * Fixture: dev-fixtures-mp03.sql (P owns "MP03 Alfa" + "MP03 Beta" — a real
 * multi-org account; O owns the unrelated "MP03 Delta").
 *
 * Proven here (the §18 rows not already carried by the M-P0-3/M-P0-4 specs):
 *   • select B → navigate + hard reload → B remains (cookie + durable
 *     pointer, re-validated per request);
 *   • a FORGED cookie naming an organization the person does not belong to
 *     (Delta) selects nothing — resolution refuses it;
 *   • two tabs share ONE server-side pointer: a switch in tab 1 is what tab
 *     2 renders on its next request — no split-brain authorization;
 *   • multi-org account with NO pointer at all FAILS CLOSED to Personal —
 *     the forbidden first-organization inference is gone;
 *   • logout → login re-validates: the chip renders a legitimate workspace,
 *     never an error, never a foreign org.
 *
 * Skips cleanly unless `E2E_MP05_LOCAL=1`.
 */
import { test, expect, type Page } from "@playwright/test";

test.skip(
  process.env.E2E_MP05_LOCAL !== "1",
  "Needs the seeded local stack (E2E_MP05_LOCAL=1 + dev-fixtures-mp03.sql).",
);

const P_EMAIL = "mp03.owner@local.test";
const PASSWORD = "password";
const ORG_A = "MP03 Alfa";
const ORG_B = "MP03 Beta";
const ORG_D = "MP03 Delta";
const P_PROFILE = "a0300000-0000-0000-0000-000000000001";
const DELTA_COMPANY = "c0300000-0000-0000-0000-00000000000d";
const COOKIE = "lm_active_workspace";

const START = "/en/dashboard/start";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function db(method: "GET" | "PATCH", path: string, body?: unknown) {
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json().catch(() => null);
}

let DELTA_ORG = "";

async function signIn(page: Page): Promise<void> {
  await page.goto("/en/auth/login");
  await page.locator('input[type="email"]').fill(P_EMAIL);
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

test.describe.serial("M-P0-5 — the workspace pointer is durable AND validated", () => {
  test.beforeEach(() => test.setTimeout(240_000));

  test.beforeAll(async () => {
    const rows = (await db(
      "GET",
      `organizations?legacy_company_id=eq.${DELTA_COMPANY}&select=id`,
    )) as { id: string }[];
    if (rows.length !== 1) throw new Error("fixture Delta org missing");
    DELTA_ORG = rows[0].id;
  });

  test("select B → navigate + reload → B remains selected", async ({ page }) => {
    await signIn(page);
    await page.goto(START);
    await switchWorkspace(page, ORG_B);

    await page.goto("/en/dashboard/company");
    await expect(page.getByTestId("workspace-chip")).toContainText(ORG_B);
    await page.reload();
    await expect(page.getByTestId("workspace-chip")).toContainText(ORG_B);
    await page.goto(START);
    await expect(page.getByTestId("workspace-chip")).toContainText(ORG_B);
  });

  test("a FORGED cookie naming a foreign organization selects nothing", async ({
    page,
    context,
  }) => {
    await signIn(page);
    await page.goto(START);
    await switchWorkspace(page, ORG_A);

    // Inject Delta's REAL org id — an organization P does not belong to.
    await context.addCookies([
      {
        name: COOKIE,
        value: DELTA_ORG,
        url: page.url(),
      },
    ]);
    await page.goto(START);
    const chip = page.getByTestId("workspace-chip");
    await expect(chip).toBeVisible();
    await expect(chip).not.toContainText(ORG_D);
    await expect(page.locator("body")).not.toContainText(ORG_D);
    // The menu still offers only legitimate workspaces.
    const menu = await openChipMenu(page);
    await expect(menu).not.toContainText(ORG_D);
    await page.keyboard.press("Escape");
  });

  test("two tabs share ONE validated pointer — no split-brain", async ({
    page,
    context,
  }) => {
    await signIn(page);
    await page.goto(START);
    await switchWorkspace(page, ORG_B);

    const tab2 = await context.newPage();
    await tab2.goto(START);
    await expect(tab2.getByTestId("workspace-chip")).toContainText(ORG_B);

    // Switch in tab 1 → tab 2's NEXT request renders the same workspace.
    await switchWorkspace(page, ORG_A);
    await tab2.reload();
    await expect(tab2.getByTestId("workspace-chip")).toContainText(ORG_A);
    await tab2.close();
  });

  test("multi-org account with NO pointer fails closed to Personal (no first-org guess)", async ({
    browser,
  }) => {
    // Clear the durable pointer, then use a FRESH browser context (no
    // session cookie either): the multi-org account must land in Personal.
    await db("PATCH", `profiles?id=eq.${P_PROFILE}`, {
      active_organization_id: null,
    });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto(START);
    const chip = page.getByTestId("workspace-chip");
    await expect(chip).toBeVisible();
    await expect(chip).not.toContainText(ORG_A);
    await expect(chip).not.toContainText(ORG_B);
    // Both organizations stay one explicit choice away.
    const menu = await openChipMenu(page);
    await expect(menu).toContainText(ORG_A);
    await expect(menu).toContainText(ORG_B);
    await page.keyboard.press("Escape");
    await ctx.close();
  });

  test("logout → login re-validates the workspace (no inheritance, no error)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto(START);
    await switchWorkspace(page, ORG_A);

    await page.goto("/en/auth/logout");
    await page.waitForURL(/\/(en|lt)(\/|$)/, { timeout: 60_000 });

    await signIn(page);
    await page.goto(START);
    const chip = page.getByTestId("workspace-chip");
    await expect(chip).toBeVisible();
    // The re-validated pointer may legitimately restore Alfa (the durable
    // preference) — what it may NEVER do is show a foreign org or error.
    await expect(chip).not.toContainText(ORG_D);
    await expect(page.locator("body")).not.toContainText(/42P01|42703|PGRST/);
    await ctx.close();
  });
});
