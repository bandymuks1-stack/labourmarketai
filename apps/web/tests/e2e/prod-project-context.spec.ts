import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Page } from "@playwright/test";

/**
 * PRODUCTION PROJECT CONTEXT + HOME TRACE — Future Experience 2030 (owner
 * decision 2026-10-14, A+B+C). Proves on labourmarket.ai, for the minted
 * synthetic cast, that the new surfaces render honestly:
 *
 *   home      "Kas pasikeitė" (home-trace) is present and its read did not
 *             fail; no raw message key leaks
 *   project   the project course (F4) and this week's goal (F6) on a project
 *             the person can open — either drawn, or honestly absent; a
 *             region that says its OWN read failed is a failure here
 *
 * Runs only inside `.github/workflows/prod-qa-walk.yml` (spec=project-context).
 * Read-only: it opens pages, it never submits. Soft checks, so one run
 * reports every broken surface. A cast member who can open no project is
 * reported as a note, not a failure (that is data, not a defect).
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 300_000, retries: 0 });

const UUID = /\/dashboard\/projects\/([0-9a-f-]{36})(?:[/?#]|$)/i;
const RAW_KEY = /\b(projectCourse|projectWeekGoal|homeTrace|careerJourney)\.[a-zA-Z]/;

async function guard(page: Page, label: string, problems: string[]): Promise<boolean> {
  if (/\/auth\/(login|sign-?in)/.test(page.url())) {
    problems.push(`${label}: bounced to sign-in`);
    return false;
  }
  if (await page.getByTestId("error-boundary-message").isVisible().catch(() => false)) problems.push(`${label}: error boundary`);
  if (await page.getByTestId("global-error-message").isVisible().catch(() => false)) problems.push(`${label}: global error`);
  const text = await page.locator("body").innerText().catch(() => "");
  if (RAW_KEY.test(text) || text.includes("MISSING:")) problems.push(`${label}: raw message key on screen`);
  return true;
}

async function firstProjectHref(page: Page): Promise<string | null> {
  for (const route of ["/lt/dashboard", "/lt/dashboard/projects"]) {
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    const hrefs = await page.locator('a[href*="/dashboard/projects/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
    const hit = hrefs.find((h) => UUID.test(h) && !h.includes("/operations"));
    if (hit) return hit;
  }
  return null;
}

for (const slot of ["worker", "manager", "owner"] as const) {
  test(`project context + home trace — ${slot}`, async ({ browser }) => {
    test.skip(!existsSync(state(slot)), `no minted session for ${slot}`);
    const context = await browser.newContext({ storageState: state(slot) });
    const page = await context.newPage();
    const problems: string[] = [];
    const notes: string[] = [];

    // HOME — "Kas pasikeitė" is there, and its read did not fail.
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    if (await guard(page, "home", problems)) {
      const trace = page.getByTestId("home-trace");
      const shown = await trace.waitFor({ state: "attached", timeout: 20_000 }).then(() => true).catch(() => false);
      if (slot === "worker") {
        if (!shown) problems.push("home: 'Kas pasikeitė' region missing for a worker");
        else if ((await trace.getAttribute("data-state")) === "unknown") problems.push("home: trace says its read failed");
        else notes.push(`home trace: ${(await trace.getAttribute("data-state")) ?? "?"}`);
      } else {
        notes.push(`home trace (${slot}): ${shown ? "shown" : "not on this context's home"}`);
      }
    }

    // PROJECT — course + this week's goal on a project this person can open.
    const href = await firstProjectHref(page);
    if (!href) {
      notes.push("no project visible to this cast member");
    } else {
      const res = await page.goto(href, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: Error) => e);
      if (res instanceof Error) problems.push(`project: navigation failed`);
      else if (res && res.status() >= 500) problems.push(`project: HTTP ${res.status()}`);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      if (await guard(page, "project", problems)) {
        for (const id of ["project-course", "project-week-goal"]) {
          const region = page.getByTestId(id);
          if ((await region.count()) === 0) {
            notes.push(`${id}: absent (no stages / nothing due this week)`);
            continue;
          }
          const st = await region.first().getAttribute("data-state");
          if (st === "unknown") problems.push(`${id}: says its read failed`);
          else notes.push(`${id}: ${st}${id === "project-week-goal" ? ` · scope=${await region.first().getAttribute("data-scope")}` : ""}`);
        }
        // Never green on the team course: a stage status is the manager's own.
        const course = page.getByTestId("project-course");
        if ((await course.count()) > 0) {
          const html = await course.first().innerHTML();
          if (/state-success|trust-accent/.test(html)) problems.push("project-course: uses green");
        }
      }
    }

    for (const n of notes) test.info().annotations.push({ type: "note", description: `${slot}: ${n}` });
    await context.close();
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
