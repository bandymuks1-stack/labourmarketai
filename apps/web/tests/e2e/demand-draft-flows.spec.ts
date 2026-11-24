/**
 * Where the private demand draft actually lives (post-W3).
 *
 * ── WHY THIS FILE WAS REWRITTEN ────────────────────────────────────────────
 * It used to drive three standalone `DemandDraftForm` mounts — company,
 * agency, buyer — using a minted session for one personal Gmail account that
 * happened to hold all four roles. Every premise of that has since gone:
 *
 *   1. `/dashboard/company` no longer mounts a standalone draft form. The W3
 *      consolidation absorbed it into `DemandRequestButton`, which is the ONE
 *      demand home. `pilot-draft-form-company_request` is not rendered there
 *      and has not been for some time.
 *   2. `/dashboard/agency` does not exist. It is a permanent redirect to
 *      `/dashboard/company` (next.config REDIRECTS). The old spec navigated
 *      there, silently landed on the company page, and then failed looking for
 *      an agency form.
 *   3. `/dashboard/buyer` still mounts the form, but it is gated on the
 *      `customer` role, and the shared storage state is a worker or company
 *      session. The old spec never had a customer session on the local stack.
 *
 * So the file failed three times on every local run while the product was
 * working correctly. A suite that cries wolf is worse than no suite: the next
 * person to see red has to spend an hour proving it means nothing. (It cost
 * exactly that on 2026-08-26.)
 *
 * ── WHAT IT ASSERTS NOW ────────────────────────────────────────────────────
 * The invariants that are actually true and actually worth protecting:
 * the retired route still lands somewhere real, the consolidated draft control
 * is where W3 put it, and the buyer page is genuinely closed to a session
 * without the role.
 *
 * The company draft save/reload round-trip itself is covered — with a real DB
 * assertion — by `w3-demand-consolidation.spec.ts` ("private draft save writes
 * a REAL draft row and survives reload"). It is deliberately not duplicated
 * here.
 */
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const STORAGE_STATE = join(__dirname, ".storage-state.json");

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });

test("the retired agency route lands on the company workspace", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/lt/dashboard/agency", { waitUntil: "domcontentloaded" });
  // A permanent redirect, not a 404: somebody's bookmark must still work.
  await expect(page).toHaveURL(/\/lt\/dashboard\/company/, { timeout: 40_000 });
});

test("the private draft control is the consolidated one, not a second form", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/lt/dashboard/company", { waitUntil: "domcontentloaded" });

  // A session without the company role is redirected by requireRoleOrRedirect;
  // that is the ONLY reason to skip. Never skip on "the element is not there
  // yet" — a cold dev compile of this route takes tens of seconds, and a skip
  // on that timing would make this test silently vacuous.
  if (!/\/dashboard\/company/.test(page.url())) {
    test.skip(true, "this session holds no company role — not its workspace");
  }

  // The consolidated intake owns the draft leg…
  await expect(page.getByTestId("demand-intake-section")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("demand-form")).toBeVisible({ timeout: 20_000 });
  // …and the standalone mount this file used to drive is genuinely gone. If it
  // ever comes back there are two draft surfaces on one page, which is the
  // duplication W3 removed.
  await expect(
    page.getByTestId("pilot-draft-form-company_request"),
  ).toHaveCount(0);
});

test("the buyer workspace is closed to a session without the customer role", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/lt/dashboard/buyer", { waitUntil: "domcontentloaded" });
  // requireRoleOrRedirect("customer") — a worker/company session must not see
  // the buyer draft form, and must not be left on a dead page either.
  await expect(page).not.toHaveURL(/\/lt\/dashboard\/buyer$/, {
    timeout: 40_000,
  });
  await expect(page.getByTestId("pilot-draft-form-buyer_request")).toHaveCount(0);
});
