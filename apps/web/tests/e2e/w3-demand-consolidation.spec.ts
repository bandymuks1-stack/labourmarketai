import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 rows 7/8/25 — EMPLOYER DEMAND CONSOLIDATION: browser proof.
 *
 * The FULL demand wizard (structured v2, estimate builder, prefill, draft
 * auto-continue, private save-draft leg) and the ONE owner readback now live
 * on /dashboard/company under the stable #demand-intake anchor. The advanced
 * page carries NO demand surface. This spec proves, against the LOCAL stack
 * with the real fixture company session:
 *
 *   - the company page hosts the wizard + the employer-kind-scoped readback;
 *   - the private save-draft leg writes a REAL customer_requests draft row,
 *     survives reload (auto-continue), and is CLOSED by the real submit so
 *     exactly one canonical demand row remains;
 *   - describe → criteria (estimate builder) → review → submit echoes the
 *     entered values and lands in the readback with its scouting deep link;
 *   - /dashboard/advanced renders no wizard and no readback;
 *   - the #demand-intake anchor works as a direct URL and across Back;
 *   - 375px mobile has no sideways scroll;
 *   - a worker-only user is DENIED /dashboard/company (honest notice);
 *   - RLS: an authenticated outsider reads ZERO customer_requests rows;
 *   - 0 console errors, 0 unexplained failed requests.
 */

const SHOTS = process.env.E2E_SHOTS_DIR
  ? join(process.cwd(), "..", "..", process.env.E2E_SHOTS_DIR)
  : join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-rebuild", "w3");

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

const COMPANY_USER_ID = "aaaaaaaa-0000-0000-0000-000000000002";
const MARKER = `E2E W3-7825 poreikis ${Date.now()}`;
const ROLE_MARKER = "E2E betonuotojų brigada";

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
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Remove every row this spec created (marker-scoped — fixture rows stay). */
async function clearSpecRows(): Promise<void> {
  await db(
    "DELETE",
    `customer_requests?profile_id=eq.${COMPANY_USER_ID}&need_summary=like.E2E%20W3-7825%25`,
  );
  // Draft rows store the text in payload.capabilities, not need_summary.
  await db(
    "DELETE",
    `customer_requests?profile_id=eq.${COMPANY_USER_ID}&payload->>capabilities=like.E2E%20W3-7825%25`,
  );
}

async function companyRows(filter: string): Promise<Array<Record<string, unknown>>> {
  const r = await db(
    "GET",
    `customer_requests?profile_id=eq.${COMPANY_USER_ID}&${filter}&select=id,status,kind,need_summary,payload,title`,
  );
  return (await r.json()) as Array<Record<string, unknown>>;
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

test.describe("W3 7/8/25 — the company page is the ONE demand home (company session)", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  test.use({
    storageState: "tests/e2e/.storage-state.company.json",
    viewport: { width: 1440, height: 900 },
  });

  test.beforeAll(clearSpecRows);
  test.afterAll(clearSpecRows);

  test("wizard + owner readback render on /dashboard/company", async ({ page }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/company");

    const section = page.getByTestId("demand-intake-section");
    await expect(section).toBeVisible();
    await expect(page.getByTestId("demand-form")).toBeVisible();
    // The owner readback (moved from /dashboard/advanced) renders below —
    // empty state or rows, but PRESENT, exactly once.
    await expect(page.getByTestId("demand-requests-readback")).toHaveCount(1);
    // The save-draft leg is a real, named control.
    await expect(
      page.getByRole("button", { name: "Išsaugoti juodraštį privačiai" }),
    ).toBeVisible();

    await page.screenshot({
      path: join(SHOTS, "rows7825-company-wizard-1440.png"),
      fullPage: true,
    });
    w.assertClean();
  });

  test("private draft save writes a REAL draft row and survives reload", async ({ page }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/company");

    await page.getByTestId("demand-role").fill(ROLE_MARKER);
    await page.getByTestId("demand-description").fill(MARKER);
    await page.getByTestId("demand-save-draft").click();
    await expect(page.getByTestId("demand-draft-saved")).toBeVisible();

    // DATABASE proof — the draft row exists, private (status='draft').
    const drafts = await companyRows(
      `status=eq.draft&kind=eq.company_request&payload->>capabilities=eq.${encodeURIComponent(MARKER)}`,
    );
    expect(drafts).toHaveLength(1);

    // Reload: the wizard auto-continues from the OWN saved draft.
    await page.reload();
    await expect(page.getByTestId("demand-prefill-draft")).toBeVisible();
    await expect(page.getByTestId("demand-description")).toHaveValue(MARKER);
    w.assertClean();
  });

  test("describe → criteria (estimate) → review → submit: receipt, closed draft, readback", async ({
    page,
  }) => {
    const w = watch(page);
    await page.goto("/lt/dashboard/company");
    await expect(page.getByTestId("demand-description")).toHaveValue(MARKER);

    // Step 2 — the criteria screen carries the ONE estimate builder.
    await page.getByTestId("demand-next").click();
    await expect(page.getByTestId("demand-work-type")).toBeVisible();
    await expect(page.getByTestId("estimate-open")).toBeVisible();
    await page.getByTestId("demand-team-size").fill("4");

    // Step 3 — review echoes the entered values.
    await page.getByTestId("demand-next").click();
    await expect(page.getByTestId("demand-review")).toBeVisible();
    await expect(page.getByTestId("demand-summary-description")).toHaveText(MARKER);

    // Submit — the immediate receipt (done state + the exact next step).
    await page.getByTestId("demand-create").click();
    await expect(page.getByTestId("demand-done")).toBeVisible();
    await expect(page.getByTestId("demand-done-scouting-link")).toBeVisible();

    // DATABASE proof — exactly ONE canonical row remains: the submitted
    // request (with its real id) exists; the draft it continued from is
    // CLOSED, not duplicated.
    const submitted = await companyRows(
      `status=eq.submitted&need_summary=eq.${encodeURIComponent(MARKER)}`,
    );
    expect(submitted).toHaveLength(1);
    expect(String(submitted[0].id)).toMatch(/[0-9a-f-]{36}/);
    // The draft close runs AFTER the done state renders (best-effort leg of
    // the same click) — poll instead of racing it.
    await expect
      .poll(
        async () =>
          (
            await companyRows(
              `status=eq.draft&kind=eq.company_request&payload->>capabilities=eq.${encodeURIComponent(MARKER)}`,
            )
          ).length,
        { timeout: 15_000 },
      )
      .toBe(0);

    // The owner readback shows the new request with its scouting deep link.
    await page.reload();
    const row = page
      .getByTestId("demand-readback-row")
      .filter({ hasText: ROLE_MARKER })
      .first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId("demand-readback-scout-link")).toHaveAttribute(
      "href",
      /\/dashboard\/company\/scouting\?request=/,
    );
    await page.screenshot({
      path: join(SHOTS, "rows7825-owner-readback-1440.png"),
      fullPage: true,
    });
    w.assertClean();
  });

  test("the advanced page carries NO demand surface; Back returns to the wizard", async ({
    page,
  }) => {
    const w = watch(page);
    // Direct anchor URL works.
    await page.goto("/lt/dashboard/company#demand-intake");
    await expect(page.getByTestId("demand-intake-section")).toBeVisible();

    // The advanced page: no wizard, no readback — and the page still works.
    await page.goto("/lt/dashboard/advanced");
    await expect(page.getByTestId("dashboard-module-grid").first()).toBeVisible();
    await expect(page.getByTestId("demand-intake-section")).toHaveCount(0);
    await expect(page.getByTestId("demand-requests-readback")).toHaveCount(0);

    // Browser Back returns to the anchored wizard.
    await page.goBack();
    await expect(page.getByTestId("demand-intake-section")).toBeVisible();
    w.assertClean();
  });

  test("375px: the wizard fits with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const w = watch(page);
    await page.goto("/lt/dashboard/company#demand-intake");
    await expect(page.getByTestId("demand-intake-section")).toBeVisible();
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: join(SHOTS, "rows7825-company-wizard-375.png"),
      fullPage: true,
    });
    w.assertClean();
  });
});

test.describe("W3 7/8/25 — non-member denial (worker-only session)", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
  // Minted with E2E_OWNER_EMAIL=dev.worker@local.test — a user who does NOT
  // hold the company role (the default .storage-state.json may be any role).
  test.use({
    storageState: "tests/e2e/.storage-state.worker.json",
    viewport: { width: 1440, height: 900 },
  });

  test("a worker without the company role is redirected with an honest notice", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/company");
    await expect(page).toHaveURL(/\/lt\/dashboard\?notice=needs_company_role/);
    await expect(page.getByTestId("demand-intake-section")).toHaveCount(0);
  });
});

test.describe("W3 7/8/25 — RLS isolation (API-level negative proof)", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");

  test("an authenticated outsider reads ZERO customer_requests rows", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const service = createClient(SUPA_URL, SUPA_SERVICE, {
      auth: { persistSession: false },
    });
    // The table is NOT empty — the fixture company's rows exist.
    const { data: allRows } = await service.from("customer_requests").select("id");
    expect((allRows ?? []).length).toBeGreaterThan(0);

    const email = `rls.outsider.rows7825.${Date.now()}@local.test`;
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

    const { data, error } = await outsider.from("customer_requests").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);

    await service.auth.admin.deleteUser(created.user!.id);
  });
});
