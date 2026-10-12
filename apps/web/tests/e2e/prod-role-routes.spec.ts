import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Page } from "@playwright/test";

/**
 * PRODUCTION ROLE ROUTES — owner programme 2026-10-12 §7: every main role can
 * sign in, understand what it can do, and reach its working surfaces.
 *
 * Runs only inside `.github/workflows/prod-qa-walk.yml` (spec=role-routes) with
 * the minted synthetic cast. Read-only: it opens pages, it never submits.
 * Each route is a SOFT check, so one run reports every broken surface instead
 * of stopping at the first.
 *
 * A route FAILS when: the response is 5xx, the person is bounced to sign-in,
 * the error boundary renders, or the page shows no main content.
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 300_000, retries: 0 });

const COMMON = [
  "/lt/dashboard",
  "/lt/dashboard/journal",
  "/lt/dashboard/planning",
  "/lt/dashboard/communication",
  "/lt/dashboard/profile",
  "/lt/dashboard/network",
  "/lt/dashboard/activity",
  "/lt/dashboard/learning",
  "/lt/dashboard/services",
  "/lt/dashboard/market",
  "/lt/dashboard/opportunities",
  "/lt/dashboard/work-in-numbers",
  "/lt/dashboard/documents",
  "/lt/dashboard/absences",
  "/lt/dashboard/tasks",
];
const EMPLOYER = [
  "/lt/dashboard/company",
  "/lt/dashboard/company/people",
  "/lt/dashboard/company/needs",
  "/lt/dashboard/company/projects",
  "/lt/dashboard/company/planning",
  "/lt/dashboard/company/scouting",
  "/lt/dashboard/company/partners",
  "/lt/dashboard/buyer",
  "/lt/dashboard/projects",
  "/lt/dashboard/hours",
  "/lt/dashboard/candidates",
  "/lt/dashboard/talent",
  "/lt/dashboard/reports",
];

const CAST: readonly { slot: string; role: string; routes: readonly string[] }[] = [
  { slot: "worker", role: "worker", routes: COMMON },
  { slot: "worker2", role: "worker (second)", routes: COMMON },
  { slot: "owner", role: "company owner", routes: [...COMMON, ...EMPLOYER] },
  { slot: "manager", role: "manager", routes: [...COMMON, ...EMPLOYER] },
  { slot: "agency", role: "agency", routes: [...COMMON, ...EMPLOYER] },
];

async function check(page: Page, route: string): Promise<string | null> {
  const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: Error) => e);
  if (res instanceof Error) return `navigation failed: ${res.message.split("\n")[0]}`;
  if (res && res.status() >= 500) return `HTTP ${res.status()}`;
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  if (/\/auth\/(login|sign-?in)/.test(page.url())) return `bounced to sign-in (${new URL(page.url()).pathname})`;
  if (await page.getByTestId("error-boundary-message").isVisible().catch(() => false)) return "error boundary rendered";
  if (await page.getByTestId("global-error-message").isVisible().catch(() => false)) return "global error rendered";
  // The home IS the chat: its proof is the composer, not a <main> text block.
  // A role redirect lands there too, with a ?notice= that explains why.
  if (new URL(page.url()).pathname.replace(//$/, "") === "/lt/dashboard") {
    const composer = page.getByTestId("composer-input");
    return (await composer.isVisible({ timeout: 20_000 }).catch(() => false)) ? null : "chat composer missing";
  }
  const main = page.locator("main").first();
  if (!(await main.isVisible().catch(() => false))) return "no main content";
  if ((await main.innerText().catch(() => "")).trim().length < 20) return "main content is empty";
  return null;
}

for (const actor of CAST) {
  test(`${actor.role}: every working surface opens`, async ({ browser }) => {
    test.skip(!existsSync(state(actor.slot)), `no session for ${actor.slot}`);
    const ctx = await browser.newContext({ storageState: state(actor.slot), locale: "lt-LT" });
    const page = await ctx.newPage();
    const failures: string[] = [];
    for (const route of actor.routes) {
      const problem = await check(page, route);
      // A redirect to another surface with a notice is a role decision, not a
      // failure — it is recorded so the report shows where each role lands.
      const landed = new URL(page.url()).pathname + new URL(page.url()).search;
      console.info(`[role-routes] ${actor.slot} ${route} -> ${landed} ${problem ? "FAIL " + problem : "ok"}`);
      if (problem) failures.push(`${route}: ${problem}`);
      expect.soft(problem, `${actor.role} ${route}`).toBeNull();
    }
    await ctx.close();
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
