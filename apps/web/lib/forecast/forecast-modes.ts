/**
 * FORECAST RECOMPUTE MODES — WHEN a project forecast is recomputed, never
 * WHAT it says (owner order 2026-10-24, Stage 7).
 *
 * In EVERY plan the facts move immediately: Work Journal entries, the hours
 * ledger, the Living CV (from confirmed data) and the project's current state
 * are written and read live by their own paths, which this module never
 * touches. Plans differ ONLY in how often the FORECAST — a derived reading of
 * those facts — is recomputed, plus the extra analytics a mode carries.
 *
 * The four INTERNAL modes (technical ids — never rendered to a customer):
 *
 *   weekly  FREE            recomputed once per week, on Sundays (UTC)
 *   daily   VIP DAILY       recomputed once per UTC day
 *   hourly  VIP HOURLY      recomputed once per UTC hour
 *   live    SUPER VIP LIVE  recomputed after a SIGNIFICANT CHANGE (debounced),
 *                           plus the daily baseline so the passing of time
 *                           (days left before the deadline) is reflected even
 *                           when nothing was written
 *
 * The engine (`forecast-engine.ts`) is the SAME function for every mode. Two
 * modes that recompute at the same instant over the same facts produce the
 * same numbers, byte for byte — the demonstration test proves it. A mode can
 * only make the forecast FRESHER; it can never make it better.
 *
 * Pure. No IO, no clock: `now` is always passed in.
 */

export const FORECAST_MODES = ["weekly", "daily", "hourly", "live"] as const;
export type ForecastMode = (typeof FORECAST_MODES)[number];

/** The mode every organization has unless an explicit setting says otherwise. */
export const DEFAULT_FORECAST_MODE: ForecastMode = "weekly";

export function isForecastMode(v: unknown): v is ForecastMode {
  return typeof v === "string" && (FORECAST_MODES as readonly string[]).includes(v);
}

/**
 * Internal names, for operators and logs only. These are NOT public labels:
 * no status hierarchy is ever shown to a customer.
 */
export const INTERNAL_MODE_NAME: Readonly<Record<ForecastMode, string>> = {
  weekly: "FREE",
  daily: "VIP DAILY",
  hourly: "VIP HOURLY",
  live: "SUPER VIP LIVE",
};

/**
 * SUGGESTED public direction (owner 2026-10-24), not wired to any plan, price,
 * entitlement or rendered copy. Describes the cadence plainly; a later plan
 * integration decides whether and where any of it is shown.
 */
export const SUGGESTED_PUBLIC_MODE_LABEL: Readonly<Record<ForecastMode, string>> = {
  weekly: "Essential",
  daily: "Advanced",
  hourly: "Professional",
  live: "Adaptive",
};

/**
 * SIGNIFICANT CHANGES — the facts whose change makes a LIVE forecast stale
 * (owner list, 2026-10-24). Each kind is raised by the database itself, inside
 * the write that changed the fact (see the forecast migration), so every write
 * path — web, chat, MCP, import — is covered without a second hook.
 */
export const FORECAST_SIGNAL_KINDS = [
  "hours", // new / corrected hours (journal entries, the organization's hour ledger)
  "quantities", // completed quantities and finished work (task / stage completion)
  "team", // team change (individual assignments, brigade assignments)
  "availability", // availability change (approved / cancelled absences, planned work)
  "orders", // new or changed orders (demand, procurement inquiries)
  "scope", // scope change (tasks or stages added, removed, cancelled)
  "supply", // supply problems (procurement status)
  "quality", // quality issues / defects and their corrections
  "deadline", // deadline or dependency change (project end date, stage dates, task dependencies)
  "partner", // partner capacity change (brigade assignment ended / replaced)
  "budget", // budget lines and actual cost (finance records)
] as const;
export type ForecastSignalKind = (typeof FORECAST_SIGNAL_KINDS)[number];

export function isForecastSignalKind(v: unknown): v is ForecastSignalKind {
  return typeof v === "string" && (FORECAST_SIGNAL_KINDS as readonly string[]).includes(v);
}

/** A LIVE recompute waits until the project has been quiet this long, so a
 *  burst of writes (an import, a day's journal batch) yields one recompute. */
export const LIVE_DEBOUNCE_MS = 2 * 60 * 1000;
/** …but never longer than this after the first unprocessed signal, so a
 *  project that never goes quiet is still recomputed. */
export const LIVE_MAX_WAIT_MS = 15 * 60 * 1000;

/** What the scheduler knows about one project when it asks "is it due?". */
export interface RecomputeState {
  readonly mode: ForecastMode;
  /** false = forecasting switched off for the organization: never due. */
  readonly enabled: boolean;
  /** When the latest forecast version was computed; null = never. */
  readonly lastComputedAt: string | null;
  /** The oldest unprocessed significant-change signal; null = none. */
  readonly firstSignalAt: string | null;
  /** The newest unprocessed significant-change signal; null = none. */
  readonly lastSignalAt: string | null;
}

export type RecomputeDecision =
  | { readonly due: true; readonly reason: "first" | "schedule" | "signal" | "signal_max_wait" | "daily_baseline" }
  | { readonly due: false; readonly reason: "disabled" | "not_yet" | "debouncing" };

const ms = (iso: string): number => Date.parse(iso);
const utcDay = (t: number): string => new Date(t).toISOString().slice(0, 10);
const utcHour = (t: number): string => new Date(t).toISOString().slice(0, 13);
const isSundayUtc = (t: number): boolean => new Date(t).getUTCDay() === 0;

/**
 * Is a recompute due NOW? Deterministic in its inputs.
 *
 *  - weekly: once per Sunday (UTC). A project with no forecast yet also waits
 *    for the next Sunday: the plan's cadence is the plan's cadence.
 *  - daily:  once per UTC day (the first run of a new day).
 *  - hourly: once per UTC hour.
 *  - live:   when an unprocessed signal exists and the project has been quiet
 *            for LIVE_DEBOUNCE_MS (or the first signal is LIVE_MAX_WAIT_MS
 *            old); otherwise the daily baseline; a project never computed is
 *            computed at once.
 */
export function recomputeDecision(state: RecomputeState, nowIso: string): RecomputeDecision {
  if (!state.enabled) return { due: false, reason: "disabled" };
  const now = ms(nowIso);
  const last = state.lastComputedAt ? ms(state.lastComputedAt) : null;

  switch (state.mode) {
    case "weekly": {
      if (!isSundayUtc(now)) return { due: false, reason: "not_yet" };
      if (last === null) return { due: true, reason: "first" };
      return utcDay(last) === utcDay(now) ? { due: false, reason: "not_yet" } : { due: true, reason: "schedule" };
    }
    case "daily": {
      if (last === null) return { due: true, reason: "first" };
      return utcDay(last) < utcDay(now) ? { due: true, reason: "schedule" } : { due: false, reason: "not_yet" };
    }
    case "hourly": {
      if (last === null) return { due: true, reason: "first" };
      return utcHour(last) < utcHour(now) ? { due: true, reason: "schedule" } : { due: false, reason: "not_yet" };
    }
    case "live": {
      if (last === null) return { due: true, reason: "first" };
      if (state.lastSignalAt && state.firstSignalAt) {
        const quietFor = now - ms(state.lastSignalAt);
        const waitingFor = now - ms(state.firstSignalAt);
        if (quietFor >= LIVE_DEBOUNCE_MS) return { due: true, reason: "signal" };
        if (waitingFor >= LIVE_MAX_WAIT_MS) return { due: true, reason: "signal_max_wait" };
        return { due: false, reason: "debouncing" };
      }
      return utcDay(last) < utcDay(now) ? { due: true, reason: "daily_baseline" } : { due: false, reason: "not_yet" };
    }
  }
}

/**
 * The instants at which a mode WOULD recompute, between two instants, given
 * the moments significant changes happened — the same rule as
 * `recomputeDecision`, evaluated on the scheduler's tick. Used by the
 * commercial demonstration, never by production scheduling.
 */
export function recomputeInstants(
  mode: ForecastMode,
  fromIso: string,
  toIso: string,
  signalTimesIso: readonly string[],
  tickMs: number = 5 * 60 * 1000,
): string[] {
  const out: string[] = [];
  const signals = [...signalTimesIso].map(ms).sort((a, b) => a - b);
  let lastComputed: number | null = null;
  const start = ms(fromIso);
  const end = ms(toIso);
  for (let t = start; t <= end; t += tickMs) {
    // Signals raised after the last recompute and up to this tick are unprocessed.
    const pending = signals.filter((s) => s <= t && (lastComputed === null || s > lastComputed));
    const decision = recomputeDecision(
      {
        mode,
        enabled: true,
        lastComputedAt: lastComputed === null ? null : new Date(lastComputed).toISOString(),
        firstSignalAt: pending.length ? new Date(pending[0]).toISOString() : null,
        lastSignalAt: pending.length ? new Date(pending[pending.length - 1]).toISOString() : null,
      },
      new Date(t).toISOString(),
    );
    if (decision.due) {
      lastComputed = t;
      out.push(new Date(t).toISOString());
    }
  }
  return out;
}
