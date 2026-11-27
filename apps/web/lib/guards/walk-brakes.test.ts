import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  THRESHOLDS,
  gapRemainingSeconds,
  judgeDeployBrake,
  runShippedFromJobs,
  readDeployVerdict,
  readStandaloneDeployVerdict,
  judgeErrorBrake,
  judgeHealth,
  judgeHealthSamples,
  judgeSupabaseEdge,
  judgeSr1Readings,
  judgeWalkRun,
  SR1_READING_KEYS,
} from "../../../../.github/scripts/walk-brakes.mjs";

/**
 * PRODUCTION WALK BRAKES (owner order 2026-10-23): the daily walk budget rises
 * to 200, so every walk passes automatic load and error brakes first. These are
 * the brakes' pure judges, and the workflow wiring that makes two of them
 * impossible to bypass with `budget_override`.
 */

const healthy = {
  ok: true,
  build: "abcdef12",
  checks: { auth: { ok: true, ms: 120 }, db: { ok: true, ms: 180 } },
  vacancyFreshness: { ok: true, ms: 200, state: "fresh" },
};

describe("health brake", () => {
  it("passes a healthy, fast production", () => {
    expect(judgeHealth(healthy).ok).toBe(true);
  });

  it.each([
    ["ok=false", { ...healthy, ok: false }],
    ["db slow", { ...healthy, checks: { ...healthy.checks, db: { ok: true, ms: THRESHOLDS.healthDbMs + 1 } } }],
    ["auth slow", { ...healthy, checks: { ...healthy.checks, auth: { ok: true, ms: THRESHOLDS.healthAuthMs + 1 } } }],
    ["db failed", { ...healthy, checks: { ...healthy.checks, db: { ok: false, ms: 50, reason: "http_503" } } }],
    ["freshness unreadable", { ...healthy, vacancyFreshness: { ok: false, ms: 9, state: "unavailable" } }],
    ["latency missing", { ...healthy, checks: { auth: { ok: true }, db: { ok: true } } }],
    ["not JSON", null],
  ])("refuses: %s", (_name, report) => {
    const v = judgeHealth(report);
    expect(v.ok).toBe(false);
    expect(v.reasons.length).toBeGreaterThan(0);
  });

  it("the thresholds are the documented ones", () => {
    expect(THRESHOLDS.healthDbMs).toBe(1500);
    expect(THRESHOLDS.healthAuthMs).toBe(1500);
    expect(THRESHOLDS.healthSamples).toBe(3);
    expect(THRESHOLDS.healthSampleGapMs).toBe(5_000);
    expect(THRESHOLDS.deployQuietMinutes).toBe(5);
    expect(THRESHOLDS.minGapSeconds).toBe(180);
  });

  it("every one of the samples must pass: one slow or non-200 sample refuses", () => {
    const good = { status: 200, report: healthy };
    expect(judgeHealthSamples([good, good, good]).ok).toBe(true);
    const slow = { status: 200, report: { ...healthy, checks: { ...healthy.checks, db: { ok: true, ms: 1805 } } } };
    expect(judgeHealthSamples([slow, good, good]).ok).toBe(false);
    expect(judgeHealthSamples([good, { status: 503, report: { ...healthy, ok: false } }, good]).ok).toBe(false);
    expect(judgeHealthSamples([good, good, { status: 0, report: null }]).ok).toBe(false);
    expect(judgeHealthSamples([good, good]).ok).toBe(false);
  });
});

describe("a deploy run holds the quiet period only if it shipped (run 45472560135)", () => {
  const ship = (conclusion: string | null) => ({ name: "deploy", conclusion: "success", steps: [{ name: "Ship + activate on the VPS (forced-command receiver)", conclusion }] });
  it("a run cancelled while pending, or with every job skipped, shipped nothing", () => {
    expect(runShippedFromJobs([])).toBe(false);
    expect(runShippedFromJobs([{ name: "gate", conclusion: "failure" }, { name: "deploy", conclusion: "skipped", steps: [] }])).toBe(false);
    expect(runShippedFromJobs([ship("skipped")])).toBe(false); // never-backwards skip
  });
  it("a ship step that ran counts, whatever its outcome", () => {
    expect(runShippedFromJobs([ship("success")])).toBe(true);
    expect(runShippedFromJobs([ship("failure")])).toBe(true);
    expect(runShippedFromJobs([ship("cancelled")])).toBe(true);
  });
  it("keeps the quiet period when any retry shipped, regardless of attempt order", () => {
    for (const outcome of ["success", "failure", "cancelled"]) {
      for (const noShip of [ship("skipped"), ship(null), { name: "deploy", conclusion: "skipped", steps: [] }]) {
        expect(runShippedFromJobs([noShip, ship(outcome)])).toBe(true);
        expect(runShippedFromJobs([ship(outcome), noShip])).toBe(true);
      }
    }
    expect(runShippedFromJobs([ship("skipped"), ship(null)])).toBe(false);
  });
  it("ignores ship-like steps outside the deploy job", () => {
    expect(runShippedFromJobs([{ ...ship("success"), name: "build" }, ship("skipped")])).toBe(false);
  });
  it("the brake reads every job and step of each recent run, and an unreadable run still counts as a deploy", () => {
    const src = readFileSync(resolve(__dirname, "../../../../.github/scripts/walk-brakes.mjs"), "utf8");
    expect(src).toContain("r.deploySkipped = !runShippedFromJobs(jobs);");
    expect(src).toMatch(/\} catch \{\n\s+r\.deploySkipped = false;/);
  });
});

describe("deploy brake", () => {
  const now = new Date("2026-10-23T16:00:00Z");
  const done = (minAgo: number, id = 1) => ({
    id,
    status: "completed",
    updated_at: new Date(now.getTime() - minAgo * 60_000).toISOString(),
  });
  it.each(["in_progress", "queued", "waiting", "requested", "pending"])("refuses while a deploy is %s", (status) => {
    expect(judgeDeployBrake([{ id: 9, status, updated_at: now.toISOString() }, done(60)], now).refuse).toBe(true);
  });
  it("refuses within the quiet period after a deploy, allows after it", () => {
    expect(judgeDeployBrake([done(2), done(60, 2)], now).refuse).toBe(true);
    expect(judgeDeployBrake([done(THRESHOLDS.deployQuietMinutes + 1)], now).refuse).toBe(false);
    expect(judgeDeployBrake([], now).refuse).toBe(false);
  });
  it("a finished run that shipped nothing holds no quiet period, a running one still refuses", () => {
    expect(judgeDeployBrake([{ ...done(1), deploySkipped: true }, done(60, 2)], now).refuse).toBe(false);
    expect(judgeDeployBrake([{ ...done(1), deploySkipped: true }, done(2, 2)], now).refuse).toBe(true);
    expect(judgeDeployBrake([{ id: 9, status: "in_progress", updated_at: now.toISOString() }], now).refuse).toBe(true);
  });
  it("judges by the most recent end, whatever the list order", () => {
    expect(judgeDeployBrake([done(60), done(1, 2)], now).refuse).toBe(true);
  });

  describe("inside a deploy-vps run (the post-deploy checks of ONE deploy queue)", () => {
    const own = (minAgo: number | null) => ({
      id: 7,
      deployEndedAt: minAgo === null ? null : new Date(now.getTime() - minAgo * 60_000).toISOString(),
    });
    const self = { id: 7, status: "in_progress", updated_at: now.toISOString() };
    it("its own run is not another deploy, and the quiet period counts from its own deploy job", () => {
      expect(judgeDeployBrake([self, done(60)], now, THRESHOLDS, own(THRESHOLDS.deployQuietMinutes + 1)).refuse).toBe(false);
      expect(judgeDeployBrake([self, done(60)], now, THRESHOLDS, own(2)).refuse).toBe(true);
    });
    it.each(["queued", "waiting", "requested", "pending"])("a run %s in the deploy group cannot start before it, so it does not refuse", (status) => {
      expect(judgeDeployBrake([{ id: 9, status, updated_at: now.toISOString() }, self], now, THRESHOLDS, own(10)).refuse).toBe(false);
    });
    it("another run in progress is outside the queue and still refuses; an unreadable own deploy end refuses", () => {
      expect(judgeDeployBrake([{ id: 9, status: "in_progress", updated_at: now.toISOString() }, self], now, THRESHOLDS, own(10)).refuse).toBe(true);
      expect(judgeDeployBrake([self], now, THRESHOLDS, own(null)).refuse).toBe(true);
    });
    it("without the own run nothing changes: the same lists refuse as before", () => {
      expect(judgeDeployBrake([self, done(60)], now).refuse).toBe(true);
    });
  });
});

describe("standalone deploy evidence survives capped run history", () => {
  const repo = "owner/project";
  const prefix = `repos/${repo}`;
  const now = new Date("2026-11-25T16:00:00Z");
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const active = ["in_progress", "queued", "waiting", "requested", "pending"];
  const historyPath = `${prefix}/actions/workflows/deploy-vps.yml/runs?per_page=10`;
  const deploymentsPath = `${prefix}/deployments?environment=production-vps&per_page=50`;
  type Candidate = { workflow?: string; jobName?: string; endedAgo?: number; createdAgo?: number };

  function setup(specs: Candidate[] = [{}]) {
    const responses = new Map<string, unknown>();
    const calls: string[] = [];
    responses.set(historyPath, { total_count: 0, workflow_runs: [] });
    for (const status of active) {
      responses.set(`${prefix}/actions/workflows/deploy-vps.yml/runs?status=${status}&per_page=1`, { total_count: 0, workflow_runs: [] });
    }
    const candidates = specs.map((spec, index) => {
      const deployment = { id: 500 - index, environment: "production-vps", created_at: ago(spec.createdAgo ?? 15 + index) };
      const run = { id: 1000 + index, path: spec.workflow ?? ".github/workflows/deploy-vps.yml", status: "completed", created_at: ago(500) };
      const job = {
        id: 2000 + index, run_id: run.id, name: spec.jobName ?? "deploy", status: "completed", conclusion: "success",
        completed_at: ago(spec.endedAgo ?? 1),
      };
      const status = { state: "success", log_url: `https://github.com/${repo}/actions/runs/${run.id}/job/${job.id}` };
      const statusPath = `${prefix}/deployments/${deployment.id}/statuses?per_page=1`;
      const jobPath = `${prefix}/actions/jobs/${job.id}`;
      const runPath = `${prefix}/actions/runs/${run.id}`;
      responses.set(statusPath, [status]);
      responses.set(jobPath, job);
      responses.set(runPath, run);
      return { deployment, status, job, run, statusPath, jobPath, runPath };
    });
    responses.set(deploymentsPath, candidates.map((c) => c.deployment));
    const api = (path: string): unknown => {
      calls.push(path);
      if (!responses.has(path)) throw new Error("unexpected API read");
      return responses.get(path);
    };
    return { responses, calls, candidates, api };
  }
  const verdict = (f: ReturnType<typeof setup>) => readDeployVerdict({ api: f.api, repo, now, ownId: 0 });

  it("ten cancelled pending runs cannot hide the eleventh run's recent ship", () => {
    const f = setup();
    const runs = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, status: "completed", conclusion: "cancelled", updated_at: ago(1) }));
    f.responses.set(historyPath, { total_count: 10000, workflow_runs: runs });
    for (const run of runs) f.responses.set(`${prefix}/actions/runs/${run.id}/jobs?filter=all&per_page=100`, { total_count: 0, jobs: [] });
    const result = verdict(f);
    expect(result.refuse).toBe(true);
    expect(result.reason).toContain("quiet period 5 min");
    expect(f.calls).toContain(f.candidates[0].jobPath);
    expect(f.calls.filter((path) => path.includes("/runs?per_page="))).toEqual([historyPath]);
  });

  it.each([5, 6, 60])("clears after %i quiet minutes without scanning lifetime run history", (endedAgo) => {
    const f = setup([{ endedAgo, createdAgo: endedAgo + 10 }]);
    f.responses.set(historyPath, { total_count: 10000, workflow_runs: [] });
    expect(verdict(f).refuse).toBe(false);
    expect(f.calls).toHaveLength(10); // one old guard + five active probes + deployments/status/job/run
  });

  it.each([[1, true], [10, false]] as const)(
    "a verified skipped ship uses the older actual ship (%i minutes ago, refuse=%s)", (endedAgo, refuse) => {
      const f = setup([
        { createdAgo: 0.5, endedAgo: 0.25 },
        { createdAgo: 20, endedAgo },
      ]);
      for (const [index, conclusion] of [[0, "skipped"], [1, "success"]] as const) {
        const candidate = f.candidates[index];
        f.responses.set(candidate.jobPath, {
          ...candidate.job,
          steps: [{ name: "Ship + activate on the VPS (forced-command receiver)", conclusion }],
        });
      }
      const result = verdict(f);
      expect(result.refuse).toBe(refuse);
      expect(result.reason).toContain(`ended ${endedAgo} min`);
      expect(f.calls).toContain(f.candidates[1].jobPath);
    },
  );

  it("refuses when every deployment is a proven skipped ship and no actual ship is found", () => {
    const f = setup();
    const candidate = f.candidates[0];
    f.responses.set(candidate.jobPath, {
      ...candidate.job,
      steps: [{ name: "Ship + activate on the VPS (forced-command receiver)", conclusion: "skipped" }],
    });
    const result = verdict(f);
    expect(result.refuse).toBe(true);
    expect(result.reason).toContain("no deploy job was found");
  });

  it.each([{ steps: undefined }, { steps: null }, { steps: [] }, { steps: [{ name: "Ship + activate on the VPS (forced-command receiver)", conclusion: null }] }])(
    "keeps the quiet period when ship-step evidence is incomplete: %j", ({ steps }) => {
      const f = setup([
        { createdAgo: 2, endedAgo: 1 },
        { createdAgo: 20, endedAgo: 10 },
      ]);
      const candidate = f.candidates[0];
      f.responses.set(candidate.jobPath, { ...candidate.job, steps });
      expect(verdict(f).refuse).toBe(true);
      expect(f.calls).not.toContain(f.candidates[1].jobPath);
    },
  );

  it("keeps the 50-object cap when all verified deploy jobs skipped shipping", () => {
    const f = setup(Array.from({ length: 50 }, () => ({ endedAgo: 10 })));
    for (const candidate of f.candidates) {
      f.responses.set(candidate.jobPath, {
        ...candidate.job,
        steps: [{ name: "Ship + activate on the VPS (forced-command receiver)", conclusion: "skipped" }],
      });
    }
    const result = readStandaloneDeployVerdict(f.api, repo, now);
    expect(result.refuse).toBe(true);
    expect(result.reason).toContain("scan limit");
    expect(f.calls).toHaveLength(156);
    expect(f.calls.filter((path) => path.includes("/deployments?"))).toEqual([deploymentsPath]);
  });
  it("uses the rerun's environment job completion, not the old workflow creation time", () => {
    const f = setup([{ createdAgo: 2, endedAgo: 1 }]);
    expect(f.candidates[0].run.created_at).toBe(ago(500));
    expect(verdict(f).refuse).toBe(true);
  });

  it("a newer read-only status job cannot hide an older-created deploy that just finished", () => {
    const f = setup([
      { workflow: ".github/workflows/vps-status.yml", jobName: "status", createdAgo: 10, endedAgo: 6 },
      { createdAgo: 20, endedAgo: 1 },
    ]);
    expect(verdict(f).refuse).toBe(true);
    expect(f.calls).toContain(f.candidates[1].jobPath);
  });

  it.each(active)("finds an old workflow rerun that is %s outside the capped history", (status) => {
    const f = setup([{ endedAgo: 10 }]);
    f.responses.set(`${prefix}/actions/workflows/deploy-vps.yml/runs?status=${status}&per_page=1`, {
      total_count: 1, workflow_runs: [{ id: 1, status, created_at: ago(500) }],
    });
    expect(verdict(f)).toEqual({ refuse: true, reason: `a production deploy is ${status}` });
    expect(f.calls).not.toContain(deploymentsPath);
  });

  it.each([null, {}, { total_count: 1, workflow_runs: [] }, { total_count: 0, workflow_runs: [{}] }, { total_count: -1, workflow_runs: [] }])(
    "refuses malformed active-run evidence: %j", (response) => {
      const f = setup();
      f.responses.set(`${prefix}/actions/workflows/deploy-vps.yml/runs?status=in_progress&per_page=1`, response);
      expect(verdict(f).refuse).toBe(true);
    },
  );

  it.each(["success", "failure", "cancelled", "skipped", "timed_out"])("keeps the quiet period for a completed deploy job with conclusion %s", (conclusion) => {
    const f = setup();
    f.candidates[0].job.conclusion = conclusion;
    expect(verdict(f).refuse).toBe(true);
  });

  it.each(["queued", "pending", "in_progress", "unknown"])("refuses a deployment status of %s", (state) => {
    const f = setup([{ endedAgo: 10 }]);
    f.candidates[0].status.state = state;
    expect(verdict(f).refuse).toBe(true);
  });

  it.each([
    ".github/workflows/unknown.yml",
    ".github/workflows/vps-status.yml",
  ])("does not trust an unmatched workflow/job pair: %s", (workflow) => {
    const f = setup([{ workflow, endedAgo: 10 }]);
    expect(verdict(f).refuse).toBe(true); // vps-status must also name its read-only `status` job
  });

  it.each([
    "https://github.com/other/project/actions/runs/1000/job/2000",
    "https://elsewhere.invalid/owner/project/actions/runs/1000/job/2000",
    "https://github.com/owner/project/actions/runs/1000",
    "https://github.com/owner/project/actions/runs/1000/job/2000?elsewhere=1",
    "not a URL",
  ])("refuses an untrusted or incomplete deployment log URL: %s", (logUrl) => {
    const f = setup([{ endedAgo: 10 }]);
    f.candidates[0].status.log_url = logUrl;
    expect(verdict(f).refuse).toBe(true);
    expect(f.calls).not.toContain(f.candidates[0].jobPath);
  });

  it("refuses mismatched run/job identities and invalid job conclusions", () => {
    for (const patch of [{ id: 9 }, { run_id: 9 }, { conclusion: "unknown" }, { name: "build" }]) {
      const f = setup([{ endedAgo: 10 }]);
      f.responses.set(f.candidates[0].jobPath, { ...f.candidates[0].job, ...patch });
      expect(verdict(f).refuse).toBe(true);
    }
    const f = setup([{ endedAgo: 10 }]);
    f.candidates[0].run.id = 9;
    expect(verdict(f).refuse).toBe(true);
  });

  it.each([null, "invalid", ago(-1), ago(16)])("refuses an invalid completion time: %s", (completedAt) => {
    const f = setup([{ endedAgo: 10 }]);
    f.responses.set(f.candidates[0].jobPath, { ...f.candidates[0].job, completed_at: completedAt });
    expect(verdict(f).refuse).toBe(true);
  });

  it("refuses a job or workflow still running even if an earlier active probe was empty", () => {
    for (const kind of ["job", "run"] as const) {
      const f = setup([{ endedAgo: 10 }]);
      f.candidates[0][kind].status = "in_progress";
      expect(verdict(f).refuse).toBe(true);
    }
  });

  it("refuses missing evidence or API failures at every new read boundary", () => {
    const baseline = setup([{ endedAgo: 10 }]);
    verdict(baseline);
    for (const path of baseline.calls.filter((p) => p !== historyPath)) {
      const missing = setup([{ endedAgo: 10 }]);
      missing.responses.delete(path);
      expect(verdict(missing).refuse, path).toBe(true);
      const malformed = setup([{ endedAgo: 10 }]);
      malformed.responses.set(path, null);
      expect(verdict(malformed).refuse, path).toBe(true);
    }
  });

  it("refuses empty, malformed or unordered deployment lists", () => {
    for (const response of [[], {}, [null]]) {
      const f = setup();
      f.responses.set(deploymentsPath, response);
      expect(verdict(f).refuse).toBe(true);
    }
    const f = setup([{ createdAgo: 20 }, { createdAgo: 10 }]);
    expect(verdict(f).refuse).toBe(true);
  });

  it("stops after at most 50 deployment objects and refuses an unproven quiet period", () => {
    const f = setup(Array.from({ length: 50 }, () => ({ workflow: ".github/workflows/vps-status.yml", jobName: "status", endedAgo: 10 })));
    const result = readStandaloneDeployVerdict(f.api, repo, now);
    expect(result.refuse).toBe(true);
    expect(result.reason).toContain("scan limit");
    expect(f.calls).toHaveLength(156);
    expect(f.calls.filter((path) => path.includes("/deployments?"))).toEqual([deploymentsPath]);
  });

  it("does not call the standalone evidence path when the existing brake already refuses", () => {
    const f = setup();
    f.responses.set(historyPath, { total_count: 1, workflow_runs: [{ id: 7, status: "in_progress", updated_at: ago(1) }] });
    expect(verdict(f).refuse).toBe(true);
    expect(f.calls).toEqual([historyPath]);
  });

  it("keeps the serialized own-deploy path unchanged, with no deployment or active-status reads", () => {
    const f = setup();
    f.responses.set(historyPath, { total_count: 1, workflow_runs: [{ id: 7, status: "in_progress", updated_at: ago(1) }] });
    const ownJobs = `${prefix}/actions/runs/7/jobs?per_page=100`;
    f.responses.set(ownJobs, { jobs: [{ name: "deploy", status: "completed", conclusion: "success", completed_at: ago(6) }] });
    expect(readDeployVerdict({ api: f.api, repo, now, ownId: 7 }).refuse).toBe(false);
    expect(f.calls).toEqual([historyPath, ownJobs]);
  });
});

const report = (...statuses: [string, string?][]) => ({
  suites: [
    {
      specs: statuses.map(([status, message]) => ({
        tests: [{ status: status === "skipped" ? "skipped" : "expected", results: [{ status, errors: message ? [{ message }] : [] }] }],
      })),
    },
  ],
});

describe("walk verdicts", () => {
  it("a passed walk is good", () => {
    expect(judgeWalkRun({ walkConclusion: "success", provisionFailed: false, result: null }).bad).toBe(false);
  });
  it("a failed first step is bad", () => {
    const r = judgeWalkRun({ walkConclusion: "failure", provisionFailed: false, result: report(["timedOut"], ["passed"]) });
    expect(r).toEqual({ bad: true, why: "the first step failed (timedOut)" });
  });
  it("skipped steps before the first real step are ignored", () => {
    const r = judgeWalkRun({
      walkConclusion: "failure",
      provisionFailed: false,
      result: report(["skipped"], ["passed"], ["failed", "expected 3 rows"]),
    });
    expect(r.bad).toBe(false);
  });
  it("a 5xx anywhere is infrastructure", () => {
    const r = judgeWalkRun({
      walkConclusion: "failure",
      provisionFailed: false,
      result: report(["passed"], ["failed", "page.goto: net::ERR_CONNECTION_RESET"]),
    });
    expect(r.bad).toBe(true);
    const fromLog = judgeWalkRun({
      walkConclusion: "failure",
      provisionFailed: false,
      result: report(["passed"], ["failed", "assertion"]),
      log: "Error: 503 Service Unavailable",
    });
    expect(fromLog.bad).toBe(true);
  });
  it("a step on line 500–504 of its spec is not a 5xx (2026-11-01 false trip)", () => {
    const r = judgeWalkRun({
      walkConclusion: "failure",
      provisionFailed: false,
      result: report(["passed"], ["failed", "expect(locator).toBeVisible() failed\n\n  502 |   const failed = form;\n> 503 |   await expect(done).toBeVisible();"]),
      log: "  -  15 [chromium] › tests/e2e/prod-project-execution.spec.ts:504:5 › E-13 (3.13). the report\n      at tests/e2e/prod-x.spec.ts:500:12",
    });
    expect(r).toEqual({ bad: false, why: "a product assertion failed (not an infrastructure signal)" });
    const real = judgeWalkRun({
      walkConclusion: "failure",
      provisionFailed: false,
      result: report(["passed"], ["failed", "assertion"]),
      log: "page.goto: 504 Gateway Timeout at tests/e2e/prod-x.spec.ts:12:3",
    });
    expect(real.bad, "a real 504 still counts").toBe(true);
  });
  it("a product assertion failing later is NOT an infrastructure signal", () => {
    const r = judgeWalkRun({
      walkConclusion: "failure",
      provisionFailed: false,
      result: report(["passed"], ["failed", "expected brigade card to be visible"]),
    });
    expect(r.bad).toBe(false);
  });
  it("a failed mint or a missing result is bad", () => {
    expect(judgeWalkRun({ walkConclusion: "failure", provisionFailed: true, result: null }).bad).toBe(true);
    expect(judgeWalkRun({ walkConclusion: "failure", provisionFailed: false, result: null }).bad).toBe(true);
  });
});

describe("error brake (circuit breaker)", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const bad = (minAgo: number) => ({ bad: true, why: "x", endedAt: new Date(now.getTime() - minAgo * 60_000).toISOString() });
  const good = { bad: false, why: "passed", endedAt: now.toISOString() };
  it("trips when the last two walks both failed for infrastructure, recently", () => {
    expect(judgeErrorBrake([bad(5), bad(20)], now).refuse).toBe(true);
  });
  it("does not trip on one failure, or when the latest passed", () => {
    expect(judgeErrorBrake([bad(5), good], now).refuse).toBe(false);
    expect(judgeErrorBrake([good, bad(5)], now).refuse).toBe(false);
    expect(judgeErrorBrake([bad(5)], now).refuse).toBe(false);
  });
  it("lets one probe walk through after the cool-down", () => {
    expect(judgeErrorBrake([bad(THRESHOLDS.errorCooldownMinutes + 1), bad(90)], now).refuse).toBe(false);
  });
});

describe("gap and Supabase edge brakes", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("waits out the remainder of the minimum gap", () => {
    expect(gapRemainingSeconds(new Date(now.getTime() - 60_000).toISOString(), now)).toBe(120);
    expect(gapRemainingSeconds(new Date(now.getTime() - 600_000).toISOString(), now)).toBe(0);
    expect(gapRemainingSeconds(null, now)).toBe(0);
  });
  it("refuses above the edge limits only", () => {
    expect(judgeSupabaseEdge({ e5: 3, e429: 0 }).refuse).toBe(false);
    expect(judgeSupabaseEdge({ e5: THRESHOLDS.supabaseMax5xx + 1, e429: 0 }).refuse).toBe(true);
    expect(judgeSupabaseEdge({ e5: 0, e429: THRESHOLDS.supabaseMax429 + 1 }).refuse).toBe(true);
  });
});

describe("SR-1 readings privacy check", () => {
  // The four line shapes prod-sr1-first-search.spec.ts writes.
  const header = { at: "2026-11-09T07:00:00.000Z", browser: "chrome 141.0.7390.54", mode: "headless scripted, GitHub runner", rounds: 8 };
  const base = { at: "2026-11-09T07:01:00.000Z", round: 0, actor: "signed_in", term: "virėja" };
  const result = {
    ...base,
    outcome: "results",
    board_ms: 812,
    search_ms: 640,
    ttfb_ms: 210,
    dcl_ms: 480,
    full_page_load: true,
    to_profession_filter: false,
    signed_in: true,
  };
  const timeout = { ...base, actor: "signed_out", outcome: "board_timeout", board_ms: 60_000, signed_in: null };
  const error = { ...base, outcome: "error", kind: "TimeoutError", signed_in: false };
  const file = (...lines: unknown[]) => lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n";

  it("publishes a file of the readings the spec writes", () => {
    expect(judgeSr1Readings(file(header, result, timeout, error))).toEqual({ publish: true, why: "4 readings checked" });
  });

  it("knows every field the spec writes", () => {
    for (const line of [header, result, timeout, error]) {
      for (const key of Object.keys(line)) expect(SR1_READING_KEYS).toContain(key);
    }
  });

  it("withholds an empty, broken or wrongly shaped file", () => {
    expect(judgeSr1Readings("").publish).toBe(false);
    expect(judgeSr1Readings("\n \n").publish).toBe(false);
    expect(judgeSr1Readings(file(header, '{"at":"2026-11-09T07:01:00.000Z","round":')).publish).toBe(false);
    expect(judgeSr1Readings(file(header, "[1,2]")).publish).toBe(false);
    expect(judgeSr1Readings(file(header, "null")).publish).toBe(false);
    expect(judgeSr1Readings(file(header, '"text"')).publish).toBe(false);
  });

  it("withholds a field no reading writes, a nested value, a long text or an address", () => {
    expect(judgeSr1Readings(file(header, { ...result, message: "boom" })).publish).toBe(false);
    expect(judgeSr1Readings(file(header, { ...result, kind: { name: "x" } })).publish).toBe(false);
    expect(judgeSr1Readings(file(header, { ...result, term: ["a"] })).publish).toBe(false);
    expect(judgeSr1Readings(file(header, { ...result, term: "x".repeat(81) })).publish).toBe(false);
    expect(judgeSr1Readings(file(header, { ...result, term: "someone@example.com" })).publish).toBe(false);
    // A duplicated key: JSON.parse keeps the last value, the published file still holds the first.
    expect(judgeSr1Readings(file(header, '{"at":"2026-11-09T07:01:00.000Z","term":"someone@example.com","term":"kock"}')).publish).toBe(false);
  });

  it("says why with a line number, never the field or the value", () => {
    const why = judgeSr1Readings(file(header, { ...result, secret_field: "private value" })).why;
    expect(why).toBe("line 2 has a field no reading writes");
    expect(why).not.toMatch(/secret_field|private/);
  });
});

describe("workflow wiring", () => {
  const yml = readFileSync(resolve(__dirname, "../../../../.github/workflows/prod-qa-walk.yml"), "utf8");
  const budget = yml.slice(yml.indexOf("\n  budget:"), yml.indexOf("\n  walk:"));
  const walk = yml.slice(yml.indexOf("\n  walk:"));

  it("the budget job runs the health, error and Supabase brakes and the cheap count", () => {
    for (const cmd of ["health", "deploy", "errors", "supabase", "count"]) {
      expect(budget).toContain(`walk-brakes.mjs ${cmd}`);
    }
  });

  it("budget_override never reaches the health or the gap brake", () => {
    const step = (job: string, cmd: string) => {
      const at = job.indexOf(`walk-brakes.mjs ${cmd}`);
      return job.slice(job.lastIndexOf("- name:", at), at);
    };
    expect(step(budget, "health")).not.toMatch(/OVERRIDE|budget_override/);
    expect(step(walk, "health")).not.toMatch(/OVERRIDE|budget_override/);
    expect(step(walk, "gap")).not.toMatch(/OVERRIDE|budget_override/);
    expect(step(budget, "deploy")).not.toMatch(/OVERRIDE|budget_override/);
    expect(step(walk, "deploy")).not.toMatch(/OVERRIDE|budget_override/);
    // …while the error and Supabase brakes are the ones it may lift.
    expect(step(budget, "errors")).toMatch(/OVERRIDE/);
  });

  const stepOf = (name: string) => {
    const at = walk.indexOf(`- name: ${name}`);
    expect(at, name).toBeGreaterThan(-1);
    const next = walk.indexOf("\n      - name:", at + 1);
    return walk.slice(at, next === -1 ? undefined : next);
  };

  it("publishes the walk result and the SR-1 readings only after their privacy checks passed", () => {
    expect(stepOf("Upload result (no screenshots, no traces, no sessions)")).toContain(
      "if: always() && steps.privacy.outputs.published == 'true'",
    );
    expect(stepOf("Check the SR-1 readings before they are published")).toContain("walk-brakes.mjs sr1-check");
    expect(stepOf("Upload the SR-1 readings (one day)")).toContain("steps.sr1.outputs.published == 'true'");
  });

  it("a withheld result leaves a marker under the walk's artefact name, so the daily count still sees the walk", () => {
    const marker = stepOf("Upload the withheld marker");
    expect(marker).toContain("if: always() && steps.privacy.outputs.published != 'true'");
    expect(marker).toContain("name: prod-qa-${{ needs.debounce.outputs.spec }}-${{ github.run_id }}");
    expect(marker).toContain("path: prod-qa-withheld.txt");
    expect(stepOf("Upload result (no screenshots, no traces, no sessions)")).toContain(
      "name: prod-qa-${{ needs.debounce.outputs.spec }}-${{ github.run_id }}",
    );
  });

  it("the walk job re-checks health, deploys and the gap after its concurrency wait, before any production step", () => {
    const provision = walk.indexOf("Provision + mint");
    expect(walk.indexOf("walk-brakes.mjs deploy")).toBeGreaterThan(walk.indexOf("walk-brakes.mjs gap"));
    expect(walk.indexOf("walk-brakes.mjs deploy")).toBeLessThan(provision);
    expect(walk.indexOf("walk-brakes.mjs health")).toBeGreaterThan(-1);
    expect(walk.indexOf("walk-brakes.mjs health")).toBeLessThan(provision);
    expect(walk.indexOf("walk-brakes.mjs gap")).toBeGreaterThan(-1);
    expect(walk.indexOf("walk-brakes.mjs gap")).toBeLessThan(provision);
  });
});
