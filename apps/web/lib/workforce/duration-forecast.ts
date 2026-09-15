import { addDays } from "@/lib/planning/planning-model";
import {
  durationKey,
  MIN_OBSERVATIONS,
  type LearnedConfidence,
  type LearnedDuration,
} from "@/lib/workforce/learned-duration";

/**
 * DURATION FORECAST — the learned reading, carried forward to the next plan.
 *
 * THE GAP THIS CLOSES (J-TIME-FREEDOM step 7, "Learned durations improve the
 * next forecast — labelled as forecast"). CAL-10 reads back what comparable
 * finished stages REALLY took (`learned-duration.ts`) and shows it beside a
 * plan. Nothing carried that reading FORWARD: a planner typing the next
 * stage's dates got no suggestion, and the register said, correctly, that
 * closing the step meant designing where a suggestion lives without it
 * hardening into a record.
 *
 * WHERE IT LIVES: NOWHERE. A forecast is a value computed at render from the
 * observations as they stand, offered as a prefill, and discarded. Adopting
 * it writes a PLAN (`planned_end`) by the planner's own act; the forecast
 * itself is never a column, never a row, never cached. That is the whole of
 * SEP-1 here: FACT (actual_start/actual_end) → DERIVED (the median) →
 * FORECAST (this object), and only the first is stored.
 *
 * ── WHAT A FORECAST MAY SAY ────────────────────────────────────────────────
 *
 * Only what the evidence supports. Below `MIN_OBSERVATIONS` the learned
 * reading carries no median, so there is no forecast — not a rough one, none.
 * The confidence word is the READING's, passed through unchanged, and the
 * observation count and date span travel with the number so a planner can
 * weigh "three stages, last winter" against "twelve, this quarter".
 *
 * PURE. No IO, no clock. Same inputs, same forecast.
 */

export interface DurationForecast {
  /** The learned key this forecast was read from. */
  readonly key: string;
  /** Inclusive calendar days the comparable work has taken (the median). */
  readonly forecastDays: number;
  /** ISO day: `plannedStart` + forecastDays − 1. Null when no start is set —
   *  a duration without a start is not a date. */
  readonly forecastEnd: string | null;
  readonly confidence: Exclude<LearnedConfidence, "insufficient">;
  readonly observations: number;
  readonly firstObservedOn: string | null;
  readonly lastObservedOn: string | null;
  /** The rows the number came from — every forecast is traceable. */
  readonly sourceIds: readonly string[];
}

/**
 * The one forecast rule. Returns null whenever the evidence does not support
 * a number: no learned reading for this name, or a reading below the
 * observation floor. Null is "no forecast", never "zero days".
 */
export function forecastDuration(input: {
  readonly stageName: string | null | undefined;
  readonly plannedStart: string | null | undefined;
  readonly learned: readonly LearnedDuration[];
}): DurationForecast | null {
  const key = durationKey(input.stageName);
  if (!key) return null;
  const reading = input.learned.find((r) => r.key === key);
  if (!reading) return null;
  if (reading.medianActualDays === null || reading.observations < MIN_OBSERVATIONS) return null;
  if (reading.confidence === "insufficient") return null;

  const forecastDays = Math.max(1, Math.round(reading.medianActualDays));
  const start = input.plannedStart && /^\d{4}-\d{2}-\d{2}$/.test(input.plannedStart) ? input.plannedStart : null;
  return {
    key,
    forecastDays,
    forecastEnd: start ? addDays(start, forecastDays - 1) : null,
    confidence: reading.confidence,
    observations: reading.observations,
    firstObservedOn: reading.firstObservedOn,
    lastObservedOn: reading.lastObservedOn,
    sourceIds: reading.sourceIds,
  };
}
