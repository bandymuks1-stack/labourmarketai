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
 * They are reached ONLY while a backlog exists (cold start, or an outage). In
 * steady state a session is one listing request plus the few new entries (NAV
 * publishes ~1,500 changes/day), because the head page is checkpointed
 * mid-page. BEFORE this budget the same arithmetic gave 5,005/session and
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
