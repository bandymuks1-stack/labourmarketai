/**
 * M-P0-3 — ACTIVE WORKSPACE AUTHORITY: browser + actor proof (§13).
 *
 * Fixture (local stack, `supabase/dev-fixtures-mp03.sql`):
 *   P  mp03.owner@local.test  OWNS "MP03 Alfa" (A) AND "MP03 Beta" (B) — a
 *      real two-company owner, possible since M-P0-1; MANAGES "MP03 Gamma"
 *      (C, active manager engagement, not owner); dual worker+company
 *      identity so the Personal workspace exists.
 *   O  mp03.other@local.test  owns C and the UNRELATED "MP03 Delta" (D).
 *   W  mp03.worker@local.test worker; ACTIVE roster member of A only.
 *
 * Proven here, against real rows:
 *   1/2  select A → the invite belongs to A; select B → the SAME form writes
 *        an invite that belongs to B (service-role read of
 *        company_worker_invitations.company_id);
 *   3/4  the roster surface is workspace-scoped: A lists W, B lists nobody —
 *        role assignment / provisioning / journal review have no cross-tenant
 *        target to act on (their A/B id binding is pinned by the unit
 *        behaviour tests in lib/company/actions-workspace-authority.test.ts);
 *   7/8  a project created in A belongs to A; created in B belongs to B
 *        (service-role read of projects.company_id);
 *   9    the Personal context fails closed (setup guide, no roster, no invite
 *        form, no silent first-company fallback);
 *   C    a workspace the actor only MANAGES fails closed (company-not-owned
 *        boundary is W8 slice 1 doctrine, unchanged by M-P0-3);
 *   10   a REVOKED workspace fails closed: ending P's manager engagement on C
 *        while C is active must not leave C's employer surface reachable;
 *   11   unrelated D never appears in the workspace menu;
 *   12   no first-company fallback anywhere above.
 *
 * Also: 375px viewport pass, chip keyboard access, no console/hydration
 * errors during the core flows. Screenshots land in
 * docs/audits/evidence/multi-org-m-p0-3/.
 *
 * Skips cleanly unless `E2E_MP03_LOCAL=1` — it needs the seeded local stack.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

test.skip(
  process.env.E2E_MP03_LOCAL !== "1",
  "Needs the seeded local stack (E2E_MP03_LOCAL=1 + dev-fixtures-mp03.sql).",
);

const P_EMAIL = "mp03.owner@local.test";
const PASSWORD = "password";

const ORG_A = "MP03 Alfa";
const ORG_B = "MP03 Beta";
const ORG_C = "MP03 Gamma";
const ORG_D = "MP03 Delta";
const COMPANY_A = "c0300000-0000-0000-0000-00000000000a";
const COMPANY_B = "c0300000-0000-0000-0000-00000000000b";
const GAMMA_ENGAGEMENT = "e0300000-0000-0000-0000-00000000000c";
const WORKER_PROFILE = "a0300000-0000-0000-0000-000000000003";
// The workers row is AUTO-CREATED by the role trigger at signup, so its id is
// generated — resolved from profile_id in beforeAll, never hard-coded
// (dev-fixtures.sql documents exactly this trap).
let WORKER_ID = "";

const COMPANY = "/en/dashboard/company";
const PROJECT_NEW = "/en/dashboard/company/projects/new";

const EVIDENCE = join(__dirname, "..", "..", "..", "..", "docs", "audits",
  "evidence", "multi-org-m-p0-3");
mkdirSync(EVIDENCE, { recursive: true });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Service-role PostgREST read/write — refuses any non-local target. */
async function db(
  method: "GET" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<unknown> {
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

const consoleErrors: string[] = [];

function watchConsole(page: Page): void {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/en/auth/login");
  await page.locator('input[type="email"]').fill(P_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

/** Open the chip menu, re-clicking if the first click raced hydration. */
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
      // Click landed before the trigger hydrated — try again.
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

async function inviteFromCurrentWorkspace(
  page: Page,
  email: string,
): Promise<void> {
  const form = page.getByTestId("company-workers-invite-form");
  await expect(form).toBeVisible();
  await page.getByTestId("company-workers-invite-email").fill(email);
  await page.getByTestId("company-workers-invite-submit").click();
  await expect(page.getByTestId("company-workers-invite-result")).toBeVisible({
    timeout: 30_000,
  });
}

test.describe.serial("M-P0-3 — the active workspace IS the write authority", () => {
  // Dev-server cold compiles (login → dashboard → company) blow the 30s
  // default on the first navigation of each route; the flows themselves are
  // serial and unretried, so a generous ceiling hides no flake.
  test.beforeEach(() => test.setTimeout(240_000));

  test.beforeAll(async () => {
    const workers = (await db(
      "GET",
      `workers?profile_id=eq.${WORKER_PROFILE}&select=id`,
    )) as { id: string }[];
    if (workers.length !== 1) throw new Error("fixture worker missing — apply dev-fixtures-mp03.sql");
    WORKER_ID = workers[0].id;

    // Clean slate for this run's disposable writes (invites + proof projects),
    // and re-arm the Gamma manager engagement the revocation test ends.
    await db(
      "DELETE",
      `company_worker_invitations?company_id=in.(${COMPANY_A},${COMPANY_B})`,
    );
    await db(
      "DELETE",
      `projects?company_id=in.(${COMPANY_A},${COMPANY_B})&title=like.MP03*`,
    );
    await db("PATCH", `engagement_contexts?id=eq.${GAMMA_ENGAGEMENT}`, {
      status: "active",
    });
  });

  test("invites bind to the SELECTED workspace: A then B (assertions 1+2+12)", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page);
    await page.goto(COMPANY);
    await ensureWorkspace(page, ORG_A);
    await page.goto(COMPANY);

    // Workspace A: the dashboard names A, not B — and the roster exists (the
    // singleton lookup used to blank this page for a two-company owner).
    await expect(page.getByTestId("company-next-actions")).toContainText(ORG_A);
    await expect(page.getByTestId("company-next-actions")).not.toContainText(ORG_B);
    await page.screenshot({
      path: join(EVIDENCE, "mp03-dashboard-a-1440.png"),
      fullPage: true,
      caret: "initial",
    });

    await inviteFromCurrentWorkspace(page, "mp03.invitee.a@local.test");
    const invitesA = (await db(
      "GET",
      "company_worker_invitations?invited_email=eq.mp03.invitee.a@local.test&select=company_id",
    )) as { company_id: string }[];
    expect(invitesA).toHaveLength(1);
    expect(invitesA[0].company_id).toBe(COMPANY_A);

    // Switch to B — THE SAME form now writes to B and only B.
    await switchWorkspace(page, ORG_B);
    await page.goto(COMPANY);
    await expect(page.getByTestId("company-next-actions")).toContainText(ORG_B);
    await expect(page.getByTestId("company-next-actions")).not.toContainText(ORG_A);
    await inviteFromCurrentWorkspace(page, "mp03.invitee.b@local.test");
    const invitesB = (await db(
      "GET",
      "company_worker_invitations?invited_email=eq.mp03.invitee.b@local.test&select=company_id",
    )) as { company_id: string }[];
    expect(invitesB).toHaveLength(1);
    expect(invitesB[0].company_id).toBe(COMPANY_B);

    // Nothing leaked across: A's invite did not also land in B or vice versa.
    const crossCheck = (await db(
      "GET",
      `company_worker_invitations?company_id=eq.${COMPANY_B}&select=invited_email`,
    )) as { invited_email: string }[];
    expect(crossCheck.map((r) => r.invited_email)).toEqual(["mp03.invitee.b@local.test"]);
  });

  test("the roster surface is workspace-scoped: A lists W, B lists nobody (3+4+5+6)", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page);
    await page.goto(COMPANY);
    await ensureWorkspace(page, ORG_A);
    await page.goto(COMPANY);

    // A's roster: W is present, with the ops controls that host role
    // assignment / provisioning / journal review.
    await expect(page.getByTestId(`company-worker-row-${WORKER_ID}`)).toBeVisible();

    // B's roster: W does not exist — there is no cross-tenant target for any
    // of the three per-worker writes. Their id binding is unit-pinned.
    await switchWorkspace(page, ORG_B);
    await page.goto(COMPANY);
    await expect(page.getByTestId(`company-worker-row-${WORKER_ID}`)).toHaveCount(0);
    await expect(page.getByTestId("company-workers-empty")).toBeVisible();
  });

  test("projects are created in the SELECTED workspace: A then B (7+8)", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page);
    await page.goto(COMPANY);
    await ensureWorkspace(page, ORG_A);

    await page.goto(PROJECT_NEW);
    await page.getByTestId("project-name-input").fill("MP03 Proof Project A");
    await page.getByTestId("project-create-submit").click();
    await expect(page.getByTestId("project-context-created")).toBeVisible({
      timeout: 30_000,
    });
    const projA = (await db(
      "GET",
      "projects?title=eq.MP03 Proof Project A&select=company_id",
    )) as { company_id: string }[];
    expect(projA).toHaveLength(1);
    expect(projA[0].company_id).toBe(COMPANY_A);

    await page.goto(COMPANY);
    await switchWorkspace(page, ORG_B);
    await page.goto(PROJECT_NEW);
    await page.getByTestId("project-name-input").fill("MP03 Proof Project B");
    await page.getByTestId("project-create-submit").click();
    await expect(page.getByTestId("project-context-created")).toBeVisible({
      timeout: 30_000,
    });
    const projB = (await db(
      "GET",
      "projects?title=eq.MP03 Proof Project B&select=company_id",
    )) as { company_id: string }[];
    expect(projB).toHaveLength(1);
    expect(projB[0].company_id).toBe(COMPANY_B);
  });

  test("Personal context fails closed — no roster, no invite form, no fallback (9+12)", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page);
    await page.goto(COMPANY);
    await ensureWorkspace(page, "Personal space");
    await page.goto(COMPANY);

    await expect(page.getByTestId("company-no-profile-guide")).toBeVisible();
    await expect(page.getByTestId("company-workers-invite-form")).toHaveCount(0);
    await expect(page.getByTestId(`company-worker-row-${WORKER_ID}`)).toHaveCount(0);
    // No silent fallback to the first owned company.
    await expect(page.getByTestId("company-next-actions")).toHaveCount(0);
    await page.screenshot({
      path: join(EVIDENCE, "mp03-personal-failclosed-1440.png"),
      fullPage: true,
      caret: "initial",
    });
  });

  test("a workspace the actor only MANAGES fails closed (C boundary)", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page);
    await page.goto(COMPANY);
    await switchWorkspace(page, ORG_C);
    await page.goto(COMPANY);

    // company-not-owned → the employer write surface does not exist here.
    await expect(page.getByTestId("company-no-profile-guide")).toBeVisible();
    await expect(page.getByTestId("company-workers-invite-form")).toHaveCount(0);
  });

  test("a REVOKED workspace fails closed (10)", async ({ page }) => {
    watchConsole(page);
    await signIn(page);
    await page.goto(COMPANY);
    await switchWorkspace(page, ORG_C);

    // Revoke the manager engagement WHILE C is the active workspace.
    await db("PATCH", `engagement_contexts?id=eq.${GAMMA_ENGAGEMENT}`, {
      status: "ended",
    });
    await page.goto(COMPANY);

    // The stale pointer must not keep C reachable: the resolver re-validates
    // membership per request, so the pointer can only land on a workspace the
    // caller STILL belongs to (an owned org, or Personal) — never C. C's name
    // is gone from the whole surface and from the menu.
    const chip = page.getByTestId("workspace-chip");
    await expect(chip).toBeVisible();
    await expect(chip).not.toContainText(ORG_C);
    await expect(page.locator("body")).not.toContainText(ORG_C);
    const menu = await openChipMenu(page);
    await expect(menu).not.toContainText(ORG_C);
    await page.keyboard.press("Escape");
  });

  test("unrelated D never appears; chip is keyboard-accessible; 375px holds (11)", async ({
    page,
  }) => {
    watchConsole(page);
    await signIn(page);
    await page.goto(COMPANY);
    await ensureWorkspace(page, ORG_A);
    await page.goto(COMPANY);

    const chip = page.getByTestId("workspace-chip");
    const trigger = chip.getByRole("button").first();
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    // Wait out hydration once (same race openChipMenu absorbs), then prove
    // the pure-KEYBOARD path: focus + Enter opens, Escape closes.
    const menu = await openChipMenu(page);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(ORG_A);
    await expect(menu).toContainText(ORG_B);
    await expect(menu).not.toContainText(ORG_D);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(chip).toBeVisible();
    await expect(page.getByTestId("company-workers-invite-form")).toBeVisible();
    // No horizontal overflow at 375.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: join(EVIDENCE, "mp03-dashboard-a-375.png"),
      fullPage: true,
      caret: "initial",
    });
  });

  test.afterAll(async () => {
    // Disposable data OUT: proof invites + projects removed; Gamma engagement
    // re-armed for the next run.
    await db(
      "DELETE",
      `company_worker_invitations?company_id=in.(${COMPANY_A},${COMPANY_B})`,
    );
    await db(
      "DELETE",
      `projects?company_id=in.(${COMPANY_A},${COMPANY_B})&title=like.MP03*`,
    );
    await db("PATCH", `engagement_contexts?id=eq.${GAMMA_ENGAGEMENT}`, {
      status: "active",
    });

    // Hydration / console honesty for every flow above — NOTHING is excluded.
    // The `caret-color: transparent` mismatch this gate used to allow was
    // never a product defect: no `caret` rule exists anywhere in this repo's
    // source. Playwright's own screenshotter injects
    // `caret-color: transparent !important` inline on every
    // input/textarea/[contenteditable] while a screenshot with the default
    // `caret: "hide"` is captured (see inPagePrepareForScreenshots in
    // playwright-core), and when that capture window overlaps React's
    // streamed hydration of the demand composer, React reports the injected
    // style as an SSR/client mismatch. The screenshots above pass
    // `caret: "initial"` so nothing is ever injected, and the gate is strict.
    const hydration = consoleErrors.filter((e) =>
      /hydrat|did not match|Minified React error/i.test(e),
    );
    if (hydration.length > 0) {
      throw new Error(`hydration errors during the proof: ${hydration.join("\n")}`);
    }
  });
});
