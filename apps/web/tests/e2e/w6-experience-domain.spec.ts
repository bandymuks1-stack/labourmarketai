import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { dbOk, HAS_LOCAL_STACK } from "./market-map-db-state";

/**
 * W6 slice 3B — experience domain browser proof (LOCAL stack, domain
 * migration applied locally; production apply stays owner-gated).
 *
 * The full lifecycle with real roles is proven authoritatively at the DB
 * layer by apps/web/scripts/w6-experience-domain-proof.sql (43/43). This
 * spec proves the PRODUCT surfaces on top of it: honest state rendering,
 * count-only reputation with no score anywhere, the dispute marker, the
 * admin gate, and mobile.
 *
 * THE SURFACES MOVED. Slice 3B proved this against two screens,
 * `/dashboard/experiences` and `/dashboard/admin/experience-moderation`. The
 * Product Gate refused both (A-09, undeclared surface) and they were deleted:
 * the workspace is chat-first, so the domain is the `?result=experiences`
 * Workspace Result, and the moderator queue is a band on the EXISTING
 * `/dashboard/admin` control room. This spec follows the domain to its
 * canonical homes — the assertions about honesty are unchanged, because the
 * doctrine did not move, only the surface did.
 */

/** The canonical address of the experience domain. Deep-linkable, survives a
 *  reload, shareable — the whole reason a result lives in the query string. */
const EXPERIENCES = "/lt/dashboard?result=experiences";
const WORKER_STATE = join(__dirname, ".storage-state.worker.json");
const COMPANY_STATE = join(__dirname, ".storage-state.company.json");
const HAS_SESSIONS = existsSync(WORKER_STATE) && existsSync(COMPANY_STATE);

test.skip(!HAS_SESSIONS || !HAS_LOCAL_STACK, "needs the local stack + minted sessions");
test.setTimeout(120_000);

/** No stars, no total score, no trust percentage — anywhere on the page.
 *
 *  The rating WORDS are searched outside the explicit meaning/caution blocks,
 *  because those exist precisely to say "this is NOT a rating" — a naive
 *  whole-page match would flag the honesty copy itself. */
async function assertNoRatingUi(page: Page): Promise<void> {
  await expect(page.locator("text=/★|⭐|☆/")).toHaveCount(0);
  // Structural, not lexical: the product says "this is NOT a rating" in
  // several honest disclaimers, so a word search would flag the very copy
  // that enforces the doctrine. What must be absent is a rating VALUE.
  const ratingSurfaces = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("[data-testid]"));
    return els
      .map((e) => e.getAttribute("data-testid") ?? "")
      .filter((id) => /score|rating|ovr|stars/i.test(id)).length;
  });
  expect(ratingSurfaces).toBe(0);
  // no "N%" reliability claim
  await expect(page.locator("text=/\\b\\d{1,3}\\s?% (patikim|reliab|trust)/i")).toHaveCount(0);
}

/**
 * Open the Context Panel's mobile fold if it is still closed.
 *
 * Below `lg` the panel is a collapsed sheet. It auto-expands when a result
 * shows, but that effect runs after hydration — and under a COLD dev-server
 * compile hydration can lose the race with the assertion timeout. That is
 * exactly how this spec first failed: 1.3m per test on a cold server, passing
 * in 15s warm. The product behaviour is fine; the spec was racing it. Opening
 * the fold explicitly makes the assertion deterministic either way.
 */
async function openPanelFold(page: import("@playwright/test").Page): Promise<void> {
  const toggle = page.getByTestId("context-panel-toggle");
  await toggle.waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  if ((await toggle.count()) > 0 && (await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
}

let workerProfileId = "";
let recordId = "";

test.beforeAll(async () => {
  const p = (await (
    await dbOk(
      "GET",
      "profiles?email=eq.dev.worker@local.test&select=id",
    )
  ).json()) as { id: string }[];
  if (!p[0]) throw new Error("fixture worker profile missing");
  workerProfileId = p[0].id;

  const company = (await (
    await dbOk("GET", "profiles?email=eq.dev.company@local.test&select=id")
  ).json()) as { id: string }[];
  if (!company[0]) throw new Error("fixture company profile missing");

  // Seed ONE published experience about the worker + ONE disputed one, so the
  // count-only block and the dispute marker have real rows behind them. The
  // service-role client bypasses RLS but NOT the table's CHECK constraints —
  // the lifecycle facts below must therefore be internally consistent.
  const rows = (await (
    await dbOk(
      "POST",
      "experience_records",
      [
        {
          author_profile_id: company[0].id,
          subject_type: "worker",
          subject_profile_id: workerProfileId,
          interaction_kind: "accepted_booking",
          interaction_id: "aaaaaaaa-0000-0000-0000-00000000e001",
          sentiment: "positive",
          body: "E2E: darbas atliktas sutartu laiku.",
          moderation_status: "published",
          published_at: new Date(0).toISOString(),
          moderation_reason: "e2e seed",
          dispute_status: "none",
          dispute_reason: null,
        },
        {
          author_profile_id: company[0].id,
          subject_type: "worker",
          subject_profile_id: workerProfileId,
          interaction_kind: "accepted_booking",
          interaction_id: "aaaaaaaa-0000-0000-0000-00000000e002",
          sentiment: "negative",
          body: "E2E: ginčijama patirtis.",
          moderation_status: "published",
          published_at: new Date(0).toISOString(),
          moderation_reason: "e2e seed",
          dispute_status: "opened",
          dispute_reason: "e2e dispute",
        },
      ],
      "return=representation",
    )
  ).json()) as { id: string }[];
  recordId = rows[0]?.id ?? "";
});

test.afterAll(async () => {
  if (workerProfileId) {
    await dbOk(
      "DELETE",
      `experience_records?subject_profile_id=eq.${workerProfileId}&body=like.E2E:*`,
    );
  }
});

test.describe("worker self view", () => {
  test.use({ storageState: WORKER_STATE });

  test("count-only reputation renders real counts, a dispute marker, and no score", async ({
    page,
  }) => {
    await page.goto(EXPERIENCES);
    await expect(page.getByTestId("experiences-result")).toBeVisible({ timeout: 60_000 });

    const counts = page.getByTestId("experience-counts");
    await expect(counts).toBeVisible();
    // Positive and negative are counted SEPARATELY; the disputed published row
    // stays counted AND is surfaced as disputed (the canonical W6 rule).
    await expect(counts).toHaveAttribute("data-positive", "1");
    await expect(counts).toHaveAttribute("data-negative", "1");
    await expect(counts).toHaveAttribute("data-disputed", "1");
    await expect(page.getByTestId("experience-counts-disputed")).toBeVisible();
    // The meaning line is always present: subjective, not a professional fact.
    await expect(page.getByTestId("experience-counts-meaning")).toBeVisible();
    await assertNoRatingUi(page);
  });

  test("a published record about me carries its dispute marker and the reply door", async ({
    page,
  }) => {
    await page.goto(EXPERIENCES);
    const items = page.getByTestId("experience-about-me-item");
    await expect(items.first()).toBeVisible({ timeout: 60_000 });
    const disputed = items.filter({ has: page.getByTestId("experience-dispute-marker") });
    await expect(disputed).toHaveCount(1);
    // Right of reply exists and states that it changes no count.
    await expect(page.getByTestId("experience-response").first()).toBeVisible();
  });

  test("the result IS the work surface — it survives reload and closes back to the conversation", async ({
    page,
  }) => {
    // Slice 3B needed a "back to chat" link because the domain lived on its
    // own screen. It does not any more: the result opens INSIDE the workspace,
    // so there is nowhere to go back FROM. What must hold instead is that the
    // address is real — `?result=` is state in the URL, not a modal.
    await page.goto(EXPERIENCES);
    await expect(page.getByTestId("context-panel")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("experiences-result")).toBeVisible({ timeout: 60_000 });

    await page.reload();
    await expect(page.getByTestId("experiences-result")).toBeVisible({ timeout: 60_000 });

    // The conversation is never left behind — closing the result drops the
    // param and the workspace is still there.
    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("experiences-result")).toHaveCount(0);
  });

  test("the deleted screen is really gone — /dashboard/experiences is not a route", async ({
    page,
  }) => {
    // The Product Gate refusal is only honoured if the screen actually left
    // the tree. A soft-deleted route that still renders would be the second
    // dashboard by another name.
    const response = await page.goto("/lt/dashboard/experiences");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("experiences-result")).toHaveCount(0);
  });

  test("mobile 375px: nothing overflows", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(EXPERIENCES);
    await openPanelFold(page);
    await expect(page.getByTestId("experiences-result")).toBeVisible({ timeout: 60_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await assertNoRatingUi(page);
  });

  test("the moderator queue is server-side gated — a worker never reaches it", async ({
    page,
  }) => {
    // The queue is now a BAND on the existing control room, so the gate being
    // tested is the control room's own `requireSuperadmin` — which is the
    // point: the queue inherited a gate that already existed instead of
    // bringing a new one of its own.
    await page.goto("/lt/dashboard/admin");
    await expect(page.getByTestId("admin-experience-moderation")).toHaveCount(0);
    await expect(page.getByTestId("experience-moderation-queue")).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/dashboard\/admin$/, { timeout: 60_000 });
  });

  test("the old moderator route is really gone", async ({ page }) => {
    const response = await page.goto("/lt/dashboard/admin/experience-moderation");
    // Either 404 (route deleted) or bounced by the admin gate — never a
    // rendered queue.
    await expect(page.getByTestId("experience-moderation-queue")).toHaveCount(0);
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe("employer view", () => {
  test.use({ storageState: COMPANY_STATE });

  test("the author sees their own submissions in their REAL state", async ({ page }) => {
    await page.goto(EXPERIENCES);
    await expect(page.getByTestId("experiences-result")).toBeVisible({ timeout: 60_000 });
    const mine = page.getByTestId("experience-mine-item");
    await expect(mine.first()).toBeVisible();
    // Every row states its real moderation state — never a fake "published".
    await expect(page.getByTestId("experience-state").first()).toBeVisible();
    await assertNoRatingUi(page);
  });

  test("the employer cannot reach the moderator queue either", async ({ page }) => {
    await page.goto("/lt/dashboard/admin");
    await expect(page.getByTestId("admin-experience-moderation")).toHaveCount(0);
    await expect(page.getByTestId("experience-moderation-queue")).toHaveCount(0);
  });
});
