import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { bearerOf, qaApi } from "./prod-qa-api";
import { test, expect, type Browser, type Page } from "./prod-walk";

/**
 * PRODUCTION J-12 LEARNER JOIN REQUEST — owner decision 2026-11-02 (decision
 * 0028, ARCH-3 for EDU-2): a learner asks to join a learning group on their
 * own; the institution's authorised person accepts; the learner is then a
 * member, and until then a request grants nothing.
 *
 * Needs migration 20261102160000 (PR #2959) applied. J-1 checks that first,
 * through the API, BEFORE it creates anything — a run before the apply fails
 * there and leaves no synthetic group behind.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=cohort-join-request)
 * with the synthetic cast:
 *   owner    — manages QA-SYNTHETIC Alfa (a training provider, see learning-practice)
 *   worker2  — "QA-SYNTHETIC Worker", the learner
 * Each run makes its own group (the run id is in its name). afterAll ends the
 * learner's membership in it and archives the group, so runs do not pile up
 * synthetic groups; the archived rows stay as audit data.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
// Matched as a prefix: the production name is "QA-SYNTHETIC Alfa (testinis subjektas)".
const ALFA = "QA-SYNTHETIC Alfa";
const PROGRAM = "QA-SYNTHETIC praktikos programa";
const COHORT = `QA-SYNTHETIC prašymų grupė ${RUN}`;
const TYPED = `QA-SYNTHETIC besimokantis ${RUN}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["owner", "worker2"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function workspace(page: Page, orgName: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

async function education(page: Page): Promise<void> {
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/education");
  await expect(page.getByTestId("institution-programs")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("institution-programs-unavailable")).toHaveCount(0);
}

const subOf = (token: string): string =>
  JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")).sub as string;

const cohortRow = (page: Page) => page.locator('li[data-testid^="cohort-"]', { hasText: COHORT }).first();

let cohortId = "";
let learnerId = "";

test.afterAll(async () => {
  if (!ENABLED || !cohortId) return;
  // No synthetic member stays in the group, and the group itself is archived
  // (archiving also closes it for requests and declines anything pending).
  const owner = bearerOf("owner");
  if (learnerId) {
    // Only an ACTIVE membership is ended through set_education_cohort_member_v1.
    // A request still pending is withdrawn by the learner (a request row is
    // never flipped by the member command); archive below declines anything left.
    const learner = bearerOf("worker2");
    const own = await qaApi(`/rest/v1/education_cohort_members?cohort_id=eq.${cohortId}&select=status`, learner);
    const status = own.ok ? ((await own.json()) as Array<{ status: string }>)[0]?.status : undefined;
    if (status === "requested") {
      const wd = await qaApi("/rest/v1/rpc/withdraw_education_cohort_join_v1", learner, { method: "POST", body: { p_cohort_id: cohortId } });
      console.info(`[join] clean-up: request withdrawn ${wd.status}`);
    } else if (status === "active") {
      const left = await qaApi("/rest/v1/rpc/set_education_cohort_member_v1", owner, {
        method: "POST",
        body: { p_cohort_id: cohortId, p_profile_id: learnerId, p_status: "left" },
      });
      console.info(`[join] clean-up: membership ended ${left.status}`);
    }
  }
  const archived = await qaApi("/rest/v1/rpc/archive_education_cohort_v1", owner, {
    method: "POST",
    body: { p_cohort_id: cohortId },
  });
  console.info(`[join] clean-up: group archived ${archived.status}`);
});

test("J-1. the institution makes a group and opens it for learners' requests", async ({ browser }) => {
  // Before creating anything: the join-request commands exist (migration applied).
  const probe = await qaApi("/rest/v1/rpc/list_open_education_cohorts_v1", bearerOf("owner"), { method: "POST", body: {} });
  expect(probe.ok, "migration 20261102160000 is applied (list_open_education_cohorts_v1 answers)").toBe(true);
  const { page, close } = await as(browser, "owner");
  await education(page);
  const program = page.locator('[data-testid^="program-"]', { hasText: PROGRAM }).first();
  await expect(program, "the learning-practice programme exists (walk learning-practice creates it)").toBeVisible({ timeout: 30_000 });
  const form = program.locator('[data-testid^="create-cohort-form-"]').first();
  const programId = (await form.getAttribute("data-testid"))!.replace("create-cohort-form-", "");
  await page.getByTestId(`cohort-name-${programId}`).fill(COHORT);
  await page.getByTestId(`cohort-create-${programId}`).click();
  await expect(form.getByTestId("program-form-saved")).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  await page.reload();
  const toggle = cohortRow(page).locator('form[data-testid^="cohort-join-toggle-"]');
  await expect(toggle, "the open-for-requests switch is offered (migration 20261102160000 applied)").toBeVisible({ timeout: 30_000 });
  cohortId = (await toggle.getAttribute("data-testid"))!.replace("cohort-join-toggle-", "");
  await page.getByTestId(`cohort-join-toggle-submit-${cohortId}`).click();
  await page.reload();
  await expect(cohortRow(page).getByText(/gali rasti šią grupę/)).toBeVisible({ timeout: 30_000 });
  await close();
});

test("J-2. the learner finds the group and asks to join, keeping their own record declared", async ({ browser }) => {
  expect(cohortId).not.toBe("");
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/profile");
  const section = page.getByTestId("learner-cohort-join").filter({ visible: true });
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section.getByTestId("learner-cohort-join-declared")).toContainText("deklaruot");
  const summary = section.locator("details > summary").first();
  if ((await section.locator("details").first().getAttribute("open")) === null) await summary.click();
  const group = section.getByTestId(`learner-cohort-${cohortId}`);
  await expect(group).toContainText(COHORT, { timeout: 30_000 });
  await page.getByTestId(`cohort-join-name-${cohortId}`).fill(TYPED);
  await page.getByTestId(`cohort-join-note-${cohortId}`).fill(`QA-SYNTHETIC ${RUN}`);
  await page.getByTestId(`cohort-join-send-${cohortId}`).click();
  // On success the action revalidates the page: the group re-renders as
  // "requested" (status + withdraw) and the form, with its one-shot state line,
  // is gone — so wait for the status, not for the transient line.
  await expect(group.getByTestId(`learner-cohort-status-${cohortId}`)).toHaveAttribute("data-status", "requested", { timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId(`learner-cohort-status-${cohortId}`).filter({ visible: true })).toHaveAttribute("data-status", "requested", {
    timeout: 30_000,
  });
  await close();
});

test("J-2b. a request grants nothing, and the learner cannot accept it themselves", async () => {
  const token = bearerOf("worker2");
  learnerId = subOf(token);
  const read = await qaApi(`/rest/v1/education_cohorts?id=eq.${cohortId}&select=id`, token);
  expect(read.ok).toBe(true);
  expect(await read.json(), "a pending request reads no cohort").toEqual([]);
  const self = await qaApi("/rest/v1/rpc/decide_education_cohort_join_v1", token, {
    method: "POST",
    body: { p_cohort_id: cohortId, p_profile_id: learnerId, p_decision: "accept" },
  });
  expect(self.ok, "the learner accepted their own request").toBe(false);
});

test("J-2c. callers without authority over the group are refused and read no request text", async () => {
  // Synthetic identities available to this walk: `worker` (a plain worker —
  // wrong role) and `agency` (manages ANOTHER organisation). The cast has no
  // external_manager on QA-SYNTHETIC Alfa; that case is proven in the DB proofs.
  // Not signed in = anon (no bearer).
  const callers: Array<[string, string | null]> = [["anon", null]];
  for (const slot of ["worker", "agency"]) if (existsSync(state(slot))) callers.push([slot, bearerOf(slot)]);
  for (const [who, token] of callers) {
    const rows = await qaApi(`/rest/v1/education_cohort_members?cohort_id=eq.${cohortId}&select=status,request_label,request_note`, token);
    const body = rows.ok ? ((await rows.json()) as unknown[]) : [];
    expect(body, `${who} reads no membership or request text`).toEqual([]);
    const attempts: Array<[string, Record<string, unknown>]> = [
      ["decide_education_cohort_join_v1", { p_cohort_id: cohortId, p_profile_id: learnerId, p_decision: "accept" }],
      ["set_education_cohort_member_v1", { p_cohort_id: cohortId, p_profile_id: learnerId, p_status: "active" }],
      ["set_education_cohort_join_requests_v1", { p_cohort_id: cohortId, p_open: false }],
      ["archive_education_cohort_v1", { p_cohort_id: cohortId }],
    ];
    for (const [fn, args] of attempts) {
      const r = await qaApi(`/rest/v1/rpc/${fn}`, token, { method: "POST", body: args });
      expect(r.ok, `${who} was allowed ${fn}`).toBe(false);
    }
  }
  const still = await qaApi(`/rest/v1/education_cohort_members?cohort_id=eq.${cohortId}&select=status`, bearerOf("worker2"));
  expect(await still.json(), "the request is still pending after the refused attempts").toEqual([{ status: "requested" }]);
});

test("J-3. the institution's authorised person sees the request by the typed name and accepts it", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await education(page);
  const request = page.getByTestId(`cohort-join-request-${cohortId}-${learnerId}`);
  await expect(request).toBeVisible({ timeout: 30_000 });
  await expect(request).toContainText(TYPED);
  await expect(page.getByTestId(`cohort-join-request-unverified-${cohortId}-${learnerId}`)).toContainText("nepatikrinta");
  // Accept takes a second, explicit click.
  await page.getByTestId(`cohort-join-accept-${cohortId}-${learnerId}`).click();
  await page.getByTestId(`cohort-join-accept-confirm-${cohortId}-${learnerId}`).click();
  await expect
    .poll(
      async () => {
        await page.reload({ timeout: 20_000 }).catch(() => undefined);
        return page.getByTestId(`cohort-join-request-${cohortId}-${learnerId}`).count();
      },
      { timeout: 60_000, intervals: [3_000] },
    )
    .toBe(0);
  // Accept clears the learner-typed name from the member row, so the chip names
  // the learner by the institution's own invitation (an earlier
  // learning-practice run) or, without one, by the id prefix.
  await expect(cohortRow(page)).toContainText(new RegExp(`QA-SYNTHETIC (Worker|mokinys)|${learnerId.slice(0, 8)}`), { timeout: 30_000 });
  await expect(cohortRow(page)).not.toContainText(TYPED);
  await close();
});

test("J-4. the learner is a member: the group is on their compass and no longer in the finder", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/profile");
  await expect(page.getByTestId("learning-compass").filter({ visible: true })).toContainText(COHORT, { timeout: 30_000 });
  await expect(page.getByTestId(`learner-cohort-${cohortId}`)).toHaveCount(0);
  const read = await qaApi(`/rest/v1/education_cohorts?id=eq.${cohortId}&select=id`, bearerOf("worker2"));
  expect(await read.json(), "a member reads the cohort").toEqual([{ id: cohortId }]);
  await close();
});
