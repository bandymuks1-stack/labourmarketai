import { test, expect, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * W12 SLICE 1 — BROWSER PROOF of atomic double-booking prevention.
 *
 * LOCAL-STACK ONLY. Drives the real UI against the dedicated local Supabase
 * stack `lm-w12-proof` and asserts the screen and the database agree. It
 * refuses to run against a non-local Supabase URL and skips unless
 * W12_PROOF=1, so it can never touch production or a shared environment.
 *
 * Fixtures (disposable accounts, seeded out-of-band):
 *   "W12 A overlapping"      employer A  2026-09-01..09-10  proposed
 *   "W12 B overlapping"      employer B  2026-09-05..09-15  proposed  (overlaps)
 *   "W12 A non-overlapping"  employer A  2026-12-01..12-05  proposed
 *   "W12 B declined"         employer B  2026-09-02..09-08  DECLINED  (must not block)
 *
 * ROWS ARE ADDRESSED BY THEIR VISIBLE TEXT, never by position: every fixture
 * shares one created_at, so list order is genuinely non-deterministic and a
 * `.first()` selector silently tests a different booking on each run.
 */

const RUN = process.env.W12_PROOF === "1";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const WORKER_EMAIL = "w12.worker@local.test";
const WORKER_PW = "W12proof!local";

const A_OVERLAP = "W12 A overlapping";
const B_OVERLAP = "W12 B overlapping";
const A_FREE = "W12 A non-overlapping";

const B1 = "b0000001-0000-4000-8000-000000000001"; // A overlapping
const B2 = "b0000002-0000-4000-8000-000000000002"; // B overlapping
const B3 = "b0000003-0000-4000-8000-000000000003"; // A non-overlapping
const B4 = "b0000004-0000-4000-8000-000000000004"; // B declined

const IS_LOCAL =
  /^https?:\/\/(127\.0\.0\.1|localhost):55321/.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes("supabase.co");

test.skip(!RUN, "W12_PROOF=1 not set — local-stack-only proof");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const db = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function resetFixtures() {
  const c = db();
  await c.from("booking_request_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await c.from("company_worker_engagements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await c.from("booking_requests").update({ status: "proposed" }).in("id", [B1, B2, B3]);
  await c.from("booking_requests").update({ status: "declined" }).eq("id", B4);
}

async function statusOf(id: string): Promise<string> {
  const { data } = await db().from("booking_requests").select("status").eq("id", id).single();
  return (data as { status: string } | null)?.status ?? "MISSING";
}

async function eventCount(id: string): Promise<number> {
  const { count } = await db()
    .from("booking_request_events")
    .select("id", { count: "exact", head: true })
    .eq("booking_request_id", id);
  return count ?? 0;
}

/** Independent re-implementation of the constraint predicate, for parity. */
async function overlappingAcceptedPairs(): Promise<number> {
  const { data } = await db()
    .from("booking_requests")
    .select("id, worker_id, status, start_date, expected_end_date")
    .eq("status", "accepted");
  const rows = (data ?? []) as {
    id: string; worker_id: string; start_date: string | null; expected_end_date: string | null;
  }[];
  let pairs = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.worker_id !== b.worker_id || !a.start_date || !b.start_date) continue;
      const aEnd = a.expected_end_date ?? a.start_date;
      const bEnd = b.expected_end_date ?? b.start_date;
      if (a.start_date <= bEnd && b.start_date <= aEnd) pairs++;
    }
  }
  return pairs;
}

async function login(page: Page) {
  await page.goto("/en/auth/login", { waitUntil: "domcontentloaded" });
  // HYDRATION GATE: before hydration the login form submits natively as a GET
  // and button onClick handlers are not attached, so a click is a silent
  // no-op that looks exactly like a broken product. Wait for the client.
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(WORKER_EMAIL);
  await page.locator('input[type="password"]').fill(WORKER_PW);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 90_000, waitUntil: "domcontentloaded" });
}

async function openBookings(page: Page) {
  await page.goto("/en/dashboard/bookings", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}

/** The list row whose visible text contains the fixture's role label. */
function row(page: Page, label: string): Locator {
  return page.locator("li").filter({ hasText: label }).last();
}

async function acceptRow(page: Page, label: string) {
  const r = row(page, label);
  await expect(r).toBeVisible({ timeout: 60_000 });
  await r.getByRole("button", { name: /^(Accept|Priimti)$/ }).click();
}

test.describe("W12 slice 1 — atomic double-booking, browser proof", () => {
  test.beforeAll(() => {
    expect(IS_LOCAL, `refusing non-local Supabase URL: ${SUPABASE_URL}`).toBe(true);
  });

  test.beforeEach(async () => {
    await resetFixtures();
  });

  test("A: one overlapping booking is accepted, the other is refused with no fake success", async ({ page }) => {
    await login(page);
    await openBookings(page);

    // Both overlapping offers are open.
    await expect(row(page, A_OVERLAP).getByRole("button", { name: /^Accept$/ })).toBeVisible({ timeout: 60_000 });
    await expect(row(page, B_OVERLAP).getByRole("button", { name: /^Accept$/ })).toBeVisible();

    // 1) Accept employer A's booking.
    await acceptRow(page, A_OVERLAP);
    await expect(row(page, A_OVERLAP).getByTestId("booking-responded")).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: "test-results/w12-a1-first-accepted.png", fullPage: true });

    expect(await statusOf(B1)).toBe("accepted");
    expect(await overlappingAcceptedPairs()).toBe(0);

    // 2) Try employer B's OVERLAPPING booking.
    await acceptRow(page, B_OVERLAP);

    const conflict = row(page, B_OVERLAP).getByTestId("booking-conflict");
    await expect(conflict).toBeVisible({ timeout: 60_000 });
    await expect(conflict).not.toBeEmpty();

    // The accept CTA for the refused row is GONE — never left misleadingly live.
    await expect(row(page, B_OVERLAP).getByRole("button", { name: /^Accept$/ })).toHaveCount(0);

    // NO fake success on the refused row.
    await expect(row(page, B_OVERLAP).getByTestId("booking-responded")).toHaveCount(0);

    await page.screenshot({ path: "test-results/w12-a2-conflict.png", fullPage: true });

    // DB parity.
    expect(await statusOf(B1)).toBe("accepted");
    expect(await statusOf(B2)).toBe("proposed");
    expect(await overlappingAcceptedPairs()).toBe(0);
    expect(await eventCount(B1)).toBe(1);
    expect(await eventCount(B2)).toBe(0);   // refused → no partial side effect
  });

  test("B: duplicate submit changes state once and duplicates no side effect", async ({ page }) => {
    await login(page);
    await openBookings(page);

    const btn = row(page, A_OVERLAP).getByRole("button", { name: /^Accept$/ });
    await expect(btn).toBeVisible({ timeout: 60_000 });

    // Two rapid activations of the SAME control.
    await btn.click();
    await btn.click({ force: true, timeout: 3_000 }).catch(() => { /* already replaced */ });
    await expect(row(page, A_OVERLAP).getByTestId("booking-responded")).toBeVisible({ timeout: 60_000 });

    expect(await statusOf(B1)).toBe("accepted");
    expect(await eventCount(B1)).toBe(1);          // ONE audit row

    const { count: engagements } = await db()
      .from("company_worker_engagements")
      .select("id", { count: "exact", head: true })
      .eq("source_booking_id", B1);
    expect(engagements ?? 0).toBe(1);              // engagement not minted twice

    await page.screenshot({ path: "test-results/w12-b-duplicate-submit.png", fullPage: true });
  });

  test("C+D+E: a non-overlapping booking still accepts; a declined overlap never blocks", async ({ page }) => {
    await login(page);
    await openBookings(page);

    await acceptRow(page, A_OVERLAP);
    await expect(row(page, A_OVERLAP).getByTestId("booking-responded")).toBeVisible({ timeout: 60_000 });

    // C: different dates, same worker → allowed.
    await acceptRow(page, A_FREE);
    await expect(row(page, A_FREE).getByTestId("booking-responded")).toBeVisible({ timeout: 60_000 });

    expect(await statusOf(B1)).toBe("accepted");
    expect(await statusOf(B3)).toBe("accepted");
    // E: the DECLINED overlapping row neither blocked nor changed.
    expect(await statusOf(B4)).toBe("declined");
    expect(await overlappingAcceptedPairs()).toBe(0);

    await page.screenshot({ path: "test-results/w12-cde-non-overlapping.png", fullPage: true });
  });

  test("mobile 375px: the conflict state is readable, CTA-free and does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await openBookings(page);

    await acceptRow(page, A_OVERLAP);
    await expect(row(page, A_OVERLAP).getByTestId("booking-responded")).toBeVisible({ timeout: 60_000 });

    await acceptRow(page, B_OVERLAP);
    const conflict = row(page, B_OVERLAP).getByTestId("booking-conflict");
    await expect(conflict).toBeVisible({ timeout: 60_000 });
    await expect(row(page, B_OVERLAP).getByRole("button", { name: /^Accept$/ })).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal scroll at 375px").toBeLessThanOrEqual(1);

    await page.screenshot({ path: "test-results/w12-mobile-375-conflict.png", fullPage: true });
    expect(await overlappingAcceptedPairs()).toBe(0);
  });
});
