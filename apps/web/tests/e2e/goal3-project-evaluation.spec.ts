import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * GOAL 3 — EVALUATE THE DEMAND BEHIND A PLACE, proven in an authenticated
 * browser.
 *
 * Not a unit test in a browser costume: this drives the REAL authenticated
 * workspace with a real minted session, clicks a real marker on the canonical
 * MarketMap, and asserts on what the person actually sees. Tests alone cannot
 * prove this goal — the Goal 4 defect (a result that never opened because
 * `useSearchParams` returns empty outside a Suspense boundary) was invisible to
 * tsc, to vitest and to SQL, and visible immediately in a real session.
 *
 * WHAT IT PROVES SINCE 2026-09-05 — THE CANONICAL DEMAND DRILLDOWN. The list
 * behind a marker used to read `job_demands → projects`, a table that has held
 * 0 rows in production for its whole life, while the marker itself was built
 * from the ONE canonical demand read. Every real marker therefore opened onto
 * an empty list and depth 2 was unreachable. The drilldown now reads that same
 * canonical source — `customer_requests`, status 'submitted', through the
 * caller's own-rows policy and the worker-gated RPC — so this spec asserts the
 * two surfaces agree: a marker built from canonical demand opens a list of the
 * SAME rows, one row per NEED (a need has no project behind it, so it is never
 * folded into one), each declaring its provenance, and depth 2 addresses a real
 * `customer_requests` id. The demand-source line on screen is asserted verbatim
 * for the same reason: a surface naming one store while reading another is
 * precisely the drift that hid this defect.
 *
 * Requires the LOCAL stack and the acceptance dev server:
 *   npx supabase start
 *   pnpm -C apps/web db:fixtures:local
 *   E2E_OWNER_EMAIL=dev.worker@local.test pnpm tsx scripts/e2e-mint-session.ts
 *   pnpm -C apps/web dev:acceptance -- -p 3400
 *   E2E_BASE_URL=http://127.0.0.1:3400 pnpm -C apps/web exec playwright test \
 *     tests/e2e/goal3-project-evaluation.spec.ts
 *
 * Every counter this asserts is also RECORDED, so the evidence package quotes
 * observed numbers rather than claims.
 */

const SHOTS = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "goal3-project-evaluation");
const MARKET = "/lt/dashboard?result=market";
const ROTTERDAM = "NL%3Acity%3ARotterdam";
const EINDHOVEN = "NL%3Acity%3AEindhoven";
const GERMANY_APPROX = "DE%3Acountry";
const NO_MATCH = "LT%3Acity%3AVilnius";

/**
 * The seeded CANONICAL needs — `scripts/db-fixtures-local.ts`,
 * CANONICAL_DEMAND_SQL. Rotterdam's three are listed in the order the drilldown
 * sorts them (most open headcount first: 9 / 5 / 3), so an assertion on the
 * sequence is an assertion on that ordering rule too.
 *
 * These are ROLE TEXTS, not project titles. A canonical need has no project
 * behind it, so what the row shows is the employer's own words.
 */
const ROTTERDAM_ROLES = ["Suvirintojas", "Montuotojas", "Elektrikas"] as const;
const EINDHOVEN_ROLE = "Automatikos technikas";

/** `conversation.results.notStated` in the lt catalogue — how a gap is stated.
 *  Asserted on the ORGANISATION field, which the canonical contract genuinely
 *  does not carry: a blank there would read as data. */
const NOT_STATED = "nenurodyta";
/** `conversation.results.missing.organization` in the lt catalogue — the label
 *  the gap chip carries when a need has no organisation to name. */
const ORGANIZATION_LABEL = "organizacija";

test.use({ storageState: "tests/e2e/.storage-state.json", viewport: { width: 1440, height: 900 } });

/**
 * FILE-SCOPED, AND ONLY BECAUSE OF THE DEV SERVER.
 *
 * The default 5s expect timeout is enough for a built app and not enough for
 * `next dev`, which compiles a route on first request while eight scenarios
 * share one server. A back-navigation assertion failed once at 5s and passed
 * every time in isolation — that is compile latency, not a race in the
 * product, so the wait is widened rather than the assertion weakened. Nothing
 * here is retried and no assertion is skipped.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * Failed requests and console errors are counted for EVERY scenario — the
 * evidence package reports them, and a scenario that "passed" while the console
 * was full of errors has not passed.
 *
 * TWO CLASSES OF NOISE ARE SEPARATED RATHER THAN SILENCED, because a counter
 * that hides things is worse than no counter:
 *
 *  - `net::ERR_ABORTED` on a server action or an `_rsc` prefetch is the browser
 *    cancelling in-flight work when the URL changes, plus React's dev-only
 *    StrictMode double-invoke. Nothing failed; the request was withdrawn. These
 *    are counted separately and printed, never asserted to be zero.
 *  - Two console messages predate this work and are reproducible on the
 *    baseline commit: the report-only CSP notice about
 *    `upgrade-insecure-requests`, and a hydration mismatch on the composer's
 *    `caret-color` (no `caret` rule exists anywhere in this repo's source —
 *    it is injected into the page). They are listed by name so the allowance
 *    can never quietly widen.
 */
const PRE_EXISTING_CONSOLE = [
  /upgrade-insecure-requests.*report-only/i,
  /hydrated but some attributes of the server rendered HTML didn't match/i,
];

function instrument(page: Page) {
  const consoleErrors: string[] = [];
  const preExistingConsole: string[] = [];
  const failedRequests: string[] = [];
  const abortedRequests: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (PRE_EXISTING_CONSOLE.some((rx) => rx.test(text))) preExistingConsole.push(text);
    else consoleErrors.push(text);
  });
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "?";
    const line = `${r.method()} ${r.url()} — ${why}`;
    if (why.includes("ERR_ABORTED")) abortedRequests.push(line);
    else failedRequests.push(line);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  });
  return { consoleErrors, preExistingConsole, failedRequests, abortedRequests };
}

/** The assertion every scenario ends with. Named so the evidence package can
 *  quote one rule rather than five copies of it. */
function expectClean(counters: ReturnType<typeof instrument>) {
  expect(counters.failedRequests, counters.failedRequests.join("\n")).toEqual([]);
  expect(counters.consoleErrors, counters.consoleErrors.join("\n")).toEqual([]);
}

async function report(page: Page, label: string, counters: ReturnType<typeof instrument>) {
  const state = await page.evaluate(() => {
    const q = (s: string) => document.querySelector(s);
    return {
      url: location.href,
      panelTitle: q('[data-testid="context-panel"] h2')?.textContent ?? null,
      maps: document.querySelectorAll('[data-testid="market-map"]').length,
      leaflet: document.querySelectorAll(".leaflet-container").length,
      crumbPlace: q('[data-testid="crumb-place"]')?.textContent ?? null,
      crumbPrecision: q('[data-testid="crumb-place"]')?.getAttribute("data-geo-precision") ?? null,
      projectRows: document.querySelectorAll('[data-testid="project-row"]').length,
      projectsCount: q('[data-testid="projects-count"]')?.textContent ?? null,
      empty: !!q('[data-testid="projects-empty"]'),
      unsupported: !!q('[data-testid="projects-unsupported-precision"]'),
      error: !!q('[data-testid="projects-error"]') || !!q('[data-testid="evaluation-error"]'),
      errorCode:
        q('[data-testid="projects-error"]')?.getAttribute("data-error-code") ??
        q('[data-testid="evaluation-error"]')?.getAttribute("data-error-code") ??
        null,
      marketEmpty: !!q('[data-testid="market-empty"]'),
      marketError: !!q('[data-testid="market-error"]'),
      evaluation: !!q('[data-testid="project-evaluation"]'),
      notFound: !!q('[data-testid="evaluation-not-found"]'),
    };
  });
  // eslint-disable-next-line no-console
  console.log(
    `\n[GOAL3:${label}] ${JSON.stringify({
      ...state,
      consoleErrors: counters.consoleErrors.length,
      preExistingConsole: counters.preExistingConsole.length,
      failedRequests: counters.failedRequests.length,
      abortedRequests: counters.abortedRequests.length,
      failedDetail: counters.failedRequests.slice(0, 5),
      consoleDetail: counters.consoleErrors.slice(0, 5),
    })}`,
  );
  return state;
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

// ── Scenario A — Rotterdam ─────────────────────────────────────────────────

test("A — Rotterdam: market → projects → evaluation → continuation", async ({ page }) => {
  const counters = instrument(page);

  await page.goto(MARKET);
  await expect(page.getByTestId("market-map")).toBeVisible();
  await expect(page.getByTestId("market-map")).toHaveAttribute("data-map-origin", "live");
  // The proven Goal 4 state: one map, no empty, no fallback.
  expect(await page.locator('[data-testid="market-map"]').count()).toBe(1);
  await expect(page.getByTestId("market-empty")).toHaveCount(0);
  await expect(page.getByTestId("market-error")).toHaveCount(0);
  await report(page, "A0-market", counters);
  await page.screenshot({ path: join(SHOTS, "A0-market-1440.png"), fullPage: false });

  // A REAL CLICK on a REAL anchor — not a URL typed by the test.
  const rotterdam = page.locator('[data-anchor-id="NL-Rotterdam"]');
  await expect(rotterdam).toHaveAttribute("data-anchor-precision", "city");
  await rotterdam.click();

  await expect(page.getByTestId("projects-view")).toBeVisible();
  // The click produced a CITY-precision selection, in the URL.
  await expect(page).toHaveURL(new RegExp(`geo=${ROTTERDAM}`));
  await expect(page.getByTestId("crumb-place")).toHaveText("Rotterdam, NL");
  await expect(page.getByTestId("crumb-place")).toHaveAttribute("data-geo-precision", "city");

  // Three Rotterdam NEEDS — ONE ROW PER CANONICAL DEMAND ROW, the acceptance
  // seed's "several needs in the one selected city". Not one row: two needs
  // from the same place are two commitments with two headcounts, and folding
  // them into a single unit would invent a third that nobody created.
  const rows = page.getByTestId("project-row");
  await expect(rows).toHaveCount(3);
  // And ONLY Rotterdam: every row states the city it matched on.
  for (const text of await rows.allTextContents()) {
    expect(text).toContain("Rotterdam");
  }
  // EVERY listed row declares WHICH STORE it came from. A need rendered under
  // the word "project" would claim a structure the row does not have.
  expect(
    await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-unit-kind"))),
  ).toEqual(["need", "need", "need"]);
  const firstBadge = rows.first().getByTestId("unit-kind-badge");
  await expect(firstBadge).toBeVisible();
  await expect(firstBadge).toHaveAttribute("data-unit-kind", "need");
  // The name on a need row is the employer's OWN role text — a need has no
  // project title — in the loader's order, most open headcount first.
  const rowTexts = await rows.allTextContents();
  for (const [i, role] of ROTTERDAM_ROLES.entries()) {
    expect(rowTexts[i]).toContain(role);
  }
  // …and the organisation is an EXPLICIT GAP, because neither authorized read
  // carries the employer's identity. Not blank, not a dash, not a guess.
  expect(rowTexts[0]).toContain(`${NOT_STATED} · Rotterdam, NL`);
  // No map at this depth.
  await expect(page.getByTestId("market-map")).toHaveCount(0);
  const a1 = await report(page, "A1-projects", counters);
  expect(a1.leaflet).toBe(0);
  await page.screenshot({ path: join(SHOTS, "A1-projects-rotterdam-1440.png") });

  // ── the evaluation ──────────────────────────────────────────────────────
  const firstRowId = await rows.first().getAttribute("data-project-id");
  await rows.first().click();
  await expect(page.getByTestId("project-evaluation")).toBeVisible();
  // The depth-2 address is the unit's canonical id IN ITS OWN STORE — now a
  // `customer_requests` id rather than a `projects` id, still uuid-shaped, and
  // still the row that was clicked rather than a synthesised key.
  await expect(page).toHaveURL(/project=[0-9a-f-]{36}/);
  expect(new URL(page.url()).searchParams.get("project")).toBe(firstRowId);

  // Every section the command names.
  for (const section of [
    "eval-demand-list",
    "eval-anchor-relation",
    "eval-visibility",
    "eval-no-judgement",
  ]) {
    await expect(page.getByTestId(section)).toBeVisible();
  }
  // The explanation is the deterministic match reason, carrying the real city.
  await expect(page.getByTestId("eval-anchor-relation")).toContainText("Rotterdam");
  await expect(page.getByTestId("eval-no-judgement")).toBeVisible();
  // A canonical need IS one need: the evaluation lists it as itself instead of
  // splitting it into sub-needs it does not have.
  await expect(page.getByTestId("eval-demand-list").locator("li")).toHaveCount(1);
  // The employer's identity is outside both authorized reads — stated as a gap
  // here too, on the section whose whole subject it is.
  // A need carries no organisation, and the panel says so as an explicit gap
  // chip rather than an empty field. (There is no `eval-organization` test id —
  // asserting one is how this spec silently stopped checking anything.)
  await expect(
    page.getByTestId("eval-missing-field").filter({ hasText: ORGANIZATION_LABEL }),
  ).toHaveCount(1);
  // THE SOURCE LINE NAMES WHAT WAS ACTUALLY READ. `job_demands` must not appear
  // on it: a surface naming one store while reading another is exactly the
  // drift that left this list empty for every real user.
  const source = page.getByTestId("demand-source");
  await expect(source).toContainText("canonical demand");
  await expect(source).toContainText("customer_requests");
  await expect(source).toContainText("submitted");
  await expect(source).not.toContainText("job_demands");
  await report(page, "A2-evaluation", counters);
  await page.screenshot({ path: join(SHOTS, "A2-evaluation-1440.png") });

  // ── the continuation to people ──────────────────────────────────────────
  await page.getByTestId("continue-to-people").click();
  const people = page.getByTestId("people-continuation");
  await expect(people).toBeVisible();
  // It carries the SELECTED project's real context, not a fake list.
  const projectId = new URL(page.url()).searchParams.get("project")!;
  await expect(people).toContainText(projectId);
  await expect(people).toContainText("Rotterdam, NL");
  await report(page, "A3-people-continuation", counters);
  await page.screenshot({ path: join(SHOTS, "A3-people-continuation-1440.png") });

  expectClean(counters);
});

// ── Scenario B — another geography ─────────────────────────────────────────

test("B — the result changes with the place, and Rotterdam-only rows disappear", async ({
  page,
}) => {
  const counters = instrument(page);

  await page.goto(`${MARKET}&geo=${ROTTERDAM}`);
  await expect(page.getByTestId("project-row")).toHaveCount(3);
  const rotterdamTitles = await page.getByTestId("project-row").allTextContents();

  // Eindhoven — a different CITY anchor. ONE need there, and it is a different
  // need: not a Rotterdam row that survived the change of place.
  await page.goto(`${MARKET}&geo=${EINDHOVEN}`);
  await expect(page.getByTestId("projects-view")).toBeVisible();
  const eindhoven = page.getByTestId("project-row");
  await expect(eindhoven).toHaveCount(1);
  for (const text of await eindhoven.allTextContents()) {
    expect(text).toContain("Eindhoven");
    expect(text).toContain(EINDHOVEN_ROLE);
    expect(text).not.toContain("Rotterdam");
    expect(rotterdamTitles).not.toContain(text);
  }
  await expect(eindhoven.first()).toHaveAttribute("data-unit-kind", "need");
  await report(page, "B1-eindhoven", counters);
  await page.screenshot({ path: join(SHOTS, "B1-eindhoven-1440.png") });

  // Germany at COUNTRY precision — the approximate aggregate the dashed
  // marker represents, which is the unresolved-geography case.
  await page.goto(`${MARKET}&geo=${GERMANY_APPROX}`);
  await expect(page.getByTestId("crumb-place")).toHaveAttribute(
    "data-geo-precision",
    "country",
  );
  const german = page.getByTestId("project-row");
  await expect(german).toHaveCount(1);
  // Duisburg is not in the canonical city table; Hamburg IS — and the seed
  // carries a Hamburg need on purpose, so "Hamburg must not appear here" is a
  // real negative control rather than an assertion about an absent row.
  const germanText = (await german.allTextContents()).join(" ");
  expect(germanText).toContain("Duisburg");
  expect(germanText).not.toContain("Hamburg");
  await expect(german.first().getByTestId("precision-badge")).toBeVisible();
  await expect(german.first()).toHaveAttribute("data-unit-kind", "need");
  await report(page, "B2-germany-country", counters);
  await page.screenshot({ path: join(SHOTS, "B2-germany-country-1440.png") });

  expectClean(counters);
});

// ── Scenario C — empty ─────────────────────────────────────────────────────

test("C — a valid place with no projects says so, and shows nothing else", async ({ page }) => {
  const counters = instrument(page);

  await page.goto(`${MARKET}&geo=${NO_MATCH}`);
  await expect(page.getByTestId("projects-empty")).toBeVisible();
  await expect(page.getByTestId("projects-empty")).toContainText("Vilnius");
  // No fallback, no fake project, no borrowed landing scenario.
  await expect(page.getByTestId("project-row")).toHaveCount(0);
  await expect(page.getByTestId("projects-error")).toHaveCount(0);
  await expect(page.getByTestId("market-map")).toHaveCount(0);
  // The place is still visible and the way back still works.
  await expect(page.getByTestId("crumb-place")).toHaveText("Vilnius, LT");
  await report(page, "C-empty", counters);
  await page.screenshot({ path: join(SHOTS, "C-empty-1440.png") });

  expectClean(counters);
});

// ── Scenario D — refresh and back ──────────────────────────────────────────

test("D — every depth survives refresh, and Back steps up one depth", async ({ page }) => {
  const counters = instrument(page);

  // Reach the depth by CLICKING, so the history has the market entry the Back
  // assertions below depend on. Deep-linking straight to `&geo=` would give
  // Back nothing to return to and the test would prove the wrong thing.
  await page.goto(MARKET);
  await expect(page.getByTestId("market-map")).toBeVisible();
  await page.locator('[data-anchor-id="NL-Rotterdam"]').click();
  await expect(page.getByTestId("project-row")).toHaveCount(3);

  // REFRESH at the project-list depth.
  await page.reload();
  await expect(page.getByTestId("projects-view")).toBeVisible();
  await expect(page.getByTestId("project-row")).toHaveCount(3);
  await expect(page.getByTestId("crumb-place")).toHaveText("Rotterdam, NL");
  await report(page, "D1-refresh-projects", counters);

  // Open a project, then REFRESH at the evaluation depth.
  await page.getByTestId("project-row").first().click();
  await expect(page.getByTestId("project-evaluation")).toBeVisible();
  const deepUrl = page.url();
  await page.reload();
  await expect(page.getByTestId("project-evaluation")).toBeVisible();
  expect(page.url()).toBe(deepUrl);
  await report(page, "D2-refresh-evaluation", counters);
  await page.screenshot({ path: join(SHOTS, "D2-refresh-evaluation-1440.png") });

  // BROWSER BACK returns to the project list, not out of the workspace.
  await page.goBack();
  await expect(page.getByTestId("projects-view")).toBeVisible();
  await expect(page.getByTestId("project-row")).toHaveCount(3);
  await report(page, "D3-back-to-projects", counters);

  // BROWSER BACK again returns to the market, with the map restored.
  await page.goBack();
  await expect(page.getByTestId("market-map")).toBeVisible();
  await expect(page.getByTestId("market-map")).toHaveAttribute("data-map-origin", "live");
  await report(page, "D4-back-to-market", counters);

  // The in-panel back control does the same thing, one depth at a time.
  await page.locator('[data-anchor-id="NL-Rotterdam"]').click();
  await expect(page.getByTestId("projects-view")).toBeVisible();
  await page.getByTestId("result-back").click();
  await expect(page.getByTestId("market-map")).toBeVisible();
  await report(page, "D5-in-panel-back", counters);

  expectClean(counters);
});

// ── mobile ─────────────────────────────────────────────────────────────────

test("mobile — the drill-down does not overflow horizontally", async ({ page }) => {
  const counters = instrument(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${MARKET}&geo=${ROTTERDAM}`);
  await expect(page.getByTestId("projects-view")).toBeVisible();
  const overflowProjects = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowProjects, "project list overflows horizontally").toBeLessThanOrEqual(0);
  await page.screenshot({ path: join(SHOTS, "M1-projects-390.png") });

  await page.getByTestId("project-row").first().click();
  await expect(page.getByTestId("project-evaluation")).toBeVisible();
  const overflowEval = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowEval, "evaluation overflows horizontally").toBeLessThanOrEqual(0);
  await report(page, "M-mobile", counters);
  await page.screenshot({ path: join(SHOTS, "M2-evaluation-390.png") });

  expectClean(counters);
});

// ── Scenario E — a controlled query failure ────────────────────────────────

/**
 * The failure is caused in the DATABASE, not in the code, because a code path
 * that only fails when a test flag is set proves nothing about the real one.
 * `select` on `public.customer_requests` is revoked from the `authenticated`
 * role, so the caller's OWN-ROWS leg of the canonical demand read genuinely
 * cannot be read — exactly what a broken grant, a bad migration or an outage
 * would do.
 *
 * RE-ANCHORED WITH THE READ IT BREAKS (2026-09-05). This used to revoke
 * `public.projects`, which the drilldown no longer touches at all: the same
 * revoke would now leave the list working and the scenario would silently stop
 * testing anything. A negative control has to be aimed at the read that
 * actually exists, so it follows the read.
 *
 * LOCAL ONLY, AND REVERSIBLE. The container name below exists only on a local
 * Supabase stack, the base URL is asserted to be loopback first, and the grant
 * is restored in `finally` and re-verified afterwards. Nothing production-shaped
 * is touched.
 */
function psql(sql: string): string {
  const res = spawnSync(
    "docker",
    ["exec", "-i", "supabase_db_labourmarketai", "psql", "-U", "postgres", "-d", "postgres", "-qtA", "-c", sql],
    { encoding: "utf8" },
  );
  if (res.status !== 0) throw new Error(`psql failed: ${res.stderr}`);
  return (res.stdout ?? "").trim();
}

test("E — a failed read is stated, and never falls back to rows or emptiness", async ({
  page,
  baseURL,
}) => {
  // Refuse to run anywhere that is not the local stack.
  expect(baseURL ?? "").toMatch(/^http:\/\/127\.0\.0\.1:/);
  const counters = instrument(page);

  // Prove the healthy state first, so the failure is a CHANGE and not the
  // starting condition.
  await page.goto(`${MARKET}&geo=${ROTTERDAM}`);
  await expect(page.getByTestId("project-row")).toHaveCount(3);

  try {
    psql("revoke select on public.customer_requests from authenticated;");
    await page.reload();

    const error = page.getByTestId("projects-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute("data-error-code", "project_query_failed");
    // NOT a stale list, NOT an empty state, NOT a fixture row.
    await expect(page.getByTestId("project-row")).toHaveCount(0);
    await expect(page.getByTestId("projects-empty")).toHaveCount(0);
    await expect(page.getByTestId("projects-list")).toHaveCount(0);
    // The place is still visible and the way back still works while broken.
    await expect(page.getByTestId("crumb-place")).toHaveText("Rotterdam, NL");
    await expect(page.getByTestId("result-back")).toBeVisible();
    await report(page, "E1-projects-error", counters);
    await page.screenshot({ path: join(SHOTS, "E1-projects-error-1440.png") });

    // The market result answers the same way — a failed read is not "no demand".
    await page.goto(MARKET);
    await expect(page.getByTestId("market-error")).toBeVisible();
    await expect(page.getByTestId("market-empty")).toHaveCount(0);
    await expect(page.getByTestId("market-map")).toHaveCount(0);
    await report(page, "E2-market-error", counters);
    await page.screenshot({ path: join(SHOTS, "E2-market-error-1440.png") });
  } finally {
    psql("grant select on public.customer_requests to authenticated;");
    // Belt and braces: PostgREST keeps a permission-aware schema cache, and a
    // privilege change is exactly the kind of thing it is built from. Measured
    // recovery here is immediate without it, but leaving a stale cache behind
    // would poison the NEXT run rather than this one — the worst kind of
    // failure to debug.
    psql("notify pgrst, 'reload schema';");
  }

  // …and the product recovers on its own once the grant is back.
  await page.goto(`${MARKET}&geo=${ROTTERDAM}`);
  await expect(page.getByTestId("project-row")).toHaveCount(3);
  await expect(page.getByTestId("projects-error")).toHaveCount(0);
  await report(page, "E3-recovered", counters);

  expectClean(counters);
});

// ── the two remaining honest-degradation states ────────────────────────────

test("F — an unanswerable precision and an invented token both degrade honestly", async ({
  page,
}) => {
  const counters = instrument(page);

  // REGION: the data has a country and a city and no subdivision, so this is a
  // gap in us. It must not render as "no projects here".
  await page.goto(`${MARKET}&geo=NL%3Aregion%3ARandstad`);
  await expect(page.getByTestId("projects-unsupported-precision")).toBeVisible();
  await expect(page.getByTestId("projects-empty")).toHaveCount(0);
  await expect(page.getByTestId("project-row")).toHaveCount(0);
  await expect(page.getByTestId("crumb-place")).toHaveText("Randstad, NL");
  await report(page, "F1-region-unsupported", counters);
  await page.screenshot({ path: join(SHOTS, "F1-region-unsupported-1440.png") });

  // A HAND-TYPED FABRICATION: a country selection wearing a city name. It is
  // rejected outright, so the workspace falls back to the market rather than
  // querying a place nobody selected.
  await page.goto(`${MARKET}&geo=NL%3Acountry%3ARotterdam`);
  await expect(page.getByTestId("market-map")).toBeVisible();
  await expect(page.getByTestId("crumb-place")).toHaveCount(0);
  await expect(page.getByTestId("project-row")).toHaveCount(0);
  await report(page, "F2-rejected-token", counters);

  // A project id without a place is not a state this product has.
  await page.goto(`${MARKET}&project=2b000000-0000-0000-0000-000000000001`);
  await expect(page.getByTestId("market-map")).toBeVisible();
  await expect(page.getByTestId("project-evaluation")).toHaveCount(0);
  await report(page, "F3-project-without-place", counters);

  expectClean(counters);
});

test("G — the selected place stays visible while the evaluation is scrolled", async ({
  page,
}) => {
  const counters = instrument(page);

  await page.goto(`${MARKET}&geo=${ROTTERDAM}`);
  await page.getByTestId("project-row").first().click();
  await expect(page.getByTestId("project-evaluation")).toBeVisible();

  // Scroll the panel to the bottom of the evaluation.
  await page.getByTestId("continue-to-people").click();
  await page.locator("#context-panel-body").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByTestId("people-continuation")).toBeVisible();

  // The place is STILL on screen, inside the panel's own viewport.
  const crumb = page.getByTestId("crumb-place");
  await expect(crumb).toBeInViewport();
  const inPanel = await page.evaluate(() => {
    const body = document.querySelector("#context-panel-body")!.getBoundingClientRect();
    const c = document.querySelector('[data-testid="crumb-place"]')!.getBoundingClientRect();
    return c.top >= body.top - 1 && c.bottom <= body.bottom + 1;
  });
  expect(inPanel, "the breadcrumb scrolled out of the panel").toBe(true);
  await report(page, "G-sticky-place", counters);
  await page.screenshot({ path: join(SHOTS, "G-sticky-place-1440.png") });

  expectClean(counters);
});
