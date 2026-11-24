import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * W11 — AUTHENTICATED BROWSER PROOF of the project execution / completion spine.
 *
 * LOCAL-STACK ONLY. Drives the real UI against the DISPOSABLE Supabase stack
 * `lm-w11-proof` (:55421) seeded by `scripts/db-proof/w11-browser-proof-seed.sh`,
 * and asserts the SCREEN and the DATABASE agree. It refuses to run against a
 * non-local Supabase URL and skips unless `W11_PROOF=1`, so it can never touch
 * production or the shared local stack.
 *
 * §7 of PR #1007 already proved every lifecycle rule at the layer that enforces
 * it (real Postgres, 39/39). THIS suite proves the layer above it: that the
 * product surface offers only reachable transitions, reports the SERVER's
 * outcome rather than an optimistic one, states the real consequence before an
 * irreversible act, and leaks nothing to someone who may not see the project.
 *
 * Fixtures (all on company `Dev Construction`, org auto-mirrored):
 *   2c000001…  "W11 Lifecycle Alpha"  draft      1 ACTIVE assignment
 *   2c000002…  "W11 Scope Control"    live       1 ACTIVE assignment  (control)
 *   2c000003…  "W11 Terminal Done"    completed  0 assignments
 *   2c000004…  "W11 Pre Ended"        live       1 ACTIVE assignment whose
 *                                                ended_at is ALREADY stamped
 *
 * Accounts: dev.company@local.test (manages), dev.worker@local.test (assigned),
 * w11.stranger@local.test (owns a DIFFERENT company — a real employer context
 * that is still a stranger to these projects).
 */

const RUN = process.env.W11_PROOF === "1";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const MANAGER = "dev.company@local.test";
const WORKER = "dev.worker@local.test";
const STRANGER = "w11.stranger@local.test";
const PASSWORD = "password";
/** The assigned worker's PROFILE id, from `supabase/dev-fixtures.sql`. */
const WORKER_PROFILE_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const ALPHA = "2c000001-0000-4000-8000-000000000001";
const SCOPE = "2c000002-0000-4000-8000-000000000002";
const TERMINAL = "2c000003-0000-4000-8000-000000000003";
const PRE_ENDED = "2c000004-0000-4000-8000-000000000004";

const ALPHA_TITLE = "W11 Lifecycle Alpha";
const ORG_NAME = "Dev Construction";
/** The exact timestamp the seed stamps on the pre-ended assignment. */
const PRE_ENDED_AT = "2026-01-02T03:04:05";

const IS_LOCAL =
  /^https?:\/\/(127\.0\.0\.1|localhost):55421/.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes("supabase.co");

test.skip(!RUN, "W11_PROOF=1 not set — local-stack-only proof");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const db = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** The project result's address. Depth lives in the query string, not a route. */
const resultUrl = (id: string) => `/en/dashboard?result=project&project=${id}`;

// ─────────────────────────────────────────────────────────────────────────────
// Database readers — the parity half of every assertion.
// ─────────────────────────────────────────────────────────────────────────────

async function statusOf(id: string): Promise<string> {
  const { data } = await db().from("projects").select("status").eq("id", id).single();
  return (data as { status: string } | null)?.status ?? "MISSING";
}

async function activeAssignments(projectId: string): Promise<number> {
  const { count } = await db()
    .from("project_worker_assignments")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "active");
  return count ?? 0;
}

async function assignmentRow(
  id: string,
): Promise<{ status: string; ended_at: string | null } | null> {
  const { data } = await db()
    .from("project_worker_assignments")
    .select("status, ended_at")
    .eq("id", id)
    .maybeSingle();
  return (data as { status: string; ended_at: string | null } | null) ?? null;
}

async function auditCount(action: string, entityId?: string): Promise<number> {
  let q = db()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", action);
  if (entityId) q = q.eq("entity_id", entityId);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Reset to the seeded starting state. Assignment rows are RESTORED rather than
 * recreated so their ids stay stable across tests — `PRE_ENDED`'s whole point
 * is that ONE specific row keeps ONE specific timestamp.
 */
async function resetFixtures(): Promise<void> {
  const c = db();
  await c.from("audit_logs").delete().in("action", ["set_project_status", "end_project_assignment"]);
  await c.from("projects").update({ status: "draft" }).eq("id", ALPHA);
  await c.from("projects").update({ status: "live" }).eq("id", SCOPE);
  await c.from("projects").update({ status: "completed" }).eq("id", TERMINAL);
  await c.from("projects").update({ status: "live" }).eq("id", PRE_ENDED);
  await c
    .from("project_worker_assignments")
    .update({ status: "active", ended_at: null })
    .in("id", [
      "2d000001-0000-4000-8000-000000000001",
      "2d000002-0000-4000-8000-000000000002",
    ]);
  await c
    .from("project_worker_assignments")
    .update({ status: "active", ended_at: "2026-01-02T03:04:05+00:00" })
    .eq("id", "2d000004-0000-4000-8000-000000000004");
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser helpers.
// ─────────────────────────────────────────────────────────────────────────────

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/en/auth/login", { waitUntil: "domcontentloaded" });
  // HYDRATION GATE: before hydration the form submits natively as a GET and the
  // click is a silent no-op that looks exactly like a broken product.
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 90_000, waitUntil: "domcontentloaded" });
}

async function openProject(page: Page, id: string): Promise<void> {
  await page.goto(resultUrl(id), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}

/** Run one lifecycle action and wait for the panel to settle on the result. */
async function act(page: Page, to: "live" | "paused"): Promise<void> {
  await page.getByTestId(`project-action-${to}`).click();
  await expect(page.getByTestId("project-status")).toHaveAttribute("data-status", to, {
    timeout: 60_000,
  });
}

/**
 * Call `set_project_status_v1` DIRECTLY as a real signed-in user, bypassing the
 * UI entirely. This is how a refusal the UI never offers is proven to be
 * enforced by the SERVER rather than merely hidden by the client.
 */
async function rpcAs(
  email: string,
  projectId: string,
  status: string,
): Promise<Record<string, unknown> | { rpc_error: string }> {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error: authErr } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (authErr) return { rpc_error: `signin: ${authErr.message}` };
  const { data, error } = await c.rpc("set_project_status_v1", {
    p_project_id: projectId,
    p_status: status,
  });
  await c.auth.signOut();
  if (error) return { rpc_error: error.message };
  return (data ?? {}) as Record<string, unknown>;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.beforeAll(() => {
  expect(IS_LOCAL, `refusing non-local Supabase URL: ${SUPABASE_URL}`).toBe(true);
  expect(SERVICE_KEY.length, "SUPABASE_SERVICE_ROLE_KEY missing").toBeGreaterThan(0);
});

test.beforeEach(async () => {
  await resetFixtures();
});

// ═══════════════════════════════════════════════════════════════════════════
// A — the project result shows STORED rows and invents nothing
// ═══════════════════════════════════════════════════════════════════════════

test.describe("A · the project result renders real stored data", () => {
  test("real title, org, status, roster — no dates, no progress, no score", async ({ page }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);

    const detail = page.getByTestId("project-detail");
    await expect(detail).toBeVisible({ timeout: 60_000 });

    // It renders inside the chat-first workspace — NOT a new route.
    expect(new URL(page.url()).pathname).toBe("/en/dashboard");

    await expect(detail).toContainText(ALPHA_TITLE);
    // The canonical status word AND the real organization, from the row.
    const status = page.getByTestId("project-status");
    await expect(status).toHaveAttribute("data-status", "draft");
    await expect(status).toContainText("Draft");
    await expect(status).toContainText(ORG_NAME);

    // The roster is real and the count matches the database: ONE row, with the
    // real assignment date from the row.
    const roster = page.getByTestId("project-assignments");
    await expect(roster).toBeVisible();
    await expect(roster.locator("li")).toHaveCount(1);
    await expect(roster).toContainText(new Date().toISOString().slice(0, 10));
    expect(await activeAssignments(ALPHA)).toBe(1);

    // DEFECT FOUND BY THIS PROOF, DELIBERATELY NOT ASSERTED EITHER WAY.
    // The person's NAME is not asserted here because the product currently
    // cannot produce one. `workers.display_name` is written by exactly one
    // writer in the repo — `complete_onboarding` — and that write can never
    // land: `ensure_worker_profile()` already inserted the `workers` row at
    // profile creation, so the onboarding insert is `on conflict (profile_id)
    // do nothing` and the name is discarded. `profiles_select` is
    // `id = auth.uid() OR is_admin()`, so an employer can never read
    // `profiles.full_name` either, and `listProjectAssignments` falls all the
    // way through to `profile_id.slice(0, 8)` — a raw uuid fragment.
    // PRE-EXISTING (lib/projects/projects.ts, shared with the projects page),
    // newly VISIBLE here. Asserting the name would fail; asserting the uuid
    // fallback would lock the defect in. Structure is asserted instead, and
    // the defect is recorded on the PR for its own slice.
    const rosterText = await roster.innerText();
    expect(rosterText.trim().length).toBeGreaterThan(0);

    // ABSENT DATES STAY ABSENT. The project row has no start/end write path,
    // so these labels must not appear at all — never a placeholder date.
    const text = (await detail.innerText()) ?? "";
    expect(text).not.toMatch(/^\s*Start\b/m);
    expect(text).not.toMatch(/^\s*End\b/m);

    // NO fabricated progress, percentage, estimate or confidence anywhere.
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/progress|complete[d]?\s*:\s*\d|confidence|score/i);
    await expect(detail.locator('[role="progressbar"]')).toHaveCount(0);
    await expect(detail.locator("progress")).toHaveCount(0);

    // No raw database text ever reaches a person.
    expect(text).not.toMatch(/42P01|42703|42883|PGRST|null|undefined/);

    await page.screenshot({ path: "test-results/w11-a-project-result.png", fullPage: true });
  });

  test("stages that cannot be read say so instead of showing a confident empty list", async ({
    page,
  }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 60_000 });

    // EXACTLY ONE of the three stage states is shown, and "unreadable" and
    // "none" are never conflated.
    const unavailable = await page.getByTestId("project-stages-unavailable").count();
    const empty = await page.getByTestId("project-stages-empty").count();
    const listed = await page.getByTestId("project-stages").count();
    expect(unavailable + empty + listed).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B — the lifecycle matrix, through the real controls
// ═══════════════════════════════════════════════════════════════════════════

test.describe("B · lifecycle transitions", () => {
  test("draft offers ONLY publish; the refused transitions are not controls at all", async ({
    page,
  }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);
    await expect(page.getByTestId("project-lifecycle")).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId("project-action-live")).toBeVisible();
    // draft → paused and draft → completed are NOT offered…
    await expect(page.getByTestId("project-action-paused")).toHaveCount(0);
    await expect(page.getByTestId("project-action-completed")).toHaveCount(0);

    // …and the server refuses them anyway, so the absence is not the only guard.
    expect(await rpcAs(MANAGER, ALPHA, "paused")).toMatchObject({
      outcome: "invalid_transition",
    });
    expect(await rpcAs(MANAGER, ALPHA, "completed")).toMatchObject({
      outcome: "invalid_transition",
    });
    expect(await statusOf(ALPHA)).toBe("draft");
    expect(await auditCount("set_project_status")).toBe(0);
  });

  test("draft → live → paused → live, each step confirmed in the database", async ({ page }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);

    await act(page, "live");
    expect(await statusOf(ALPHA)).toBe("live");
    await expect(page.getByTestId("project-lifecycle-message")).toBeVisible();

    await act(page, "paused");
    expect(await statusOf(ALPHA)).toBe("paused");

    await act(page, "live");
    expect(await statusOf(ALPHA)).toBe("live");

    // THREE real transitions → exactly THREE audit rows.
    expect(await auditCount("set_project_status", ALPHA)).toBe(3);
    // Nothing was ended by a mere status change.
    expect(await activeAssignments(ALPHA)).toBe(1);
    expect(await auditCount("end_project_assignment")).toBe(0);

    await page.screenshot({ path: "test-results/w11-b-transitions.png", fullPage: true });
  });

  test("same-state is refused with no write and no audit row", async ({ page }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);
    await act(page, "live");
    expect(await auditCount("set_project_status", ALPHA)).toBe(1);

    // The UI never offers the state it is already in, so the idempotency claim
    // is proven where it is enforced.
    expect(await rpcAs(MANAGER, ALPHA, "live")).toMatchObject({
      outcome: "already_in_state",
    });
    expect(await statusOf(ALPHA)).toBe("live");
    expect(await auditCount("set_project_status", ALPHA)).toBe(1); // still ONE
    expect(await activeAssignments(ALPHA)).toBe(1);
  });

  test("a completed project is terminal on screen and at the server", async ({ page }) => {
    await signIn(page, MANAGER);
    await openProject(page, TERMINAL);
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId("project-status")).toHaveAttribute("data-status", "completed");
    // No control leads out of `completed` — the panel says so instead.
    await expect(page.getByTestId("project-terminal")).toBeVisible();
    await expect(page.getByTestId("project-action-live")).toHaveCount(0);
    await expect(page.getByTestId("project-action-paused")).toHaveCount(0);
    await expect(page.getByTestId("project-action-completed")).toHaveCount(0);
    // …and nobody new can be assigned.
    await expect(page.getByTestId("project-no-assign")).toBeVisible();
    await expect(page.getByTestId("project-assign-worker")).toHaveCount(0);

    for (const to of ["live", "paused", "draft", "completed"]) {
      const res = await rpcAs(MANAGER, TERMINAL, to);
      // `completed` → `completed` is same-state; everything else is refused.
      expect(res).toMatchObject({
        outcome: to === "completed" ? "already_in_state" : "invalid_transition",
      });
    }
    expect(await statusOf(TERMINAL)).toBe("completed");

    await page.screenshot({ path: "test-results/w11-b-terminal.png", fullPage: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C — completion: confirmation, scoping, and what it does NOT do
// ═══════════════════════════════════════════════════════════════════════════

test.describe("C · completion", () => {
  test("the confirmation states the real consequence and does NOT claim a review is created", async ({
    page,
  }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);
    await act(page, "live");

    await page.getByTestId("project-action-completed").click();
    const confirm = page.getByTestId("project-complete-confirm");
    await expect(confirm).toBeVisible();

    const copy = await confirm.innerText();
    expect(copy).toMatch(/cannot be reopened/i); // irreversibility, stated
    expect(copy).toMatch(/assignments on this project are marked as ended/i);
    // W11 does NOT activate W6, and the copy must not imply otherwise.
    expect(copy).toMatch(/no review or rating is created/i);

    await page.screenshot({ path: "test-results/w11-c-confirm.png", fullPage: true });
  });

  test("cancel writes nothing", async ({ page }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);
    await act(page, "live");
    const before = await auditCount("set_project_status", ALPHA);

    await page.getByTestId("project-action-completed").click();
    await expect(page.getByTestId("project-complete-confirm")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByTestId("project-complete-confirm")).toHaveCount(0);

    expect(await statusOf(ALPHA)).toBe("live");
    expect(await auditCount("set_project_status", ALPHA)).toBe(before);
    expect(await activeAssignments(ALPHA)).toBe(1);
  });

  test("completing ends THIS project's roster only, and never overwrites an existing ended_at", async ({
    page,
  }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);
    await act(page, "live");

    await page.getByTestId("project-action-completed").click();
    await page.getByTestId("project-complete-confirm-cta").click();

    await expect(page.getByTestId("project-status")).toHaveAttribute(
      "data-status",
      "completed",
      { timeout: 60_000 },
    );
    // The count shown is the SERVER's, not an estimate.
    await expect(page.getByTestId("project-lifecycle-message")).toContainText("1");

    // This project: completed, roster ended, rows still stored.
    expect(await statusOf(ALPHA)).toBe("completed");
    expect(await activeAssignments(ALPHA)).toBe(0);
    const alphaRow = await assignmentRow("2d000001-0000-4000-8000-000000000001");
    expect(alphaRow?.status).toBe("ended");
    expect(alphaRow?.ended_at).not.toBeNull(); // stored, not deleted

    // THE SCOPING PROOF: the other project is untouched.
    expect(await statusOf(SCOPE)).toBe("live");
    expect(await activeAssignments(SCOPE)).toBe(1);

    // The pre-stamped assignment on a THIRD project keeps its exact timestamp.
    const pre = await assignmentRow("2d000004-0000-4000-8000-000000000004");
    expect(pre?.ended_at ?? "").toContain(PRE_ENDED_AT.slice(0, 10));

    // ONE audit row per real change — one transition, one ending.
    expect(await auditCount("set_project_status", ALPHA)).toBe(2); // live + completed
    expect(await auditCount("end_project_assignment")).toBe(1);

    // The panel now shows the terminal state, not a stale control.
    await expect(page.getByTestId("project-terminal")).toBeVisible();
    await page.screenshot({ path: "test-results/w11-c-completed.png", fullPage: true });
  });

  test("no experience record is created by completing a project", async ({ page }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);
    await act(page, "live");
    await page.getByTestId("project-action-completed").click();
    await page.getByTestId("project-complete-confirm-cta").click();
    await expect(page.getByTestId("project-terminal")).toBeVisible({ timeout: 60_000 });

    // W6's table either does not exist here or gains no row — both are proof
    // that project completion is not an experience producer.
    const { count, error } = await db()
      .from("experience_records")
      .select("id", { count: "exact", head: true });
    if (!error) expect(count ?? 0).toBe(0);

    // Organization membership and company engagements are untouched.
    const { count: ended } = await db()
      .from("engagement_contexts")
      .select("id", { count: "exact", head: true })
      .not("ended_at", "is", null);
    expect(ended ?? 0).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D — authorization: the control offered and the write enforced agree
// ═══════════════════════════════════════════════════════════════════════════

test.describe("D · authorization", () => {
  test("a stranger with their OWN company gets no project and no existence leak", async ({
    page,
  }) => {
    await signIn(page, STRANGER);
    await openProject(page, ALPHA);

    // "Not found, or you cannot see it" — the ANTI-ORACLE answer.
    await expect(page.getByTestId("project-not-found")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("project-detail")).toHaveCount(0);

    // Nothing about the project leaks — not the title, not the organization,
    // not the roster.
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(ALPHA_TITLE);
    expect(body).not.toContain(ORG_NAME);
    expect(body).not.toContain("Dev Worker");
    // Not "you are not allowed", which would confirm the row exists.
    expect(body).not.toMatch(/not authori[sz]ed/i);

    // The server agrees, and answers the same way.
    expect(await rpcAs(STRANGER, ALPHA, "live")).toMatchObject({ outcome: "not_found" });
    expect(await statusOf(ALPHA)).toBe("draft");
    expect(await auditCount("set_project_status")).toBe(0);

    await page.screenshot({ path: "test-results/w11-d-stranger.png", fullPage: true });
  });

  test("the assigned worker can never change the lifecycle", async ({ page }) => {
    // The DECISIVE assertion, proven at the server regardless of what any
    // surface chooses to render: being ASSIGNED is not being a MANAGER.
    expect(await rpcAs(WORKER, ALPHA, "live")).toMatchObject({ outcome: "not_authorized" });
    expect(await statusOf(ALPHA)).toBe("draft");
    expect(await auditCount("set_project_status")).toBe(0);

    await signIn(page, WORKER);
    await openProject(page, ALPHA);
    await page.waitForLoadState("networkidle");

    // Whatever the surface shows the worker, it must NEVER be a lifecycle
    // control — a control that would be refused is exactly the fake control
    // the product forbids.
    await expect(page.getByTestId("project-action-live")).toHaveCount(0);
    await expect(page.getByTestId("project-action-paused")).toHaveCount(0);
    await expect(page.getByTestId("project-action-completed")).toHaveCount(0);
    await expect(page.getByTestId("project-assign-worker")).toHaveCount(0);

    await page.screenshot({ path: "test-results/w11-d-worker.png", fullPage: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E — `company.assign-worker` is reachable from the chat-first workspace
// ═══════════════════════════════════════════════════════════════════════════

test.describe("E · assignment reachability", () => {
  test("a manageable, non-completed project offers assignment; a completed one explains why not", async ({
    page,
  }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 60_000 });

    // THE ACTIVATION: the executor that had no client caller now has one.
    const cta = page.getByTestId("project-assign-worker");
    await expect(cta).toBeVisible();
    await cta.click();

    // The chat answers — and answers with PEOPLE, not with "nobody" or "I could
    // not read your team". Those three are deliberately different answers, so
    // getting the right one is the reachability proof.
    await expect(page.getByText("Who should work on it?")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("There is nobody on your team to assign yet.")).toHaveCount(0);
    await expect(page.getByText("I could not read your team right now.")).toHaveCount(0);

    // ONE chip per person the RPC's `caller_manages_worker` gate would accept —
    // here exactly the one active roster member, and the chip carries
    // `assign:<projectId>:<workerProfileId>`, so this asserts the RIGHT project
    // and the RIGHT person. The chip's LABEL is deliberately not asserted: it
    // comes from `workers.display_name`, which the product cannot currently
    // populate (see the roster note in test A).
    const chips = page.locator(`[data-testid^="chat-chip-assign:${ALPHA}:"]`);
    await expect(chips).toHaveCount(1, { timeout: 60_000 });
    await expect(chips.first()).toBeVisible();
    await expect(chips.first()).toHaveAttribute(
      "data-testid",
      `chat-chip-assign:${ALPHA}:${WORKER_PROFILE_ID}`,
    );

    await page.screenshot({ path: "test-results/w11-e-assign.png", fullPage: true });

    // The completed project offers the reason instead of the control.
    await openProject(page, TERMINAL);
    await expect(page.getByTestId("project-no-assign")).toBeVisible();
    await expect(page.getByTestId("project-assign-worker")).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F — responsive and accessible at both widths
// ═══════════════════════════════════════════════════════════════════════════

test.describe("F · 1440 and 375", () => {
  for (const vp of [
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "mobile-375", width: 375, height: 812 },
  ]) {
    test(`${vp.name}: no overflow, nothing clipped, status not by colour alone`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signIn(page, MANAGER);
      await openProject(page, ALPHA);

      const detail = page.getByTestId("project-detail");
      await expect(detail).toBeVisible({ timeout: 60_000 });

      expect(await horizontalOverflow(page), `no horizontal scroll at ${vp.width}px`)
        .toBeLessThanOrEqual(1);

      // The result fits its viewport rather than being clipped away.
      const box = await detail.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.width ?? 0).toBeLessThanOrEqual(vp.width);

      // STATUS IS A WORD, not only a colour.
      await expect(page.getByTestId("project-status")).toContainText("Draft");

      // The confirmation dialog is reachable and not clipped at this width.
      await act(page, "live");
      await page.getByTestId("project-action-completed").click();
      const confirm = page.getByTestId("project-complete-confirm");
      await expect(confirm).toBeVisible();
      const cbox = await confirm.boundingBox();
      expect(cbox?.width ?? 0).toBeLessThanOrEqual(vp.width);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      await page.screenshot({
        path: `test-results/w11-f-${vp.name}.png`,
        fullPage: true,
      });
    });
  }

  test("keyboard: the lifecycle control is focusable and activates by keyboard", async ({
    page,
  }) => {
    await signIn(page, MANAGER);
    await openProject(page, ALPHA);

    const publish = page.getByTestId("project-action-live");
    await expect(publish).toBeVisible({ timeout: 60_000 });

    // A real button, reachable and operable without a mouse.
    expect(await publish.evaluate((el) => el.tagName)).toBe("BUTTON");
    await publish.focus();
    await expect(publish).toBeFocused();
    // A visible focus indicator, not `outline: none` with nothing in its place.
    const focusRing = await publish.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        outline: s.outlineStyle !== "none" && s.outlineWidth !== "0px",
        shadow: s.boxShadow !== "none",
        ring: s.getPropertyValue("--tw-ring-shadow").trim() !== "",
      };
    });
    expect(
      focusRing.outline || focusRing.shadow || focusRing.ring,
      "focused control has a visible focus indicator",
    ).toBe(true);

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("project-status")).toHaveAttribute("data-status", "live", {
      timeout: 60_000,
    });
    expect(await statusOf(ALPHA)).toBe("live");
  });

  test("no hydration error and no blocking console error on the project result", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

    await signIn(page, MANAGER);
    await openProject(page, ALPHA);
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 60_000 });
    await act(page, "live");

    const blocking = errors.filter(
      (e) =>
        /hydrat|Minified React error|Warning: Text content did not match|Uncaught/i.test(e) ||
        /Failed to fetch|500 \(Internal/i.test(e),
    );
    expect(blocking, `blocking console errors:\n${blocking.join("\n")}`).toEqual([]);
  });
});
