import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "./prod-walk";
import { bearerOf, qaApi } from "./prod-qa-api";
import { answerNoProjectIfAsked } from "./worklog-context";

// Explicit dispatch only, after the approved migration and existing VPS cron are live.
// All writes use existing allowlisted QA users' own sessions. No service key, cron
// invocation, approval decision, real organization or real recipient is accepted.
// The schedule is disabled in finally. Journal/report/approval evidence is retained.
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const slots = ["worker", "owner", "manager"];
test.skip(process.env.PROD_QA_WALK !== "1" || !slots.every((s) => existsSync(state(s))), "requires minted production QA sessions");
test.describe.configure({ timeout: 420_000, retries: 0 });
test.use({ actionTimeout: 30_000 });
type Row = Record<string, unknown>;
async function rows(path: `/${string}`, token: string): Promise<Row[]> {
  const res = await qaApi(path, token);
  expect(res.ok, "own QA read succeeds").toBe(true);
  const data: unknown = await res.json();
  expect(Array.isArray(data)).toBe(true);
  return data as Row[];
}
async function rpc(name: string, token: string, body: unknown): Promise<unknown> {
  const res = await qaApi(`/rest/v1/rpc/${name}`, token, { method: "POST", body });
  expect(res.ok, "QA command succeeds").toBe(true);
  return res.json();
}
async function self(token: string): Promise<string> {
  const res = await qaApi("/auth/v1/user", token);
  expect(res.ok).toBe(true);
  const data = await res.json();
  expect(data.app_metadata?.qa_synthetic, "identity is synthetic").toBe(true);
  return data.id as string;
}

test("worker chooses a delivery time; the existing cron submits journal hours to the chosen QA approver", async ({ browser }) => {
  const workerToken = bearerOf("worker"), ownerToken = bearerOf("owner"), otherToken = bearerOf("manager");
  const worker = await self(workerToken), owner = await self(ownerToken);
  await self(otherToken);
  const orgs = (await rows(`/rest/v1/organizations?select=id,display_name,legal_name&owner_profile_id=eq.${owner}`, ownerToken))
    .filter((row) => String(row.display_name ?? row.legal_name).startsWith("QA-SYNTHETIC Alfa"));
  expect(orgs).toHaveLength(1);
  const org = String(orgs[0].id);
  expect(String(orgs[0].display_name ?? orgs[0].legal_name).startsWith("QA-SYNTHETIC Alfa")).toBe(true);
  const workers = await rows(`/rest/v1/workers?select=id&profile_id=eq.${worker}`, workerToken);
  expect(workers).toHaveLength(1);
  const workerId = String(workers[0].id);
  const context = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const page = await context.newPage();
  let optedIn = false;
  try {
    // One reusable QA-only template. Validate its latest version BEFORE opting in.
    const definitionPath = `/rest/v1/workflow_definitions?select=id&organization_id=eq.${org}&slug=eq.qa_timesheet_schedule` as const;
    let definitions = await rows(definitionPath, ownerToken);
    if (!definitions.length) {
      expect(await rpc("create_workflow_definition_v1", ownerToken, {
        p_organization_id: org, p_name: "QA-SYNTHETIC schedule approval", p_slug: "qa_timesheet_schedule", p_context_entity_type: "timesheet",
        p_steps: [{ name: "QA-SYNTHETIC approval", approval_mode: "single", approver_rule: { kind: "profiles", profile_ids: [owner] } }],
      })).toBe("created");
      definitions = await rows(definitionPath, ownerToken);
    }
    expect(definitions).toHaveLength(1);
    const definition = String(definitions[0].id);
    const versions = await rows(`/rest/v1/workflow_definition_versions?select=id,published_at&definition_id=eq.${definition}&order=version.desc&limit=1`, ownerToken);
    expect(versions).toHaveLength(1);
    const steps = await rows(`/rest/v1/workflow_version_steps?select=approver_rule&version_id=eq.${versions[0].id}`, ownerToken);
    expect(steps).toEqual([{ approver_rule: { kind: "profiles", profile_ids: [owner] } }]);
    if (!versions[0].published_at) expect(await rpc("publish_workflow_version_v1", ownerToken, { p_version_id: versions[0].id })).toBe("published");

    const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const existing = await rows(`/rest/v1/timesheets?select=id,status,period_start,period_end&worker_id=eq.${workerId}&organization_id=eq.${org}&period_start=lte.${day}&period_end=gte.${day}`, workerToken);
    // Never rewrite or remove an existing report to make a test pass.
    expect(existing.length, "a fresh daily period is required; existing history is preserved").toBe(0);
    const tag = `QA-SYNTHETIC schedule ${process.env.GITHUB_RUN_ID ?? Date.now()}`;
    await page.goto("/lt/dashboard/journal");
    const main = page.getByRole("main");
    await expect(async () => {
      await main.getByTestId("journal-quick-record-text").fill("");
      await main.getByTestId("journal-quick-record-text").fill(`${tag}: vakar 2 valandas tinkavau sieną`);
      await main.getByTestId("journal-quick-record-understand").click({ timeout: 5_000 });
      await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 90_000 });
    const workContext = main.getByTestId("worklog-context");
    if (await workContext.count()) {
      const option = workContext.locator("option").filter({ hasText: "QA-SYNTHETIC Alfa" }).first();
      expect(await option.count(), "the exact QA employer is offered").toBe(1);
      await workContext.selectOption((await option.getAttribute("value"))!);
    }
    await answerNoProjectIfAsked(page);
    await main.getByTestId("worklog-date").fill(day);
    await main.getByTestId("worklog-save").click();
    await main.getByTestId("worklog-confirm").click();
    await expect(main.getByTestId("worklog-done")).toBeVisible({ timeout: 60_000 });
    const entries = await rows(`/rest/v1/journal_entries?select=id,engagement_context_id&worker_id=eq.${workerId}&original_text=like.${encodeURIComponent(tag)}*&order=created_at.desc&limit=2`, workerToken);
    expect(entries).toHaveLength(1);
    const entry = String(entries[0].id);
    const engagement = await rows(`/rest/v1/engagement_contexts?select=organization_id&id=eq.${entries[0].engagement_context_id}`, workerToken);
    expect(engagement).toEqual([{ organization_id: org }]);

    await page.goto("/lt/dashboard/planning#timesheets");
    await main.getByTestId("planning-timesheets-fold").locator(":scope > summary").click();
    const settings = main.getByTestId("timesheet-schedule-settings");
    await settings.locator("summary").click();
    const form = settings.locator("form").filter({ has: page.locator(`input[name="organizationId"][value="${org}"]`) });
    await expect(form).toHaveCount(1);
    // A near-future UTC minute exercises the actual scheduler without forcing global cron.
    const delivery = new Date(Date.now() + 180_000);
    const time = delivery.toISOString().slice(11, 16);
    expect(delivery.toISOString().slice(0, 10), "do not cross midnight during this walk").toBe(new Date().toISOString().slice(0, 10));
    await form.locator('[name="frequency"]').selectOption("daily");
    await form.locator('[name="localTime"]').fill(time);
    await form.locator('[name="timeZone"]').fill("UTC");
    await form.locator('[name="definitionId"]').selectOption(definition);
    await form.locator('[name="enabled"]').check();
    optedIn = true; // Also clean up when the response is lost after a successful save.
    await form.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/ts=schedule_saved/);
    const schedulePath = `/rest/v1/timesheet_schedules?select=id,enabled,next_run_at,last_outcome,last_timesheet_id,pending_instance_id&organization_id=eq.${org}&profile_id=eq.${worker}` as const;
    const saved = await rows(schedulePath, workerToken);
    expect(saved).toHaveLength(1);
    expect(saved[0].enabled).toBe(true);
    expect(String(saved[0].next_run_at).slice(11,16)).toBe(time);
    expect(await rows(schedulePath, ownerToken)).toHaveLength(0);
    expect(await rows(schedulePath, otherToken)).toHaveLength(0);

    await expect.poll(async () => (await rows(schedulePath, workerToken))[0]?.last_outcome, { timeout: 240_000, intervals: [10_000] }).toBe("submitted");
    const completed = (await rows(schedulePath, workerToken))[0];
    const report = await rows(`/rest/v1/timesheets?select=id,status,period_start,period_end,lines_snapshot&id=eq.${completed.last_timesheet_id}`, workerToken);
    expect(report).toHaveLength(1);
    expect(report[0].status).toBe("submitted");
    expect(report[0].period_start).toBe(day);
    expect(report[0].period_end).toBe(day);
    const snapshot = report[0].lines_snapshot as { lines: { journalEntryId: string; hours: number; day: string }[] };
    const ownLines = snapshot.lines.filter((line) => line.journalEntryId === entry);
    expect(ownLines.length).toBeGreaterThan(0);
    expect(ownLines.reduce((sum,line) => sum + Number(line.hours), 0)).toBe(2);
    expect(ownLines.every((line) => line.day === day)).toBe(true);
    const instances = await rows(`/rest/v1/workflow_instances?select=id,status,requester_profile_id&context_entity_type=eq.timesheet&context_entity_id=eq.${report[0].id}`, ownerToken);
    expect(instances).toHaveLength(1);
    expect(instances[0].status).toBe("pending");
    expect(instances[0].requester_profile_id).toBe(worker);
    const approvers = await rows(`/rest/v1/workflow_instance_approvers?select=approver_profile_id,decision&instance_id=eq.${instances[0].id}`, ownerToken);
    expect(approvers).toEqual([{ approver_profile_id: owner, decision: null }]);
    expect(await rows(`/rest/v1/timesheets?select=id&id=eq.${report[0].id}`, otherToken)).toHaveLength(0);
    await expect.poll(async () => (await rows(schedulePath, workerToken))[0]?.pending_instance_id, { timeout: 65_000, intervals: [5_000] }).toBeNull();
    await page.goto("/lt/dashboard/planning#timesheets");
    await main.getByTestId("planning-timesheets-fold").locator(":scope > summary").click();
    await expect(main.locator(`[data-testid="timesheet-${report[0].id}"]`)).toBeVisible({ timeout: 30_000 });
    const employer = await browser.newContext({ storageState: state("owner"), locale: "lt-LT" });
    try {
      const employerPage = await employer.newPage();
      await employerPage.goto("/lt/dashboard/planning#timesheets");
      await employerPage.getByRole("main").getByTestId("planning-timesheets-fold").locator(":scope > summary").click();
      await expect(employerPage.getByRole("main").locator(`[data-testid="timesheet-org-${report[0].id}"]`)).toBeVisible({ timeout: 30_000 });
    } finally { await employer.close(); }
    console.info("[timesheet-schedule] journalHours=2 scheduledSubmission=true chosenQaApprover=true approvalPending=true crossOrgDenied=true");
  } finally {
    if (optedIn) expect(await rpc("save_timesheet_schedule_v1", workerToken, { p_organization_id: org, p_definition_id: null, p_frequency: null, p_local_time: null, p_time_zone: null, p_weekday: null, p_enabled: false })).toBe("saved");
    await context.close();
  }
});
