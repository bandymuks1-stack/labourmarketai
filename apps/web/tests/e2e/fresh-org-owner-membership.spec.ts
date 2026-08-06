/**
 * FRESH-ORG OWNER MEMBERSHIP — §9 browser regression proof.
 *
 * The Finding-2 defect: an organization created through the real product
 * path was born WITHOUT its owner's company_memberships row, so the
 * governance member directory on /dashboard/start never rendered
 * (`activeOrgId && members.length > 0`) and the owner could not invite
 * anyone. With 20260807090000 applied locally, this spec proves in the
 * REAL UI, with a DISPOSABLE actor created for this run:
 *
 *   • create organization A through the real setup form → the membership
 *     directory renders IMMEDIATELY (the defect surface), the owner row is
 *     present, the invite action is reachable;
 *   • create organization B → B has its OWN owner membership; A unchanged;
 *   • workspace switch A↔B — each directory isolated;
 *   • the organization write surface (company dashboard) is reachable —
 *     demand creation entry;
 *   • Personal context shows NO governance controls;
 *   • 1440 and 375 (no horizontal overflow), keyboard/focus on the invite
 *     form, zero console errors, zero hydration warnings (strict — the
 *     screenshots pass `caret: "initial"`, so Playwright's screenshotter
 *     never injects the caret-color style that used to masquerade as a
 *     hydration mismatch).
 *
 * LOCAL ONLY. Skips cleanly unless `E2E_FRESH_ORG_LOCAL=1` (run through
 * `pnpm e2e:local`, which refuses non-local stacks by design). The actor
 * and its organizations stay in the disposable local stack; the next
 * `supabase db reset` removes them.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

test.skip(
  process.env.E2E_FRESH_ORG_LOCAL !== "1",
  "Needs the local stack with 20260807090000 applied (E2E_FRESH_ORG_LOCAL=1).",
);

const RUN = `${Date.now()}`;
const F_EMAIL = `fresh.owner.${RUN}@local.test`;
const PASSWORD = "password";
const ORG_A = `Fresh Alpha ${RUN}`;
const ORG_B = `Fresh Beta ${RUN}`;

const START = "/en/dashboard/start";
const SETUP_NEW = "/en/dashboard/start/company?new=1";

const EVIDENCE = join(__dirname, "..", "..", "..", "..", "docs", "audits",
  "evidence", "fresh-org-owner-membership");
mkdirSync(EVIDENCE, { recursive: true });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function assertLocal(): void {
  if (!SUPA_URL || !SUPA_SERVICE) throw new Error("local stack env missing");
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing a non-local target: ${SUPA_URL}`);
  }
}

async function adminCreateUser(): Promise<string> {
  assertLocal();
  const res = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: F_EMAIL,
      password: PASSWORD,
      email_confirm: true,
    }),
  });
  if (!res.ok) throw new Error(`admin create user → ${res.status}: ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  // The profiles row is normally minted by the auth trigger; upsert defensively
  // so the spec does not depend on trigger timing.
  const up = await fetch(`${SUPA_URL}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: user.id,
      email: F_EMAIL,
      // The proof's subject is organization creation, not onboarding — the
      // disposable actor starts with the exact fields real onboarding
      // writes (dashboard gate: onboarded_at; identity source:
      // active_role — the start page derives the workspace identity from
      // it, and a NULL here is a state no real onboarded user has).
      onboarded_at: new Date().toISOString(),
      onboarded: true,
      active_role: "company",
      full_name: "Fresh Owner",
      country: "LT",
    }),
  });
  if (!up.ok) throw new Error(`profiles upsert → ${up.status}: ${await up.text()}`);
  return user.id;
}

const consoleErrors: string[] = [];
function watchConsole(page: Page): void {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/en/auth/login");
  await page.locator('input[type="email"]').fill(F_EMAIL);
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

async function createOrgViaUi(page: Page, legalName: string): Promise<void> {
  await page.goto(SETUP_NEW);
  const form = page.getByTestId("company-setup-form");
  await expect(form).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("company-setup-legal-name").fill(legalName);
  await page.getByTestId("company-setup-country").selectOption("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({
    timeout: 30_000,
  });
}

test.describe.serial("fresh-org owner membership — §9 browser proof", () => {
  test.beforeEach(() => test.setTimeout(240_000));

  test.beforeAll(async () => {
    await adminCreateUser();
  });

  test("org A: directory renders immediately, owner row + invite reachable", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page);
    await createOrgViaUi(page, ORG_A);

    await page.goto(START);
    await ensureWorkspace(page, ORG_A);
    await page.goto(START);

    // THE defect surface: pre-fix this section never rendered for a fresh
    // org (members.length === 0). Post-fix the owner membership exists from
    // the same transaction that created the organization.
    const section = page.getByTestId("org-members-section");
    await expect(section).toBeVisible({ timeout: 60_000 });
    // The directory shows the member's display name and role.
    await expect(section).toContainText("Fresh Owner");
    await expect(section.locator("li")).toHaveCount(1);

    // Invite action reachable — and keyboard-focusable.
    await expect(page.getByTestId("org-members-invite-form")).toBeVisible();
    await page.getByTestId("org-members-invite-email").focus();
    await expect(page.getByTestId("org-members-invite-email")).toBeFocused();

    await page.screenshot({
      path: join(EVIDENCE, "fresh-org-a-directory-1440.png"),
      fullPage: true,
      caret: "initial",
    });
  });

  test("org B: own membership; A unchanged; A↔B directories isolated", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page);
    await createOrgViaUi(page, ORG_B);

    await page.goto(START);
    await ensureWorkspace(page, ORG_B);
    await page.goto(START);
    const section = page.getByTestId("org-members-section");
    await expect(section).toBeVisible({ timeout: 60_000 });
    await expect(section).toContainText("Fresh Owner");
    // Exactly the owner — nothing leaked across organizations.
    await expect(section.locator("li")).toHaveCount(1);

    // Switch back to A — its directory is intact and equally isolated.
    await switchWorkspace(page, ORG_A);
    await page.goto(START);
    const sectionA = page.getByTestId("org-members-section");
    await expect(sectionA).toBeVisible({ timeout: 60_000 });
    await expect(sectionA).toContainText("Fresh Owner");
    await expect(sectionA.locator("li")).toHaveCount(1);

    await page.screenshot({
      path: join(EVIDENCE, "fresh-org-switch-a-b-1440.png"),
      fullPage: true,
      caret: "initial",
    });
  });

  test("org write surface reachable (demand creation entry)", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page);
    await page.goto(START);
    await ensureWorkspace(page, ORG_A);
    await page.goto("/en/dashboard/company");
    // The company dashboard (the demand/write surface) resolves for the
    // fresh organization — pre-fix parts of the org surface failed closed
    // because governance authority rows did not exist.
    await expect(page.getByTestId("company-next-actions")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("company-next-actions")).toContainText(ORG_A);
  });

  test("Personal context has no governance controls", async ({ page }) => {
    watchConsole(page);
    await signIn(page);
    await page.goto(START);
    const menu = await openChipMenu(page);
    await menu
      .getByRole("button", { name: /personal|asmenin/i })
      .first()
      .click();
    await expect(menu).toBeHidden({ timeout: 30_000 });
    await page.goto(START);
    await expect(page.getByTestId("org-members-section")).toHaveCount(0);
    await expect(page.getByTestId("org-members-invite-form")).toHaveCount(0);
  });

  test("375px: directory holds, no horizontal overflow", async ({ page }) => {
    watchConsole(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page);
    await page.goto(START);
    await ensureWorkspace(page, ORG_A);
    await page.goto(START);
    await expect(page.getByTestId("org-members-section")).toBeVisible({
      timeout: 60_000,
    });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: join(EVIDENCE, "fresh-org-directory-375.png"),
      fullPage: true,
      caret: "initial",
    });
  });

  test.afterAll(() => {
    // Strict: no exclusions. `caret: "initial"` above means the historical
    // screenshot-injected caret-color mismatch cannot occur.
    const hydration = consoleErrors.filter((e) =>
      /hydrat|did not match|Minified React error/i.test(e),
    );
    if (hydration.length > 0) {
      throw new Error(`hydration errors during the proof: ${hydration.join("\n")}`);
    }
    const errors = consoleErrors.filter(
      (e) =>
        !/favicon|net::ERR_ABORTED/i.test(e) &&
        // Dev-harness artifact, not a product error: next dev delivers the
        // CSP as Report-Only, and Chromium warns that
        // upgrade-insecure-requests is ignored in report-only mode. The
        // production response delivers an enforced CSP.
        !/upgrade-insecure-requests.*report-only/i.test(e),
    );
    if (errors.length > 0) {
      throw new Error(`console errors during the proof: ${errors.join("\n")}`);
    }
  });
});
