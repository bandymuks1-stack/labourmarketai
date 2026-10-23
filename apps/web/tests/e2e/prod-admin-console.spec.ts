import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Page } from "@playwright/test";


/**
 * PRODUCTION ADMIN CONSOLE — READ-ONLY walk of the operator tree
 * (`/[locale]/dashboard/admin/*`, gated by `requireSuperadmin` in the admin
 * layout and again on each page).
 *
 * Runs only inside `.github/workflows/prod-qa-walk.yml` (spec=admin-console).
 * It opens pages and reads them. It never clicks a control, submits a form or
 * calls an API, so it changes nothing in production.
 *
 * Two parts:
 *  1. DENIAL — always runs. A minted NON-admin synthetic session (worker, then
 *     company owner) opens the admin tree and must land on the dashboard with
 *     `?notice=needs_operator_access`, with no admin banner rendered.
 *  2. ADMIN — runs ONLY when a minted admin session file exists
 *     (`.storage-state.prod-qa.admin.json`). No synthetic QA identity holds the
 *     admin role today, and granting one is a security change that needs the
 *     owner's explicit approval (it would also widen the allowlist in
 *     `lib/testing/prod-qa-guard.ts`). Until then this part SKIPS and says why:
 *     a skipped admin walk is "not verified", never "passed".
 *
 * Output: route, landing path, timings and the two mail-readiness booleans
 * (`data-ready`, `data-on`) — presence facts, never a setting's value.
 */
/** = OPERATOR_ACCESS_NOTICE in lib/auth/role-gated-routes.ts (not imported:
 *  that module pulls server-action code into the test runner). */
const OPERATOR_ACCESS_NOTICE = "needs_operator_access";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ retries: 0 });

/** Every admin page without a dynamic segment (`pilots/[id]`, `users/[id]`
 *  need a real id and are left out: this walk invents no identifier;
 *  `users` has no index page). */
const ADMIN_ROUTES = [
  "/lt/dashboard/admin",
  "/lt/dashboard/admin/launch-readiness",
  "/lt/dashboard/admin/readiness",
  "/lt/dashboard/admin/billing",
  "/lt/dashboard/admin/telemetry",
  "/lt/dashboard/admin/support",
  "/lt/dashboard/admin/pilots",
  "/lt/dashboard/admin/pipeline",
  "/lt/dashboard/admin/market",
  "/lt/dashboard/admin/matching",
  "/lt/dashboard/admin/candidate-pool",
  "/lt/dashboard/admin/company-need-intakes",
  "/lt/dashboard/admin/company-verification",
  "/lt/dashboard/admin/need-structuring",
  "/lt/dashboard/admin/project-truth",
  "/lt/dashboard/admin/intelligence-observations",
  "/lt/dashboard/admin/language-feedback",
  "/lt/dashboard/admin/import-sandbox",
  "/lt/dashboard/admin/league",
  "/lt/dashboard/admin/agent-os",
] as const;

async function open(page: Page, route: string): Promise<{ status: number | null; error: string | null; ms: number }> {
  const started = Date.now();
  const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: Error) => e);
  const ms = Date.now() - started;
  if (res instanceof Error) return { status: null, error: `navigation failed: ${res.message.split("\n")[0]}`, ms };
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  return { status: res?.status() ?? null, error: null, ms };
}

const path = (page: Page) => new URL(page.url()).pathname.replace(/\/$/, "");

for (const slot of ["worker", "owner"] as const) {
  test(`non-admin (${slot}) is refused by the admin tree, with the operator notice`, async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(!existsSync(state(slot)), `no session for ${slot}`);
    const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
    const page = await ctx.newPage();
    for (const route of ["/lt/dashboard/admin", "/lt/dashboard/admin/launch-readiness"]) {
      const r = await open(page, route);
      const landed = path(page);
      const notice = new URL(page.url()).searchParams.get("notice");
      console.info(`[admin-console] deny ${slot} ${route} -> ${landed}?notice=${notice ?? ""} nav_ms=${r.ms}`);
      expect(r.error, `${slot} ${route}`).toBeNull();
      expect(landed, `${slot} ${route} must leave the admin tree`).toBe("/lt/dashboard");
      expect(notice, `${slot} ${route} must say why`).toBe(OPERATOR_ACCESS_NOTICE);
      await expect(page.getByTestId("admin-context-banner")).toHaveCount(0);
      await expect(page.getByTestId("mail-readiness")).toHaveCount(0);
    }
    await ctx.close();
  });
}

test("admin: every operator page opens and renders (read-only)", async ({ browser }) => {
  test.skip(
    !existsSync(state("admin")),
    "NOT VERIFIED: no synthetic admin identity exists. Granting the admin role to a QA identity needs the owner's explicit approval; see docs/ops/VPS_PRODUCTION_RUNBOOK.md §9.",
  );
  test.setTimeout(ADMIN_ROUTES.length * 25_000);
  const ctx = await browser.newContext({ storageState: state("admin"), locale: "lt-LT" });
  const page = await ctx.newPage();
  const failures: string[] = [];
  for (const route of ADMIN_ROUTES) {
    const r = await open(page, route);
    let problem = r.error;
    if (!problem && r.status !== null && r.status >= 400) problem = `HTTP ${r.status}`;
    if (!problem && /\/auth\/(login|sign-?in)/.test(page.url())) problem = "bounced to sign-in";
    if (!problem && path(page) !== route) problem = `left the admin tree (${path(page)})`;
    if (!problem && !(await page.getByTestId("admin-context-banner").isVisible().catch(() => false))) problem = "admin banner missing";
    if (!problem && (await page.getByTestId("error-boundary-message").isVisible().catch(() => false))) problem = "error boundary rendered";
    if (!problem && (await page.getByTestId("global-error-message").isVisible().catch(() => false))) problem = "global error rendered";
    if (!problem && (await page.getByTestId("branded-not-found").isVisible().catch(() => false))) problem = "not found (404 page)";
    if (!problem) {
      const main = page.locator("main").first();
      if ((await main.innerText().catch(() => "")).trim().length < 20) problem = "main content is empty";
    }
    console.info(`[admin-console] admin ${route} -> ${path(page)} nav_ms=${r.ms} ${problem ? "FAIL " + problem : "ok"}`);
    if (problem) failures.push(`${route}: ${problem}`);
    expect.soft(problem, route).toBeNull();
  }

  // The mail panel answers "can the platform send mail?" without a value:
  // log the two booleans so a walk run is the observation (no admin needed
  // for the owner to read it, but no value ever leaves the page).
  await open(page, "/lt/dashboard/admin/launch-readiness");
  const panel = page.getByTestId("mail-readiness");
  await expect(panel).toBeVisible();
  const ready = await page.getByTestId("mail-readiness-status").getAttribute("data-ready");
  const invites = await page.getByTestId("mail-readiness-invites").getAttribute("data-on");
  console.info(`[admin-console] mail-readiness ready=${ready} invites=${invites}`);
  expect(["true", "false"]).toContain(ready);
  expect(["true", "false"]).toContain(invites);

  await ctx.close();
  expect(failures, failures.join("\n")).toEqual([]);
});
