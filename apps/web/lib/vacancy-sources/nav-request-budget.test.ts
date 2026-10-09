/**
 * NAV REQUEST BUDGET — worst-case outbound load against a SHARED NAV grant.
 *
 * NAV publishes no numeric rate limit, but its terms treat failing to keep the
 * feed current as grounds for revoking access, and it recommends about two
 * minutes of sleep at the end of the feed. This test turns the registry's
 * numbers into a worst-case request count and fails if a future edit widens it.
 *
 * COMPARISON (the sister product Agentai's configured NAV ceiling, which this
 * budget is measured against): <= 220 requests per run, 2 s spacing, 24 runs a
 * day -> <= 5,280 requests/day. Our cron is every 10 minutes (144 sessions a
 * day), six times as frequent, so a per-session number that merely matched
 * Agentai's would be 6x its daily load. The ceilings are therefore set per DAY:
 *
 *   NOMINAL (every request succeeds first time):  102/session ->  14,688/day
 *   HARD    (every request needs both retries):   306/session ->  44,064/day
 *
 * They are reached ONLY while a backlog exists (cold start, or an outage) or
 * while the open head page holds more live entries than the budget: the open
 * page is re-read from its start every poll (idempotent upsert + content_hash),
 * so steady state costs up to the budget per session, never more. BEFORE this budget the same arithmetic gave 5,005/session and
 * 720,720/day nominal (5 pages x (1 + 1000 details), concurrency 8, no spacing).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVacancyEndpoint,
  getVacancyProvider,
  resolveProviderBounds,
  VACANCY_PROVIDERS,
} from "./vacancy-provider-registry";
import { VACANCY_IMPORT_BOUNDS } from "./vacancy-contract";
import {
  MAX_IN_RUN_RETRIES,
  MAX_SESSIONS_PER_RUN,
  NO_NEW_SESSION_AFTER_MS,
  SESSION_CHILD_TIMEOUT_MS,
  SESSION_HARD_DEADLINE_MS,
} from "../../scripts/vacancy-cadence-outcome";

const NAV = getVacancyProvider("nav")!;
const SE = getVacancyProvider("arbetsformedlingen")!;
const FAN = getVacancyEndpoint(NAV, "stream")!.detailFanOut!;

/** Documented ceilings (see the header). Raising one is an owner decision. */
const CEILING = {
  nominalPerSession: 110,
  nominalPerDay: 16_000, // ~3x Agentai's 5,280/day, at 6x its run frequency
  hardPerSession: 320,
  hardPerDay: 46_000,
  minSpacingMs: 500,
  maxConcurrency: 2,
} as const;

function cronSessionsPerDay(): number {
  const yml = readFileSync(
    join(__dirname, "..", "..", "..", "..", ".github", "workflows", "nav-supply-cadence.yml"),
    "utf8",
  );
  const m = /cron:\s*"\*\/(\d+) \* \* \* \*"/.exec(yml);
  if (!m) throw new Error("nav-supply-cadence cron is no longer a */N schedule; update the budget test");
  return Math.floor(1440 / Number(m[1]));
}

function worstCase(pages: number, details: number, retries: number) {
  return { nominal: pages + details, hard: (pages + details) * (retries + 1) };
}

describe("NAV request budget", () => {
  const bounds = resolveProviderBounds(NAV);
  const sessions = cronSessionsPerDay();
  const perSession = worstCase(
    bounds.maxPagesPerSession,
    FAN.maxDetailFetchesPerSession ?? Number.POSITIVE_INFINITY,
    bounds.maxRetries,
  );

  it("the cadence is the documented every-10-minutes (144 sessions/day)", () => {
    expect(sessions).toBe(144);
  });

  it("the descriptor declares a finite per-session budget, spacing and low concurrency", () => {
    expect(Number.isFinite(FAN.maxDetailFetchesPerSession)).toBe(true);
    expect(FAN.maxDetailFetchesPerSession).toBeGreaterThan(0);
    expect(FAN.minRequestSpacingMs ?? 0).toBeGreaterThanOrEqual(CEILING.minSpacingMs);
    expect(FAN.concurrency).toBeLessThanOrEqual(CEILING.maxConcurrency);
  });

  it("worst-case requests per session stay under the documented ceilings", () => {
    expect(perSession.nominal).toBeLessThanOrEqual(CEILING.nominalPerSession);
    expect(perSession.hard).toBeLessThanOrEqual(CEILING.hardPerSession);
  });

  it("worst-case requests per day (cron x session) stay under the documented ceilings", () => {
    expect(perSession.nominal * sessions).toBeLessThanOrEqual(CEILING.nominalPerDay);
    expect(perSession.hard * sessions).toBeLessThanOrEqual(CEILING.hardPerDay);
  });

  it("is at least 40x below the previous configuration (5 pages x (1 + 1000 details))", () => {
    const before = 5 * (1 + 1000) * sessions;
    expect(before).toBe(720_720);
    expect(before / (perSession.nominal * sessions)).toBeGreaterThan(40);
  });

  it("the request RATE is bounded by spacing, independent of concurrency", () => {
    expect(3_600_000 / (FAN.minRequestSpacingMs ?? 1)).toBeLessThanOrEqual(7_200);
  });

  it("a full-budget session fits the workflow's 20 minute timeout, spacing included", () => {
    const seconds = (perSession.nominal * (FAN.minRequestSpacingMs ?? 0)) / 1000;
    expect(seconds).toBeLessThan(20 * 60);
  });

  it("only tightens the shared bounds and keeps the per-page guard above the session budget", () => {
    expect(bounds.maxPagesPerSession).toBeLessThan(VACANCY_IMPORT_BOUNDS.maxPagesPerSession);
    expect(FAN.maxDetailFetchesPerPage).toBeGreaterThanOrEqual(FAN.maxDetailFetchesPerSession ?? 0);
  });
});

describe("NAV multi-session run budget (cadence loop)", () => {
  const bounds = resolveProviderBounds(NAV);
  const perSession = worstCase(
    bounds.maxPagesPerSession,
    FAN.maxDetailFetchesPerSession ?? Number.POSITIVE_INFINITY,
    bounds.maxRetries,
  );
  /** Pinned per-RUN ceilings. Raising one is an owner decision. */
  const RUN_CEILING = { nominal: 816, hard: 2_448, realRunsPerDay: 6, agentaiPerDay: 5_280 } as const;

  it("the loop is bounded: <= 8 sessions per run, <= 2 in-run retries", () => {
    expect(MAX_SESSIONS_PER_RUN).toBeLessThanOrEqual(8);
    expect(MAX_IN_RUN_RETRIES).toBeLessThanOrEqual(2);
  });

  it("worst-case requests per RUN stay under the pinned ceilings", () => {
    expect(perSession.nominal * MAX_SESSIONS_PER_RUN).toBeLessThanOrEqual(RUN_CEILING.nominal);
    expect(perSession.hard * MAX_SESSIONS_PER_RUN).toBeLessThanOrEqual(RUN_CEILING.hard);
    expect(perSession.nominal * MAX_SESSIONS_PER_RUN).toBe(816);
  });

  it("at the REAL GitHub firing rate (<= 6 runs/day) the daily worst case is below Agentai's 5,280/day", () => {
    expect(perSession.nominal * MAX_SESSIONS_PER_RUN * RUN_CEILING.realRunsPerDay).toBeLessThanOrEqual(
      RUN_CEILING.agentaiPerDay,
    );
  });

  it("the caught-up steady state at the nominal 144 runs/day is the unchanged 102/run", () => {
    expect(perSession.nominal * cronSessionsPerDay()).toBeLessThanOrEqual(CEILING.nominalPerDay);
  });

  it("the per-session budget itself did not move (loop adds sessions, never widens one)", () => {
    expect(bounds.maxPagesPerSession).toBe(2);
    expect(FAN.maxDetailFetchesPerSession).toBe(100);
    expect(FAN.minRequestSpacingMs).toBeGreaterThanOrEqual(500);
    expect(FAN.concurrency).toBeLessThanOrEqual(2);
  });

  it("the loop's wall-clock design fits inside the workflow's 20 minute job timeout", () => {
    expect(NO_NEW_SESSION_AFTER_MS).toBeLessThan(SESSION_HARD_DEADLINE_MS);
    expect(SESSION_HARD_DEADLINE_MS).toBeLessThan(20 * 60_000);
    const yml = readFileSync(
      join(__dirname, "..", "..", "..", "..", ".github", "workflows", "nav-supply-cadence.yml"),
      "utf8",
    );
    expect(/timeout-minutes:\s*20(?!\d)/.test(yml)).toBe(true);
  });
});

describe("NAV scheduler independence (rearm) keeps the 144 runs/day ceiling", () => {
  const yml = readFileSync(
    join(__dirname, "..", "..", "..", "..", ".github", "workflows", "nav-supply-cadence.yml"),
    "utf8",
  );

  it("the rearm job spaces run STARTS >= 600 s apart, honours the kill switch and queues at most one successor", () => {
    expect(yml).toMatch(/needs\.import\.outputs\.gated == 'false'/);
    expect(yml).toMatch(/start \+ 600/);
    expect(yml).toMatch(/--status queued/);
    expect(yml).toMatch(/gh workflow run nav-supply-cadence\.yml -f mode=persist/);
  });

  it("the default token may only add actions: write for the self-dispatch", () => {
    expect(yml).toMatch(/permissions:\s*\n\s*contents: read[\s\S]*?issues: write[\s\S]*?actions: write/);
    expect(yml).not.toMatch(/contents: write|pull-requests: write/);
  });
});

describe("NAV slow-publisher tolerance (2026-10-09)", () => {
  it("raises ONLY the per-request wait and bounds the detail phase; request counts, spacing and concurrency are untouched", () => {
    expect(FAN.requestTimeoutMs).toBe(45_000);
    expect(FAN.sessionDeadlineMs).toBe(150_000);
    // A longer wait per request never adds a request: the ceilings above still hold.
    expect(FAN.maxDetailFetchesPerSession).toBe(100);
    expect(FAN.minRequestSpacingMs).toBeGreaterThanOrEqual(500);
    expect(FAN.concurrency).toBeLessThanOrEqual(2);
  });

  it("the worst session (listing + detail phase + in-flight tail) fits the helper's child timeout", () => {
    // listing: (1 + retries) x timeout; details: deadline + the requests still
    // in flight at the deadline, each up to (1 + retries) x timeout.
    const attempts = resolveProviderBounds(NAV).maxRetries + 1;
    const listing = attempts * (FAN.requestTimeoutMs ?? 0);
    const tail = attempts * (FAN.requestTimeoutMs ?? 0);
    const worst = listing + (FAN.sessionDeadlineMs ?? 0) + tail;
    expect(worst).toBeLessThanOrEqual(SESSION_CHILD_TIMEOUT_MS);
  });

  it("Sweden keeps the shared timeout and no deadline", () => {
    for (const e of SE.endpoints) {
      expect(e.detailFanOut?.requestTimeoutMs).toBeUndefined();
      expect(e.detailFanOut?.sessionDeadlineMs).toBeUndefined();
    }
  });
});

describe("Sweden is untouched by the NAV budget", () => {
  it("has no fan-out budget, no spacing, and resolves to the shared bounds object itself", () => {
    expect(SE.boundOverrides).toBeUndefined();
    expect(resolveProviderBounds(SE)).toBe(VACANCY_IMPORT_BOUNDS);
    for (const e of SE.endpoints) expect(e.detailFanOut).toBeUndefined();
  });

  it("only NAV carries fan-out limits among registered providers", () => {
    const withFan = VACANCY_PROVIDERS.filter((p) => p.endpoints.some((e) => e.detailFanOut));
    expect(withFan.map((p) => p.key)).toEqual(["nav"]);
  });
});
