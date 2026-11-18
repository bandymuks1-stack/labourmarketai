import { countedOnce } from "@/lib/journal/counted-once";
import { deriveIndependentReviewResult } from "@/lib/journal/review-status";
import { deriveEntryWorkTime } from "@/lib/journal/work-time";
import { collectCountableLeaves } from "@/lib/projects/progress-model";
import { teamHourRowsToWindowRows, type TeamHourRow } from "@/lib/projects/project-team-hours-model";

import { addDays, isIsoDay, toIsoDay } from "./forecast-days";
import { MAX_HORIZON_DAYS, TRAILING_WINDOW_DAYS, type ForecastFacts, type ForecastSource } from "./forecast-engine";

/**
 * FACT ROWS → FORECAST FACTS — the pure half of the forecast read.
 *
 * The scheduler has no person's session, so the rows arrive through ONE
 * service-only database door (`forecast_project_facts_v1`, forecast
 * migration). That door only FETCHES rows — opaque keys, statuses, dates,
 * metric rows, review rows; never entry text, never names. Every rule that
 * turns rows into numbers lives HERE, in the app, and is the SAME rule every
 * surface already uses:
 *
 *   hours            THE work-time rule (`deriveEntryWorkTime`), each
 *                    correction chain counted once (`countedOnce`), confirmed
 *                    = an independent APPROVED review
 *                    (`deriveIndependentReviewResult`) — through the same
 *                    opaque-row mapping the brigade hours door uses
 *                    (`teamHourRowsToWindowRows`);
 *   scope            THE leaf-task counting rule (`collectCountableLeaves`);
 *   two ledgers      the journal and the organization's hour records are
 *                    BRIDGED, never added: the journal is the basis when it
 *                    holds hours, else the organization's ledger; the other
 *                    total rides beside, labelled.
 *
 * A truncated or failed part is UNKNOWN (null), never short and never zero.
 */

export interface ForecastFactRows {
  readonly project: { readonly status: string; readonly start_date: string | null; readonly end_date: string | null };
  readonly tasks: {
    readonly rows: readonly { readonly key: string; readonly parent_key: string | null; readonly status: string; readonly resolved_at: string | null }[];
    readonly truncated: boolean;
  } | null;
  readonly stages: {
    readonly rows: readonly { readonly status: string; readonly planned_end: string | null; readonly actual_end: string | null }[];
    readonly truncated: boolean;
  } | null;
  readonly journal: { readonly rows: readonly TeamHourRow[]; readonly truncated: boolean } | null;
  readonly allocations: {
    readonly rows: readonly {
      readonly worker_key: string | null;
      readonly work_date: string | null;
      readonly hours: number | null;
      readonly status: string | null;
    }[];
    readonly truncated: boolean;
  } | null;
  readonly team: {
    readonly active_people: number;
    readonly absences: readonly {
      readonly person_key: string;
      readonly start_date: string;
      readonly end_date: string;
      readonly half_day: boolean | null;
    }[];
  } | null;
  readonly defects: {
    readonly rows: readonly { readonly severity: string; readonly status: string; readonly due_date: string | null }[];
    readonly failed_corrections: number;
  } | null;
  readonly readiness: { readonly workers_with_missing: number } | null;
  readonly economics: {
    readonly budget_total_cents: number | null;
    readonly budget_lines_cents: number | null;
    readonly budget_lines: number;
    readonly actual_cost_cents: number | null;
  } | null;
  /** Free people on the roster — not read by the v1 door (UNKNOWN). */
  readonly free_internal_people?: number | null;
}

/** Defect statuses that are still open work (closed: accepted, rejected, cancelled). */
export const OPEN_DEFECT_STATUSES: ReadonlySet<string> = new Set([
  "reported",
  "acknowledged",
  "assigned",
  "in_correction",
  "ready_for_review",
  "reopened",
]);

const COUNTABLE_STAGE = new Set(["planned", "in_progress", "blocked", "done"]);
const SEVERITIES = ["low", "medium", "high", "critical"] as const;
/** An absence is expanded over at most this many days ahead of `today`. */
const ABSENCE_LOOKAHEAD_DAYS = Math.min(MAX_HORIZON_DAYS, 366);

const round2 = (n: number): number => Math.round(n * 100) / 100;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

function source(key: string, part: { rows: readonly unknown[]; truncated: boolean } | null): ForecastSource {
  if (part === null) return { key, rows: null, state: "unavailable" };
  return { key, rows: part.rows.length, state: part.truncated ? "truncated" : "read" };
}

function tasksFacts(rows: ForecastFactRows["tasks"]): ForecastFacts["tasks"] {
  if (rows === null || rows.truncated) return null;
  const { leaves } = collectCountableLeaves(
    rows.rows.map((r) => ({ id: r.key, parentTaskId: r.parent_key, status: r.status })),
  );
  const done = leaves.filter((t) => t.status === "done");
  const resolvedByKey = new Map(rows.rows.map((r) => [r.key, r.resolved_at]));
  return {
    total: leaves.length,
    done: done.length,
    blocked: leaves.filter((t) => t.status === "blocked").length,
    completedOn: done
      .map((t) => toIsoDay(resolvedByKey.get(t.id ?? "") ?? null))
      .filter((d): d is string => d !== null)
      .sort(),
  };
}

function stagesFacts(rows: ForecastFactRows["stages"], today: string): ForecastFacts["stages"] {
  if (rows === null || rows.truncated) return null;
  const counted = rows.rows.filter((s) => COUNTABLE_STAGE.has(s.status));
  const done = counted.filter((s) => s.status === "done");
  return {
    total: counted.length,
    done: done.length,
    blocked: counted.filter((s) => s.status === "blocked").length,
    overdue: counted.filter((s) => {
      const end = toIsoDay(s.planned_end);
      return s.status !== "done" && end !== null && end < today;
    }).length,
    completedOn: done.map((s) => toIsoDay(s.actual_end)).filter((d): d is string => d !== null).sort(),
  };
}

function journalHours(rows: ForecastFactRows["journal"], today: string) {
  if (rows === null) return null;
  const windowRows = countedOnce(teamHourRowsToWindowRows(rows.rows));
  const byDay = new Map<string, number>();
  const contributors = new Set<string>();
  const windowStart = addDays(today, -(TRAILING_WINDOW_DAYS - 1));
  let total = 0;
  let confirmed = 0;
  for (const r of windowRows) {
    const wt = deriveEntryWorkTime({ entryId: r.id, createdAt: r.created_at, metrics: r.journal_entry_metrics ?? [] });
    let entryHours = 0;
    for (const line of wt.lines) {
      if (line.hours <= 0 || !isIsoDay(line.day) || line.day > today) continue;
      byDay.set(line.day, (byDay.get(line.day) ?? 0) + line.hours);
      entryHours += line.hours;
      if (line.day >= windowStart && r.engagement_context_id) contributors.add(r.engagement_context_id);
    }
    total += entryHours;
    if (deriveIndependentReviewResult(r.journal_entry_confirmations, r.subject?.profile_id ?? null) === "approved") {
      confirmed += entryHours;
    }
  }
  return {
    byDay: [...byDay.entries()].map(([day, hours]) => ({ day, hours: round2(hours) })).sort((a, b) => a.day.localeCompare(b.day)),
    total: round2(total),
    confirmed: round2(confirmed),
    contributors: contributors.size,
    truncated: rows.truncated,
  };
}

function ledgerHours(rows: ForecastFactRows["allocations"], today: string) {
  if (rows === null) return null;
  const byDay = new Map<string, number>();
  const contributors = new Set<string>();
  const windowStart = addDays(today, -(TRAILING_WINDOW_DAYS - 1));
  let total = 0;
  for (const r of rows.rows) {
    if (r.status === "rejected") continue;
    const day = toIsoDay(r.work_date);
    const h = num(r.hours);
    if (!day || day > today || h <= 0) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + h);
    total += h;
    if (day >= windowStart && r.worker_key) contributors.add(r.worker_key);
  }
  return {
    byDay: [...byDay.entries()].map(([day, hours]) => ({ day, hours: round2(hours) })).sort((a, b) => a.day.localeCompare(b.day)),
    total: round2(total),
    contributors: contributors.size,
    truncated: rows.truncated,
  };
}

function absencesAhead(team: NonNullable<ForecastFactRows["team"]>, today: string) {
  // person-key → day → share absent (a half day is half a person).
  const perDay = new Map<string, Map<string, number>>();
  const last = addDays(today, ABSENCE_LOOKAHEAD_DAYS);
  for (const a of team.absences) {
    const start = toIsoDay(a.start_date);
    const end = toIsoDay(a.end_date);
    if (!start || !end || end < start) continue;
    const share = a.half_day ? 0.5 : 1;
    let day = start > today ? start : addDays(today, 1);
    const stop = end < last ? end : last;
    while (day <= stop) {
      const people = perDay.get(day) ?? new Map<string, number>();
      people.set(a.person_key, Math.max(people.get(a.person_key) ?? 0, share));
      perDay.set(day, people);
      day = addDays(day, 1);
    }
  }
  return [...perDay.entries()]
    .map(([day, people]) => ({ day, peopleAbsent: [...people.values()].reduce((s, x) => s + x, 0) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function buildForecastFacts(projectId: string, today: string, rows: ForecastFactRows): ForecastFacts {
  const journal = journalHours(rows.journal, today);
  const ledger = ledgerHours(rows.allocations, today);

  let hours: ForecastFacts["hours"];
  if (journal === null && ledger === null) hours = null;
  else if (journal && journal.total > 0) {
    hours = {
      basis: "journal",
      byDay: journal.byDay,
      totalHours: journal.total,
      confirmedHours: journal.confirmed,
      otherLedgerHours: ledger ? ledger.total : null,
      complete: !journal.truncated,
      contributorsInWindow: journal.contributors,
    };
  } else if (ledger && ledger.total > 0) {
    hours = {
      basis: "organization_ledger",
      byDay: ledger.byDay,
      totalHours: ledger.total,
      confirmedHours: null,
      otherLedgerHours: journal ? journal.total : null,
      complete: !ledger.truncated,
      contributorsInWindow: ledger.contributors,
    };
  } else if (journal === null || ledger === null) {
    // One ledger read failed and the other holds nothing: UNKNOWN, not zero.
    hours = null;
  } else {
    hours = {
      basis: "none",
      byDay: [],
      totalHours: 0,
      confirmedHours: null,
      otherLedgerHours: null,
      complete: !journal.truncated && !ledger.truncated,
      contributorsInWindow: 0,
    };
  }

  const defects = rows.defects;
  const open = { low: 0, medium: 0, high: 0, critical: 0 };
  let overdueOpen = 0;
  for (const d of defects?.rows ?? []) {
    if (!OPEN_DEFECT_STATUSES.has(d.status)) continue;
    const sev = (SEVERITIES as readonly string[]).includes(d.severity) ? (d.severity as (typeof SEVERITIES)[number]) : "medium";
    open[sev]++;
    const due = toIsoDay(d.due_date);
    if (due !== null && due < today) overdueOpen++;
  }

  const e = rows.economics;
  const budgetCents =
    e === null || e.budget_lines === 0 ? null : e.budget_total_cents !== null ? num(e.budget_total_cents) : num(e.budget_lines_cents);

  return {
    projectId,
    today,
    project: {
      status: rows.project.status,
      startDate: toIsoDay(rows.project.start_date),
      plannedEnd: toIsoDay(rows.project.end_date),
    },
    tasks: tasksFacts(rows.tasks),
    stages: stagesFacts(rows.stages, today),
    hours,
    team: rows.team
      ? {
          activePeople: Math.max(0, Math.floor(num(rows.team.active_people))),
          absences: absencesAhead(rows.team, today),
          freeInternalPeople: rows.free_internal_people ?? null,
        }
      : null,
    quality: defects ? { open, overdueOpen, failedCorrections: Math.max(0, num(defects.failed_corrections)) } : null,
    readiness: rows.readiness ? { workersWithMissingItems: Math.max(0, num(rows.readiness.workers_with_missing)) } : null,
    economics: e ? { budgetCents, actualCostCents: e.actual_cost_cents === null ? null : num(e.actual_cost_cents) } : null,
    sources: [
      source("work_tasks", rows.tasks),
      source("project_stages", rows.stages),
      source("journal_entries", rows.journal),
      source("work_hour_allocations", rows.allocations),
      rows.team ? { key: "team", rows: rows.team.absences.length, state: "read" } : { key: "team", rows: null, state: "unavailable" },
      rows.defects ? { key: "defects", rows: rows.defects.rows.length, state: "read" } : { key: "defects", rows: null, state: "unavailable" },
      rows.economics ? { key: "project_budgets+finance_records", rows: rows.economics.budget_lines, state: "read" } : { key: "project_budgets+finance_records", rows: null, state: "unavailable" },
    ],
  };
}
