import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 — THE CALENDAR RESULT: browser proof.
 *
 * `calendar` was the one `dataReadiness: "real"` result kind with no
 * `ResultBody` case. This spec proves the panel presentation against REAL
 * seeded booking data through the canonical Time Engine projection:
 *
 *   - `?result=calendar` deep link renders the panel result (URL persistence
 *     is the workspace's existing mechanism — reload and Back/Forward hold);
 *   - the seeded REAL booking appears as a real agenda line;
 *   - an empty window is SAID, not decorated;
 *   - the full calendar stays one action away (`/dashboard/planning`);
 *   - desktop and 375px mobile;
 *   - 0 console errors, 0 unexplained failed requests.
 */

const SHOTS = process.env.E2E_SHOTS_DIR
  ? join(process.cwd(), "..", "..", process.env.E2E_SHOTS_DIR)
  : join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-rebuild", "w3");

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

const WORKER_PROFILE_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const COMPANY_USER_ID = "aaaaaaaa-0000-0000-0000-000000000002";
const REQUEST_ID = "99999999-0000-0000-0000-000000000001";

async function db(
  method: "POST" | "DELETE" | "GET",
  path: string,
  body?: unknown,
): Promise<Response> {
  if (!SUPA_URL || !SUPA_SERVICE) throw new Error("local stack env missing");
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing to seed a non-local target: ${SUPA_URL}`);
  }
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function fixtureWorkerRowId(): Promise<string> {
  const r = await db("GET", `workers?profile_id=eq.${WORKER_PROFILE_ID}&select=id`);
  const rows = (await r.json()) as Array<{ id: string }>;
  if (!rows[0]) throw new Error("fixture worker has no workers row");
  return rows[0].id;
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** Seed ONE real proposed booking inside the agenda window. */
async function seedWindowBooking(): Promise<void> {
  const r = await db("POST", "booking_requests", {
    owner_id: COMPANY_USER_ID,
    request_id: REQUEST_ID,
    worker_id: await fixtureWorkerRowId(),
    status: "proposed",
    start_date: isoDay(2),
    expected_end_date: isoDay(5),
    location_country: "NL",
    role_text: "E2E kalendoriaus rezultatas",
  });
  if (!r.ok) throw new Error(`seed booking failed: ${await r.text()}`);
}

async function clearBookings(): Promise<void> {
  await db("DELETE", `booking_requests?request_id=eq.${REQUEST_ID}`);
}

/** Pre-existing, named console allowances (see goal3 spec) — never widened. */
const PRE_EXISTING_CONSOLE = [
  /upgrade-insecure-requests/i,
  /hydrated but some attributes of the server rendered HTML didn't match/i,
];

function watch(page: Page) {
  const consoleErrors: string[] = [];
  const failed: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !PRE_EXISTING_CONSOLE.some((rx) => rx.test(m.text()))) {
      consoleErrors.push(m.text());
    }
  });
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "";
    if (!why.includes("ERR_ABORTED")) failed.push(`${r.url()} — ${why}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  return {
    assertClean() {
      expect(failed, failed.join("\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    },
  };
}

test.use({
  storageState: "tests/e2e/.storage-state.json",
  viewport: { width: 1440, height: 900 },
});
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

test.describe("W3 — the calendar result renders the Time Engine in the panel", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");

  test.beforeAll(clearBookings);
  test.afterAll(clearBookings);

  test("empty window: the absence is SAID, and the full calendar stays reachable", async ({
    page,
  }) => {
    // The fixture worker carries ONE dated commitment — the approved leave
    // band (worker_absences, fixture id abababab-…-01). A genuinely empty
    // window therefore requires lifting it; it is SNAPSHOTTED verbatim and
    // restored in `finally`, so every later test still sees the fixture.
    const workerRowId = await fixtureWorkerRowId();
    const snapRes = await db(
      "GET",
      `worker_absences?worker_id=eq.${workerRowId}&select=*`,
    );
    const snapshot = (await snapRes.json()) as Array<Record<string, unknown>>;
    await db("DELETE", `worker_absences?worker_id=eq.${workerRowId}`);
    try {
      const w = watch(page);
      await page.goto("/lt/dashboard?result=calendar");

      const panel = page.getByTestId("context-panel");
      await expect(panel).toBeVisible();

      // The honest empty state, with real zero counts — never a decorated
      // zero, never an invented item.
      const empty = page.getByTestId("calendar-result-empty");
      await expect(empty).toBeVisible({ timeout: 40_000 });
      await expect(empty).toContainText(/14/); // the real window size, stated

      await expect(page.getByTestId("calendar-result-open-full")).toBeVisible();
      w.assertClean();
    } finally {
      if (snapshot.length > 0) {
        const restore = await db("POST", "worker_absences", snapshot);
        if (!restore.ok) {
          throw new Error(`restoring fixture absences failed: ${await restore.text()}`);
        }
      }
    }
  });

  test("a REAL seeded booking renders as a real agenda line; reload and Back/Forward hold", async ({
    page,
  }) => {
    const w = watch(page);
    await seedWindowBooking();

    await page.goto("/lt/dashboard?result=calendar");
    const result = page.getByTestId("calendar-result");
    await expect(result).toBeVisible({ timeout: 40_000 });

    // The seeded booking is a REAL line: the booking source noun + the real
    // role text, exactly what the projection carries.
    await expect(result).toContainText("E2E kalendoriaus rezultatas");

    await page.screenshot({ path: join(SHOTS, "calendar-result-1440.png") });

    // RELOAD: `?result=` is the workspace's URL persistence — the result
    // survives a full page load.
    await page.reload();
    await expect(page.getByTestId("calendar-result")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("calendar-result")).toContainText(
      "E2E kalendoriaus rezultatas",
    );

    // BACK/FORWARD across a result switch.
    await page.goto("/lt/dashboard?result=player-card");
    await expect(page.getByTestId("calendar-result")).toHaveCount(0);
    await page.goBack();
    await expect(page.getByTestId("calendar-result")).toBeVisible({ timeout: 40_000 });
    await page.goForward();
    await expect(page.getByTestId("calendar-result")).toHaveCount(0);

    w.assertClean();
  });

  test("the full-screen door opens the canonical calendar route", async ({ page }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard?result=calendar");
    await expect(page.getByTestId("calendar-result")).toBeVisible({ timeout: 40_000 });

    await page.getByTestId("calendar-result-open-full").click();
    await expect(page).toHaveURL(/\/lt\/dashboard\/planning/);
    w.assertClean();
  });

  test("375px mobile renders the same real line", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: "tests/e2e/.storage-state.json",
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    const w = watch(page);

    await page.goto("/lt/dashboard?result=calendar");
    const result = page.getByTestId("calendar-result");
    await expect(result).toBeVisible({ timeout: 40_000 });
    await expect(result).toContainText("E2E kalendoriaus rezultatas");

    // No sideways scroll, and the one control is a real tap target.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, "the result must not push the page sideways on 375px").toBe(false);
    const box = await page.getByTestId("calendar-result-open-full").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.screenshot({ path: join(SHOTS, "calendar-result-375.png") });

    w.assertClean();
    await ctx.close();
  });
});
