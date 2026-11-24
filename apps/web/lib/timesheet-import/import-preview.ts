import "server-only";

/**
 * TIMESHEET IMPORT PREVIEW — read → parse → resolve, composed server-side.
 *
 * Produces the INTERPRETATION a human will correct and confirm; it persists
 * NOTHING (`persisted: false` is a literal type, the `manual-import-sandbox`
 * idiom). The only writes in this feature live in `import-confirm-actions.ts`
 * and run strictly on human-confirmed rows.
 *
 * Entity resolution runs against the SAME canonical readers the hours page
 * uses (`listActiveCompanyWorkers`, `getOrgWorkObjects`), so a name that
 * resolves here is byte-identical to the one the quick-entry select shows.
 * Ambiguity survives into the preview — a row whose worker or object is not
 * an exact/unambiguous match arrives with candidates and NO selection.
 *
 * Accounting reuses `buildImportSession` (exact-sum invariant): every parsed
 * proposal is accepted (ready), rejected (needs a human) or duplicated
 * (already recorded). The session is preview-only and NOT persisted in this
 * slice; its rollbackRef says so explicitly.
 */

import { randomUUID } from "node:crypto";

import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { getOrgWorkObjects } from "@/lib/objects/objects";
import { getAllocationsForMonth } from "@/lib/work-hours/allocations";
import {
  buildImportSession,
  type ImportSessionV1,
} from "@/lib/intelligence/import-session";
import {
  readTimesheetXlsx,
} from "@/lib/timesheet-import/xlsx-read";
import {
  parseTimesheetSheet,
  type TimesheetGridProposal,
  type TimesheetMonth,
  type TimesheetSkippedCell,
} from "@/lib/timesheet-import/xlsx-grid-parse";
import {
  resolveEntityLabel,
  type EntityResolution,
  type ResolveEntity,
} from "@/lib/timesheet-import/resolve-entities";

/** Upper bound on rows one preview may carry to the surface. A 30-worker,
 *  31-day, two-objects-a-day month is ~1.9k facts; beyond that the file needs
 *  splitting, not a bigger page. */
export const MAX_PREVIEW_ROWS = 2_000;

export type TimesheetPreviewRow = {
  readonly index: number;
  readonly workerLabel: string;
  readonly worker: EntityResolution;
  readonly objectLabel: string | null;
  /** Null when the sheet named no object at all — the human picks one. */
  readonly object: EntityResolution | null;
  readonly workDate: string | null;
  readonly dayOfMonth: number | null;
  readonly hours: number;
  readonly note: string | null;
  readonly confidence: "high" | "low";
  readonly sourceCell: string;
  /** An identical allocation (worker, date, object, hours) already exists —
   *  surfaced as a warning; writing it again needs an explicit override. */
  readonly duplicate: boolean;
};

export type TimesheetImportPreview = {
  readonly kind: "ok";
  /** LITERAL false — a persisted preview is unrepresentable. */
  readonly persisted: false;
  readonly fileName: string;
  readonly sheetName: string;
  readonly layout: "monthly-grid" | "long-format";
  readonly month: TimesheetMonth | null;
  readonly rows: readonly TimesheetPreviewRow[];
  readonly skipped: readonly TimesheetSkippedCell[];
  readonly session: ImportSessionV1 | null;
};

export type TimesheetPreviewRefusedCode =
  | "no-file"
  | "too-large"
  | "not-xlsx"
  | "too-complex"
  | "read-failed"
  | "unrecognized"
  | "too-many-rows";

export type TimesheetPreviewResult =
  | TimesheetImportPreview
  | { readonly kind: "refused"; readonly reasonCode: TimesheetPreviewRefusedCode }
  | { readonly kind: "empty" }
  | { readonly kind: "no-company" }
  | { readonly kind: "failed" };

function isReady(row: {
  worker: EntityResolution;
  object: EntityResolution | null;
  workDate: string | null;
  confidence: "high" | "low";
}): boolean {
  return (
    row.worker.kind === "resolved" &&
    row.object !== null &&
    row.object.kind === "resolved" &&
    row.workDate !== null &&
    row.confidence === "high"
  );
}

function duplicateKey(
  workerId: string,
  workDate: string,
  objectId: string,
  hours: number,
): string {
  return `${workerId}|${workDate}|${objectId}|${Math.round(hours * 100)}`;
}

/** Distinct `YYYY-MM-01` month starts covered by the resolved dates. */
function monthStarts(proposals: readonly TimesheetGridProposal[]): readonly string[] {
  const starts = new Set<string>();
  for (const p of proposals) {
    if (p.workDate !== null) starts.add(`${p.workDate.slice(0, 7)}-01`);
  }
  return [...starts].slice(0, 3);
}

/**
 * Build the reviewable interpretation of an uploaded timesheet workbook.
 * Reads only; the caller (a server action) owns auth, size caps and the file
 * handle. The first sheet that parses wins — a workbook usually carries one
 * real month plus empty scratch sheets.
 */
export async function buildTimesheetImportPreview(
  buffer: Buffer,
  fileName: string,
): Promise<TimesheetPreviewResult> {
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok") return { kind: "no-company" };

  const startedAtIso = new Date().toISOString();

  const read = await readTimesheetXlsx(buffer);
  if (read.kind === "too-large") return { kind: "refused", reasonCode: "too-large" };
  if (read.kind === "not-xlsx") return { kind: "refused", reasonCode: "not-xlsx" };
  if (read.kind === "too-complex") return { kind: "refused", reasonCode: "too-complex" };
  if (read.kind === "failed") return { kind: "refused", reasonCode: "read-failed" };
  if (read.kind === "empty") return { kind: "empty" };

  let parsed: ReturnType<typeof parseTimesheetSheet> = { kind: "unrecognized" };
  let sheetName = "";
  for (const sheet of read.sheets) {
    const attempt = parseTimesheetSheet(sheet.rows, sheet.name);
    if (attempt.kind === "parsed") {
      parsed = attempt;
      sheetName = sheet.name;
      break;
    }
  }
  if (parsed.kind !== "parsed") return { kind: "refused", reasonCode: "unrecognized" };
  if (parsed.proposals.length === 0 && parsed.skipped.length === 0) {
    return { kind: "empty" };
  }
  if (parsed.proposals.length > MAX_PREVIEW_ROWS) {
    return { kind: "refused", reasonCode: "too-many-rows" };
  }

  // The SAME entity lists the quick-entry surface renders.
  const [workersRes, objectsRes] = await Promise.all([
    listActiveCompanyWorkers(ctx.companyId),
    getOrgWorkObjects(),
  ]);
  if (workersRes.kind === "error" || objectsRes.kind === "error") {
    return { kind: "failed" };
  }
  const workerEntities: readonly ResolveEntity[] =
    workersRes.kind === "ok"
      ? workersRes.rows.map((w) => ({
          id: w.workerId,
          name: w.displayName?.trim() || w.email?.split("@")[0] || w.workerId,
        }))
      : [];
  const objectEntities: readonly ResolveEntity[] =
    objectsRes.kind === "ok"
      ? objectsRes.rows
          .filter((o) => o.status === "active")
          .map((o) => ({ id: o.id, name: o.name }))
      : [];

  // Resolution is memoized per label — a 30-day grid repeats each name a lot.
  const workerCache = new Map<string, EntityResolution>();
  const objectCache = new Map<string, EntityResolution>();
  const resolveWorker = (label: string): EntityResolution => {
    const hit = workerCache.get(label);
    if (hit) return hit;
    const res = resolveEntityLabel(label, workerEntities);
    workerCache.set(label, res);
    return res;
  };
  const resolveObject = (label: string): EntityResolution => {
    const hit = objectCache.get(label);
    if (hit) return hit;
    const res = resolveEntityLabel(label, objectEntities);
    objectCache.set(label, res);
    return res;
  };

  // Existing facts for the covered month(s) — duplicate WARNINGS, never
  // blocks; identical rows are also legitimate (a morning and an afternoon).
  const existing = new Set<string>();
  for (const start of monthStarts(parsed.proposals)) {
    const res = await getAllocationsForMonth(start);
    if (res.kind === "ok") {
      for (const a of res.rows) {
        existing.add(duplicateKey(a.workerId, a.workDate, a.workObjectId, a.hours));
      }
    }
  }

  const rows: TimesheetPreviewRow[] = parsed.proposals.map((p, index) => {
    const worker = resolveWorker(p.workerLabel);
    const object = p.objectLabel === null ? null : resolveObject(p.objectLabel);
    const duplicate =
      worker.kind === "resolved" &&
      object?.kind === "resolved" &&
      p.workDate !== null &&
      existing.has(duplicateKey(worker.id, p.workDate, object.id, p.hours));
    return {
      index,
      workerLabel: p.workerLabel,
      worker,
      objectLabel: p.objectLabel,
      object,
      workDate: p.workDate,
      dayOfMonth: p.dayOfMonth,
      hours: p.hours,
      note: p.note,
      confidence: p.confidence,
      sourceCell: p.sourceCell,
      duplicate,
    };
  });

  // Preview accounting via the canonical validating builder. NOT persisted in
  // this slice — the rollbackRef states that in so many words.
  let accepted = 0;
  let duplicated = 0;
  for (const row of rows) {
    if (!isReady(row)) continue;
    if (row.duplicate) duplicated++;
    else accepted++;
  }
  const scanned = rows.length + parsed.skipped.length;
  const sessionResult = buildImportSession({
    sessionId: `timesheet-preview-${randomUUID()}`,
    sourceKey: "timesheet_xlsx_upload",
    transformVersion: "timesheet-xlsx-v1",
    startedAtIso,
    finishedAtIso: new Date().toISOString(),
    itemsScanned: scanned,
    itemsAccepted: accepted,
    itemsRejected: scanned - accepted - duplicated,
    itemsDuplicated: duplicated,
    reasonCounts: [],
    errors: [],
    rollbackRef: `preview-not-persisted:${fileName}`,
  });

  return {
    kind: "ok",
    persisted: false,
    fileName,
    sheetName,
    layout: parsed.layout,
    month: parsed.month,
    rows,
    skipped: parsed.skipped,
    session: sessionResult.ok ? sessionResult.session : null,
  };
}
