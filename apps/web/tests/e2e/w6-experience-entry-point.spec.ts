import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db, dbOk, HAS_LOCAL_STACK } from "./market-map-db-state";

/**
 * W6 slice 3D — the experience ENTRY POINT, in the browser.
 *
 * What must hold, and why each one is here rather than only in a unit test:
 *
 *   - the CTA is STATEFUL and INTERACTION-BOUND. There is no "leave a review"
 *     button; there is one chip per real finished interaction, and the chip
 *     carries that interaction's own token;
 *   - a booking that has not started yet produces NO chip — the eligibility
 *     contract is not relaxed to make the UI easier;
 *   - the chip opens `?result=experiences&interaction=…`, NOT a route;
 *   - the form mounts only after the SERVER re-derives eligibility. A token
 *     for an interaction the viewer is not part of renders no form at all,
 *     which is the forged-payload case as a person could actually attempt it;
 *   - a duplicate shows the existing state instead of a second form.
 *
 * Runs against the LOCAL stack with the domain migration applied locally.
 * Production apply stays owner-gated.
 */
const WORKER_STATE = join(__dirname, ".storage-state.worker.json");
const COMPANY_STATE = join(__dirname, ".storage-state.company.json");
const HAS_SESSIONS = existsSync(WORKER_STATE) && existsSync(COMPANY_STATE);

test.skip(!HAS_SESSIONS || !HAS_LOCAL_STACK, "needs the local stack + minted sessions");
test.setTimeout(120_000);

const WORKER_PROFILE = "aaaaaaaa-0000-0000-0000-000000000001";
const COMPANY_PROFILE = "aaaaaaaa-0000-0000-0000-000000000002";
/** An interaction between two OTHER people — the forged-token target. */
const STRANGER_INTERACTION = "dddddddd-0000-0000-0000-0000000000ff";

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

let workerRowId = "";
let requestId = "";
/** Accepted + already started → eligible. */
let eligibleBooking = "";
/** Accepted but starting in the future → NOT eligible (contract-conservative). */
let futureBooking = "";

const EXPERIENCES = "/lt/dashboard?result=experiences";

test.beforeAll(async () => {
  const workers = (await (
    await dbOk("GET", `workers?profile_id=eq.${WORKER_PROFILE}&select=id`)
  ).json()) as { id: string }[];
  if (!workers[0]) throw new Error("fixture worker row missing");
  workerRowId = workers[0].id;

  // A booking needs a customer_request to hang off — seed the minimum.
  const req = (await (
    await dbOk(
      "POST",
      "customer_requests",
      [{ profile_id: COMPANY_PROFILE, title: "E2E: patirties įėjimo taškas" }],
      "return=representation",
    )
  ).json()) as { id: string }[];
  requestId = req[0]?.id ?? "";

  const rows = (await (
    await dbOk(
      "POST",
      "booking_requests",
      [
        {
          owner_id: COMPANY_PROFILE,
          request_id: requestId,
          worker_id: workerRowId,
          status: "accepted",
          start_date: "2026-07-01",
          role_text: "E2E pamušalo montuotojas",
        },
      ],
      "return=representation",
    )
  ).json()) as { id: string }[];
  eligibleBooking = rows[0]?.id ?? "";

  // The same two parties cannot have a second booking on the same request
  // (unique owner+request+worker), so the future one needs its own request.
  const req2 = (await (
    await dbOk(
      "POST",
      "customer_requests",
      [{ profile_id: COMPANY_PROFILE, title: "E2E: dar neprasidėjęs" }],
      "return=representation",
    )
  ).json()) as { id: string }[];
  const rows2 = (await (
    await dbOk(
      "POST",
      "booking_requests",
      [
        {
          owner_id: COMPANY_PROFILE,
          request_id: req2[0]?.id,
          worker_id: workerRowId,
          status: "accepted",
          start_date: "2099-01-01",
          role_text: "E2E ateities darbas",
        },
      ],
      "return=representation",
    )
  ).json()) as { id: string }[];
  futureBooking = rows2[0]?.id ?? "";
});

test.afterAll(async () => {
  await db("DELETE", `experience_records?interaction_id=eq.${eligibleBooking}`);
  await db("DELETE", `booking_requests?request_id=eq.${requestId}`);
  await db("DELETE", `customer_requests?title=like.E2E:*`);
});

test.describe("the chat offers one chip per real interaction", () => {
  test.use({ storageState: COMPANY_STATE });

  test("saying it lists the ELIGIBLE interaction and opens the result", async ({ page }) => {
    await page.goto("/lt/dashboard");
    const composer = page.getByTestId("composer-input");
    await composer.fill("noriu palikti patirtį");
    await page.getByTestId("composer-send").click();

    // The chip carries the interaction's own context, not a generic verb.
    const chip = page.getByRole("button", { name: /E2E pamušalo montuotojas/ });
    await expect(chip).toBeVisible({ timeout: 60_000 });

    // The future booking is real and accepted — and still offers nothing.
    await expect(
      page.getByRole("button", { name: /E2E ateities darbas/ }),
    ).toHaveCount(0);

    await chip.click();
    // A RESULT depth, never a route.
    await expect(page).toHaveURL(/\?result=experiences&.*interaction=accepted_booking%3A/, {
      timeout: 60_000,
    });
    await expect(page).not.toHaveURL(/\/dashboard\/experiences/);
    await expect(page.getByTestId("experience-submit-form")).toBeVisible({ timeout: 60_000 });
  });

  test("the form mounts at the deep link and states which interaction grounds it", async ({
    page,
  }) => {
    await page.goto(
      `/lt/dashboard?result=experiences&interaction=accepted_booking:${eligibleBooking}`,
    );
    await expect(page.getByTestId("experience-submit-depth")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("experience-submit-form")).toBeVisible();
    // Only the contract's two options — no third choice, no scale.
    await expect(page.getByTestId("experience-sentiment-positive")).toBeVisible();
    await expect(page.getByTestId("experience-sentiment-negative")).toBeVisible();
    await expect(page.locator("input[type=number], input[type=range]")).toHaveCount(0);
    await expect(page.locator("text=/★|⭐|☆/")).toHaveCount(0);
  });

  test("a booking that has not started yet renders NO form, with a real reason", async ({
    page,
  }) => {
    await page.goto(
      `/lt/dashboard?result=experiences&interaction=accepted_booking:${futureBooking}`,
    );
    await expect(page.getByTestId("experience-submit-blocked-not_yet")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("experience-submit-form")).toHaveCount(0);
  });

  test("a forged token for someone else's interaction mounts no form at all", async ({
    page,
  }) => {
    await page.goto(
      `/lt/dashboard?result=experiences&interaction=accepted_booking:${STRANGER_INTERACTION}`,
    );
    await expect(page.getByTestId("experience-submit-blocked-not_available")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("experience-submit-form")).toHaveCount(0);
    // "Not a party" and "does not exist" must look identical — a distinct
    // answer would be an existence oracle for other people's interactions.
    await expect(page.getByTestId("experience-submit-blocked-not_yet")).toHaveCount(0);
  });

  test("a malformed token is not depth at all — the list renders instead", async ({ page }) => {
    await page.goto("/lt/dashboard?result=experiences&interaction=accepted_booking:not-a-uuid");
    await expect(page.getByTestId("experiences-result")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("experience-submit-form")).toHaveCount(0);
  });

  test("submitting once, then returning, shows the existing state — never a second form", async ({
    page,
  }) => {
    const url = `/lt/dashboard?result=experiences&interaction=accepted_booking:${eligibleBooking}`;
    await page.goto(url);
    await expect(page.getByTestId("experience-submit-form")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("experience-sentiment-positive").check();
    await page.getByTestId("experience-body").fill("E2E: darbas atliktas kaip sutarta.");
    await page.getByTestId("experience-submit").click();
    await expect(page.getByTestId("experience-submitted")).toBeVisible({ timeout: 60_000 });

    // Coming back to the SAME interaction: one interaction, one record.
    await page.goto(url);
    await expect(page.getByTestId("experience-submit-duplicate")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("experience-submit-form")).toHaveCount(0);
  });

  test("mobile 375px: the submit depth does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(
      `/lt/dashboard?result=experiences&interaction=accepted_booking:${futureBooking}`,
    );
    await openPanelFold(page);
    await expect(page.getByTestId("experience-submit-blocked-not_yet")).toBeVisible({
      timeout: 60_000,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("the other party is unaffected by the first party's record", () => {
  test.use({ storageState: WORKER_STATE });

  test("the worker still has their own eligible chip for the same booking", async ({ page }) => {
    // One record per (author, subject, interaction) — not one per interaction.
    await page.goto(EXPERIENCES);
    await expect(page.getByTestId("experiences-result")).toBeVisible({ timeout: 60_000 });
    await page.goto(
      `/lt/dashboard?result=experiences&interaction=accepted_booking:${eligibleBooking}`,
    );
    await expect(page.getByTestId("experience-submit-form")).toBeVisible({ timeout: 60_000 });
  });
});
