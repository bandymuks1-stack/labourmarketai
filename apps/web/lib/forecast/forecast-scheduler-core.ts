import { computeProjectForecast, FORECAST_ENGINE_VERSION, type ProjectForecast } from "./forecast-engine";
import { buildForecastFacts, type ForecastFactRows } from "./forecast-facts";
import { compareForecasts, factsFingerprint } from "./forecast-history";
import { isForecastMode, recomputeDecision, type ForecastMode } from "./forecast-modes";

/**
 * THE RECOMPUTE PASS — one bounded sweep of due projects (Stage 7).
 *
 * Runs ONLY in the scheduler (the VPS cron route, every 5 minutes), never in
 * a user request. Each pass:
 *   1. reads at most `limit` CANDIDATES from the database (coarse cadence
 *      prefilter, signalled live projects first);
 *   2. asks THE cadence rule (`recomputeDecision`) whether each is due — a
 *      live project still inside its debounce window is left for a later tick;
 *   3. reads the project's fact rows, builds the facts through the canonical
 *      rules, runs THE engine, fingerprints the inputs, compares with the
 *      previous version;
 *   4. records it — a NEW VERSION only when the forecast or its inputs
 *      changed; otherwise only the "last computed" mark moves (bounded
 *      storage) — and consumes the signals it has seen.
 * Stops early at `timeBudgetMs`. One project failing never stops the pass.
 *
 * Pure orchestration: the store is injected, the clock is passed in.
 */

export interface ForecastCandidate {
  readonly projectId: string;
  readonly mode: string;
  readonly enabled: boolean;
  readonly lastComputedAt: string | null;
  readonly lastVersion: number | null;
  readonly lastInputsHash: string | null;
  readonly firstSignalAt: string | null;
  readonly lastSignalAt: string | null;
  readonly maxSignalId: number | null;
  readonly lastForecast: ProjectForecast | null;
}

export interface ForecastRecord {
  readonly projectId: string;
  readonly mode: ForecastMode;
  readonly reason: string;
  readonly computedAt: string;
  readonly asOf: string;
  readonly engineVersion: string;
  readonly inputsHash: string;
  readonly forecast: ProjectForecast;
  readonly comparison: unknown;
  readonly factsSummary: Record<string, unknown>;
  readonly storeVersion: boolean;
  readonly consumedSignalId: number | null;
}

export interface ForecastStore {
  dueCandidates(limit: number): Promise<readonly ForecastCandidate[] | null>;
  factRows(projectId: string, today: string): Promise<ForecastFactRows | null>;
  record(r: ForecastRecord): Promise<number | null>;
}

export interface RecomputePassResult {
  readonly candidates: number;
  readonly computed: number;
  readonly newVersions: number;
  readonly unchanged: number;
  readonly notDue: number;
  readonly failed: number;
  readonly stoppedEarly: boolean;
}

export const RECOMPUTE_PASS_LIMIT = 25;
export const RECOMPUTE_PASS_BUDGET_MS = 60_000;

/** The forecast without its "as of" day — two forecasts that differ only in
 *  the day they were read are the same statement. */
function statement(f: ProjectForecast | null): string {
  if (!f) return "";
  return JSON.stringify({ ...f, asOf: null });
}

/** The day the last finished unit (task, else stage) was finished — the
 *  ACTUAL completion day once nothing remains. */
function lastCompletedOn(facts: ReturnType<typeof buildForecastFacts>): string | null {
  const unit = facts.tasks && facts.tasks.total > 0 ? facts.tasks : facts.stages;
  if (!unit || unit.completedOn.length === 0) return null;
  const sorted = [...unit.completedOn].sort();
  return sorted[sorted.length - 1] ?? null;
}

export async function runRecomputePass(
  store: ForecastStore,
  opts: { readonly nowIso: string; readonly limit?: number; readonly timeBudgetMs?: number; readonly clockMs?: () => number },
): Promise<RecomputePassResult | null> {
  const limit = opts.limit ?? RECOMPUTE_PASS_LIMIT;
  const budget = opts.timeBudgetMs ?? RECOMPUTE_PASS_BUDGET_MS;
  const clock = opts.clockMs ?? (() => Date.parse(opts.nowIso));
  const started = clock();
  const today = opts.nowIso.slice(0, 10);

  const candidates = await store.dueCandidates(limit);
  if (candidates === null) return null;

  let computed = 0;
  let newVersions = 0;
  let unchanged = 0;
  let notDue = 0;
  let failed = 0;
  let stoppedEarly = false;

  for (const c of candidates) {
    if (clock() - started > budget) {
      stoppedEarly = true;
      break;
    }
    const mode: ForecastMode = isForecastMode(c.mode) ? c.mode : "weekly";
    const decision = recomputeDecision(
      { mode, enabled: c.enabled, lastComputedAt: c.lastComputedAt, firstSignalAt: c.firstSignalAt, lastSignalAt: c.lastSignalAt },
      opts.nowIso,
    );
    if (!decision.due) {
      notDue++;
      continue;
    }
    try {
      const rows = await store.factRows(c.projectId, today);
      if (rows === null) {
        failed++;
        continue;
      }
      const facts = buildForecastFacts(c.projectId, today, rows);
      const forecast = computeProjectForecast(facts);
      const inputsHash = factsFingerprint(facts);
      const changed = c.lastForecast === null || c.lastInputsHash !== inputsHash || statement(c.lastForecast) !== statement(forecast);
      const comparison =
        c.lastForecast && c.lastVersion !== null && c.lastInputsHash
          ? compareForecasts({ version: c.lastVersion, forecast: c.lastForecast, inputsHash: c.lastInputsHash }, { forecast, inputsHash })
          : null;
      const version = await store.record({
        projectId: c.projectId,
        mode,
        reason: decision.reason,
        computedAt: opts.nowIso,
        asOf: today,
        engineVersion: FORECAST_ENGINE_VERSION,
        inputsHash,
        forecast,
        comparison,
        factsSummary: {
          hoursBasis: facts.hours?.basis ?? null,
          totalHours: facts.hours?.totalHours ?? null,
          confirmedHours: facts.hours?.confirmedHours ?? null,
          unitsDone: forecast.remaining.done,
          unitsTotal: forecast.remaining.total,
          unitsRemaining: forecast.remaining.remaining,
          lastUnitCompletedOn: lastCompletedOn(facts),
          activePeople: facts.team?.activePeople ?? null,
          actualCostCents: facts.economics?.actualCostCents ?? null,
        },
        storeVersion: changed,
        consumedSignalId: c.maxSignalId,
      });
      if (version === null) {
        failed++;
        continue;
      }
      computed++;
      if (changed) newVersions++;
      else unchanged++;
    } catch {
      failed++;
    }
  }

  return { candidates: candidates.length, computed, newVersions, unchanged, notDue, failed, stoppedEarly };
}
