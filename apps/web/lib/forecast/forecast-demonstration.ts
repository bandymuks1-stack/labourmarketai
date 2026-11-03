import { computeProjectForecast, type ForecastAction, type ForecastFacts, type ProjectForecast } from "./forecast-engine";
import { FORECAST_MODES, recomputeInstants, type ForecastMode } from "./forecast-modes";

/**
 * THE COMMERCIAL DEMONSTRATION — one project, the same facts, the same rules,
 * the same start, four recompute modes (owner order 2026-10-24).
 *
 * What differs between the modes is ONLY WHEN each recomputes. Every forecast
 * in every mode is `computeProjectForecast` over the facts as they stood at
 * that instant — the identical function, the identical facts. So the
 * demonstration can show:
 *   - when each mode first NOTICED the problem (and how long after the facts
 *     already showed it),
 *   - how far the forecast completion date moved, and when each mode saw it,
 *   - which prevention actions were on the table when it noticed,
 *   - the possible financial impact visible at that moment.
 * It can NEVER show a better number for a faster mode: at the same instant
 * all modes hold the same forecast (pinned by the demonstration test). A
 * faster mode wins only by reacting earlier — the time left to act.
 *
 * Pure: the scenario is data; no clock, no IO.
 */

export interface DemonstrationState {
  /** The instant this state of the facts began (a significant change). */
  readonly at: string;
  /** What happened, in the scenario author's words (never computed). */
  readonly label: string;
  /** The facts from `at` on; `today` is set per recompute instant. */
  readonly facts: Omit<ForecastFacts, "today">;
}

export interface DemonstrationScenario {
  readonly start: string;
  readonly end: string;
  /** Sorted by `at`; the first state must begin at or before `start`. */
  readonly states: readonly DemonstrationState[];
  /** The scheduler tick in ms (production cron: 5 minutes). */
  readonly tickMs?: number;
}

export interface DemonstrationRecompute {
  readonly at: string;
  readonly version: number;
  readonly stateLabel: string;
  readonly forecast: ProjectForecast;
}

export interface ModeRun {
  readonly mode: ForecastMode;
  readonly recomputes: readonly DemonstrationRecompute[];
  readonly firstProblemNoticedAt: string | null;
  /** Hours between the facts showing the problem and this mode noticing it. */
  readonly reactionHours: number | null;
  readonly completionDateMoves: readonly { readonly at: string; readonly from: string | null; readonly to: string | null }[];
  readonly actionsWhenNoticed: readonly ForecastAction[];
  readonly possibleExtraCostCentsWhenNoticed: number | null;
  readonly lateDaysWhenNoticed: number | null;
}

export interface DemonstrationResult {
  /** The first state whose facts, computed at once, show a problem. */
  readonly problemOnsetAt: string | null;
  readonly runs: readonly ModeRun[];
}

/** A forecast "shows a problem" when the deadline, the quality or the money
 *  is at risk. The same predicate for every mode. */
export function forecastShowsProblem(f: ProjectForecast): boolean {
  return (
    f.deadline.risk === "tight" ||
    f.deadline.risk === "likely_miss" ||
    f.deadline.risk === "overdue" ||
    f.quality.risk === "elevated" ||
    f.quality.risk === "high" ||
    (f.cost.possibleExtraCostCents !== null && f.cost.possibleExtraCostCents > 0)
  );
}

function factsAt(states: readonly DemonstrationState[], at: string): DemonstrationState {
  let current = states[0];
  for (const s of states) if (Date.parse(s.at) <= Date.parse(at)) current = s;
  return current;
}

/** THE forecast at an instant — the one function every mode calls. */
export function forecastAt(states: readonly DemonstrationState[], at: string): ProjectForecast {
  const s = factsAt(states, at);
  return computeProjectForecast({ ...s.facts, today: at.slice(0, 10) } as ForecastFacts);
}

export function runModeDemonstration(
  scenario: DemonstrationScenario,
  modes: readonly ForecastMode[] = FORECAST_MODES,
): DemonstrationResult {
  const states = [...scenario.states].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (states.length === 0) return { problemOnsetAt: null, runs: [] };
  const signals = states.slice(1).map((s) => s.at).filter((at) => Date.parse(at) > Date.parse(scenario.start));

  let problemOnsetAt: string | null = null;
  for (const s of states) {
    const at = Date.parse(s.at) < Date.parse(scenario.start) ? scenario.start : s.at;
    if (forecastShowsProblem(forecastAt(states, at))) {
      problemOnsetAt = at;
      break;
    }
  }

  const runs: ModeRun[] = modes.map((mode) => {
    const instants = recomputeInstants(mode, scenario.start, scenario.end, signals, scenario.tickMs);
    const recomputes: DemonstrationRecompute[] = instants.map((at, i) => ({
      at,
      version: i + 1,
      stateLabel: factsAt(states, at).label,
      forecast: forecastAt(states, at),
    }));
    const noticed = recomputes.find((r) => forecastShowsProblem(r.forecast)) ?? null;
    const moves: { at: string; from: string | null; to: string | null }[] = [];
    for (let i = 1; i < recomputes.length; i++) {
      const from = recomputes[i - 1].forecast.completion.date;
      const to = recomputes[i].forecast.completion.date;
      if (from !== to) moves.push({ at: recomputes[i].at, from, to });
    }
    return {
      mode,
      recomputes,
      firstProblemNoticedAt: noticed?.at ?? null,
      reactionHours:
        noticed && problemOnsetAt
          ? Math.round(((Date.parse(noticed.at) - Date.parse(problemOnsetAt)) / 3_600_000) * 10) / 10
          : null,
      completionDateMoves: moves,
      actionsWhenNoticed: noticed?.forecast.actions ?? [],
      possibleExtraCostCentsWhenNoticed: noticed?.forecast.cost.possibleExtraCostCents ?? null,
      lateDaysWhenNoticed: noticed?.forecast.losses.lateDays ?? null,
    };
  });

  return { problemOnsetAt, runs };
}
