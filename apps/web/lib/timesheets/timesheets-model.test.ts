import { describe, expect, it } from "vitest";

import {
  buildTimesheetCsv,
  currentMonthPeriod,
  deriveTimesheetTotals,
  isEditableTimesheetStatus,
  isReopenableTimesheetStatus,
  isTimesheetMigrationMissingCode,
  isTimesheetNotice,
  lineHours,
  parseTimesheetSnapshot,
  timesheetCsvFilename,
  timesheetNoticeForOutcome,
  timesheetPeriodDays,
  type TimesheetLine,
  type TimesheetRow,
} from "@/lib/timesheets/timesheets-model";

function line(partial: Partial<TimesheetLine>): TimesheetLine {
  return {
    lineKey: "je-1#f1",
    journalEntryId: "je-1",
    fragmentIndex: 1,
    day: "2026-08-03",
    title: "Poured concrete",
    evidencePhrase: null,
    workTypeKey: null,
    value: 8,
    unit: "hours",
    derivedFrom: "fragment_time",
    metricSource: "worker_input",
    projectId: null,
    projectTitle: null,
    ...partial,
  };
}

describe("timesheet period rules", () => {
  it("accepts a natural month and rejects >31 days / reversed order", () => {
    expect(timesheetPeriodDays("2026-08-01", "2026-08-31")).toBe(31);
    expect(timesheetPeriodDays("2026-08-01", "2026-08-01")).toBe(1);
    expect(timesheetPeriodDays("2026-08-01", "2026-09-01")).toBeNull();
    expect(timesheetPeriodDays("2026-08-10", "2026-08-01")).toBeNull();
    expect(timesheetPeriodDays("2026-8-1", "2026-08-31")).toBeNull();
  });

  it("currentMonthPeriod covers the whole month incl. leap February", () => {
    expect(currentMonthPeriod("2026-08-17")).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
    expect(currentMonthPeriod("2028-02-10")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });
});

describe("snapshot parsing (defensive, never guessing)", () => {
  it("drops malformed lines and re-derives totals from survivors", () => {
    const parsed = parseTimesheetSnapshot({
      computedAt: "2026-08-17T10:00:00Z",
      lines: [
        line({ value: 8, unit: "hours" }),
        line({ lineKey: "je-1#f2", value: 90, unit: "minutes" }),
        line({ lineKey: "je-1#f3", value: 1, unit: "days" }),
        { day: "not-a-day", value: 5, unit: "hours" }, // dropped
        { day: "2026-08-03", value: "x", unit: "hours" }, // dropped
        { day: "2026-08-03", value: 2, unit: "weeks" }, // dropped
        null,
      ],
      totals: { totalHours: 999, totalDayUnits: 999, lineCount: 999 }, // ignored
    });
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.totals.totalHours).toBe(9.5);
    expect(parsed.totals.totalDayUnits).toBe(1);
    expect(parsed.totals.lineCount).toBe(3);
  });

  it("an empty / garbage snapshot degrades to zero totals", () => {
    for (const raw of [{}, null, [], "x", 42]) {
      const parsed = parseTimesheetSnapshot(raw);
      expect(parsed.lines).toHaveLength(0);
      expect(parsed.totals).toEqual({
        totalHours: 0,
        totalDayUnits: 0,
        lineCount: 0,
      });
    }
  });

  it("never invents a day-to-hours conversion", () => {
    expect(lineHours(line({ unit: "days", value: 3 }))).toBe(0);
    expect(lineHours(line({ unit: "minutes", value: 30 }))).toBe(0.5);
    const totals = deriveTimesheetTotals([line({ unit: "days", value: 2 })]);
    expect(totals.totalHours).toBe(0);
    expect(totals.totalDayUnits).toBe(2);
  });
});

describe("CSV export carries REAL hours", () => {
  const sheet: TimesheetRow = {
    id: "t-1",
    organizationId: "o-1",
    workerId: "w-1",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    status: "approved",
    submittedAt: "2026-08-20T10:00:00Z",
    decidedAt: "2026-08-21T10:00:00Z",
    createdAt: "2026-08-19T10:00:00Z",
    snapshot: {
      computedAt: "2026-08-20T10:00:00Z",
      source: "journal_entry_metrics",
      conflicts: [],
      lines: [
        line({ value: 8, unit: "hours", projectTitle: 'Site "A", hall' }),
        line({ lineKey: "je-1#f2", value: 90, unit: "minutes" }),
      ],
      totals: deriveTimesheetTotals([
        line({ value: 8, unit: "hours" }),
        line({ lineKey: "je-1#f2", value: 90, unit: "minutes" }),
      ]),
    },
  };

  it("emits header, per-line hours, quoting and a TOTAL row", () => {
    const csv = buildTimesheetCsv(sheet);
    const rows = csv.trim().split("\r\n");
    expect(rows[0]).toContain("hours");
    expect(rows[1]).toContain("8"); // real hours on the line
    expect(rows[1]).toContain('"Site ""A"", hall"'); // RFC-4180 quoting
    expect(rows[2]).toContain("1.5"); // 90 minutes as hours
    expect(rows.at(-1)).toContain("TOTAL");
    expect(rows.at(-1)).toContain("9.5");
  });

  it("an empty sheet exports honestly: header + zero total, no fake rows", () => {
    const empty: TimesheetRow = {
      ...sheet,
      snapshot: {
        computedAt: null,
        source: null,
        conflicts: [],
        lines: [],
        totals: deriveTimesheetTotals([]),
      },
    };
    const rows = buildTimesheetCsv(empty).trim().split("\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("TOTAL");
    expect(rows[1]).toContain("0");
  });

  it("filename is period-stable", () => {
    expect(timesheetCsvFilename(sheet)).toBe(
      "timesheet-2026-08-01-2026-08-31.csv",
    );
  });
});

describe("status + notice vocabulary", () => {
  it("editable = draft/reopened; reopenable = approved/rejected", () => {
    expect(isEditableTimesheetStatus("draft")).toBe(true);
    expect(isEditableTimesheetStatus("reopened")).toBe(true);
    expect(isEditableTimesheetStatus("submitted")).toBe(false);
    expect(isReopenableTimesheetStatus("approved")).toBe(true);
    expect(isReopenableTimesheetStatus("rejected")).toBe(true);
    expect(isReopenableTimesheetStatus("draft")).toBe(false);
  });

  it("missing-migration codes map to the honest degradation state", () => {
    for (const code of ["42P01", "42703", "42883", "PGRST202"]) {
      expect(isTimesheetMigrationMissingCode(code)).toBe(true);
    }
    expect(isTimesheetMigrationMissingCode("23505")).toBe(false);
  });

  it("every RPC outcome maps to a known notice; unknown maps to error", () => {
    for (const outcome of [
      "created",
      "refreshed",
      "submitted",
      "reopened",
      "approved",
      "rejected",
      "overlap",
      "invalid_period",
      "no_worker",
      "not_editable",
      "not_decided",
      "not_submitted",
      "already_submitted",
      "no_instance",
      "invalid",
      "not_found",
      "limit_reached",
    ]) {
      const notice = timesheetNoticeForOutcome(outcome);
      expect(isTimesheetNotice(notice)).toBe(true);
      expect(notice).toBe(outcome);
    }
    expect(timesheetNoticeForOutcome("still_pending")).toBe("synced_pending");
    expect(timesheetNoticeForOutcome("weird")).toBe("error");
  });
});
