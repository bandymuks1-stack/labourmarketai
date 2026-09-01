"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { getOrgWorkObjects } from "@/lib/objects/objects";
import { getAllocationsForMonth } from "@/lib/work-hours/allocations";
import {
  ALLOCATION_NOTE_MAX,
  ALLOCATION_SOURCE_IMPORT,
  isAllocationMigrationMissingCode,
  isValidWorkDate,
  parseHours,
} from "@/lib/work-hours/allocations-model";
import {
  buildTimesheetImportPreview,
  type TimesheetImportPreview,
  type TimesheetPreviewRefusedCode,
} from "@/lib/timesheet-import/import-preview";

/**
 * TIMESHEET IMPORT — the two server actions.
 *
 * `previewTimesheetImportAction` takes the uploaded workbook and returns the
 * interpretation for human review; it writes NOTHING (`persisted: false` is a
 * literal on the preview type). `confirmTimesheetImportAction` takes the rows
 * a human has corrected and confirmed and bulk-inserts them into the ONE
 * canonical table, `work_hour_allocations`, under the caller's own RLS —
 * exactly the write path `recordAllocationAction` uses, with `source:
 * "import"` marking where the facts came from. No new table, no new RPC, no
 * migration.
 *
 * Rules inherited verbatim from `lib/work-hours/allocations-actions.ts`:
 *   - `entered_by` is the ACTING profile from the session, never a form
 *     field; RLS enforces the same thing a second time;
 *   - the organization comes from the server-side employer context;
 *   - a duplicate is a WARNING requiring an explicit override, never a
 *     silent skip and never a silent write.
 *
 * Every row is RE-validated server-side — the corrected preview the client
 * sends is a proposal like any other input. The insert is ONE atomic
 * statement: either every confirmed row is written or none is, so a failure
 * can never leave a half-imported month that looks complete.
 */

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_CONFIRM_ROWS = 2_000;

export type TimesheetPreviewActionState =
  | { status: "idle" }
  | { status: "preview"; preview: TimesheetImportPreview }
  | { status: "refused"; reasonCode: TimesheetPreviewRefusedCode }
  | { status: "empty" }
  | { status: "no-company" }
  | { status: "error" };

export type TimesheetConfirmRowInput = {
  readonly workerId: string;
  readonly workObjectId: string;
  readonly workDate: string;
  readonly hours: string;
  readonly note: string | null;
};

export type TimesheetRowProblem = {
  readonly index: number;
  readonly field: "worker" | "object" | "date" | "hours" | "note";
};

export type TimesheetConfirmActionState =
  | { status: "idle" }
  | { status: "no-rows" }
  | { status: "too-many-rows" }
  /** Nothing was written; each named row must be corrected first. */
  | { status: "invalid-rows"; problems: readonly TimesheetRowProblem[] }
  /** Nothing was written; these rows already exist identically — confirm
   *  again with the explicit override to write them anyway. */
  | { status: "duplicates"; indexes: readonly number[] }
  | { status: "needs-migration" }
  | { status: "not-authorized" }
  | { status: "error" }
  | { status: "written"; written: number };

export async function previewTimesheetImportAction(
  _prev: TimesheetPreviewActionState,
  formData: FormData,
): Promise<TimesheetPreviewActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "refused", reasonCode: "no-file" };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { status: "refused", reasonCode: "read-failed" };
  }

  const result = await buildTimesheetImportPreview(buffer, file.name || "timesheet.xlsx");
  if (result.kind === "ok") return { status: "preview", preview: result };
  if (result.kind === "refused") {
    return { status: "refused", reasonCode: result.reasonCode };
  }
  if (result.kind === "empty") return { status: "empty" };
  if (result.kind === "no-company") return { status: "no-company" };
  return { status: "error" };
}

function parseRows(raw: string): TimesheetConfirmRowInput[] | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const rows: TimesheetConfirmRowInput[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    rows.push({
      workerId: String(o.workerId ?? "").trim(),
      workObjectId: String(o.workObjectId ?? "").trim(),
      workDate: String(o.workDate ?? "").trim(),
      hours: String(o.hours ?? "").trim(),
      note:
        typeof o.note === "string" && o.note.trim() !== "" ? o.note.trim() : null,
    });
  }
  return rows;
}

function duplicateKey(
  workerId: string,
  workDate: string,
  objectId: string,
  hoursCents: number,
): string {
  return `${workerId}|${workDate}|${objectId}|${hoursCents}`;
}

export async function confirmTimesheetImportAction(
  _prev: TimesheetConfirmActionState,
  formData: FormData,
): Promise<TimesheetConfirmActionState> {
  const rows = parseRows(String(formData.get("rows") ?? ""));
  if (rows === null || rows.length === 0) return { status: "no-rows" };
  if (rows.length > MAX_CONFIRM_ROWS) return { status: "too-many-rows" };
  const overrideDuplicates = String(formData.get("override_duplicates")) === "1";

  // ── Per-row re-validation, before any IO. The client's corrections are
  //    input, not truth. All problems are reported at once — no fix-one-
  //    resubmit-find-the-next loop across a 600-row month.
  const problems: TimesheetRowProblem[] = [];
  const parsedHours: number[] = [];
  rows.forEach((row, index) => {
    if (!UUID_RX.test(row.workerId)) problems.push({ index, field: "worker" });
    if (!UUID_RX.test(row.workObjectId)) problems.push({ index, field: "object" });
    if (!isValidWorkDate(row.workDate)) problems.push({ index, field: "date" });
    if ((row.note ?? "").length > ALLOCATION_NOTE_MAX) {
      problems.push({ index, field: "note" });
    }
    const hours = parseHours(row.hours);
    if (!hours.ok) {
      problems.push({ index, field: "hours" });
      parsedHours.push(0);
    } else {
      parsedHours.push(hours.hours);
    }
  });
  if (problems.length > 0) return { status: "invalid-rows", problems };

  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok") return { status: "not-authorized" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authorized" };

  // ── Membership: every worker must be on THIS company's crew and every
  //    object must be one of ITS active objects — the same lists the page
  //    renders. RLS would refuse a foreign worker anyway; checking here turns
  //    a blunt 42501 into a row-addressed correction.
  const [workersRes, objectsRes] = await Promise.all([
    listActiveCompanyWorkers(ctx.companyId),
    getOrgWorkObjects(),
  ]);
  const knownWorkers = new Set(
    workersRes.kind === "ok" ? workersRes.rows.map((w) => w.workerId) : [],
  );
  const knownObjects = new Set(
    objectsRes.kind === "ok"
      ? objectsRes.rows.filter((o) => o.status === "active").map((o) => o.id)
      : [],
  );
  rows.forEach((row, index) => {
    if (!knownWorkers.has(row.workerId)) problems.push({ index, field: "worker" });
    if (!knownObjects.has(row.workObjectId)) problems.push({ index, field: "object" });
  });
  if (problems.length > 0) return { status: "invalid-rows", problems };

  // ── Duplicate check against what is ALREADY recorded. A warning gate, not
  //    a block: two identical allocations are also a legitimate morning and
  //    afternoon — the human overrides explicitly when that is the case.
  if (!overrideDuplicates) {
    const starts = new Set(rows.map((r) => `${r.workDate.slice(0, 7)}-01`));
    const existing = new Set<string>();
    for (const start of [...starts].slice(0, 3)) {
      const res = await getAllocationsForMonth(start);
      if (res.kind === "ok") {
        for (const a of res.rows) {
          existing.add(
            duplicateKey(a.workerId, a.workDate, a.workObjectId, Math.round(a.hours * 100)),
          );
        }
      }
    }
    const indexes = rows
      .map((row, index) =>
        existing.has(
          duplicateKey(
            row.workerId,
            row.workDate,
            row.workObjectId,
            Math.round(parsedHours[index] * 100),
          ),
        )
          ? index
          : -1,
      )
      .filter((i) => i >= 0);
    if (indexes.length > 0) return { status: "duplicates", indexes };
  }

  // ── ONE atomic insert. Either the whole confirmed set is written or none
  //    of it is — no half-imported month. `entered_by` is the acting session
  //    profile, RLS-enforced a second time.
  const payload = rows.map((row, index) => ({
    organization_id: ctx.organizationId,
    worker_id: row.workerId,
    entered_by: user.id,
    work_date: row.workDate,
    work_object_id: row.workObjectId,
    hours_numeric: parsedHours[index],
    note: row.note,
    source: ALLOCATION_SOURCE_IMPORT,
  }));

  const res = await (supabase as never as {
    from: (t: string) => {
      insert: (v: unknown) => {
        select: (c: string) => Promise<{
          data: readonly { id: string }[] | null;
          error: { code?: string } | null;
        }>;
      };
    };
  })
    .from("work_hour_allocations")
    .insert(payload)
    .select("id");

  if (res.error) {
    if (isAllocationMigrationMissingCode(res.error.code)) {
      return { status: "needs-migration" };
    }
    if (res.error.code === "42501") return { status: "not-authorized" };
    console.error("[timesheet-import] bulk write failed:", res.error.code);
    return { status: "error" };
  }
  const written = res.data?.length ?? 0;
  if (written !== rows.length) {
    // PostgREST inserts are atomic; a count mismatch would mean silent drops,
    // which this feature exists to make impossible. Say so loudly.
    console.error(
      "[timesheet-import] write count mismatch:",
      written,
      "of",
      rows.length,
    );
    return { status: "error" };
  }

  revalidatePath("/", "layout");
  return { status: "written", written };
}
