import { describe, expect, it } from "vitest";

import { computeProjectForecast } from "./forecast-engine";
import { buildForecastFacts, type ForecastFactRows } from "./forecast-facts";

const TODAY = "2026-10-14";

const hoursEntry = (key: string, day: string, hours: number, opts: { approved?: boolean; bySubject?: boolean; correctionOf?: string } = {}) => ({
  entry_key: key,
  correction_of_key: opts.correctionOf ?? null,
  created_at: `${day}T18:00:00.000Z`,
  context_key: "ctx",
  metrics: [
    { metric_slug: "work_date", value_text: day, value_numeric: null, unit_slug: null },
    { metric_slug: "quantity", value_text: null, value_numeric: hours, unit_slug: "hours" },
  ],
  confirmations: opts.approved
    ? [{ confirmation_scope: { decision: "approved" }, created_at: `${day}T19:00:00.000Z`, confirmer_role: "employer", by_subject: opts.bySubject ?? false }]
    : [],
});

const rows = (over: Partial<ForecastFactRows> = {}): ForecastFactRows => ({
  project: { status: "live", start_date: "2026-09-01", end_date: "2026-11-30" },
  tasks: {
    rows: [
      { key: "t1", parent_key: null, status: "done", resolved_at: "2026-10-10T10:00:00Z" },
      { key: "t2", parent_key: null, status: "in_progress", resolved_at: null },
      // A container: counted through its leaves only.
      { key: "t3", parent_key: null, status: "done", resolved_at: "2026-10-11T10:00:00Z" },
      { key: "t3a", parent_key: "t3", status: "done", resolved_at: "2026-10-11T09:00:00Z" },
      { key: "t3b", parent_key: "t3", status: "blocked", resolved_at: null },
      { key: "t4", parent_key: null, status: "cancelled", resolved_at: null },
    ],
    truncated: false,
  },
  stages: {
    rows: [
      { status: "done", planned_end: "2026-10-01", actual_end: "2026-10-03" },
      { status: "in_progress", planned_end: "2026-10-10", actual_end: null },
      { status: "cancelled", planned_end: "2026-10-01", actual_end: null },
    ],
    truncated: false,
  },
  journal: {
    rows: [
      hoursEntry("a", "2026-10-12", 8, { approved: true }),
      hoursEntry("b", "2026-10-13", 6, { approved: true, bySubject: true }), // self-approval is not confirmation
      // A corrected original and its correction: counted once, by the correction.
      hoursEntry("c0", "2026-10-13", 9, { approved: true }),
      hoursEntry("c1", "2026-10-13", 7, { correctionOf: "c0" }),
      hoursEntry("future", "2026-10-20", 5), // a future day is not work done
    ],
    truncated: false,
  },
  allocations: { rows: [
      { worker_key: "w1", work_date: "2026-10-12", hours: 30, status: "approved" },
      { worker_key: "w2", work_date: "2026-10-12", hours: 4, status: "rejected" },
    ], truncated: false },
  team: {
    active_people: 3,
    absences: [
      { person_key: "p1", start_date: "2026-10-10", end_date: "2026-10-16", half_day: false },
      { person_key: "p2", start_date: "2026-10-16", end_date: "2026-10-16", half_day: true },
    ],
  },
  defects: {
    rows: [
      { severity: "critical", status: "reported", due_date: "2026-10-01" },
      { severity: "high", status: "accepted", due_date: null },
      { severity: "low", status: "in_correction", due_date: null },
    ],
    failed_corrections: 1,
  },
  readiness: { workers_with_missing: 2 },
  economics: { budget_total_cents: null, budget_lines_cents: 500_000, budget_lines: 2, actual_cost_cents: 120_000 },
  ...over,
});

describe("fact rows → forecast facts, through the canonical rules", () => {
  it("scope: leaf tasks only, cancelled excluded, completion days kept", () => {
    const f = buildForecastFacts("p", TODAY, rows());
    expect(f.tasks).toEqual({ total: 4, done: 2, blocked: 1, completedOn: ["2026-10-10", "2026-10-11"] });
    expect(f.stages).toEqual({ total: 2, done: 1, blocked: 0, overdue: 1, completedOn: ["2026-10-03"] });
  });

  it("hours: one work-time rule, chains counted once, self-approval not confirmed, no future days", () => {
    const f = buildForecastFacts("p", TODAY, rows());
    expect(f.hours?.basis).toBe("journal");
    expect(f.hours?.totalHours).toBe(21); // 8 + 6 + 7
    expect(f.hours?.confirmedHours).toBe(8);
    expect(f.hours?.byDay).toEqual([{ day: "2026-10-12", hours: 8 }, { day: "2026-10-13", hours: 13 }]);
    // The organization's ledger rides beside — never added.
    expect(f.hours?.otherLedgerHours).toBe(30);
    expect(f.hours?.contributorsInWindow).toBe(1); // one engagement context recorded the hours
  });

  it("the organization's ledger is the basis only when the journal holds no hours", () => {
    const f = buildForecastFacts("p", TODAY, rows({ journal: { rows: [], truncated: false } }));
    expect(f.hours?.basis).toBe("organization_ledger");
    expect(f.hours?.totalHours).toBe(30);
    expect(f.hours?.otherLedgerHours).toBe(0);
    expect(f.hours?.contributorsInWindow).toBe(1); // the rejected row is counted nowhere
  });

  it("a failed ledger read with an empty journal is UNKNOWN, not zero", () => {
    const f = buildForecastFacts("p", TODAY, rows({ journal: { rows: [], truncated: false }, allocations: null }));
    expect(f.hours).toBeNull();
  });

  it("a truncated task read is UNKNOWN", () => {
    const f = buildForecastFacts("p", TODAY, rows({ tasks: { rows: [], truncated: true } }));
    expect(f.tasks).toBeNull();
    expect(f.sources.find((s) => s.key === "work_tasks")?.state).toBe("truncated");
  });

  it("absences: only days ahead, one person once per day, half days as half", () => {
    const f = buildForecastFacts("p", TODAY, rows());
    expect(f.team?.activePeople).toBe(3);
    expect(f.team?.absences).toEqual([
      { day: "2026-10-15", peopleAbsent: 1 },
      { day: "2026-10-16", peopleAbsent: 1.5 },
    ]);
  });

  it("quality, readiness and money", () => {
    const f = buildForecastFacts("p", TODAY, rows());
    expect(f.quality).toEqual({ open: { low: 1, medium: 0, high: 0, critical: 1 }, overdueOpen: 1, failedCorrections: 1 });
    expect(f.readiness).toEqual({ workersWithMissingItems: 2 });
    expect(f.economics).toEqual({ budgetCents: 500_000, actualCostCents: 120_000 });
    const noBudget = buildForecastFacts("p", TODAY, rows({ economics: { budget_total_cents: null, budget_lines_cents: null, budget_lines: 0, actual_cost_cents: 0 } }));
    expect(noBudget.economics?.budgetCents).toBeNull();
  });
});

/**
 * THE CONTRACT WITH THE DATABASE DOOR. This is the literal output of
 * `forecast_project_facts_v1` (migration 20261024130000) over synthetic rows,
 * captured on a throwaway PostgreSQL 16 cluster on 2026-10-24 — so the shape
 * the app reads is the shape the SQL writes. Keys are md5 of synthetic ids.
 * Note what is NOT in it: no entry text, no free-text metric, no review note.
 */
const DOOR_OUTPUT = {
  "team": {
    "absences": [
      {
        "end_date": "2026-10-28",
        "half_day": false,
        "person_key": "01597edc939df1b029348ea277f3cffb",
        "start_date": "2026-10-26"
      }
    ],
    "active_people": 2
  },
  "tasks": {
    "rows": [
      {
        "key": "364bdd112da218e15c37d19a619ca5be",
        "status": "done",
        "parent_key": null,
        "resolved_at": "2026-10-24T12:53:57.232971+03:00"
      },
      {
        "key": "272775ba22707dee3f289ccba93e8e8b",
        "status": "done",
        "parent_key": null,
        "resolved_at": "2026-10-22T12:53:57.223013+03:00"
      }
    ],
    "truncated": false
  },
  "stages": {
    "rows": [
      {
        "status": "in_progress",
        "actual_end": null,
        "planned_end": "2026-11-05"
      }
    ],
    "truncated": false
  },
  "defects": {
    "rows": [
      {
        "status": "reported",
        "due_date": "2026-10-23",
        "severity": "critical"
      }
    ],
    "failed_corrections": 0
  },
  "journal": {
    "rows": [
      {
        "metrics": [
          {
            "id": "cf75c46b855c598ff2f476341050f6b4",
            "source": "worker_input",
            "unit_slug": "hours",
            "created_at": "2026-10-24T12:53:57.248214+03:00",
            "value_text": null,
            "metric_slug": "quantity",
            "value_numeric": 8
          },
          {
            "id": "7617b84ec35a7e8e196992db64b5c578",
            "source": "worker_input",
            "unit_slug": null,
            "created_at": "2026-10-24T12:53:57.248214+03:00",
            "value_text": "2026-10-23",
            "metric_slug": "work_date",
            "value_numeric": null
          }
        ],
        "entry_key": "d4c46ff321bde2195faf8ad649c9b7ce",
        "created_at": "2026-10-24T12:53:57.242862+03:00",
        "context_key": "4a03bad94a9c02ab2db48bf7088a1adb",
        "confirmations": [
          {
            "by_subject": false,
            "created_at": "2026-10-24T12:53:57.255321+03:00",
            "confirmer_role": "employer",
            "confirmation_scope": {
              "decision": "approved"
            }
          }
        ],
        "correction_of_key": null
      }
    ],
    "truncated": false
  },
  "project": {
    "status": "live",
    "end_date": "2026-12-03",
    "start_date": "2026-09-24"
  },
  "economics": {
    "budget_lines": 2,
    "actual_cost_cents": 40000,
    "budget_lines_cents": 150000,
    "budget_total_cents": null
  },
  "readiness": {
    "workers_with_missing": 0
  },
  "allocations": {
    "rows": [
      {
        "hours": 7.5,
        "status": "recorded",
        "work_date": "2026-10-23",
        "worker_key": "b07433b5a4c192d36a710941e52d27cb"
      }
    ],
    "truncated": false
  }
} as unknown as ForecastFactRows;

describe("the facts door's real output, through the same rules", () => {
  it("reads every part", () => {
    const f = buildForecastFacts("p", "2026-10-24", DOOR_OUTPUT);
    expect(f.tasks).toEqual({ total: 2, done: 2, blocked: 0, completedOn: ["2026-10-22", "2026-10-24"] });
    expect(f.stages).toMatchObject({ total: 1, done: 0, overdue: 0 });
    expect(f.hours).toMatchObject({ basis: "journal", totalHours: 8, confirmedHours: 8, otherLedgerHours: 7.5, contributorsInWindow: 1 });
    expect(f.team?.activePeople).toBe(2);
    expect(f.team?.absences.map((a) => a.day)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(f.quality).toEqual({ open: { low: 0, medium: 0, high: 0, critical: 1 }, overdueOpen: 1, failedCorrections: 0 });
    expect(f.economics).toEqual({ budgetCents: 150_000, actualCostCents: 40_000 });
    expect(JSON.stringify(DOOR_OUTPUT)).not.toMatch(/secret free text|must not leak/);
  });

  it("and the engine reads those facts: all tasks done, a critical defect still open", () => {
    const f = computeProjectForecast(buildForecastFacts("p", "2026-10-24", DOOR_OUTPUT));
    expect(f.completion.method).toBe("done");
    expect(f.quality.risk).toBe("high");
    expect(f.actions).toContainEqual({ key: "close_serious_defects", value: 1 });
  });
});
