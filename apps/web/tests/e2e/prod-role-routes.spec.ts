import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Page } from "./prod-walk";
import { COMMON_ROUTES, EMPLOYER_ROUTES } from "./prod-walk-routes";

/**
 * PRODUCTION ROLE ROUTES — owner programme 2026-10-12 §7: every main role can
 * sign in, understand what it can do, and reach its working surfaces.
 *
 * Runs only inside `.github/workflows/prod-qa-walk.yml` (spec=role-routes) with
 * the minted synthetic cast. Read-only: it opens pages, it never submits.
 * Each route is a SOFT check, so one run reports every broken surface instead
 * of stopping at the first.
 *
 * A route FAILS when: the response is 4xx/5xx, the branded not-found page renders
 * (it has a <main> with text, so the content checks alone passed a missing page —
 * audit 2026-10-18), the person is bounced to sign-in, the error boundary
 * renders, or the page shows no main content.
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
// The budget scales with the routes an actor opens: a healthy owner pass was
// ~250 s for 28 routes (2026-10-22), so a flat 300 s cut the 27th route of a
// merely slow run. Slow surfaces stay visible by name (SLOW in the log).
test.describe.configure({ retries: 0 });

// The route lists are shared with the ux-metrics walk (one copy: ./prod-walk-routes).
const COMMON = COMMON_ROUTES;
const EMPLOYER = EMPLOYER_ROUTES;

const CAST: readonly { slot: string; role: string; routes: readonly string[] }[] = [
  { slot: "worker", role: "worker", routes: COMMON },
  { slot: "worker2", role: "worker (second)", routes: COMMON },
  { slot: "owner", role: "company owner", routes: [...COMMON, ...EMPLOYER] },
  { slot: "manager", role: "manager", routes: [...COMMON, ...EMPLOYER] },
  { slot: "agency", role: "agency", routes: [...COMMON, ...EMPLOYER] },
];

/** Per-route timing of the LAST check (ms): time to first byte of the
 *  document and the whole navigation. Logged so a slow route is a number in
 *  the run log, not a guess (owner 2026-10-15: the manager's /reports took
 *  >45 s once, two minutes after a deploy). */
const lastTiming: { ttfb: number | null; total: number } = { ttfb: null, total: 0 };

async function check(page: Page, route: string): Promise<string | null> {
  const started = Date.now();
  const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: Error) => e);
  lastTiming.total = Date.now() - started;
  lastTiming.ttfb = null;
  if (res instanceof Error) return `navigation failed: ${res.message.split("\n")[0]}`;
  const timing = res?.request().timing();
  if (timing && timing.responseStart > 0) lastTiming.ttfb = Math.round(timing.responseStart);
  if (res && res.status() >= 400) return `HTTP ${res.status()}`;
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  if (/\/auth\/(login|sign-?in)/.test(page.url())) return `bounced to sign-in (${new URL(page.url()).pathname})`;
  if (await page.getByTestId("error-boundary-message").isVisible().catch(() => false)) return "error boundary rendered";
  if (await page.getByTestId("global-error-message").isVisible().catch(() => false)) return "global error rendered";
  if (await page.getByTestId("branded-not-found").isVisible().catch(() => false)) return "not found (404 page)";
  // The home IS the chat: its proof is the composer, not a <main> text block.
  // A role redirect lands there too, with a ?notice= that explains why.
  if (new URL(page.url()).pathname.replace(/\/$/, "") === "/lt/dashboard") {
    const composer = page.getByTestId("composer-input");
    return (await composer.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false)) ? null : "chat composer missing";
  }
  const main = page.locator("main").first();
  if (!(await main.isVisible().catch(() => false))) return "no main content";
  if ((await main.innerText().catch(() => "")).trim().length < 20) return "main content is empty";
  return null;
}

for (const actor of CAST) {
  test(`${actor.role}: every working surface opens`, async ({ browser }) => {
    test.setTimeout(actor.routes.length * 20_000); // 28 routes -> 560 s, 15 -> 300 s
    test.skip(!existsSync(state(actor.slot)), `no session for ${actor.slot}`);
    const ctx = await browser.newContext({ storageState: state(actor.slot), locale: "lt-LT" });
    const page = await ctx.newPage();
    const failures: string[] = [];
    for (const route of actor.routes) {
      const problem = await check(page, route);
      // A redirect to another surface with a notice is a role decision, not a
      // failure — it is recorded so the report shows where each role lands.
      const landed = new URL(page.url()).pathname + new URL(page.url()).search;
      console.info(
        `[role-routes] ${actor.slot} ${route} -> ${landed} ttfb_ms=${lastTiming.ttfb ?? "?"} nav_ms=${lastTiming.total}${lastTiming.total > 20_000 ? " SLOW" : ""} ${problem ? "FAIL " + problem : "ok"}`,
      );
      if (problem) failures.push(`${route}: ${problem}`);
      expect.soft(problem, `${actor.role} ${route}`).toBeNull();
    }
    await ctx.close();
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

const SCOUTING = "/lt/dashboard/company/scouting";
const PRODUCTION_ORIGIN = "https://labourmarket.ai";
const SCOUTING_TIMEOUT = 30_000;

/** Keep authenticated Playwright call logs, DOM and actual URLs out of the public report. */
async function scoutingCheck<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    throw new Error(message);
  }
}

async function inScoutingWorkspace(page: Page, workspace: string | RegExp, walk: () => Promise<void>) {
  const chip = page.getByTestId("workspace-chip").getByRole("button");
  const menu = page.getByTestId("workspace-chip-menu");
  const options = menu.getByRole("button");
  const openSwitcher = async () => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded", timeout: SCOUTING_TIMEOUT });
    // A first click can precede hydration. Retry just the read-only menu open.
    await expect(async () => {
      if (!(await menu.isVisible())) await chip.click({ timeout: 3_000 });
      await expect(menu).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: SCOUTING_TIMEOUT });
  };
  const titleOf = (title: string | RegExp) => options.and(menu.getByTitle(title, { exact: true }));

  await scoutingCheck("QA fixture blocked: the workspace switcher did not open", openSwitcher);
  const target = titleOf(workspace);
  await scoutingCheck("QA fixture blocked: expected exactly one enrolled scouting workspace", async () => {
    expect(await target.count()).toBe(1);
  });
  const alreadySelected = await scoutingCheck("QA fixture blocked: the enrolled workspace was unreadable", () =>
    target.getAttribute("aria-current", { timeout: SCOUTING_TIMEOUT }),
  );
  if (alreadySelected === "true") {
    await walk();
    return;
  }
  const previous = await scoutingCheck("QA fixture blocked: the current workspace was unreadable", () =>
    options.and(menu.locator('button[aria-current="true"]')).getAttribute("title", { timeout: SCOUTING_TIMEOUT }),
  );
  // A UI switch can persist on the QA identity. Switch only when the previous
  // selection is a QA workspace or personal space and can safely be restored.
  if (!previous || !/^(?:Asmeninė erdvė$|QA-SYNTHETIC )/.test(previous)) {
    throw new Error("QA fixture blocked: the previous workspace is outside the restorable QA scope");
  }

  try {
    await scoutingCheck("QA fixture blocked: the enrolled scouting workspace could not be selected", async () => {
      await target.click({ timeout: SCOUTING_TIMEOUT });
      await expect(chip).toHaveAttribute("title", workspace, { timeout: SCOUTING_TIMEOUT });
      await expect(menu).toBeHidden({ timeout: SCOUTING_TIMEOUT });
    });
    await walk();
  } finally {
    await scoutingCheck("QA workspace restoration failed", async () => {
      await openSwitcher();
      const restore = titleOf(previous);
      if ((await restore.getAttribute("aria-current", { timeout: SCOUTING_TIMEOUT })) !== "true") {
        await restore.click({ timeout: SCOUTING_TIMEOUT });
        await expect(chip).toHaveAttribute("title", previous, { timeout: SCOUTING_TIMEOUT });
        await expect(menu).toBeHidden({ timeout: SCOUTING_TIMEOUT });
      }
    });
  }
}

const scoutingTest = test.extend({ trace: "off", video: "off", screenshot: "off" });

test.describe("scouting first action", () => {
  scoutingTest("empty scouting opens the hiring form and the agency shared-needs view", async ({ browser, baseURL }) => {
    test.setTimeout(360_000);
    if (baseURL !== PRODUCTION_ORIGIN) {
      throw new Error("The scouting production walk requires the canonical production origin");
    }
    const fixtures = [
      { slot: "owner", workspace: /^QA-SYNTHETIC Beta(?: \(testinis subjektas\))?$/, door: "scouting-no-demands-cta" },
      { slot: "agency", workspace: "QA-SYNTHETIC Agentūra", door: "scouting-no-demands-partners" },
    ] as const;

    for (const fixture of fixtures) {
      await test.step(`${fixture.slot} opens the next working surface`, async () => {
        if (!existsSync(state(fixture.slot))) {
          throw new Error("QA fixture blocked: the existing QA session is missing");
        }
        const ctx = await scoutingCheck("QA fixture blocked: the existing QA session could not be opened", () =>
          browser.newContext({ storageState: state(fixture.slot), locale: "lt-LT" }),
        );
        try {
          const page = await scoutingCheck("The scouting browser page could not be opened", () => ctx.newPage());
          await inScoutingWorkspace(page, fixture.workspace, async () => {
            await scoutingCheck("The scouting page did not open in the selected QA workspace", async () => {
              const res = await page.goto(SCOUTING, { waitUntil: "domcontentloaded", timeout: SCOUTING_TIMEOUT });
              const url = new URL(page.url());
              expect(res?.ok() && url.origin === PRODUCTION_ORIGIN && url.pathname === SCOUTING).toBe(true);
            });
            const main = page.getByRole("main");
            const needRows = await scoutingCheck("The scouting need list could not be read", () =>
              main.locator('nav a[href*="/dashboard/company/scouting?request="]').count(),
            );
            if (needRows > 0) {
              throw new Error("QA fixture blocked: the scouting workspace now has needs");
            }
            const door = main.getByRole("link").and(main.getByTestId(fixture.door));
            await scoutingCheck("The expected empty scouting action was missing or could not be clicked", async () => {
              if (fixture.slot === "owner") {
                await expect(door).toHaveAttribute("data-need-door", "company_scouting_empty", { timeout: SCOUTING_TIMEOUT });
              }
              await door.click({ timeout: SCOUTING_TIMEOUT });
            });

            if (fixture.slot === "owner") {
              await scoutingCheck("The scouting action did not open the editable hiring form", async () => {
                await page.waitForURL(
                  (url) => url.origin === PRODUCTION_ORIGIN && url.pathname === "/lt/dashboard/company/needs" && url.hash === "#demand-intake",
                  { waitUntil: "domcontentloaded", timeout: SCOUTING_TIMEOUT },
                );
                const intake = main.getByTestId("demand-intake-section");
                const heading = intake.getByRole("heading", { name: "Ieškoti darbuotojo ar komandos", exact: true });
                await expect(heading).toBeVisible({ timeout: SCOUTING_TIMEOUT });
                const description = intake.getByTestId("demand-form").getByTestId("demand-description");
                await expect(description).toBeVisible({ timeout: SCOUTING_TIMEOUT });
                await expect(description).toBeEditable({ timeout: SCOUTING_TIMEOUT });
              });
            } else {
              await scoutingCheck("The scouting action did not open the agency's shared-needs view", async () => {
                await page.waitForURL(
                  (url) => url.origin === PRODUCTION_ORIGIN && url.pathname === "/lt/dashboard/company/partners",
                  { waitUntil: "domcontentloaded", timeout: SCOUTING_TIMEOUT },
                );
                const shared = main.getByTestId("company-partners").getByTestId("agency-bridge-shared");
                const heading = shared.getByRole("heading", { name: "Jums pasidalinti poreikiai", exact: true });
                await expect(heading).toBeVisible({ timeout: SCOUTING_TIMEOUT });
              });
            }
          });
        } finally {
          await scoutingCheck("The scouting browser context could not be closed", () => ctx.close());
        }
      });
    }
  });
});
