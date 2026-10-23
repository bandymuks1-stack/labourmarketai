import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  THRESHOLDS,
  gapRemainingSeconds,
  judgeErrorBrake,
  judgeHealth,
  judgeSupabaseEdge,
  judgeWalkRun,
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
    expect(THRESHOLDS.minGapSeconds).toBe(180);
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

describe("workflow wiring", () => {
  const yml = readFileSync(resolve(__dirname, "../../../../.github/workflows/prod-qa-walk.yml"), "utf8");
  const budget = yml.slice(yml.indexOf("\n  budget:"), yml.indexOf("\n  walk:"));
  const walk = yml.slice(yml.indexOf("\n  walk:"));

  it("the budget job runs the health, error and Supabase brakes and the cheap count", () => {
    for (const cmd of ["health", "errors", "supabase", "count"]) {
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
    // …while the error and Supabase brakes are the ones it may lift.
    expect(step(budget, "errors")).toMatch(/OVERRIDE/);
  });

  it("the walk job re-checks health and the gap after its concurrency wait, before any production step", () => {
    const provision = walk.indexOf("Provision + mint");
    expect(walk.indexOf("walk-brakes.mjs health")).toBeGreaterThan(-1);
    expect(walk.indexOf("walk-brakes.mjs health")).toBeLessThan(provision);
    expect(walk.indexOf("walk-brakes.mjs gap")).toBeGreaterThan(-1);
    expect(walk.indexOf("walk-brakes.mjs gap")).toBeLessThan(provision);
  });
});
