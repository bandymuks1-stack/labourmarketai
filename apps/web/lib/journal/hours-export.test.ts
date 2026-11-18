import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildHoursCsv,
  hoursExportRange,
  summarizeHours,
} from "@/lib/journal/hours-export";
import { deriveEntryWorkTime, type WorkTimeMetricRow } from "@/lib/journal/work-time";

const metric = (row: Partial<WorkTimeMetricRow> & { metric_slug: string }): WorkTimeMetricRow => ({
  value_text: null,
  value_numeric: null,
  unit_slug: null,
  ...row,
});

/**
 * HOURS EXPORT — one week, two weeks, one month of the SAME canonical work
 * time the journal, the calendar and the timesheet already share. A
 * representation, never a second ledger.
 */

const entry = (id: string, day: string, value: number | null, unit = "hours") =>
  deriveEntryWorkTime({
    entryId: id,
    createdAt: `${day}T12:00:00Z`,
    originalText: `darbas ${id}`,
    metrics: [
      metric({ id: `${id}-d`, metric_slug: "work_date", value_text: day, created_at: `${day}T12:00:00Z` }),
      ...(value === null
        ? []
        : [
            metric({
              id: `${id}-q`,
              metric_slug: "quantity",
              value_numeric: value,
              unit_slug: unit,
              source: "worker_input",
              created_at: `${day}T12:00:00Z`,
            }),
          ]),
    ],
  });

describe("periods are calendar periods around the picked day (UTC, Monday-first)", () => {
  it("week = Monday..Sunday", () => {
    expect(hoursExportRange("week", "2026-09-27")).toEqual({ start: "2026-09-21", end: "2026-09-27" });
    expect(hoursExportRange("week", "2026-09-28")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
  });
  it("2weeks = the picked week and the week before", () => {
    expect(hoursExportRange("2weeks", "2026-09-27")).toEqual({ start: "2026-09-14", end: "2026-09-27" });
  });
  it("month = the calendar month", () => {
    expect(hoursExportRange("month", "2026-09-27")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(hoursExportRange("month", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("the export sums exactly the canonical lines — nothing invented", () => {
  const entries = [
    entry("a", "2026-09-27", 9), // the owner's walked entry: 9 h on the 27th
    entry("b", "2026-09-15", 7.5),
    entry("c", "2026-08-31", 8), // outside September
    entry("d", "2026-09-20", null), // untimed: real work, not 0 h
    entry("e", "2026-09-10", 2, "days"), // days never become hours
  ];
  const month = summarizeHours(entries, hoursExportRange("month", "2026-09-27"));

  it("month total is the sum of the month's lines", () => {
    expect(month.totalHours).toBe(16.5);
    expect(month.rows.map((r) => r.day)).toEqual(["2026-09-10", "2026-09-15", "2026-09-27"]);
  });

  it("day units stay days, never converted into hours", () => {
    expect(month.totalDayUnits).toBe(2);
    expect(month.rows.find((r) => r.entryId === "e")?.hours).toBe(0);
  });

  it("an untimed entry is counted as such, not as zero hours", () => {
    expect(month.untimedEntries).toBe(1);
    expect(month.rows.some((r) => r.entryId === "d")).toBe(false);
  });

  it("the week holds only its own day", () => {
    const week = summarizeHours(entries, hoursExportRange("week", "2026-09-27"));
    expect(week.totalHours).toBe(9);
    // the untimed entry of the 20th belongs to the week before
    expect(week.untimedEntries).toBe(0);
  });

  it("CSV carries provenance and a labelled total row", () => {
    const csv = buildHoursCsv(month);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe(
      "work_date,work_date_basis,hours,day_units,work,work_context,organization,project,derived_from,metric_source,journal_entry_id",
    );
    expect(lines).toContain("total,2026-09-01..2026-09-30,16.5,2");
    expect(lines.some((l) => l.startsWith("2026-09-27,stated,9,0,") && l.endsWith(",entry_quantity,worker_input,a"))).toBe(true);
  });

  it("a cell a spreadsheet would evaluate is written as text", () => {
    const csv = buildHoursCsv(
      summarizeHours(
        [
          deriveEntryWorkTime({
            entryId: "x",
            createdAt: "2026-09-27T12:00:00Z",
            originalText: "=HYPERLINK(1)",
            metrics: [
              metric({ id: "x-q", metric_slug: "quantity", value_numeric: 1, unit_slug: "hours", created_at: "2026-09-27T12:00:00Z" }),
            ],
          }),
        ],
        { start: "2026-09-27", end: "2026-09-27" },
      ),
    );
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });
});

describe("the export is a representation, never a ledger", () => {
  const web = join(__dirname, "..", "..");
  const route = readFileSync(join(web, "app/[locale]/dashboard/journal/hours/route.ts"), "utf8");

  it("reads the one shared canonical reader and writes nothing", () => {
    expect(route).toMatch(/readMyEntryWorkTime\(\)/);
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|service_role|createServiceClient/);
  });

  it("a failed hours read is an error, never a file of zeros", () => {
    expect(route).toMatch(/hours_unavailable[\s\S]{0,40}status: 503/);
  });
});
