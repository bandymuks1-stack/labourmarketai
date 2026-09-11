import { describe, expect, it } from "vitest";

import {
  deriveWindowWorkTime,
  journalReportWindow,
  rollUpJournalWindow,
  windowCreatedAtBounds,
  type JournalWindowEntryRow,
} from "./journal-window-report";

/**
 * Windowed journal report — behaviour of the pure window derivation (V8
 * employer daily loop, GAP 4). These tests pin the WINDOWS, not the queries:
 * today is exactly one UTC calendar day, the week is exactly 7 calendar days
 * inclusive ending today, the month is exactly 30 — and boundaries do not
 * bend across month or year edges (W12 doctrine: UTC calendar days).
 */

const TODAY = "2026-08-13";

describe("journalReportWindow — today is one UTC calendar day", () => {
  it("starts and ends on the same day", () => {
    const w = journalReportWindow("today", TODAY);
    expect(w).toEqual({ key: "today", startIso: TODAY, endIso: TODAY });
  });

  it("created_at bounds cover the full day, exclusive of the next", () => {
    const b = windowCreatedAtBounds(journalReportWindow("today", TODAY));
    expect(b.gteIso).toBe("2026-08-13T00:00:00.000Z");
    expect(b.ltIso).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("journalReportWindow — week is 7 inclusive days ending today", () => {
  it("spans exactly seven calendar days", () => {
    const w = journalReportWindow("week", TODAY);
    expect(w.startIso).toBe("2026-08-07");
    expect(w.endIso).toBe(TODAY);
  });

  it("crosses a month boundary without bending", () => {
    const w = journalReportWindow("week", "2026-09-03");
    expect(w.startIso).toBe("2026-08-28");
    expect(w.endIso).toBe("2026-09-03");
  });
});

describe("journalReportWindow — month is 30 inclusive days ending today", () => {
  it("spans exactly thirty calendar days", () => {
    const w = journalReportWindow("month", TODAY);
    expect(w.startIso).toBe("2026-07-15");
    expect(w.endIso).toBe(TODAY);
  });

  it("crosses a year boundary without bending", () => {
    const w = journalReportWindow("month", "2026-01-10");
    expect(w.startIso).toBe("2025-12-12");
    expect(w.endIso).toBe("2026-01-10");
  });

  it("the upper created_at bound is the first instant after today", () => {
    const b = windowCreatedAtBounds(journalReportWindow("month", "2026-12-31"));
    expect(b.gteIso).toBe("2026-12-02T00:00:00.000Z");
    expect(b.ltIso).toBe("2027-01-01T00:00:00.000Z");
  });
});

/**
 * Per-member roll-up (issue #1689, owner §14) — the pure part of the report:
 * hours from THE work-intelligence model over the window's own rows, counted
 * once per entry; confirmed hours from APPROVED confirmations only; review
 * counts that add up; `null` (not zero) when work time was not measured.
 */
const WORKERS = {
  a: { display_name: "Ona", profiles: null },
  b: { display_name: "Jonas", profiles: null },
};

type Metric = NonNullable<JournalWindowEntryRow["journal_entry_metrics"]>[number];

const hoursMetric = (index: number, hours: number): Metric => ({
  metric_slug: "fragment_time",
  value_text: String(index),
  value_numeric: hours,
  unit_slug: "hours",
  source: "ai_extracted",
});
const activityMetric = (index: number, key: string): Metric => ({
  metric_slug: "fragment_activity",
  value_text: `${index}|${key}`,
  value_numeric: null,
  unit_slug: null,
  source: "ai_extracted",
});
const quantityMetric = (value: number, unit: string): Metric => ({
  metric_slug: "quantity",
  value_text: null,
  value_numeric: value,
  unit_slug: unit,
  source: "worker_input",
});

function row(
  id: string,
  worker: keyof typeof WORKERS,
  createdAt: string,
  metrics: Metric[],
  decisions: readonly ("approved" | "rejected" | "changes_requested")[] = [],
): JournalWindowEntryRow {
  return {
    id,
    worker_id: `worker-${worker}`,
    created_at: createdAt,
    engagement_context_id: "ctx-1",
    workers: WORKERS[worker],
    journal_entry_confirmations: decisions.map((decision, i) => ({
      confirmation_scope: { decision },
      created_at: `2026-09-1${i}T12:00:00.000Z`,
      confirmer_role: "manager",
    })),
    journal_entry_metrics: metrics,
  };
}

const TODAY_ISO = "2026-09-11";

describe("rollUpJournalWindow — hours from the one model, counted once", () => {
  const rows = [
    // Ona: 6 h tiling + 2 h plaster on fragments, AND an entry-level 8 h —
    // the fragments win (never 16), approved → 8 h confirmed.
    row(
      "e1",
      "a",
      "2026-09-10T08:00:00.000Z",
      [
        hoursMetric(1, 6),
        activityMetric(1, "tiler"),
        hoursMetric(2, 2),
        activityMetric(2, "plasterer"),
        quantityMetric(8, "hours"),
      ],
      ["approved"],
    ),
    // Ona: 4 h tiling the next day, awaiting review.
    row("e2", "a", "2026-09-11T08:00:00.000Z", [hoursMetric(1, 4), activityMetric(1, "tiler")]),
    // Jonas: 2 days recorded in DAYS (never hours), rejected → returned.
    row("e3", "b", "2026-09-09T08:00:00.000Z", [quantityMetric(2, "days")], ["rejected"]),
    // Jonas: an entry with no duration at all, changes requested then approved
    // (latest wins) → confirmed, but nothing to time.
    row("e4", "b", "2026-09-11T09:00:00.000Z", [], ["changes_requested", "approved"]),
  ];

  const { workers, totals } = rollUpJournalWindow(rows, { workTime: true, todayIso: TODAY_ISO });
  const ona = workers.find((w) => w.workerId === "worker-a")!;
  const jonas = workers.find((w) => w.workerId === "worker-b")!;

  it("sorts members by name and keys them on the worker id", () => {
    expect(workers.map((w) => w.name)).toEqual(["Jonas", "Ona"]);
  });

  it("an entry's fragments win over its entry-level figure — 8 h, never 16", () => {
    expect(ona.work?.hours).toBe(12);
    expect(ona.work?.confirmedHours).toBe(8);
    expect(ona.work?.daysWorked).toBe(2);
    expect(ona.work?.mainActivity).toEqual({ key: "tiler", hours: 10 });
  });

  it("days-unit durations stay days; an entry without duration is counted, not timed", () => {
    expect(jonas.work?.hours).toBe(0);
    expect(jonas.work?.dayUnits).toBe(2);
    expect(jonas.work?.daysWorked).toBe(0);
    expect(jonas.work?.entriesWithoutDuration).toBe(1);
    expect(jonas.work?.mainActivity).toBeNull();
  });

  it("confirmed = approved only; rejected / changes requested = returned; latest decision wins", () => {
    expect(ona).toMatchObject({ entries: 2, confirmed: 1, awaitingReview: 1, returned: 0 });
    expect(jonas).toMatchObject({ entries: 2, confirmed: 1, awaitingReview: 0, returned: 1 });
  });

  it("review counts add up to the entries, per member and in total", () => {
    for (const w of workers) {
      expect(w.awaitingReview + w.confirmed + w.returned).toBe(w.entries);
    }
    expect(totals.awaitingReview + totals.confirmed + totals.returned).toBe(totals.entries);
    expect(totals).toMatchObject({ entries: 4, confirmed: 2, awaitingReview: 1, returned: 1, workers: 2 });
  });

  it("totals sum the members' hours and never invent a main activity", () => {
    expect(totals.work).toEqual({
      hours: 12,
      confirmedHours: 8,
      dayUnits: 2,
      daysWorked: 2,
      entriesWithoutDuration: 1,
      mainActivity: null,
    });
  });

  it("the latest created_at wins per member whatever order the rows arrive in", () => {
    const reversed = rollUpJournalWindow([...rows].reverse(), { workTime: true, todayIso: TODAY_ISO });
    expect(reversed.workers.find((w) => w.workerId === "worker-a")?.lastEntryAtIso).toBe("2026-09-11T08:00:00.000Z");
    expect(reversed.workers.find((w) => w.workerId === "worker-b")?.lastEntryAtIso).toBe("2026-09-11T09:00:00.000Z");
    expect(reversed.totals).toEqual(totals);
  });

  it("without the option, work time is null — not measured, never zero", () => {
    const counts = rollUpJournalWindow(rows, { workTime: false, todayIso: TODAY_ISO });
    expect(counts.workers.every((w) => w.work === null)).toBe(true);
    expect(counts.totals.work).toBeNull();
    // the counts are the same either way
    expect(counts.totals).toMatchObject({ entries: 4, confirmed: 2, awaitingReview: 1, returned: 1 });
  });
});

describe("deriveWindowWorkTime — the model without skill links", () => {
  it("an 8 h entry is 8 h once, whatever else it carries", () => {
    const wt = deriveWindowWorkTime(
      [row("x", "a", "2026-09-11T08:00:00.000Z", [quantityMetric(8, "hours")], ["approved"])],
      TODAY_ISO,
    );
    expect(wt).toEqual({
      hours: 8,
      confirmedHours: 8,
      dayUnits: 0,
      daysWorked: 1,
      entriesWithoutDuration: 0,
      mainActivity: null,
    });
  });

  it("a rejected entry's hours are worked hours, not confirmed hours", () => {
    const wt = deriveWindowWorkTime(
      [row("x", "a", "2026-09-11T08:00:00.000Z", [quantityMetric(5, "hours")], ["rejected"])],
      TODAY_ISO,
    );
    expect(wt.hours).toBe(5);
    expect(wt.confirmedHours).toBe(0);
  });

  it("no rows → zeros that mean measured-empty (the caller passed rows)", () => {
    expect(deriveWindowWorkTime([], TODAY_ISO).hours).toBe(0);
  });
});
