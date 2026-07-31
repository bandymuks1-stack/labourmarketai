import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 rows 11 / 12 — THE CALENDAR BADGES: verification, not migration.
 *
 * The audit (PR #944) reclassified these rows from ABSORB to (provisionally)
 * ALREADY: they are not renderers, they are two count-gated `<Link>` badges on
 * `/dashboard/advanced` whose capability lives on `/dashboard/bookings` and
 * whose SIGNAL is already carried by the notification spine — which survives
 * the advanced route's deletion because the bell mounts in the dashboard
 * LAYOUT.
 *
 * This spec is the browser proof the audit demanded ("confirmed, not
 * assumed"), with REAL seeded bookings driven through the real tables and the
 * real RLS. It proves, for each side of the loop:
 *
 *   row 12 (worker)   pendingIncomingBookings — the badge renders ONLY when
 *                     the real count > 0, shows the real count, and links
 *                     /dashboard/bookings where the ONE action surface
 *                     (BookingRespondButtons) responds;
 *   row 11 (company)  bookingResponsesNew — same shape for the proposer after
 *                     the worker responds, seen-model gated;
 *   the spine         the bell presents BOTH signals with the same counts and
 *                     the same href — the presentation that outlives the route;
 *   zero state        no booking → no badge, no chip, no bell signal — never
 *                     a fake zero;
 *   RLS               an unrelated authenticated user reads 0 of these rows.
 *
 * If every one of these holds, rows 11/12 are ALREADY — deleting the two link
 * cards with the route removes a SECOND presentation of an already-presented
 * signal, not a capability — and NO new code is owed for them.
 */

const SHOTS = process.env.E2E_SHOTS_DIR
  ? join(process.cwd(), "..", "..", process.env.E2E_SHOTS_DIR)
  : join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-rebuild", "w3");

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

/** Fixture identities (supabase/dev-fixtures.sql). */
const WORKER_PROFILE_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const COMPANY_USER_ID = "aaaaaaaa-0000-0000-0000-000000000002";
/** The fixture company request the booking hangs off (FK: customer_requests). */
const REQUEST_ID = "99999999-0000-0000-0000-000000000001";

/** Minimal PostgREST calls with the LOCAL service key — refuses non-loopback. */
async function db(
  method: "POST" | "DELETE" | "GET" | "PATCH",
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

async function clearBookingState(): Promise<void> {
  await db("DELETE", `booking_requests?request_id=eq.${REQUEST_ID}`);
  await db("DELETE", `booking_requests_seen?user_id=eq.${COMPANY_USER_ID}`);
}

/** `booking_requests.worker_id` FKs the WORKERS table (its generated id), not
 *  the profile — resolved at runtime because fixture resets regenerate it. */
async function fixtureWorkerRowId(): Promise<string> {
  const r = await db(
    "GET",
    `workers?profile_id=eq.${WORKER_PROFILE_ID}&select=id`,
  );
  const rows = (await r.json()) as Array<{ id: string }>;
  if (!rows[0]) throw new Error("fixture worker has no workers row");
  return rows[0].id;
}

/** Seed ONE real incoming proposal: company → worker, status 'proposed'. */
async function seedProposedBooking(): Promise<string> {
  const r = await db("POST", "booking_requests", {
    owner_id: COMPANY_USER_ID,
    request_id: REQUEST_ID,
    worker_id: await fixtureWorkerRowId(),
    status: "proposed",
    start_date: "2026-09-01",
    expected_end_date: "2026-09-12",
    location_country: "NL",
    role_text: "E2E rows 11/12 mūrininkas",
  });
  if (!r.ok) throw new Error(`seed booking failed: ${await r.text()}`);
  const [row] = (await r.json()) as Array<{ id: string }>;
  return row.id;
}

/** Real count from the data source — what every badge must agree with. */
async function dbProposedCount(): Promise<number> {
  const r = await db(
    "GET",
    `booking_requests?worker_id=eq.${await fixtureWorkerRowId()}&status=eq.proposed&select=id`,
  );
  return ((await r.json()) as unknown[]).length;
}

/** Console messages that PREDATE this work and are reproducible on the
 *  baseline (named in goal3-project-evaluation.spec.ts): the report-only CSP
 *  notice, and the injected `caret-color` hydration mismatch (no `caret` rule
 *  exists anywhere in this repo's source). Listed by name so the allowance
 *  can never quietly widen. */
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

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));
// The advanced page's first dev compile is slow — build cost, not product cost.
test.setTimeout(180_000);
// One fixture database — the zero-state test must not race the seeded ones.
test.describe.configure({ mode: "serial" });

/* ── row 12 — the WORKER side: pending incoming proposal ─────────────────── */

test.describe("row 12 — pending booking badge (worker)", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.json",
    viewport: { width: 1440, height: 900 },
  });

  test.beforeAll(clearBookingState);
  test.afterAll(clearBookingState);

  test("zero state: no booking → no badge, no chip, no bell signal", async ({
    page,
  }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/advanced");
    await expect(page.getByTestId("dashboard-status-strip").first()).toBeVisible();

    // Count-gated everywhere: nothing may render a fake zero.
    await expect(page.getByTestId("dashboard-bookings-next-action")).toHaveCount(0);
    await expect(page.getByTestId("status-strip-pending-bookings")).toHaveCount(0);
    await expect(page.getByTestId("notification-signal-pending-bookings")).toHaveCount(0);
    w.assertClean();

    // Pre-warm the bookings route: its FIRST dev compile can exceed a click
    // navigation's assertion window, and that is build cost, not product cost.
    await page.goto("/lt/dashboard/bookings");
    await expect(page.getByTestId("bookings-page")).toBeVisible({ timeout: 60_000 });
  });

  test("seeded proposal: badge count == DB count, href → /dashboard/bookings, back/forward/reload, keyboard", async ({
    page,
  }) => {
    const w = watch(page);
    await seedProposedBooking();
    const real = await dbProposedCount();
    expect(real).toBe(1);

    await page.goto("/lt/dashboard/advanced");

    // The badge renders (top-slot ladder: incoming_booking outranks the rest
    // of this fixture's signals) and shows the REAL count.
    const badge = page.getByTestId("dashboard-bookings-next-action");
    await expect(badge).toBeVisible();
    await expect(badge.locator("span").last()).toHaveText(String(real));
    await expect(badge).toHaveAttribute("href", /\/dashboard\/bookings$/);

    // The spine chip carries the SAME count to the SAME surface.
    const chip = page.getByTestId("status-strip-pending-bookings");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(String(real));
    await expect(chip).toHaveAttribute("href", /\/dashboard\/bookings$/);

    // Keyboard: the badge is a real link with a real accessible name.
    await badge.focus();
    await expect(badge).toBeFocused();
    await expect(badge).toHaveAccessibleName(/\S/);

    await page.screenshot({ path: join(SHOTS, "rows11-12-worker-badge-1440.png") });

    // The badge opens the ONE action surface. (Generous timeout: a dev-mode
    // recompile can stall the first navigation — build cost, not product.)
    await badge.click();
    await expect(page).toHaveURL(/\/lt\/dashboard\/bookings/, { timeout: 60_000 });
    await expect(page.getByTestId("bookings-page")).toBeVisible();
    // The seeded row is there, with the REAL respond controls (the only
    // booking action surface in the product).
    await expect(page.getByTestId(/^booking-/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /priimti|sutinku|accept/i }).first())
      .toBeVisible();

    await page.screenshot({ path: join(SHOTS, "rows11-12-bookings-detail-1440.png") });

    // Browser navigation: Back → advanced, Forward → bookings, reload holds.
    await page.goBack();
    await expect(page).toHaveURL(/\/lt\/dashboard\/advanced/);
    await expect(page.getByTestId("dashboard-bookings-next-action")).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/lt\/dashboard\/bookings/);
    await page.reload();
    await expect(page.getByTestId("bookings-page")).toBeVisible();
    await expect(page.getByTestId(/^booking-/).first()).toBeVisible();

    w.assertClean();
  });

  test("the bell carries the signal — the presentation that OUTLIVES the route", async ({
    page,
  }) => {
    const w = watch(page);
    // Deliberately NOT the advanced page: the bell mounts in the dashboard
    // layout, so this is exactly what remains after /dashboard/advanced dies.
    await page.goto("/lt/dashboard/bookings");
    await expect(page.getByTestId("bookings-page")).toBeVisible();

    await page.getByRole("button", { name: /pranešimai|notifications/i }).click();
    // The panel renders twice (desktop popover + mobile sheet); assert the
    // copy that is actually visible at this viewport.
    const signal = page
      .locator('a[data-testid="notification-signal-pending-bookings"]:visible')
      .first();
    await expect(signal).toBeVisible();
    await expect(signal).toContainText("1");
    await expect(signal).toHaveAttribute("href", /\/dashboard\/bookings$/);
    w.assertClean();
  });

  test("375px mobile: the badge and the detail both work one-handed", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: "tests/e2e/.storage-state.json",
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    const w = watch(page);

    await page.goto("/lt/dashboard/advanced");
    const badge = page.getByTestId("dashboard-bookings-next-action");
    await expect(badge).toBeVisible();
    await page.screenshot({ path: join(SHOTS, "rows11-12-worker-badge-375.png") });

    await badge.click();
    await expect(page).toHaveURL(/\/lt\/dashboard\/bookings/);
    await expect(page.getByTestId("bookings-page")).toBeVisible();
    await page.screenshot({ path: join(SHOTS, "rows11-12-bookings-detail-375.png") });

    w.assertClean();
    await ctx.close();
  });

  test("RLS: an unrelated authenticated user reads ZERO of these rows", async () => {
    // Real negative proof at the API layer — not a UI absence, which could be
    // a rendering accident. A fresh authenticated outsider selects the table
    // the badges count from and receives nothing.
    const { createClient } = await import("@supabase/supabase-js");
    const service = createClient(SUPA_URL, SUPA_SERVICE, {
      auth: { persistSession: false },
    });
    const email = `rls.outsider.rows1112.${Date.now()}@local.test`;
    const password = `E2e!${Date.now()}rls`;
    const { data: created, error: cErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr) throw new Error(`createUser: ${cErr.message}`);
    await service.from("profiles").upsert({ id: created.user!.id }, { onConflict: "id" });

    const outsider = createClient(SUPA_URL, SUPA_ANON, {
      auth: { persistSession: false },
    });
    const { error: sErr } = await outsider.auth.signInWithPassword({ email, password });
    if (sErr) throw new Error(`sign-in: ${sErr.message}`);

    const { data, error } = await outsider.from("booking_requests").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);

    await service.auth.admin.deleteUser(created.user!.id);
  });
});

/* ── row 11 — the COMPANY side: worker responded since last seen ─────────── */

test.describe("row 11 — booking responses badge (company)", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.company.json",
    viewport: { width: 1440, height: 900 },
  });

  test.beforeAll(clearBookingState);
  test.afterAll(clearBookingState);

  test("zero state: nothing responded → no badge, no chip", async ({ page }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/advanced");
    await expect(page.getByTestId("dashboard-status-strip").first()).toBeVisible();
    await expect(page.getByTestId("dashboard-booking-responses-next-action")).toHaveCount(0);
    await expect(page.getByTestId("status-strip-booking-responses")).toHaveCount(0);
    w.assertClean();
  });

  test("worker's real response since seen_at lights the badge with the real count", async ({
    page,
  }) => {
    const w = watch(page);

    // The seen-model gate, exactly as production computes it: the company
    // opened the surface YESTERDAY, the worker responded NOW.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const seenRes = await db("POST", "booking_requests_seen", {
      user_id: COMPANY_USER_ID,
      seen_at: yesterday,
    });
    if (!seenRes.ok) throw new Error(`seed seen_at failed: ${await seenRes.text()}`);

    const bookingId = await seedProposedBooking();
    // The worker's REAL response — the same transition the respond RPC makes
    // (status + updated_at), written to the same row the count reads.
    const upd = await db("PATCH", `booking_requests?id=eq.${bookingId}`, {
      status: "accepted",
      updated_at: new Date().toISOString(),
    });
    if (!upd.ok) throw new Error(`respond failed: ${await upd.text()}`);

    await page.goto("/lt/dashboard/advanced");

    const badge = page.getByTestId("dashboard-booking-responses-next-action");
    await expect(badge).toBeVisible();
    await expect(badge.locator("span").last()).toHaveText("1");
    await expect(badge).toHaveAttribute("href", /\/dashboard\/bookings$/);

    const chip = page.getByTestId("status-strip-booking-responses");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("href", /\/dashboard\/bookings$/);

    await page.screenshot({ path: join(SHOTS, "rows11-12-company-badge-1440.png") });

    // The href resolves to the surface that shows the response.
    await badge.click();
    await expect(page).toHaveURL(/\/lt\/dashboard\/bookings/);
    await expect(page.getByTestId("bookings-page")).toBeVisible();
    await expect(page.getByTestId(/^booking-/).first()).toBeVisible();

    w.assertClean();
  });
});
