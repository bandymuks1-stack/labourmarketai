import { describe, expect, it } from "vitest";

import { forecastDuration } from "./duration-forecast";
import { learnDurations, MIN_OBSERVATIONS, type DurationObservation } from "./learned-duration";

/**
 * J-TIME-FREEDOM step 7 — the learned reading carried forward as a FORECAST.
 *
 * Two things must hold and both are SEP-1: the forecast is derived from the
 * same readings CAL-10 shows (never a second number), and it exists only as a
 * suggestion — a value, never a store. The tests below also pin the floor:
 * below MIN_OBSERVATIONS there is no forecast at all, not a rough one.
 */

function observations(key: string, actualDays: readonly number[]): DurationObservation[] {
  return actualDays.map((d, i) => ({
    key,
    sourceId: `${key}-${i}`,
    plannedDays: null,
    actualDays: d,
    completedOn: `2026-0${(i % 8) + 1}-15`,
  }));
}

const names = new Map([["foundations", "Foundations"]]);

describe("forecastDuration — the reading carried forward", () => {
  it("forecasts the median of comparable finished stages and dates it from the planned start", () => {
    const learned = learnDurations(observations("foundations", [4, 6, 5]), names);
    const f = forecastDuration({ stageName: "  Foundations ", plannedStart: "2026-10-05", learned });
    expect(f).not.toBeNull();
    expect(f!.forecastDays).toBe(5);
    expect(f!.forecastEnd).toBe("2026-10-09"); // inclusive: 5 days from 10-05
    expect(f!.observations).toBe(3);
    expect(f!.confidence).toBe("indicative");
    expect(f!.sourceIds).toEqual(["foundations-0", "foundations-1", "foundations-2"]);
  });

  it("carries a duration but no date when there is no planned start — a duration is not a date", () => {
    const learned = learnDurations(observations("foundations", [4, 6, 5]), names);
    const f = forecastDuration({ stageName: "Foundations", plannedStart: "", learned });
    expect(f?.forecastDays).toBe(5);
    expect(f?.forecastEnd).toBeNull();
  });

  it("gives NO forecast below the observation floor — not a rough one, none", () => {
    const learned = learnDurations(observations("foundations", [4, 6]), names);
    expect(MIN_OBSERVATIONS).toBe(3);
    expect(forecastDuration({ stageName: "Foundations", plannedStart: "2026-10-05", learned })).toBeNull();
  });

  it("gives NO forecast for a name nothing has been learned about", () => {
    const learned = learnDurations(observations("foundations", [4, 6, 5]), names);
    expect(forecastDuration({ stageName: "Roofing", plannedStart: "2026-10-05", learned })).toBeNull();
    expect(forecastDuration({ stageName: "F", plannedStart: "2026-10-05", learned })).toBeNull();
  });

  it("is exactly the number CAL-10 shows — one reading, not a second estimate", () => {
    const learned = learnDurations(observations("foundations", [3, 9, 4, 8, 5, 7, 6, 10]), names);
    const reading = learned.find((r) => r.key === "foundations")!;
    const f = forecastDuration({ stageName: "Foundations", plannedStart: "2026-01-01", learned })!;
    expect(f.forecastDays).toBe(Math.round(reading.medianActualDays!));
    expect(f.confidence).toBe("established");
    expect(f.firstObservedOn).toBe(reading.firstObservedOn);
    expect(f.lastObservedOn).toBe(reading.lastObservedOn);
  });

  it("never forecasts zero days", () => {
    const learned = learnDurations(observations("foundations", [1, 1, 1]), names);
    const f = forecastDuration({ stageName: "Foundations", plannedStart: "2026-10-05", learned })!;
    expect(f.forecastDays).toBe(1);
    expect(f.forecastEnd).toBe("2026-10-05");
  });

  it("is deterministic", () => {
    const learned = learnDurations(observations("foundations", [4, 6, 5]), names);
    const input = { stageName: "Foundations", plannedStart: "2026-10-05", learned };
    expect(forecastDuration(input)).toEqual(forecastDuration(input));
  });
});
