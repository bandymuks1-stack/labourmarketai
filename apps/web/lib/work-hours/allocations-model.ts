/**
 * WORK-HOUR ALLOCATIONS — the pure model.
 *
 * Validation and aggregation live here, with no Supabase client and no server
 * imports, so the rules a site operator depends on can be tested exhaustively
 * without a database. The read/write modules beside this one hold the I/O.
 *
 * The canonical direction, which nothing here may reverse:
 *
 *     ALLOCATION ROWS → aggregation → timesheet snapshot / approval → export
 *
 * An allocation is a FACT: this worker, this date, this object, these hours.
 * A timesheet is a DECISION about a period of facts. `lib/timesheets` owns the
 * decision; this owns the facts.
 */

/** Table + column names the DB migration created — one place, so a rename is
 *  one edit and a guard can assert the module and the migration agree. */
export const ALLOCATIONS_TABLE = "work_hour_allocations";

/**
 * Lifecycle of one allocation. `recorded` is the resting state: entered and
 * true, not yet part of a submitted period. The remaining three mirror the
 * timesheet decision that will govern it — deliberately the same words, so an
 * operator never has to learn two vocabularies for one workflow.
 */
export const ALLOCATION_STATUSES = [
  "recorded",
  "submitted",
  "approved",
  "rejected",
] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

/**
 * Where the row came from. Open by convention, exactly as
 * `worker_skills.source` is: a closed enum here would be the ceiling doctrine
 * §10 forbids, and `import` / `ai` must be addable as DATA, not as a
 * migration.
 */
export const ALLOCATION_SOURCE_MANUAL = "manual";

/** Historical work documents brought in through the reviewed XLSX import —
 *  the first non-manual source, added exactly as the comment above promised:
 *  as data, not as a migration. */
export const ALLOCATION_SOURCE_IMPORT = "import";

/** One allocation may not exceed a real day. Multiple allocations still sum
 *  freely across objects — this only catches 80 typed for 8. */
export const ALLOCATION_HOURS_MIN = 0.25;
export const ALLOCATION_HOURS_MAX = 24;

/** Quarter-hour granularity. Site work is not recorded to the second, and
 *  free-form decimals make two operators disagree about the same shift. */
export const ALLOCATION_HOURS_STEP = 0.25;

export const ALLOCATION_NOTE_MAX = 500;

/** Read ceiling, mirroring WORK_OBJECT_READ_LIMIT's intent: a month of a
 *  crew's allocations must fit, an unbounded scan must not. */
export const ALLOCATION_READ_LIMIT = 2000;

/**
 * The migration may not be applied yet on a given database. These are the
 * PostgREST/Postgres codes that mean exactly that, so every surface can say
 * "not migrated" honestly instead of rendering an empty grid that looks like
 * "nobody worked".
 */
export const ALLOCATION_MIGRATION_MISSING_CODES = [
  "42P01", // undefined_table
  "PGRST205", // schema cache: table not found
] as const;

export function isAllocationMigrationMissingCode(
  code: string | undefined,
): boolean {
  return (
    code !== undefined &&
    (ALLOCATION_MIGRATION_MISSING_CODES as readonly string[]).includes(code)
  );
}

export type WorkHourAllocation = {
  readonly id: string;
  readonly organizationId: string;
  /** Whose work this is. */
  readonly workerId: string;
  /** Who RECORDED it. Never conflated with workerId — an operator entering a
   *  colleague's hours must stay visible as the enterer. */
  readonly enteredBy: string;
  /** `YYYY-MM-DD`, the day worked — not the day typed. */
  readonly workDate: string;
  readonly workObjectId: string;
  readonly hours: number;
  readonly note: string | null;
  readonly source: string;
  readonly status: AllocationStatus;
  /** Optional, explicit Work Journal link. Null is the normal case. */
  readonly journalEntryId: string | null;
  readonly correctionOf: string | null;
  readonly supersededBy: string | null;
  readonly createdAt: string;
};

export function isValidAllocationStatus(v: string): v is AllocationStatus {
  return (ALLOCATION_STATUSES as readonly string[]).includes(v);
}

/** `YYYY-MM-DD` and a real calendar date — `2026-02-31` is neither. */
export function isValidWorkDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export type HoursProblem =
  | "not-a-number"
  | "too-small"
  | "too-large"
  | "not-a-quarter";

/**
 * Parse operator input into hours, or say precisely what is wrong.
 *
 * Accepts a comma decimal separator: the pilot is Lithuanian and a phone
 * keypad there produces `7,5`. Rejecting that as "not a number" would be a
 * defect dressed as validation.
 */
export function parseHours(raw: string): { ok: true; hours: number } | { ok: false; problem: HoursProblem } {
  const normalised = raw.trim().replace(",", ".");
  if (normalised === "" || !/^\d{1,2}(\.\d{1,2})?$/.test(normalised)) {
    return { ok: false, problem: "not-a-number" };
  }
  const hours = Number(normalised);
  if (!Number.isFinite(hours)) return { ok: false, problem: "not-a-number" };
  if (hours < ALLOCATION_HOURS_MIN) return { ok: false, problem: "too-small" };
  if (hours > ALLOCATION_HOURS_MAX) return { ok: false, problem: "too-large" };
  // Float-safe quarter check: 7.35 must fail, 7.25 must pass.
  if (Math.round(hours * 100) % 25 !== 0) {
    return { ok: false, problem: "not-a-quarter" };
  }
  return { ok: true, hours };
}

/** Sum that does not accumulate binary-float error across a month. */
export function sumHours(values: readonly number[]): number {
  const cents = values.reduce((acc, v) => acc + Math.round(v * 100), 0);
  return cents / 100;
}

export type WorkerDayTotal = {
  readonly workerId: string;
  readonly workDate: string;
  readonly hours: number;
};

/**
 * Per-worker daily totals — the number an operator checks before moving on
 * ("Vitalii has 10 h today, that's right").
 *
 * Deliberately SUMS rather than replaces: a worker with 8 h on object 01 and
 * 2 h on object 05 has a 10 h day, and that must be visible without implying
 * the two rows should have been one.
 */
export function workerDayTotals(
  rows: readonly Pick<WorkHourAllocation, "workerId" | "workDate" | "hours">[],
): readonly WorkerDayTotal[] {
  const acc = new Map<string, WorkerDayTotal>();
  for (const r of rows) {
    const key = `${r.workerId}|${r.workDate}`;
    const prev = acc.get(key);
    acc.set(key, {
      workerId: r.workerId,
      workDate: r.workDate,
      hours: sumHours([prev?.hours ?? 0, r.hours]),
    });
  }
  return [...acc.values()];
}

export type MonthlyGrid = {
  /** Object ids in a stable column order. */
  readonly objectIds: readonly string[];
  readonly rows: readonly {
    readonly workerId: string;
    /** Hours per object id; absent means no hours, never zero-as-a-claim. */
    readonly byObject: Readonly<Record<string, number>>;
    readonly total: number;
  }[];
  /** Column totals, by object id. */
  readonly objectTotals: Readonly<Record<string, number>>;
  readonly grandTotal: number;
};

/**
 * The manager's month: worker × object, with both margins.
 *
 * Column order is taken from `objectIds` when given, so the grid keeps a
 * stable shape even for objects nobody worked this month — an empty column is
 * information ("object 12 had no hours"), whereas a column that silently
 * disappears looks like the object was deleted.
 */
export function monthlyGrid(
  rows: readonly Pick<WorkHourAllocation, "workerId" | "workObjectId" | "hours">[],
  objectIds?: readonly string[],
): MonthlyGrid {
  const columns = objectIds
    ? [...objectIds]
    : [...new Set(rows.map((r) => r.workObjectId))].sort();
  const seen = new Set(columns);
  for (const r of rows) {
    // An allocation on an object outside the requested column set must still
    // be counted — dropping it would under-report a worker's real total.
    if (!seen.has(r.workObjectId)) {
      seen.add(r.workObjectId);
      columns.push(r.workObjectId);
    }
  }

  const byWorker = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const w = byWorker.get(r.workerId) ?? {};
    w[r.workObjectId] = sumHours([w[r.workObjectId] ?? 0, r.hours]);
    byWorker.set(r.workerId, w);
  }

  const objectTotals: Record<string, number> = {};
  let grandTotal = 0;
  const gridRows = [...byWorker.entries()]
    .map(([workerId, byObject]) => {
      const total = sumHours(Object.values(byObject));
      for (const [objectId, hours] of Object.entries(byObject)) {
        objectTotals[objectId] = sumHours([objectTotals[objectId] ?? 0, hours]);
      }
      grandTotal = sumHours([grandTotal, total]);
      return { workerId, byObject, total };
    })
    .sort((a, b) => a.workerId.localeCompare(b.workerId));

  return { objectIds: columns, rows: gridRows, objectTotals, grandTotal };
}

/**
 * A deterministic fallback tint for an object with no `color_hex`.
 *
 * Colour is UX metadata and nothing reads it to decide behaviour. This exists
 * so an operator can still tell objects apart before anyone has configured
 * colours — the alternative is a grid of identical grey chips.
 */
const FALLBACK_TINTS = [
  "#2F6B3F",
  "#8A5A00",
  "#0D5C63",
  "#A12D2D",
  "#4B3F8A",
  "#1F5673",
] as const;

export function objectTint(
  objectId: string,
  configured: string | null | undefined,
): string {
  if (configured && /^#[0-9A-Fa-f]{6}$/.test(configured)) return configured;
  let hash = 0;
  for (let i = 0; i < objectId.length; i++) {
    hash = (hash * 31 + objectId.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_TINTS[hash % FALLBACK_TINTS.length];
}

/**
 * Does this new entry look like an accidental re-submit of one just made?
 *
 * Convenience features (repeat last entry, add another object) must not
 * silently create duplicate records, but two IDENTICAL allocations are also
 * legitimate — a morning and an afternoon shift on the same object are two
 * real facts. So this never blocks: it reports a suspicion the surface can
 * put in front of the operator, who is the only one who knows which it is.
 */
export function looksLikeAccidentalDuplicate(
  candidate: Pick<WorkHourAllocation, "workerId" | "workDate" | "workObjectId" | "hours">,
  existing: readonly Pick<
    WorkHourAllocation,
    "workerId" | "workDate" | "workObjectId" | "hours" | "createdAt"
  >[],
  nowIso: string,
  withinSeconds = 120,
): boolean {
  const now = Date.parse(nowIso);
  return existing.some((e) => {
    if (
      e.workerId !== candidate.workerId ||
      e.workDate !== candidate.workDate ||
      e.workObjectId !== candidate.workObjectId ||
      Math.round(e.hours * 100) !== Math.round(candidate.hours * 100)
    ) {
      return false;
    }
    const age = (now - Date.parse(e.createdAt)) / 1000;
    return Number.isFinite(age) && age >= 0 && age <= withinSeconds;
  });
}
