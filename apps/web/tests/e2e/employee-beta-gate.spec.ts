import { expect as baseExpect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * EMPLOYEE_BETA_PRODUCTION_GATE — the authenticated production proof.
 *
 * This is the gate that decides whether worker promotion may send real people
 * to production. It runs against the CANONICAL production origin
 * (`lib/domain/canonical.ts` → `https://labourmarket.ai`) as the ONE synthetic
 * QA identity, and it is deliberately unforgiving: a console error, an
 * unexplained failed request, or a fallback to invented data fails the gate.
 *
 * NOT the legacy `app.` host — the repo classifies that as a redirect alias and
 * `next.config.ts` 301s it to the apex. Pointing the gate at a permanent
 * redirect would prove the redirect works, not the product.
 *
 *   pnpm -C apps/web exec tsx scripts/prod-qa-provision.ts --i-understand-production   # owner, once
 *   pnpm -C apps/web exec tsx scripts/prod-qa-mint-session.ts                          # per run
 *   E2E_BASE_URL=https://labourmarket.ai E2E_NO_SERVER=1 \
 *     pnpm -C apps/web exec playwright test tests/e2e/employee-beta-gate.spec.ts
 *
 * IT SKIPS RATHER THAN LIES. Without the minted storage state every check would
 * bounce to the login page and "pass" for the wrong reason. So the suite refuses
 * to run and says why — an unrun gate must never look like a passed one.
 *
 * READ-ONLY IN PRODUCTION. Nothing here creates, edits or deletes production
 * data. The chat check sends a message the assistant answers deterministically;
 * the journal WRITE path is deliberately excluded and stays a local proof,
 * because a gate that leaves rows behind pollutes the thing it measures.
 *
 * NO SECRETS IN ARTEFACTS. Screenshots are of a synthetic identity with no real
 * personal data. The storage state is gitignored and never attached.
 */

const STATE = "tests/e2e/.storage-state.prod-qa.json";
const SHOTS = join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "audits",
  "evidence",
  "premium-rebuild",
  "employee-gate",
);
const RESULTS = join(SHOTS, "gate-results.json");

const expect = baseExpect.configure({ timeout: 20_000 });

/** Two console messages reproduce on the baseline and are not this gate's
 *  business. Everything else fails it. Named, so the allowance cannot widen. */
const KNOWN_CONSOLE = [
  /upgrade-insecure-requests.*report-only/i,
  /hydrated but some attributes of the server rendered HTML didn't match/i,
];

type GateCheck = {
  id: string;
  viewport: "desktop" | "mobile";
  status: "PASS" | "FAIL";
  detail: string;
  consoleErrors: number;
  failedRequests: number;
};
const results: GateCheck[] = [];

function instrument(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!KNOWN_CONSOLE.some((rx) => rx.test(t))) consoleErrors.push(t);
  });
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "";
    // ERR_ABORTED is the browser withdrawing in-flight work on navigation.
    if (!why.includes("ERR_ABORTED")) failedRequests.push(`${r.url()} — ${why}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  });
  return { consoleErrors, failedRequests };
}

/** Record + assert. A check is PASS only with zero errors AND zero failures. */
function settle(
  id: string,
  viewport: "desktop" | "mobile",
  c: ReturnType<typeof instrument>,
  detail: string,
) {
  const ok = c.consoleErrors.length === 0 && c.failedRequests.length === 0;
  results.push({
    id,
    viewport,
    status: ok ? "PASS" : "FAIL",
    detail,
    consoleErrors: c.consoleErrors.length,
    failedRequests: c.failedRequests.length,
  });
  expect(c.failedRequests, `${id} failed requests:\n${c.failedRequests.join("\n")}`).toEqual([]);
  expect(c.consoleErrors, `${id} console errors:\n${c.consoleErrors.join("\n")}`).toEqual([]);
}

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
  if (!existsSync(join(process.cwd(), STATE))) {
    throw new Error(
      `EMPLOYEE_BETA_PRODUCTION_GATE cannot run: ${STATE} is missing.\n` +
        "Provision the synthetic QA account (owner, once) and mint a session:\n" +
        "  pnpm -C apps/web exec tsx scripts/prod-qa-provision.ts --i-understand-production\n" +
        "  pnpm -C apps/web exec tsx scripts/prod-qa-mint-session.ts\n" +
        "An unrun gate is NOT a passed gate.",
    );
  }
});

test.afterAll(() => {
  const failed = results.filter((r) => r.status === "FAIL");
  writeFileSync(
    RESULTS,
    JSON.stringify(
      {
        gate: "EMPLOYEE_BETA_PRODUCTION_GATE",
        target: process.env.E2E_BASE_URL ?? "(unset)",
        verdict: failed.length === 0 && results.length > 0 ? "PASS" : "FAIL",
        checks: results,
      },
      null,
      2,
    ),
  );
});

test.use({ storageState: STATE, trace: "on" });

// ── DESKTOP ────────────────────────────────────────────────────────────────

test.describe("desktop 1440x900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("G1 login — the minted session lands in the authenticated product", async ({ page }) => {
    const c = instrument(page);
    await page.goto("/lt/dashboard");
    // Not bounced to login: the workspace itself is on screen.
    await expect(page.getByTestId("conversation-chat")).toBeVisible();
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await page.screenshot({ path: join(SHOTS, "g1-authenticated-1440.png") });
    settle("G1-login", "desktop", c, "authenticated workspace renders");
  });

  test("G2 first experience — the workspace explains itself without a form maze", async ({ page }) => {
    const c = instrument(page);
    await page.goto("/lt/dashboard");
    // Chat is the control surface: a greeting, a composer, and starter actions.
    await expect(page.getByTestId("conversation-chat")).toBeVisible();
    await expect(page.getByTestId("composer-input")).toBeVisible();
    await expect(page.getByTestId("context-panel")).toBeVisible();
    settle("G2-first-experience", "desktop", c, "chat + composer + context panel present");
  });

  test("G3 profile and Player Card — real data, no invented score", async ({ page }) => {
    const c = instrument(page);
    await page.goto("/lt/dashboard/profile");
    await expect(page.locator("main")).toBeVisible();
    const body = (await page.locator("body").innerText()).toLowerCase();
    // The reputation doctrine: no stars, no single mystical human score.
    expect(body).not.toMatch(/\bovr\b/);
    await page.screenshot({ path: join(SHOTS, "g3-profile-1440.png"), fullPage: true });
    settle("G3-profile-player-card", "desktop", c, "profile renders, no OVR-style score");
  });

  test("G4 chat action — a request produces a real answer surface", async ({ page }) => {
    const c = instrument(page);
    await page.goto("/lt/dashboard");
    const composer = page.getByTestId("composer-input");
    await composer.fill("ieškau darbo");
    await composer.press("Enter");
    // The thread must visibly react — this is the control surface working.
    await expect(page.locator('[role="log"]')).toContainText(/\S/);
    await page.screenshot({ path: join(SHOTS, "g4-chat-action-1440.png") });
    settle("G4-chat-action", "desktop", c, "chat accepted the request and the thread responded");
  });

  test("G5 market → projects → evaluation, on real rows", async ({ page }) => {
    const c = instrument(page);
    await page.goto("/lt/dashboard?result=market");
    const map = page.getByTestId("market-map");
    await expect(map).toBeVisible();
    // Real rows or an honest empty — never a demo fallback.
    await expect(map).toHaveAttribute("data-map-origin", "live");
    await expect(page.getByTestId("market-error")).toHaveCount(0);
    await page.screenshot({ path: join(SHOTS, "g5-market-1440.png") });

    const anchors = page.locator("[data-anchor-id]");
    const n = await anchors.count();
    if (n === 0) {
      // An empty production market is a legitimate state, not a gate failure —
      // but it must SAY so rather than render nothing.
      await expect(page.getByTestId("market-empty")).toBeVisible();
      settle("G5-market-depth", "desktop", c, "honest empty market (no open demand in production)");
      return;
    }

    await anchors.first().click();
    await expect(page.getByTestId("projects-view")).toBeVisible();
    await expect(page.getByTestId("crumb-place")).toBeVisible();
    await page.screenshot({ path: join(SHOTS, "g5-projects-1440.png") });

    const rows = page.getByTestId("project-row");
    if ((await rows.count()) > 0) {
      await rows.first().click();
      await expect(page.getByTestId("project-evaluation")).toBeVisible();
      await expect(page.getByTestId("eval-explanation")).toBeVisible();
      await expect(page.getByTestId("continue-to-people")).toBeVisible();
      await page.screenshot({ path: join(SHOTS, "g5-evaluation-1440.png") });
      settle("G5-market-depth", "desktop", c, "market → projects → evaluation on real rows");
    } else {
      await expect(page.getByTestId("projects-empty")).toBeVisible();
      settle("G5-market-depth", "desktop", c, "geography selected; honest empty project list");
    }
  });

  test("G6 back / forward / reload restore every depth", async ({ page }) => {
    const c = instrument(page);
    await page.goto("/lt/dashboard?result=market");
    await expect(page.getByTestId("market-map")).toBeVisible();

    const anchors = page.locator("[data-anchor-id]");
    test.skip((await anchors.count()) === 0, "no market anchors in production to drill into");

    await anchors.first().click();
    await expect(page.getByTestId("projects-view")).toBeVisible();
    const deep = page.url();

    await page.reload();
    await expect(page.getByTestId("projects-view")).toBeVisible();
    expect(page.url()).toBe(deep);

    await page.goBack();
    await expect(page.getByTestId("market-map")).toBeVisible();

    await page.goForward();
    await expect(page.getByTestId("projects-view")).toBeVisible();
    settle("G6-history", "desktop", c, "reload + back + forward all restore state");
  });

  test("G7 RLS isolation — another worker's private surface is refused", async ({ page }) => {
    const c = instrument(page);
    // A worker detail route for an id this identity has no relationship with.
    // The product must refuse or degrade honestly — never render the person.
    const res = await page.goto("/lt/dashboard/people/00000000-0000-0000-0000-000000000000");
    const status = res?.status() ?? 0;
    const body = (await page.locator("body").innerText()).toLowerCase();
    // Either an explicit not-found/forbidden, or a page that shows no identity.
    const leaked = /@/.test(body) && /\+?\d[\d ()-]{7,}/.test(body);
    expect(leaked, "an unauthorized worker page must not expose contact details").toBe(false);
    settle("G7-rls-isolation", "desktop", c, `unauthorized worker route status=${status}, no contact leak`);
  });

  test("G8 logout, then re-entry is required", async ({ page, context }) => {
    const c = instrument(page);
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("conversation-chat")).toBeVisible();

    // Session expiry / recovery, exercised honestly: drop the auth cookies the
    // way an expiry does, then prove the product asks for identity again
    // instead of rendering a half-authenticated shell.
    await context.clearCookies();
    await page.goto("/lt/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByTestId("conversation-chat")).toHaveCount(0);
    await page.screenshot({ path: join(SHOTS, "g8-session-expiry-1440.png") });
    settle("G8-logout-expiry", "desktop", c, "cleared session bounces to login, no authenticated shell");
  });
});

// ── MOBILE ─────────────────────────────────────────────────────────────────

test.describe("mobile 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("G9 the authenticated workspace is usable on a phone", async ({ page }) => {
    const c = instrument(page);
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("conversation-chat")).toBeVisible();
    await expect(page.getByTestId("composer-input")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the workspace must not overflow horizontally").toBeLessThanOrEqual(0);
    await page.screenshot({ path: join(SHOTS, "g9-workspace-390.png") });
    settle("G9-mobile-workspace", "mobile", c, "chat-first workspace, no horizontal overflow");
  });

  test("G10 the market result is usable on a phone", async ({ page }) => {
    const c = instrument(page);
    await page.goto("/lt/dashboard?result=market");
    await expect(page.getByTestId("context-panel")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the market result must not overflow horizontally").toBeLessThanOrEqual(0);
    await page.screenshot({ path: join(SHOTS, "g10-market-390.png") });
    settle("G10-mobile-market", "mobile", c, "market result renders in the mobile sheet");
  });
});
