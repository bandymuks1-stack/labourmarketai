import { describe, expect, it } from "vitest";

import { forecastAt, forecastShowsProblem, runModeDemonstration, type DemonstrationScenario } from "./forecast-demonstration";
import { baseFacts } from "./forecast-test-fixtures";

/**
 * THE DEMONSTRATION, PROVEN HONEST — one project, the same facts, the same
 * rules, the same start; four modes. The facts change once: on Tuesday 14:02
 * one of the two people leaves the project. The base project was on track
 * (TODAY+28 against a planned end at TODAY+35); with half the capacity it is
 * not.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { today: _today, ...base } = baseFacts();
const scenario: DemonstrationScenario = {
  start: "2026-10-12T00:00:00.000Z", // Monday
  end: "2026-10-18T23:55:00.000Z", // Sunday
  states: [
    { at: "2026-10-11T00:00:00.000Z", label: "project running, two people", facts: base },
    {
      at: "2026-10-13T14:02:00.000Z",
      label: "one person leaves the project",
      facts: { ...base, team: { activePeople: 1, absences: [], freeInternalPeople: null } },
    },
  ],
};

describe("four modes over the same facts", () => {
  const result = runModeDemonstration(scenario);
  const run = (mode: string) => result.runs.find((r) => r.mode === mode)!;

  it("the problem is in the facts from the moment the person left", () => {
    expect(result.problemOnsetAt).toBe("2026-10-13T14:02:00.000Z");
    expect(forecastShowsProblem(forecastAt(scenario.states, "2026-10-13T13:55:00.000Z"))).toBe(false);
  });

  it("each mode notices it only when it recomputes — faster modes earlier, never better", () => {
    expect(run("live").firstProblemNoticedAt).toBe("2026-10-13T14:05:00.000Z");
    expect(run("hourly").firstProblemNoticedAt).toBe("2026-10-13T15:00:00.000Z");
    expect(run("daily").firstProblemNoticedAt).toBe("2026-10-14T00:00:00.000Z");
    expect(run("weekly").firstProblemNoticedAt).toBe("2026-10-18T00:00:00.000Z");
    const hours = ["live", "hourly", "daily", "weekly"].map((m) => run(m).reactionHours!);
    expect(hours).toEqual([0.1, 1, 10, 106]);
  });

  it("IDENTICAL facts at the same instant give IDENTICAL numbers in every mode", () => {
    const byInstant = new Map<string, unknown[]>();
    for (const r of result.runs) {
      for (const c of r.recomputes) {
        const list = byInstant.get(c.at) ?? [];
        list.push(c.forecast);
        byInstant.set(c.at, list);
      }
    }
    let shared = 0;
    for (const forecasts of byInstant.values()) {
      if (forecasts.length < 2) continue;
      shared++;
      for (const f of forecasts) expect(f).toEqual(forecasts[0]);
    }
    // e.g. Monday 00:00 (all but weekly), every midnight, Sunday 00:00 (all four).
    expect(shared).toBeGreaterThanOrEqual(7);
    const sunday = byInstant.get("2026-10-18T00:00:00.000Z")!;
    expect(sunday).toHaveLength(4);
  });

  it("every number a mode shows is the one engine over the facts of that instant", () => {
    for (const r of result.runs) {
      for (const c of r.recomputes) expect(c.forecast).toEqual(forecastAt(scenario.states, c.at));
    }
  });

  it("what each mode can tell when it notices: the date moved, the actions, the late days", () => {
    for (const mode of ["live", "hourly", "daily", "weekly"]) {
      const r = run(mode);
      // Weekly computed once this week (Sunday): it has no earlier version to move from.
      if (mode !== "weekly") expect(r.completionDateMoves.length).toBeGreaterThanOrEqual(1);
      else expect(r.recomputes).toHaveLength(1);
      expect(r.actionsWhenNoticed.map((a) => a.key)).toContain("add_workers");
      expect(r.lateDaysWhenNoticed).toBeGreaterThan(0);
    }
  });
});
