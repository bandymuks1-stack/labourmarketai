import { describe, expect, it } from "vitest";

import { addDays } from "./forecast-days";
import { computeProjectForecast, FORECAST_ENGINE_VERSION } from "./forecast-engine";
import { factsFingerprint } from "./forecast-history";
import { baseFacts, TODAY } from "./forecast-test-fixtures";

describe("forecast engine — the formulas, by hand", () => {
  it("the base project: 280 h left at 10 h/day → TODAY+28, 7 days of slack, on track", () => {
    const f = computeProjectForecast(baseFacts());
    expect(f.kind).toBe("forecast");
    expect(f.engineVersion).toBe(FORECAST_ENGINE_VERSION);
    expect(f.status).toBe("ok");
    expect(f.remaining).toEqual({ unit: "tasks", total: 28, done: 14, remaining: 14 });
    expect(f.productivity.hoursPerUnit).toBe(20);
    expect(f.productivity.dailyHours).toBe(10);
    expect(f.productivity.activeDaysInWindow).toBe(28);
    expect(f.requiredHours).toBe(280);
    expect(f.completion).toEqual({ date: addDays(TODAY, 28), method: "hours", daysFromToday: 28, beyondHorizon: false });
    expect(f.deadline).toEqual({ plannedEnd: addDays(TODAY, 35), slackDays: 7, risk: "on_track" });
    expect(f.workforce.perPersonDailyHours).toBe(5);
    expect(f.workforce.workersNeeded).toBe(2);
    expect(f.workforce.workerGap).toBe(0);
    expect(f.workforce.capacityHoursBeforeDeadline).toBe(350);
    expect(f.workforce.capacityGapHours).toBe(-70);
    expect(f.confidence).toBe("high");
    expect(f.actions).toEqual([]);
  });

  it("an approved absence moves the date: one person away 7 days → TODAY+32, tight", () => {
    const absences = Array.from({ length: 7 }, (_, i) => ({ day: addDays(TODAY, i + 1), peopleAbsent: 1 }));
    const f = computeProjectForecast(baseFacts({ team: { activePeople: 2, absences, freeInternalPeople: null } }));
    // 7 days × 5 h = 35 h, then 245 h at 10 h/day = 24.5 → 25 days.
    expect(f.completion.date).toBe(addDays(TODAY, 32));
    expect(f.deadline.slackDays).toBe(3);
    expect(f.deadline.risk).toBe("tight");
    expect(f.workforce.absencePersonDaysBeforeDeadline).toBe(7);
    expect(f.workforce.capacityHoursBeforeDeadline).toBe(315);
    expect(f.assumptions.map((a) => a.key)).toContain("absences_as_approved");
  });

  it("a deadline the team cannot hold: likely miss, one more worker, the late days counted", () => {
    const f = computeProjectForecast(baseFacts({ project: { status: "live", startDate: null, plannedEnd: addDays(TODAY, 20) } }));
    expect(f.deadline).toEqual({ plannedEnd: addDays(TODAY, 20), slackDays: -8, risk: "likely_miss" });
    // 280 h ÷ 5 h = 56 person-days over 20 days → 3 people.
    expect(f.workforce.workersNeeded).toBe(3);
    expect(f.workforce.workerGap).toBe(1);
    expect(f.workforce.partnerNeed).toBeNull(); // free internal people unknown → partner need unknown
    expect(f.losses.lateDays).toBe(8);
    expect(f.actions).toContainEqual({ key: "add_workers", value: 1 });
  });

  it("partner need only when the free internal people are known", () => {
    const f = computeProjectForecast(
      baseFacts({
        project: { status: "live", startDate: null, plannedEnd: addDays(TODAY, 10) },
        team: { activePeople: 2, absences: [], freeInternalPeople: 1 },
      }),
    );
    // 56 person-days over 10 days → 6 people → gap 4, one free internally → 3 from a partner.
    expect(f.workforce.workerGap).toBe(4);
    expect(f.workforce.partnerNeed).toBe(3);
    expect(f.actions).toContainEqual({ key: "find_partner_capacity", value: 3 });
  });

  it("possible extra cost: the observed cost per hour carried over the remaining hours", () => {
    const f = computeProjectForecast(baseFacts({ economics: { budgetCents: 1_000_000, actualCostCents: 560_000 } }));
    expect(f.cost.costPerHourCents).toBe(2_000);
    expect(f.cost.forecastTotalCostCents).toBe(1_120_000);
    expect(f.cost.possibleExtraCostCents).toBe(120_000);
    expect(f.losses.possibleExtraCostCents).toBe(120_000);
    expect(f.actions).toContainEqual({ key: "review_budget", value: 120_000 });
    expect(f.assumptions.map((a) => a.key)).toContain("cost_continues_at_observed_rate");
  });

  it("no cost reading without a recorded actual cost — never invented", () => {
    const f = computeProjectForecast(baseFacts({ economics: { budgetCents: 1_000_000, actualCostCents: null } }));
    expect(f.cost.costPerHourCents).toBeNull();
    expect(f.cost.possibleExtraCostCents).toBeNull();
    expect(f.losses.possibleExtraCostCents).toBeNull();
  });

  it("quality: a critical defect is high risk and asks for it to be closed", () => {
    const f = computeProjectForecast(
      baseFacts({ quality: { open: { low: 0, medium: 1, high: 0, critical: 1 }, overdueOpen: 1, failedCorrections: 0 } }),
    );
    expect(f.quality).toEqual({ risk: "high", openDefects: 2, seriousOpen: 1, overdueOpen: 1 });
    expect(f.actions).toContainEqual({ key: "close_serious_defects", value: 1 });
  });

  it("productivity trend compares the window with the whole history", () => {
    // All 280 h fall in the window, but only 7 of the 14 tasks did: recent 40 h/task vs 20 h overall.
    const f = computeProjectForecast(
      baseFacts({ tasks: { total: 28, done: 14, blocked: 0, completedOn: Array.from({ length: 7 }, (_, i) => addDays(TODAY, -i)) } }),
    );
    expect(f.productivity.recentHoursPerUnit).toBe(40);
    expect(f.productivity.trend).toBe("declining");
  });
});

describe("forecast engine — sparse evidence stays sparse, unknown stays unknown", () => {
  it("below the done-unit threshold there is no hours-per-unit and no date", () => {
    const f = computeProjectForecast(
      baseFacts({ tasks: { total: 28, done: 2, blocked: 0, completedOn: [TODAY, addDays(TODAY, -1)] } }),
    );
    expect(f.productivity.hoursPerUnit).toBeNull();
    expect(f.requiredHours).toBeNull();
    expect(f.completion.date).toBeNull();
    expect(f.status).toBe("insufficient_data");
    expect(f.confidence).toBe("insufficient");
    expect(f.deadline.risk).toBe("unknown");
  });

  it("an UNKNOWN task read never falls back to stages as if there were no tasks", () => {
    const f = computeProjectForecast(baseFacts({ tasks: null }));
    expect(f.remaining.unit).toBeNull();
    expect(f.remaining.remaining).toBeNull();
    expect(f.completion.date).toBeNull();
    expect(f.actions.map((a) => a.key)).not.toContain("break_down_scope");
  });

  it("no tasks at all: stages are the unit, said in the assumptions", () => {
    const f = computeProjectForecast(
      baseFacts({ tasks: { total: 0, done: 0, blocked: 0, completedOn: [] }, stages: { total: 6, done: 3, blocked: 1, overdue: 0, completedOn: [] } }),
    );
    expect(f.remaining).toEqual({ unit: "stages", total: 6, done: 3, remaining: 3 });
    expect(f.assumptions.map((a) => a.key)).toContain("unit_is_stage");
    expect(f.actions).toContainEqual({ key: "unblock_stages", value: 1 });
  });

  it("no hours recorded: the throughput method, and a request to record hours", () => {
    const f = computeProjectForecast(
      baseFacts({ hours: { basis: "none", byDay: [], totalHours: 0, confirmedHours: null, otherLedgerHours: null, complete: true, contributorsInWindow: null } }),
    );
    // 14 tasks done in the window → 0.5 tasks/day → 14 remaining = 28 days.
    expect(f.completion.method).toBe("throughput");
    expect(f.completion.date).toBe(addDays(TODAY, 28));
    expect(f.requiredHours).toBeNull();
    expect(f.actions).toContainEqual({ key: "record_hours" });
  });

  it("nobody on the team: no completion date and a request for people", () => {
    const f = computeProjectForecast(baseFacts({ team: { activePeople: 0, absences: [], freeInternalPeople: null } }));
    expect(f.completion.date).toBeNull();
    expect(f.completion.beyondHorizon).toBe(true);
    expect(f.deadline.risk).toBe("likely_miss");
    expect(f.requiredHours).toBe(280);
    // 280 h ÷ 5 h per person-day over 35 days → 2 people needed, 0 on the team.
    expect(f.actions).toContainEqual({ key: "add_workers", value: 2 });
  });

  it("an overdue planned end with work left is overdue", () => {
    const f = computeProjectForecast(baseFacts({ project: { status: "live", startDate: null, plannedEnd: addDays(TODAY, -3) } }));
    expect(f.deadline.risk).toBe("overdue");
    expect(f.losses.lateDays).toBe(31);
  });

  it("no planned end: the risk is unknown and the forecast asks for one", () => {
    const f = computeProjectForecast(baseFacts({ project: { status: "live", startDate: null, plannedEnd: null } }));
    expect(f.deadline.risk).toBe("unknown");
    expect(f.actions).toContainEqual({ key: "set_planned_end" });
  });

  it("a completed project is measured, not forecast", () => {
    const f = computeProjectForecast(baseFacts({ project: { status: "completed", startDate: null, plannedEnd: TODAY } }));
    expect(f.status).toBe("not_applicable");
    expect(f.completion.date).toBeNull();
  });

  it("partly unconfirmed hours are named, and lower the confidence", () => {
    const facts = baseFacts();
    const f = computeProjectForecast({ ...facts, hours: { ...facts.hours!, confirmedHours: 70 } });
    expect(f.assumptions).toContainEqual({ key: "hours_partly_unconfirmed", value: 0.25 });
    expect(f.confidence).toBe("high"); // 2 (done) + 1 (steady) + 1 (complete) + 0 (confirmed share) = 4
    const g = computeProjectForecast({ ...facts, hours: { ...facts.hours!, confirmedHours: 70, complete: false } });
    expect(g.confidence).toBe("medium");
    expect(g.assumptions.map((a) => a.key)).toContain("hours_read_truncated");
  });
});

describe("forecast engine — deterministic", () => {
  it("the same facts give the same forecast and the same fingerprint", () => {
    expect(computeProjectForecast(baseFacts())).toEqual(computeProjectForecast(baseFacts()));
    expect(factsFingerprint(baseFacts())).toBe(factsFingerprint(baseFacts()));
  });

  it("a changed fact changes the fingerprint", () => {
    expect(factsFingerprint(baseFacts())).not.toBe(
      factsFingerprint(baseFacts({ team: { activePeople: 3, absences: [], freeInternalPeople: null } })),
    );
  });

  it("the engine has no clock, no randomness and no IO", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "forecast-engine.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toMatch(/Date\.now|new Date\(\)|Math\.random|fetch\(|supabase|from\s+"@\/lib\/supabase/);
  });
});
