import { describe, expect, it } from "vitest";
import {
  ATTEMPTS_PER_RUN,
  classifyAccounting,
  classifyErrorCode,
  decideIncident,
  describeDiagnostics,
  DEFAULT_LIMITS,
  exitCodeFor,
  failedRunStreak,
  incidentTitle,
  incidentTitlePrefix,
  INCIDENT_FAILED_RUNS,
  MAX_IN_RUN_RETRIES,
  MAX_SESSIONS_PER_RUN,
  parseAccountingStdout,
  runCadenceLoop,
  STALL_HOURS,
  STATUS_COMMENT_INTERVAL_HOURS,
  type Classification,
  type IncidentAction,
  type LoopDeps,
  type OpenIncident,
  type SessionRun,
} from "../../scripts/vacancy-cadence-outcome";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const H = 3_600_000;

function acc(
  session: Record<string, unknown>,
  streak = 0,
  before = 0,
  lastSuccessAt: string | null = "2026-10-09T11:00:00Z",
) {
  return {
    before: { cursor: { consecutive_failures: before } },
    session,
    after: { cursor: { consecutive_failures: streak, last_success_at: lastSuccessAt } },
  };
}

describe("classifyErrorCode", () => {
  it.each([
    ["page_fetch_failed:timeout", true, "timeout"],
    ["page_fetch_failed:network_error", true, "network_error"],
    ["page_fetch_failed:http_error:503", true, "http_error:503"],
    ["page_fetch_failed:http_error:500", true, "http_error:500"],
    ["page_fetch_failed:http_error:429", true, "http_error:429"],
    ["page_fetch_failed:http_error:408", true, "http_error:408"],
    ["page_fetch_failed:detail_fetch_failed", true, "detail_fetch_failed"],
    ["page_fetch_failed:detail_fetch_failed:timeout", true, "detail_fetch_failed:timeout"],
    ["page_fetch_failed:detail_fetch_failed:network_error", true, "detail_fetch_failed:network_error"],
    ["page_fetch_failed:detail_fetch_failed:http_503", true, "detail_fetch_failed:http_503"],
    ["page_fetch_failed:detail_fetch_failed:http_429", true, "detail_fetch_failed:http_429"],
    ["page_fetch_failed:detail_fetch_failed:http_403", false, "detail_fetch_failed:http_403"],
    ["page_fetch_failed:detail_fetch_failed:invalid_json", false, "detail_fetch_failed:invalid_json"],
    ["page_fetch_failed:detail_fetch_failed:fan_out_page_over_budget", false, "detail_fetch_failed:fan_out_page_over_budget"],
    ["stream:timeout:stream_interrupted", true, "timeout"],
    ["page_fetch_failed:http_error:401", false, "http_error:401"],
    ["page_fetch_failed:http_error:403", false, "http_error:403"],
    ["page_fetch_failed:http_error:400", false, "http_error:400"],
    ["page_fetch_failed:http_error:404", false, "http_error:404"],
    ["page_fetch_failed:http_error", false, "http_error"],
    ["page_fetch_failed:api_key_required", false, "api_key_required"],
    ["page_fetch_failed:content_type_invalid", false, "content_type_invalid"],
    ["page_fetch_failed:invalid_json", false, "invalid_json"],
    ["page_fetch_failed:response_too_large", false, "response_too_large"],
    ["batch_unparseable:shape", false, "batch_unparseable"],
    ["something_new", false, "something_new"],
  ])("%s -> transient=%s", (raw, transient, code) => {
    expect(classifyErrorCode(raw)).toEqual({ transient, code });
  });
});

describe("classifyAccounting", () => {
  it("imported + caughtUp=true is ok", () => {
    const c = classifyAccounting(acc({ status: "imported", caughtUp: true, cursorAdvanced: true, errors: [] }));
    expect(c).toMatchObject({ kind: "ok", retryInRun: false, caughtUp: true, cursorAdvanced: true });
  });
  it("imported + caughtUp=false is budget_exhausted (not a failure)", () => {
    const c = classifyAccounting(acc({ status: "imported", caughtUp: false, cursorAdvanced: true, errors: [] }));
    expect(c.kind).toBe("budget_exhausted");
  });
  it("a non-windowed channel (caughtUp null) is ok", () => {
    expect(classifyAccounting(acc({ status: "imported", caughtUp: null, errors: [] })).kind).toBe("ok");
  });
  it("the 2026-10-09 NAV timeout is a retryable transient failure", () => {
    const c = classifyAccounting(
      acc({ status: "fetch_failed", caughtUp: null, cursorAdvanced: false, errors: ["page_fetch_failed:timeout"] }, 1),
    );
    expect(c).toMatchObject({ kind: "transient_failure", code: "timeout", retryInRun: true, dbStreak: 1 });
  });
  it("a 5xx is transient, a 401 is hard and never retried", () => {
    expect(classifyAccounting(acc({ status: "fetch_failed", errors: ["page_fetch_failed:http_error:502"] })).kind).toBe("transient_failure");
    const hard = classifyAccounting(acc({ status: "fetch_failed", errors: ["page_fetch_failed:http_error:401"] }));
    expect(hard).toMatchObject({ kind: "hard_failure", retryInRun: false });
  });
  it("a hard code anywhere in the error list wins over a transient one", () => {
    const c = classifyAccounting(
      acc({ status: "fetch_failed", errors: ["page_fetch_failed:timeout", "page_fetch_failed:http_error:403"] }),
    );
    expect(c).toMatchObject({ kind: "hard_failure", code: "http_error:403" });
  });
  it("blocked (kill switch lost in CI) is hard and not retried", () => {
    const c = classifyAccounting(acc({ status: "blocked", blockedReason: "provider_disabled", errors: [] }));
    expect(c).toMatchObject({ kind: "hard_failure", code: "blocked:provider_disabled", retryInRun: false });
  });
  it("runner_exception is hard but retried once-or-twice in-run", () => {
    const c = classifyAccounting(acc({ status: "runner_exception", errors: ["vacancy_persist_insert_failed:57014"] }));
    expect(c).toMatchObject({ kind: "hard_failure", retryInRun: true });
  });
  it("no accounting at all (runner died) and unknown statuses are hard", () => {
    expect(classifyAccounting(null)).toMatchObject({ kind: "hard_failure", code: "runner_no_accounting", retryInRun: true });
    expect(classifyAccounting(acc({ status: "weird" }))).toMatchObject({ kind: "hard_failure", retryInRun: false });
  });
});

describe("parseAccountingStdout", () => {
  it("parses a pure document, tolerates surrounding noise, and returns null for garbage", () => {
    expect(parseAccountingStdout('{"a":1}')).toEqual({ a: 1 });
    expect(parseAccountingStdout('noise\n{"a":1}\n')).toEqual({ a: 1 });
    expect(parseAccountingStdout("")).toBeNull();
    expect(parseAccountingStdout("not json")).toBeNull();
  });
});

function cls(over: Partial<Classification> & Pick<Classification, "kind">): Classification {
  return {
    code: over.kind === "ok" ? "ok" : "timeout",
    retryInRun: over.kind === "transient_failure",
    caughtUp: null,
    cursorAdvanced: false,
    dbStreak: 0,
    dbStreakBefore: 0,
    lastSuccessAt: "2026-10-09T11:00:00Z",
    ...over,
  };
}
const run = (c: Classification): SessionRun => ({ classification: c, accounting: {}, elapsedMs: 1000 });

function harness(script: Classification[], opts: { stepMs?: number } = {}) {
  let t = 0;
  const sleeps: number[] = [];
  const logs: string[] = [];
  let i = 0;
  const timeouts: number[] = [];
  const deps: LoopDeps = {
    async runSession(timeoutMs) {
      timeouts.push(timeoutMs);
      t += opts.stepMs ?? 60_000;
      const c = script[Math.min(i, script.length - 1)];
      i += 1;
      return run(c);
    },
    async sleep(ms) {
      sleeps.push(ms);
      t += ms;
    },
    now: () => t,
    random: () => 0.5,
    log: (l) => logs.push(l),
  };
  return { deps, sleeps, logs, timeouts, launched: () => i };
}

describe("runCadenceLoop stop conditions", () => {
  const behind = cls({ kind: "budget_exhausted", caughtUp: false, cursorAdvanced: true });
  const caught = cls({ kind: "ok", caughtUp: true, cursorAdvanced: true });

  it("keeps going while behind and stops at caughtUp=true", async () => {
    const h = harness([behind, behind, caught]);
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(r.stopReason).toBe("caught_up");
    expect(h.launched()).toBe(3);
    expect(r.final.kind).toBe("ok");
  });

  it("is capped at MAX_SESSIONS_PER_RUN sessions", async () => {
    const h = harness([behind], { stepMs: 10_000 });
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(r.stopReason).toBe("max_sessions");
    expect(h.launched()).toBe(MAX_SESSIONS_PER_RUN);
  });

  it("stops starting sessions after the wall-clock budget", async () => {
    const h = harness([behind], { stepMs: 5 * 60_000 });
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(r.stopReason).toBe("wall_clock");
    expect(h.launched()).toBe(3); // 15 min >= 13 min after the third
  });

  it("does not hammer a source that is behind but not moving", async () => {
    const h = harness([cls({ kind: "budget_exhausted", caughtUp: false, cursorAdvanced: false })]);
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(r.stopReason).toBe("no_progress");
    expect(h.launched()).toBe(1);
  });

  it("a non-windowed channel (caughtUp null) is done after one session", async () => {
    const h = harness([cls({ kind: "ok", caughtUp: null })]);
    expect((await runCadenceLoop(h.deps, { multiSession: true })).stopReason).toBe("caught_up");
    expect(h.launched()).toBe(1);
  });

  it("single-session mode never loops", async () => {
    const h = harness([behind]);
    const r = await runCadenceLoop(h.deps, { multiSession: false });
    expect(r.stopReason).toBe("single_session");
    expect(h.launched()).toBe(1);
  });

  it("a hard failure stops immediately with no retry", async () => {
    const h = harness([cls({ kind: "hard_failure", retryInRun: false })]);
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(r.stopReason).toBe("failure");
    expect(h.launched()).toBe(1);
    expect(h.sleeps).toEqual([]);
  });

  it("clips each child timeout to the remaining hard deadline", async () => {
    const h = harness([behind], { stepMs: 5 * 60_000 });
    await runCadenceLoop(h.deps, { multiSession: true });
    expect(Math.max(...h.timeouts)).toBeLessThanOrEqual(DEFAULT_LIMITS.childTimeoutMs);
  });
});

describe("runCadenceLoop transient retry", () => {
  const transient = cls({ kind: "transient_failure", dbStreak: 1 });
  const behind = cls({ kind: "budget_exhausted", caughtUp: false, cursorAdvanced: true });
  const caught = cls({ kind: "ok", caughtUp: true, cursorAdvanced: true });

  it("waits 30-60 s (jittered) and recovers on the retry", async () => {
    const h = harness([transient, caught]);
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(h.sleeps).toEqual([45_000]);
    expect(r.retries).toBe(1);
    expect(r.final.kind).toBe("ok");
    for (const s of h.sleeps) {
      expect(s).toBeGreaterThanOrEqual(30_000);
      expect(s).toBeLessThanOrEqual(60_000);
    }
  });

  it("backs off: retry 1 waits 30-60 s, retry 2 waits 60-120 s", async () => {
    const h = harness([transient]);
    await runCadenceLoop(h.deps, { multiSession: true });
    expect(h.sleeps).toEqual([45_000, 90_000]);
  });

  it("gives up after MAX_IN_RUN_RETRIES retries (3 attempts total)", async () => {
    const h = harness([transient]);
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(r.stopReason).toBe("failure");
    expect(h.launched()).toBe(1 + MAX_IN_RUN_RETRIES);
    expect(r.final.kind).toBe("transient_failure");
  });

  it("the retry allowance resets after a session that completed", async () => {
    const h = harness([transient, behind, transient, transient, caught]);
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(r.final.kind).toBe("ok");
    expect(r.retries).toBe(3);
  });

  it("never retries past the total session cap", async () => {
    const h = harness([behind, behind, behind, behind, behind, behind, behind, transient], { stepMs: 1_000 });
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(h.launched()).toBe(MAX_SESSIONS_PER_RUN);
    expect(r.stopReason).toBe("failure");
  });

  it("does not sleep into the wall-clock budget", async () => {
    const h = harness([transient], { stepMs: 12.5 * 60_000 });
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(h.sleeps).toEqual([]);
    expect(r.stopReason).toBe("failure");
  });

  it("retries an exception-class hard failure (retryInRun) too", async () => {
    const exc = cls({ kind: "hard_failure", retryInRun: true, code: "runner_exception:x" });
    const h = harness([exc, caught]);
    const r = await runCadenceLoop(h.deps, { multiSession: true });
    expect(r.final.kind).toBe("ok");
  });
});

describe("decideIncident state machine", () => {
  const fresh = new Date(NOW - 2 * H).toISOString();
  const open = (lastStatusAt = fresh): OpenIncident => ({ number: 7, lastStatusAt });
  const transient = (dbStreak: number, lastSuccessAt: string | null = "2026-10-09T11:00:00Z") =>
    cls({ kind: "transient_failure", dbStreak, lastSuccessAt });
  const decide = (final: Classification, o: OpenIncident | null = null): IncidentAction =>
    decideIncident({ final, open: o, nowMs: NOW });

  it("converts cursor streak to failed RUNS (each run records up to 3 failed sessions)", () => {
    expect(ATTEMPTS_PER_RUN).toBe(3);
    expect([0, 1, 3, 4, 6, 7, 9].map(failedRunStreak)).toEqual([1, 1, 1, 2, 2, 3, 3]);
  });

  it("failed run 1 and 2: warning only, exit 0, no notification", () => {
    for (const streak of [1, 3, 4, 6]) {
      const a = decide(transient(streak));
      expect(a.action).toBe("warn");
      expect(exitCodeFor(a)).toBe(0);
    }
  });

  it("failed run 3 (first crossing): open ONE issue and fail the run once", () => {
    const a = decide(transient(7));
    expect(a).toEqual({ action: "open_issue", failRun: true });
    expect(exitCodeFor(a)).toBe(1);
    expect(INCIDENT_FAILED_RUNS).toBe(3);
  });

  it("run 4+ of the same unresolved incident: quiet, exit 0, no new issue", () => {
    for (const streak of [10, 13, 40]) {
      const a = decide(transient(streak), open());
      expect(a).toEqual({ action: "quiet", number: 7 });
      expect(exitCodeFor(a)).toBe(0);
    }
  });

  it("a status comment at most once per 24 h", () => {
    const stale = new Date(NOW - (STATUS_COMMENT_INTERVAL_HOURS + 1) * H).toISOString();
    expect(decide(transient(10), open(stale))).toEqual({ action: "status_comment", number: 7 });
    const almost = new Date(NOW - (STATUS_COMMENT_INTERVAL_HOURS - 1) * H).toISOString();
    expect(decide(transient(10), open(almost)).action).toBe("quiet");
  });

  it("the first success after an incident recovers (comment + close); success without one is a no-op", () => {
    expect(decide(cls({ kind: "ok", caughtUp: true }), open())).toEqual({ action: "recover", number: 7 });
    expect(decide(cls({ kind: "budget_exhausted", caughtUp: false }), open()).action).toBe("recover");
    expect(decide(cls({ kind: "ok", caughtUp: true }))).toEqual({ action: "none" });
  });

  it("the first hard failure opens an issue and fails the run; repeats are quiet", () => {
    const hard = cls({ kind: "hard_failure", code: "http_error:401", dbStreak: 1 });
    expect(decide(hard)).toEqual({ action: "open_issue", failRun: true });
    expect(decide(hard, open())).toEqual({ action: "quiet", number: 7 });
  });

  it("a long stall is an incident even if the streak counter lags", () => {
    const old = new Date(NOW - (STALL_HOURS + 1) * H).toISOString();
    expect(decide(transient(1, old)).action).toBe("open_issue");
    const recent = new Date(NOW - (STALL_HOURS - 1) * H).toISOString();
    expect(decide(transient(1, recent)).action).toBe("warn");
  });

  it("only a NEWLY opened incident ever fails a run", () => {
    const actions: IncidentAction[] = [
      { action: "none" },
      { action: "warn", reason: "x" },
      { action: "quiet", number: 1 },
      { action: "status_comment", number: 1 },
      { action: "recover", number: 1 },
    ];
    for (const a of actions) expect(exitCodeFor(a)).toBe(0);
    expect(exitCodeFor({ action: "open_issue", failRun: true })).toBe(1);
  });

  it("the whole incident lifecycle notifies exactly once", () => {
    // 6 failing runs then recovery. Streak grows by 3 per fully-retried run.
    let issue: OpenIncident | null = null;
    let failedRuns = 0;
    const log: string[] = [];
    for (let run = 1; run <= 6; run += 1) {
      const a = decide(transient(run * 3), issue);
      log.push(a.action);
      if (exitCodeFor(a) === 1) failedRuns += 1;
      if (a.action === "open_issue") issue = open(new Date(NOW).toISOString());
    }
    const rec = decide(cls({ kind: "ok", caughtUp: true }), issue);
    expect(log).toEqual(["warn", "warn", "open_issue", "quiet", "quiet", "quiet"]);
    expect(failedRuns).toBe(1);
    expect(rec.action).toBe("recover");
  });
});

describe("incident titles", () => {
  it("carry provider, channel and code, and the prefix matches across code changes", () => {
    const t = incidentTitle("nav", "stream", "timeout");
    expect(t).toBe("Ingestion incident: nav/stream: timeout");
    expect(incidentTitle("nav", "stream", "http_error:503").startsWith(incidentTitlePrefix("nav", "stream"))).toBe(true);
    expect(t.startsWith(incidentTitlePrefix("arbetsformedlingen", "stream"))).toBe(false);
  });
});

describe("describeDiagnostics", () => {
  it("renders listing time, detail spread and the first failing entry; empty for none", () => {
    const text = describeDiagnostics({
      session: {
        fetchDiagnostics: [
          {
            listingElapsedMs: 8282,
            detail: {
              attempted: 8,
              succeeded: 7,
              elapsedMs: { min: 16846, median: 21110, max: 60000 },
              firstFailure: { uuid: "abc", position: 170, cause: "timeout" },
            },
          },
        ],
      },
    });
    expect(text).toContain("listing 8282 ms");
    expect(text).toContain("7/8 ok");
    expect(text).toContain("first failing entry abc at #170 (timeout)");
    expect(describeDiagnostics({ session: {} })).toBe("");
  });
});
