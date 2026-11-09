import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  THRESHOLDS,
  gapRemainingSeconds,
  judgeDeployBrake,
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
  });

  it("says why with a line number, never the field or the value", () => {
    const why = judgeSr1Readings(file(header, { ...result, secret_field: "someone@example.com" })).why;
    expect(why).toBe("line 2 has a field no reading writes");
    expect(why).not.toMatch(/secret_field|example/);
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
