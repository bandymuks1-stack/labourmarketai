import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import {
  ALLOCATION_READ_LIMIT,
  isAllocationMigrationMissingCode,
  isValidAllocationStatus,
  type WorkHourAllocation,
} from "@/lib/work-hours/allocations-model";

/**
 * WORK-HOUR ALLOCATIONS — reads.
 *
 * The organization is ALWAYS resolved server-side through the one employer
 * context resolver, exactly as `lib/objects` does. A client-supplied
 * organization id is never trusted, and RLS is the second lock behind it:
 * `owns_worker OR manages_organization OR is_admin`, the same predicate
 * `timesheets` uses, so an operator sees the same people in both surfaces.
 */

/** `work_hour_allocations` is newer than the generated Database types, and
 *  the same escape hatch `lib/objects/objects.ts` uses for `work_objects`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c as any;
}

const SELECT_COLUMNS =
  "id, organization_id, worker_id, entered_by, work_date, work_object_id, " +
  "hours_numeric, note, source, status, journal_entry_id, correction_of, " +
  "superseded_by, created_at";

type Row = {
  id: string;
  organization_id: string;
  worker_id: string;
  entered_by: string;
  work_date: string;
  work_object_id: string;
  hours_numeric: number | string;
  note: string | null;
  source: string | null;
  status: string | null;
  journal_entry_id: string | null;
  correction_of: string | null;
  superseded_by: string | null;
  created_at: string;
};

function toAllocation(r: Row): WorkHourAllocation | null {
  const status = r.status ?? "recorded";
  if (!isValidAllocationStatus(status)) return null;
  // numeric(5,2) arrives as a string over PostgREST; a silent NaN here would
  // become a missing hour on somebody's payslip.
  const hours = typeof r.hours_numeric === "string" ? Number(r.hours_numeric) : r.hours_numeric;
  if (!Number.isFinite(hours)) return null;
  return {
    id: r.id,
    organizationId: r.organization_id,
    workerId: r.worker_id,
    enteredBy: r.entered_by,
    workDate: r.work_date,
    workObjectId: r.work_object_id,
    hours,
    note: r.note ?? null,
    source: r.source ?? "manual",
    status,
    journalEntryId: r.journal_entry_id ?? null,
    correctionOf: r.correction_of ?? null,
    supersededBy: r.superseded_by ?? null,
    createdAt: r.created_at,
  };
}

export type AllocationsResult =
  | {
      readonly kind: "ok";
      readonly organizationId: string;
      readonly rows: readonly WorkHourAllocation[];
    }
  /** The table is not in this database yet. Distinct from "no rows", because
   *  "nobody worked" and "the feature is not installed" must never look the
   *  same to an operator. */
  | { readonly kind: "needs-migration" }
  | { readonly kind: "no-company" }
  | { readonly kind: "error" };

async function readAllocations(
  build: (q: ReturnType<ReturnType<typeof asAny>["from"]>) => unknown,
): Promise<AllocationsResult> {
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok") return { kind: "no-company" };

  const supabase = await createClient();
  const base = asAny(supabase)
    .from("work_hour_allocations")
    .select(SELECT_COLUMNS)
    .eq("organization_id", ctx.organizationId);

  const res = await (build(base) as Promise<{
    data: Row[] | null;
    error: { code?: string; message?: string } | null;
  }>);

  if (res.error) {
    if (isAllocationMigrationMissingCode(res.error.code)) {
      return { kind: "needs-migration" };
    }
    // Code only — a message can carry row content.
    console.error("[work-hours] read failed:", res.error.code);
    return { kind: "error" };
  }
  const rows = (res.data ?? [])
    .map(toAllocation)
    .filter((a): a is WorkHourAllocation => a !== null);
  return { kind: "ok", organizationId: ctx.organizationId, rows };
}

/** Everything recorded for one day, newest first — the quick-entry surface's
 *  running list, and what the operator checks before moving on. */
export async function getAllocationsForDate(
  workDate: string,
): Promise<AllocationsResult> {
  return readAllocations((q) =>
    q
      .eq("work_date", workDate)
      .is("superseded_by", null)
      .order("created_at", { ascending: false })
      .limit(ALLOCATION_READ_LIMIT),
  );
}

/**
 * One calendar month, for the manager grid and the export.
 *
 * `monthStart` is the first day (`YYYY-MM-01`); the range is half-open so the
 * last day of the month is included and the first of the next is not — the
 * off-by-one that would otherwise move hours between months.
 */
export async function getAllocationsForMonth(
  monthStart: string,
): Promise<AllocationsResult> {
  const start = new Date(`${monthStart}T00:00:00.000Z`);
  const next = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
  );
  const nextIso = next.toISOString().slice(0, 10);
  return readAllocations((q) =>
    q
      .gte("work_date", monthStart)
      .lt("work_date", nextIso)
      .is("superseded_by", null)
      .order("work_date", { ascending: true })
      .limit(ALLOCATION_READ_LIMIT),
  );
}

/**
 * The caller's most recent allocations, used ONLY to warn about an accidental
 * re-submit. Superseded rows are included deliberately: a correction should
 * not make the original invisible to the duplicate check.
 */
export async function getRecentAllocations(
  workDate: string,
  limit = 25,
): Promise<AllocationsResult> {
  return readAllocations((q) =>
    q.eq("work_date", workDate).order("created_at", { ascending: false }).limit(limit),
  );
}
