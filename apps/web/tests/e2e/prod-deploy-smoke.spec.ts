import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Page } from "./prod-walk";

/**
 * PRODUCTION — THE SIGNED-IN HALF OF THE POST-DEPLOY SMOKE (owner 2026-11-12: a short
 * check of the main journeys after EVERY deploy, in addition to the full walks, never
 * instead of them). Runs only in `.github/workflows/post-deploy-smoke.yml`.
 *
 * FOUR signed-in documents, read-only, two synthetic sessions (worker, company owner):
 *   worker    — the home (the chat composer) and the work journal;
 *   employer  — the company's needs surface, where a need is posted;
 *   messaging — the inbox.
 * Nothing is typed, sent, saved or created. It proves each surface OPENS on the build
 * just deployed; whether a need can be posted or a message sent is still proven only by
 * the full walks (company-chain, chat-continuity, role-routes).
 *
 * The `check` below is the role-routes walk's rule for "a surface opened"
 * (prod-role-routes.spec.ts), kept in step with it by hand: status, no bounce to sign-in,
 * no error screen, no not-found page, and real content.
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production smoke: runs only in post-deploy-smoke.yml with minted QA sessions");
test.describe.configure({ retries: 0, timeout: 120_000 });

async function check(page: Page, route: string): Promise<string | null> {
  const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: Error) => e);
  if (res instanceof Error) return `navigation failed: ${res.message.split("\n")[0]}`;
  if (res && res.status() >= 400) return `HTTP ${res.status()}`;
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  if (/\/auth\/(login|sign-?in)/.test(page.url())) return `bounced to sign-in (${new URL(page.url()).pathname})`;
  if (await page.getByTestId("error-boundary-message").isVisible().catch(() => false)) return "error boundary rendered";
  if (await page.getByTestId("global-error-message").isVisible().catch(() => false)) return "global error rendered";
  if (await page.getByTestId("branded-not-found").isVisible().catch(() => false)) return "not found (404 page)";
  if (new URL(page.url()).pathname.replace(/\/$/, "") === "/lt/dashboard") {
    const composer = page.getByTestId("composer-input");
    return (await composer.waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false)) ? null : "chat composer missing";
  }
  const main = page.locator("main").first();
  if (!(await main.isVisible().catch(() => false))) return "no main content";
  if ((await main.innerText().catch(() => "")).trim().length < 20) return "main content is empty";
  return null;
}

const JOURNEYS: readonly { name: string; slot: string; routes: readonly string[] }[] = [
  { name: "worker: home and work journal open", slot: "worker", routes: ["/lt/dashboard", "/lt/dashboard/journal"] },
  { name: "employer: the needs surface opens", slot: "owner", routes: ["/lt/dashboard/company/needs"] },
  { name: "messaging: the inbox opens", slot: "worker", routes: ["/lt/dashboard/communication"] },
];

for (const journey of JOURNEYS) {
  test(journey.name, async ({ browser }) => {
    // A missing session is a FAILURE here, not a skip: a smoke that skipped everything would be green.
    expect(existsSync(state(journey.slot)), `no minted session for ${journey.slot}`).toBe(true);
    const ctx = await browser.newContext({ storageState: state(journey.slot), locale: "lt-LT" });
    const page = await ctx.newPage();
    const failures: string[] = [];
    for (const route of journey.routes) {
      const problem = await check(page, route);
      if (problem) failures.push(`${route}: ${problem}`);
    }
    await ctx.close();
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
