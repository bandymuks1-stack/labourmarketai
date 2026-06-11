import type { ProjectOperations, WorkerOps } from "@/lib/projects/operations-derive";

/**
 * Project operations report builder (slice pilot-ops-launch-v1) — PURE, DB-free.
 *
 * Turns a ProjectOperations view into a CSV the authenticated manager can
 * download. It only ever serialises data that was already read under the
 * manager's own RLS (see lib/projects/operations.ts). It NEVER invents a value:
 * an empty project produces a header-only CSV, not fake rows; "ready" reflects
 * exactly the derived honest flag; missing reasons are the real reason codes.
 */

/** RFC-4180-ish escaping: quote when the cell holds a comma, quote or newline. */
export function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

function workerRow(w: WorkerOps): string[] {
  return [
    w.name,
    w.operationalStatus ?? "not_set",
    w.ready ? "ready_checked_fields" : "not_ready",
    String(w.declaredSkills),
    String(w.confirmedSkills),
    String(w.journalEntries),
    String(w.openReviewItems),
    String(w.docsMissing),
    String(w.docsReceived),
    String(w.docsChecked),
    String(w.docsBlocked),
    w.declaredSkills <= 0 ? "yes" : "no", // needs_skill_info (manager-visible proxy)
    w.lastActivity ?? "",
    w.missing.join("|"),
    w.needsFollowUp ? "yes" : "no",
    w.assignedAt,
  ];
}

export const OPS_CSV_HEADER = [
  "worker_name",
  "operational_status",
  "readiness",
  "declared_skills",
  "confirmed_skills",
  "work_evidence_entries",
  "open_review_items",
  "docs_missing",
  "docs_received",
  "docs_checked",
  "docs_blocked",
  "needs_skill_info",
  "last_activity",
  "missing",
  "needs_follow_up",
  "assigned_at",
] as const;

/** Build the full CSV string for a project operations export. */
export function buildOperationsCsv(ops: ProjectOperations): string {
  const lines: string[] = [];
  lines.push(csvRow([...OPS_CSV_HEADER]));
  for (const w of ops.workers) lines.push(csvRow(workerRow(w)));
  return lines.join("\r\n") + "\r\n";
}

/** A filesystem-safe filename for the export, scoped to the project. */
export function operationsCsvFilename(ops: ProjectOperations): string {
  const base = (ops.project.title ?? ops.project.id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `operations-${base || ops.project.id.slice(0, 8)}.csv`;
}
