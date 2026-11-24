/**
 * WORK HOURS EXPORT — a REPRESENTATION of canonical work-time facts, never a
 * second ledger (owner command 2026-09-28 §13: "Export is a representation
 * of canonical work-time facts, not a second ledger").
 *
 * Input is exactly what `deriveEntryWorkTime` (lib/journal/work-time.ts)
 * produced from `journal_entry_metrics` — the one rule the timesheet, the
 * calendar and the journal already share. This module only selects a period
 * and writes CSV; it computes no hour of its own. Pure: no IO, no Date.now().
 *
 * PROVENANCE is kept on every row: the work day and its basis (stated by
 * the person, or the save day standing in), the entry, the rule that
 * produced the line, the metric row's own source, the work context and the
 * project. `days` units stay days — there is no approved workday length, so
 * they are never converted into hours. No prices, pay or invoices.
 */
import type { EntryWorkTime } from "@/lib/journal/work-time";

export const HOURS_EXPORT_PERIODS = ["week", "2weeks", "month"] as const;
export type HoursExportPeriod = (typeof HOURS_EXPORT_PERIODS)[number];

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

export function isHoursExportPeriod(v: unknown): v is HoursExportPeriod {
  return typeof v === "string" && (HOURS_EXPORT_PERIODS as readonly string[]).includes(v);
}

export function isIsoDay(v: unknown): v is string {
  if (typeof v !== "string" || !DAY_RX.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The calendar period that CONTAINS `anchor` (UTC, Monday-first — the same
 * arithmetic as the journal calendar):
 *   week   — Monday..Sunday of the anchor's week
 *   2weeks — the anchor's week and the week before it
 *   month  — the anchor's calendar month
 */
export function hoursExportRange(
  period: HoursExportPeriod,
  anchor: string,
): { readonly start: string; readonly end: string } {
  if (period === "month") {
    const start = `${anchor.slice(0, 7)}-01`;
    const next = new Date(`${start}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { start, end: addDays(next.toISOString().slice(0, 10), -1) };
  }
  const dow = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(anchor, -dow);
  const sunday = addDays(monday, 6);
  return period === "week" ? { start: monday, end: sunday } : { start: addDays(monday, -7), end: sunday };
}

export type HoursExportEntryContext = {
  readonly contextTitle: string | null;
  readonly organizationName: string | null;
  readonly projectTitle: string | null;
};

export type HoursExportRow = {
  readonly day: string;
  readonly dayBasis: EntryWorkTime["dayBasis"];
  readonly hours: number;
  readonly dayUnits: number;
  readonly work: string;
  readonly contextTitle: string;
  readonly organizationName: string;
  readonly projectTitle: string;
  readonly derivedFrom: string;
  readonly metricSource: string;
  readonly entryId: string;
};

export type HoursExportSummary = {
  readonly start: string;
  readonly end: string;
  readonly rows: readonly HoursExportRow[];
  readonly totalHours: number;
  readonly totalDayUnits: number;
  /** Entries in the period that record no duration: real work, not "0 h"
   *  (SEP-7) — counted so the export never implies it covers them. */
  readonly untimedEntries: number;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function summarizeHours(
  entries: readonly EntryWorkTime[],
  range: { readonly start: string; readonly end: string },
  contextByEntry: ReadonlyMap<string, HoursExportEntryContext> = new Map(),
): HoursExportSummary {
  const rows: HoursExportRow[] = [];
  let untimedEntries = 0;
  let totalHours = 0;
  let totalDayUnits = 0;
  for (const entry of entries) {
    if (!DAY_RX.test(entry.day) || entry.day < range.start || entry.day > range.end) continue;
    if (entry.lines.length === 0) {
      untimedEntries += 1;
      continue;
    }
    const ctx = contextByEntry.get(entry.entryId);
    for (const line of entry.lines) {
      totalHours += line.hours;
      totalDayUnits += line.dayUnits;
      rows.push({
        day: entry.day,
        dayBasis: entry.dayBasis,
        hours: line.hours,
        dayUnits: line.dayUnits,
        work: line.title,
        contextTitle: ctx?.contextTitle ?? "",
        organizationName: ctx?.organizationName ?? "",
        projectTitle: ctx?.projectTitle ?? "",
        derivedFrom: line.derivedFrom,
        metricSource: line.metricSource ?? "",
        entryId: entry.entryId,
      });
    }
  }
  rows.sort((a, b) => a.day.localeCompare(b.day) || a.entryId.localeCompare(b.entryId));
  return {
    start: range.start,
    end: range.end,
    rows,
    totalHours: round2(totalHours),
    totalDayUnits: round2(totalDayUnits),
    untimedEntries,
  };
}

function csvCell(v: string | number): string {
  const s = String(v);
  // Formula-injection guard: a cell a spreadsheet would evaluate is quoted
  // as text (the same rule the journal CSV applies).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const HOURS_CSV_HEADER = [
  "work_date",
  "work_date_basis",
  "hours",
  "day_units",
  "work",
  "work_context",
  "organization",
  "project",
  "derived_from",
  "metric_source",
  "journal_entry_id",
] as const;

export function buildHoursCsv(summary: HoursExportSummary): string {
  const lines: string[] = [HOURS_CSV_HEADER.join(",")];
  for (const r of summary.rows) {
    lines.push(
      [
        r.day,
        r.dayBasis,
        r.hours,
        r.dayUnits,
        r.work,
        r.contextTitle,
        r.organizationName,
        r.projectTitle,
        r.derivedFrom,
        r.metricSource,
        r.entryId,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // The period's totals, as their own clearly-labelled rows — a sum of the
  // lines above, nothing more.
  lines.push(["total", `${summary.start}..${summary.end}`, summary.totalHours, summary.totalDayUnits].map(csvCell).join(","));
  if (summary.untimedEntries > 0) {
    lines.push(["entries_without_duration", "", "", "", summary.untimedEntries].map(csvCell).join(","));
  }
  // BOM so spreadsheet apps read Lithuanian letters as UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function hoursCsvFilename(period: HoursExportPeriod, start: string, end: string): string {
  return `work-hours-${period}-${start}_${end}.csv`;
}
