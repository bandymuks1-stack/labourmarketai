/**
 * Pure timesheet model (functional completion train V2, audit WORK section —
 * the MISSING "timesheet" row) — shared by the server read service, the
 * server actions, the CSV export route, the guard test and the planning-page
 * timesheets section. No server-only imports, no IO.
 *
 * The model codes against the `public.timesheets` contract the SEPARATE,
 * human-gated migration 20260817170000_timesheets_v1 proposes. That migration
 * IS APPLIED in production (and its derivation was replaced by
 * 20260818150000_journal_canonical_work_time_v1); the read/action layers keep
 * their honest degradation path for stacks where it is absent — nothing here
 * fakes an hour.
 *
 * DERIVED, NEVER A SECOND HOURS STORE: a timesheet's lines are a frozen COPY
 * of journal-derived rows — the CANONICAL source is `journal_entry_metrics`
 * (`fragment_time`, or entry-level `quantity` in a time unit), resolved by
 * `lib/journal/work-time` and by `timesheet_compute_lines_v1`.
 *
 * It is NOT `journal_entry_work_items`. That table has zero lifetime inserts
 * and no writer anywhere; an earlier revision of this comment named it, and a
 * later audit re-diagnosed the whole feature from this sentence rather than
 * from the deployed function. The deployed function reports its own source as
 * `journal_entry_metrics` — trust that, not this comment. The Work Journal
 * stays the only live hours truth; correcting hours happens in the journal,
 * then refresh + resubmit. Approval runs on the canonical Workflow & Approval
 * Engine (context_entity_type = 'timesheet') — nothing re-implemented here.
 */

export const TIMESHEET_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "reopened",
] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

/** Statuses the worker can still act on (refresh / submit). */
export const EDITABLE_TIMESHEET_STATUSES = ["draft", "reopened"] as const;

/** Statuses an org manager can reopen from (history note required). */
export const REOPENABLE_TIMESHEET_STATUSES = ["approved", "rejected"] as const;

export const TIMESHEET_EVENT_ACTIONS = [
  "created",
  "refreshed",
  "submitted",
  "approved",
  "rejected",
  "reopened",
] as const;
export type TimesheetEventAction = (typeof TIMESHEET_EVENT_ACTIONS)[number];

/** Period bounds — mirrored by the gated RPC + table CHECK (≤31 inclusive
 *  days; end never before start). Single contract. */
export const TIMESHEET_MAX_PERIOD_DAYS = 31;
export const TIMESHEET_REOPEN_NOTE_MIN = 3;
export const TIMESHEET_REOPEN_NOTE_MAX = 500;

/** Bounded reads everywhere — timesheet surfaces never stream unbounded rows. */
export const TIMESHEET_READ_LIMIT = 50;

/**
 * Postgres/PostgREST error codes that mean "the timesheets migration is not
 * applied yet": missing relation, missing column, missing function, and the
 * PostgREST schema-cache miss for an RPC. The read layer and the actions map
 * ALL of these to the honest "not available yet" state — never a crash.
 */
export const TIMESHEET_MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isTimesheetMigrationMissingCode(
  code: string | undefined,
): boolean {
  return (
    TIMESHEET_MIGRATION_MISSING_ERROR_CODES as readonly string[]
  ).includes(code ?? "");
}

export function isValidTimesheetStatus(v: string): v is TimesheetStatus {
  return (TIMESHEET_STATUSES as readonly string[]).includes(v);
}

export function isEditableTimesheetStatus(status: TimesheetStatus): boolean {
  return (EDITABLE_TIMESHEET_STATUSES as readonly string[]).includes(status);
}

export function isReopenableTimesheetStatus(status: TimesheetStatus): boolean {
  return (REOPENABLE_TIMESHEET_STATUSES as readonly string[]).includes(status);
}

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

/** Strict "YYYY-MM-DD" shape check (calendar validity is the DB's job). */
export function isIsoDay(v: string): boolean {
  return DAY_RX.test(v);
}

/**
 * Inclusive day count of a period, or null when the shape/order is invalid
 * or the span exceeds the 31-day bound — the SAME rule the RPC and the table
 * CHECK enforce, so the form can refuse before a round trip.
 */
export function timesheetPeriodDays(
  periodStart: string,
  periodEnd: string,
): number | null {
  if (!isIsoDay(periodStart) || !isIsoDay(periodEnd)) return null;
  const a = Date.parse(`${periodStart}T00:00:00Z`);
  const b = Date.parse(`${periodEnd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const days = Math.round((b - a) / 86_400_000) + 1;
  return days <= TIMESHEET_MAX_PERIOD_DAYS ? days : null;
}

/** First/last day of the month containing `todayIso` — the form's default
 *  period (a natural month always satisfies the 31-day bound). */
export function currentMonthPeriod(todayIso: string): {
  readonly start: string;
  readonly end: string;
} {
  const month = todayIso.slice(0, 7);
  const first = `${month}-01`;
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { start: first, end: d.toISOString().slice(0, 10) };
}

export type TimesheetRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly workerId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: TimesheetStatus;
  readonly submittedAt: string | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
  readonly snapshot: TimesheetSnapshot;
};

/** One derived line — a frozen COPY of a canonical work-time value derived
 *  from the entry's own `journal_entry_metrics` (owner ruling 2026-08-18). */
export type TimesheetLine = {
  /** Deterministic identity of the derived line: `<entryId>#f<index>` for a
   *  per-activity line, `<entryId>#entry` for an entry-level one. */
  readonly lineKey: string;
  readonly journalEntryId: string;
  /** 1-based activity index within the entry; null for an entry-level line. */
  readonly fragmentIndex: number | null;
  readonly day: string;
  readonly title: string;
  /** The worker's own phrase this duration was recorded against. */
  readonly evidencePhrase: string | null;
  readonly workTypeKey: string | null;
  /** The recorded numeric value in its RECORDED unit — never converted by
   *  invention. */
  readonly value: number;
  readonly unit: "hours" | "minutes" | "days";
  /** Which canonical rule produced this line. `work_hour_allocation` lines
   *  come from the canonical `work_hour_allocations` row-level hour fact
   *  (M3, 20260831170000) rather than from journal metrics. */
  readonly derivedFrom: "fragment_time" | "entry_quantity" | "work_hour_allocation";
  /** `journal_entry_metrics.source` of the row behind this line. */
  readonly metricSource: string | null;
  readonly projectId: string | null;
  readonly projectTitle: string | null;
  /**
   * Chain step A — the task these hours evidence, attributed ONLY when the
   * journal entry has EXACTLY ONE live task link. Two or more links leave
   * this null: the hours still count in full, exactly once, they are simply
   * not claimed for any one task. Never a guess.
   */
  readonly taskId: string | null;
  readonly taskTitle: string | null;
  /**
   * How many live task links the entry carries. Emitted so the ambiguity is
   * VISIBLE rather than silent — a reader sees "3 linked, so not attributed"
   * instead of wondering why taskId is empty. 0 on snapshots frozen before
   * attribution existed.
   */
  readonly taskLinkCount: number;
};

/** An entry-level duration the per-activity rule superseded. Reported so the
 *  ambiguity is visible on the document, never silently dropped. */
export type TimesheetConflict = {
  readonly journalEntryId: string;
  readonly reason: string;
  readonly value: number;
  readonly unit: string;
};

export type TimesheetTotals = {
  /** hours + minutes/60 lines, in hours. */
  readonly totalHours: number;
  /** 'days'-unit lines, totalled separately — NEVER multiplied into hours. */
  readonly totalDayUnits: number;
  readonly lineCount: number;
};

export type TimesheetSnapshot = {
  readonly computedAt: string | null;
  /** Which store the lines were derived from. `journal_entry_metrics` is the
   *  canonical answer; anything else means an old snapshot. */
  readonly source: string | null;
  readonly lines: readonly TimesheetLine[];
  /** Entries whose entry-level duration was NOT counted because the worker
   *  also recorded per-activity times. */
  readonly conflicts: readonly TimesheetConflict[];
  readonly totals: TimesheetTotals;
};

export const EMPTY_TIMESHEET_TOTALS: TimesheetTotals = {
  totalHours: 0,
  totalDayUnits: 0,
  lineCount: 0,
};

const LINE_UNITS = new Set(["hours", "minutes", "days"]);

/**
 * Parse the jsonb snapshot defensively — a malformed line is DROPPED, never
 * guessed at, and totals are re-derived from the surviving lines so the CSV
 * can never disagree with its own rows.
 */
export function parseTimesheetSnapshot(raw: unknown): TimesheetSnapshot {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const rawLines = Array.isArray(obj.lines) ? obj.lines : [];
  const lines: TimesheetLine[] = [];
  for (const entry of rawLines) {
    if (!entry || typeof entry !== "object") continue;
    const l = entry as Record<string, unknown>;
    const day = typeof l.day === "string" ? l.day : "";
    const unit = typeof l.unit === "string" ? l.unit : "";
    const value = typeof l.value === "number" ? l.value : Number.NaN;
    if (!DAY_RX.test(day) || !LINE_UNITS.has(unit) || !Number.isFinite(value)) {
      continue;
    }
    lines.push({
      lineKey: String(l.lineKey ?? ""),
      journalEntryId: String(l.journalEntryId ?? ""),
      fragmentIndex:
        typeof l.fragmentIndex === "number" && Number.isInteger(l.fragmentIndex)
          ? l.fragmentIndex
          : null,
      day,
      title: typeof l.title === "string" ? l.title : "",
      evidencePhrase:
        typeof l.evidencePhrase === "string" ? l.evidencePhrase : null,
      workTypeKey: typeof l.workTypeKey === "string" ? l.workTypeKey : null,
      value,
      unit: unit as TimesheetLine["unit"],
      derivedFrom:
        l.derivedFrom === "entry_quantity" ||
        l.derivedFrom === "work_hour_allocation"
          ? l.derivedFrom
          : "fragment_time",
      metricSource:
        typeof l.metricSource === "string" ? l.metricSource : null,
      projectId: typeof l.projectId === "string" ? l.projectId : null,
      projectTitle:
        typeof l.projectTitle === "string" ? l.projectTitle : null,
      // Absent on every snapshot frozen before chain step A. A missing field
      // reads as "not attributed", never as an error — a historic timesheet
      // must keep parsing exactly as it did.
      taskId: typeof l.taskId === "string" ? l.taskId : null,
      taskTitle: typeof l.taskTitle === "string" ? l.taskTitle : null,
      taskLinkCount:
        typeof l.taskLinkCount === "number" && Number.isInteger(l.taskLinkCount)
          ? l.taskLinkCount
          : 0,
    });
  }
  const rawConflicts = Array.isArray(obj.conflicts) ? obj.conflicts : [];
  const conflicts: TimesheetConflict[] = [];
  for (const entry of rawConflicts) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Record<string, unknown>;
    const value = typeof c.value === "number" ? c.value : Number.NaN;
    if (!Number.isFinite(value)) continue;
    conflicts.push({
      journalEntryId: String(c.journalEntryId ?? ""),
      reason: typeof c.reason === "string" ? c.reason : "",
      value,
      unit: typeof c.unit === "string" ? c.unit : "",
    });
  }
  return {
    computedAt: typeof obj.computedAt === "string" ? obj.computedAt : null,
    source: typeof obj.source === "string" ? obj.source : null,
    lines,
    conflicts,
    totals: deriveTimesheetTotals(lines),
  };
}

/** Re-derive totals from lines (pure) — the display/CSV truth. */
export function deriveTimesheetTotals(
  lines: readonly TimesheetLine[],
): TimesheetTotals {
  let totalHours = 0;
  let totalDayUnits = 0;
  for (const line of lines) {
    if (line.unit === "hours") totalHours += line.value;
    else if (line.unit === "minutes") totalHours += line.value / 60;
    else totalDayUnits += line.value;
  }
  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalDayUnits: Math.round(totalDayUnits * 100) / 100,
    lineCount: lines.length,
  };
}

/** Hours a line contributes (0 for 'days' lines — no invented conversion). */
export function lineHours(line: Pick<TimesheetLine, "value" | "unit">): number {
  if (line.unit === "hours") return line.value;
  if (line.unit === "minutes") return Math.round((line.value / 60) * 100) / 100;
  return 0;
}

/* ------------------------------------------------------------------ */
/* CSV export — REAL hours (closes the audit's "exports carry no       */
/* hours"). RFC-4180 quoting, UTF-8, deterministic column order.       */
/* ------------------------------------------------------------------ */

export const TIMESHEET_CSV_COLUMNS = [
  "period_start",
  "period_end",
  "status",
  "day",
  "title",
  "work_type",
  "project",
  "task",
  "value",
  "unit",
  "hours",
  "derived_from",
  "evidence",
] as const;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Build the timesheet CSV: one row per line (real hours per line), then a
 * TOTAL row per unit family. An empty timesheet exports its header + zero
 * totals honestly — never invented rows.
 */
export function buildTimesheetCsv(sheet: TimesheetRow): string {
  const rows: string[] = [csvRow([...TIMESHEET_CSV_COLUMNS])];
  for (const line of sheet.snapshot.lines) {
    rows.push(
      csvRow([
        sheet.periodStart,
        sheet.periodEnd,
        sheet.status,
        line.day,
        line.title,
        line.workTypeKey ?? "",
        line.projectTitle ?? "",
        // Empty when the entry's task link was ambiguous — an unattributed
        // hour is exported as unattributed, never as a guess.
        line.taskTitle ?? "",
        String(line.value),
        line.unit,
        String(lineHours(line)),
        line.derivedFrom,
        line.evidencePhrase ?? "",
      ]),
    );
  }
  const totals = sheet.snapshot.totals;
  rows.push(
    csvRow([
      sheet.periodStart,
      sheet.periodEnd,
      sheet.status,
      "",
      "TOTAL",
      "",
      "",
      "",
      "hours",
      String(totals.totalHours),
      "",
      "",
    ]),
  );
  if (totals.totalDayUnits > 0) {
    rows.push(
      csvRow([
        sheet.periodStart,
        sheet.periodEnd,
        sheet.status,
        "",
        "TOTAL",
        "",
        "",
        "",
        "days",
        String(totals.totalDayUnits),
        "",
        "",
      ]),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}

export function timesheetCsvFilename(sheet: {
  readonly periodStart: string;
  readonly periodEnd: string;
}): string {
  return `timesheet-${sheet.periodStart}-${sheet.periodEnd}.csv`;
}

/* ------------------------------------------------------------------ */
/* Notices — the honest `?ts=` outcomes the actions navigate back with */
/* ------------------------------------------------------------------ */

export const TIMESHEET_NOTICES = [
  "created",
  "refreshed",
  "submitted",
  "reopened",
  "approved",
  "rejected",
  "synced_pending",
  "no_instance",
  "no_template",
  "template_created",
  "overlap",
  "invalid_period",
  "no_worker",
  "not_editable",
  "not_decided",
  "not_submitted",
  "already_submitted",
  "no_approvers",
  "not_published",
  "invalid",
  "needs_migration",
  "not_authorized",
  "not_found",
  "limit_reached",
  "error",
] as const;
export type TimesheetNotice = (typeof TIMESHEET_NOTICES)[number];

export function isTimesheetNotice(v: string): v is TimesheetNotice {
  return (TIMESHEET_NOTICES as readonly string[]).includes(v);
}

/** Map an RPC outcome string onto the notice vocabulary (1:1 where the words
 *  match; everything unknown is an honest "error"). */
export function timesheetNoticeForOutcome(outcome: string): TimesheetNotice {
  switch (outcome) {
    case "created":
    case "refreshed":
    case "submitted":
    case "reopened":
    case "approved":
    case "rejected":
    case "no_instance":
    case "overlap":
    case "invalid_period":
    case "no_worker":
    case "not_editable":
    case "not_decided":
    case "not_submitted":
    case "already_submitted":
    case "invalid":
    case "not_found":
    case "limit_reached":
      return outcome;
    case "still_pending":
      return "synced_pending";
    default:
      return "error";
  }
}
