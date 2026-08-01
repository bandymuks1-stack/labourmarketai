import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 rows 2/3/9/10 — the COMPANY package: browser proof.
 *
 * Rows 9/10 (service-requests next-actions) are rows-11/12-shaped: their
 * SIGNALS already live in the notification spine, which the LAYOUT-mounted
 * bell presents — the presentation that OUTLIVES /dashboard/advanced. The
 * canonical surface (/dashboard/service-requests) owns the full list and
 * status breakdown. Proof with REAL seeded rows:
 *
 *   - a seeded incoming 'sent' request lights the bell's
 *     incoming-service-requests signal with the database count and the
 *     /dashboard/service-requests href (row 9);
 *   - a seeded provider RESPONSE after the caller's seen_at lights the
 *     service-request-responses signal (row 10, the real seen-model);
 *   - the canonical surface renders both realities;
 *   - zero state first: no rows → no signals (count-gated, never fake).
 *
 * Rows 2/3 (premium-hub company / project cards) are DOOR-PANELS — real
 * RLS-scoped counts + deep links, no editor, no write, no unique data chain
 * (verified in the audit; the row-1 workEditor situation does not repeat).
 * Proof that every destination is canonical and reachable WITHOUT the
 * advanced page: the company page carries the #company-team anchor;
 * /dashboard/projects lists the real fixture project; its detail carries the
 * #project-gallery zone; /dashboard/start (the surviving spaces hub) carries
 * the company door. So the cards die with the route and nothing is lost.
 *
 * RLS: an authenticated outsider reads ZERO service_offering_requests rows.
 */

const SHOTS = process.env.E2E_SHOTS_DIR
  ? join(process.cwd(), "..", "..", process.env.E2E_SHOTS_DIR)
  : join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-rebuild", "w3");

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

const WORKER_USER_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const COMPANY_USER_ID = "aaaaaaaa-0000-0000-0000-000000000002";
const OFFERING_MARKER = "E2E W3-23910 paslauga";

async function db(
  method: "POST" | "DELETE" | "GET" | "PATCH",
  path: string,
  body?: unknown,
): Promise<Response> {
  if (!SUPA_URL || !SUPA_SERVICE) throw new Error("local stack env missing");
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing to touch a non-local target: ${SUPA_URL}`);
  }
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
      Prefer:
        method === "POST"
          ? "return=representation,resolution=merge-duplicates"
          : "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function clearSeeded(): Promise<void> {
  // Requests cascade-delete with their offerings.
  await db(
    "DELETE",
    `service_offerings?title=like.${encodeURIComponent(OFFERING_MARKER)}%25`,
  );
  await db(
    "DELETE",
    `service_offering_requests_seen?user_id=eq.${COMPANY_USER_ID}`,
  );
}

async function seedIncomingForCompany(): Promise<void> {
  const r = await db("POST", "service_offerings", {
    provider_id: COMPANY_USER_ID,
    title: `${OFFERING_MARKER} (įmonės)`,
    status: "active",
  });
  if (!r.ok) throw new Error(`seed offering failed: ${await r.text()}`);
  const [offering] = (await r.json()) as Array<{ id: string }>;
  const rq = await db("POST", "service_offering_requests", {
    offering_id: offering.id,
    provider_id: COMPANY_USER_ID,
    buyer_id: WORKER_USER_ID,
    status: "sent",
    message: "E2E row 9 — real incoming request",
  });
  if (!rq.ok) throw new Error(`seed incoming request failed: ${await rq.text()}`);
}

/** Row 10 reality: the company ASKED (buyer), opened the loop yesterday
 *  (seen row), and the provider ACCEPTED after that — a real "new response". */
async function seedRespondedOutgoingForCompany(): Promise<void> {
  const r = await db("POST", "service_offerings", {
    provider_id: WORKER_USER_ID,
    title: `${OFFERING_MARKER} (darbuotojo)`,
    status: "active",
  });
  if (!r.ok) throw new Error(`seed offering failed: ${await r.text()}`);
  const [offering] = (await r.json()) as Array<{ id: string }>;
  const rq = await db("POST", "service_offering_requests", {
    offering_id: offering.id,
    provider_id: WORKER_USER_ID,
    buyer_id: COMPANY_USER_ID,
    status: "accepted",
    responded_at: new Date().toISOString(),
    message: "E2E row 10 — real outgoing request",
  });
  if (!rq.ok) throw new Error(`seed outgoing request failed: ${await rq.text()}`);
}

/** Force the company's seen row to YESTERDAY and read it back. Done as its
 *  own step (delete → insert → verify) because the /service-requests visit
 *  in an earlier test fires an async mark-seen upsert that could otherwise
 *  land AFTER this seed and overwrite it to NOW. */
async function setSeenYesterday(): Promise<void> {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  await db("DELETE", `service_offering_requests_seen?user_id=eq.${COMPANY_USER_ID}`);
  const seen = await db("POST", "service_offering_requests_seen", {
    user_id: COMPANY_USER_ID,
    seen_at: yesterday,
  });
  if (!seen.ok) throw new Error(`seed seen row failed: ${await seen.text()}`);
  const check = await db(
    "GET",
    `service_offering_requests_seen?user_id=eq.${COMPANY_USER_ID}&select=seen_at`,
  );
  const rows = (await check.json()) as Array<{ seen_at: string }>;
  if (!rows[0] || new Date(rows[0].seen_at).getTime() > Date.now() - 3_600_000) {
    throw new Error(`seen row not settled: ${JSON.stringify(rows)}`);
  }
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

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

test.describe("rows 9/10 — the spine carries the service-request signals (company session)", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.company.json",
    viewport: { width: 1440, height: 900 },
  });

  test.beforeAll(clearSeeded);
  test.afterAll(clearSeeded);

  test("zero state: no rows → no signals, no advanced cards (count-gated)", async ({
    page,
  }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/service-requests");
    await expect(page.getByTestId("service-requests-page")).toBeVisible();
    await page.getByRole("button", { name: /pranešimai|notifications/i }).click();
    await expect(
      page.locator('a[data-testid="notification-signal-incoming-service-requests"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('a[data-testid="notification-signal-service-request-responses"]'),
    ).toHaveCount(0);
    await page.goto("/lt/dashboard/advanced");
    await expect(page.getByTestId("dashboard-service-requests-next-action")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-outgoing-requests-next-action")).toHaveCount(0);
    w.assertClean();
  });

  test("row 9: a REAL incoming request lights the bell with the database count", async ({
    page,
  }) => {
    await seedIncomingForCompany();
    const w = watch(page);
    // Deliberately NOT the advanced page: the bell mounts in the dashboard
    // layout — the presentation that survives the route deletion.
    await page.goto("/lt/dashboard/service-requests");
    await page.getByRole("button", { name: /pranešimai|notifications/i }).click();
    const signal = page
      .locator('a[data-testid="notification-signal-incoming-service-requests"]:visible')
      .first();
    await expect(signal).toBeVisible();
    await expect(signal).toContainText("1");
    await expect(signal).toHaveAttribute("href", /\/dashboard\/service-requests$/);
    // The canonical surface owns the list — the seeded request is on it.
    await page.keyboard.press("Escape");
    await expect(
      page.getByText("E2E row 9 — real incoming request").first(),
    ).toBeVisible();
    await page.screenshot({
      path: join(SHOTS, "rows910-incoming-signal-1440.png"),
      fullPage: false,
    });
    w.assertClean();
  });

  test("row 10: a provider response AFTER seen_at lights the responses signal", async ({
    page,
  }) => {
    await seedRespondedOutgoingForCompany();
    // Let the previous test's in-flight mark-seen upsert land, THEN pin the
    // seen row to yesterday and verify it stuck (deterministic, not a race).
    await page.waitForTimeout(1_500);
    await setSeenYesterday();
    const w = watch(page);
    await page.goto("/lt/dashboard/planning");
    await page.getByRole("button", { name: /pranešimai|notifications/i }).click();
    const signal = page
      .locator('a[data-testid="notification-signal-service-request-responses"]:visible')
      .first();
    await expect(signal).toBeVisible();
    await expect(signal).toHaveAttribute("href", /\/dashboard\/service-requests$/);
    w.assertClean();
  });
});

test.describe("rows 2/3 — door-panels: every destination is canonical without the route", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.company.json",
    viewport: { width: 1440, height: 900 },
  });

  test("the advanced cards render real counts today (they die with the route)", async ({
    page,
  }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/advanced");
    // The hub folds into the collapsed more-section — open it first.
    await page.getByTestId("dashboard-more-section").locator("> summary").click();
    await expect(page.getByTestId("premium-hub-company").first()).toBeVisible();
    await expect(page.getByTestId("premium-hub-project").first()).toBeVisible();
    w.assertClean();
  });

  test("company card destinations exist canonically", async ({ page }) => {
    const w = watch(page);
    // Team anchor + invitations anchor live on the company page itself.
    await page.goto("/lt/dashboard/company");
    await expect(page.locator("#company-team")).toHaveCount(1);
    // The surviving spaces hub carries the company door.
    await page.goto("/lt/dashboard/start");
    await expect(
      page.locator('a[href*="/dashboard/company"]').first(),
    ).toBeVisible();
    w.assertClean();
  });

  test("project card destinations exist canonically", async ({ page }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/projects");
    // The REAL fixture project list — open the first project detail.
    const first = page.locator('a[href*="/dashboard/projects/"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]{36}/);
    // The gallery zone the card's image door targets.
    await expect(page.locator("#project-gallery")).toHaveCount(1);
    await page.screenshot({
      path: join(SHOTS, "rows23-project-detail-1440.png"),
      fullPage: false,
    });
    w.assertClean();
  });

  test("375px: the canonical service-requests surface fits one-handed", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: "tests/e2e/.storage-state.company.json",
      viewport: { width: 375, height: 812 },
    });
    const page = await ctx.newPage();
    const w = watch(page);
    await page.goto("/lt/dashboard/service-requests");
    await expect(page.getByTestId("service-requests-page")).toBeVisible();
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: join(SHOTS, "rows910-service-requests-375.png") });
    w.assertClean();
    await ctx.close();
  });
});

test.describe("RLS isolation — service requests", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");

  test.beforeAll(seedIncomingForCompany);
  test.afterAll(clearSeeded);

  test("an authenticated outsider reads ZERO service_offering_requests rows", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const service = createClient(SUPA_URL, SUPA_SERVICE, {
      auth: { persistSession: false },
    });
    // Not a vacuous pass: the seeded row EXISTS for the service reader.
    const { data: allRows } = await service.from("service_offering_requests").select("id");
    expect((allRows ?? []).length).toBeGreaterThan(0);

    const email = `rls.outsider.rows910.${Date.now()}@local.test`;
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

    const { data, error } = await outsider.from("service_offering_requests").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);

    await service.auth.admin.deleteUser(created.user!.id);
  });
});
