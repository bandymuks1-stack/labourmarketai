import { describe, expect, it } from "vitest";

import { addDays } from "./forecast-days";
import { computeProjectForecast } from "./forecast-engine";
import { compareForecasts, factsFingerprint, measureForecastError } from "./forecast-history";
import { baseFacts, TODAY } from "./forecast-test-fixtures";

describe("comparison with the previous version", () => {
  it("names how far the completion date moved and what changed", () => {
    const before = baseFacts();
    const after = baseFacts({
      team: { activePeople: 2, absences: Array.from({ length: 7 }, (_, i) => ({ day: addDays(TODAY, i + 1), peopleAbsent: 1 })), freeInternalPeople: null },
    });
    const c = compareForecasts(
      { version: 3, forecast: computeProjectForecast(before), inputsHash: factsFingerprint(before) },
      { forecast: computeProjectForecast(after), inputsHash: factsFingerprint(after) },
    );
    expect(c.previousVersion).toBe(3);
    expect(c.completionShiftDays).toBe(4);
    expect(c.deadlineRisk).toEqual({ from: "on_track", to: "tight" });
    expect(c.requiredHoursDelta).toBe(0);
    expect(c.sameInputs).toBe(false);
  });

  it("the same inputs are recognised as the same", () => {
    const f = baseFacts();
    const c = compareForecasts(
      { version: 1, forecast: computeProjectForecast(f), inputsHash: factsFingerprint(f) },
      { forecast: computeProjectForecast(f), inputsHash: factsFingerprint(f) },
    );
    expect(c.sameInputs).toBe(true);
    expect(c.completionShiftDays).toBe(0);
    expect(c.deadlineRisk).toBeNull();
  });
});

describe("actual vs forecast — error measurement", () => {
  const v = (version: number, computedAt: string, date: string | null, requiredHours: number | null) => {
    const f = computeProjectForecast(baseFacts());
    return {
      version,
      computedAt,
      mode: "daily",
      forecast: { ...f, requiredHours, completion: { ...f.completion, date } },
    };
  };

  it("measures each version that was made before the work finished", () => {
    const versions = [
      v(1, "2026-10-01T06:00:00Z", "2026-11-01", 300),
      v(2, "2026-10-10T06:00:00Z", "2026-11-08", 280),
      v(3, "2026-11-20T06:00:00Z", "2026-11-20", 0), // after the fact — not a forecast of it
    ];
    const spent = new Map([[1, 100], [2, 200]]);
    const s = measureForecastError(versions, { completedOn: "2026-11-10", totalHours: 480 }, (x) => spent.get(x.version) ?? null);
    expect(s.versions.map((e) => e.version)).toEqual([1, 2]);
    expect(s.versions[0]).toEqual({ version: 1, mode: "daily", leadDays: 40, completionErrorDays: 9, totalHoursError: -80 });
    expect(s.versions[1]).toEqual({ version: 2, mode: "daily", leadDays: 31, completionErrorDays: 2, totalHoursError: 0 });
    expect(s.meanAbsoluteCompletionErrorDays).toBe(5.5);
    expect(s.meanCompletionBiasDays).toBe(5.5); // both finished later than forecast: optimistic
    expect(s.meanAbsoluteHoursError).toBe(40);
  });

  it("a version without a date is listed but not counted as measured", () => {
    const s = measureForecastError([v(1, "2026-10-01T06:00:00Z", null, null)], { completedOn: "2026-11-10", totalHours: null });
    expect(s.versions[0].completionErrorDays).toBeNull();
    expect(s.measured).toBe(0);
    expect(s.meanAbsoluteCompletionErrorDays).toBeNull();
  });
});
