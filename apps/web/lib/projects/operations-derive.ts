import type { WorkerReadiness } from "@/lib/company/worker-readiness";

/**
 * Pure, DB-free operations derivations (slices pilot-ops-launch-v1 +
 * pilot-ops-v2-status-docs). Kept apart from operations.ts (which is
 * "server-only") so the honesty logic is directly unit-testable. No I/O, no
 * fabrication — every output is a function of real, already-read signals.
 */

/** Manager-set operational status (project_worker_operational_statuses). */
export type OperationalStatus =
  | "candidate"
  | "contacted"
  | "interested"
  | "documents_needed"
  | "ready"
  | "assigned"
  | "unavailable"
  | "rejected";

export const OPERATIONAL_STATUSES: readonly OperationalStatus[] = [
  "candidate",
  "contacted",
  "interested",
  "documents_needed",
  "ready",
  "assigned",
  "unavailable",
  "rejected",
] as const;

/** Manager-set checklist item state (project_worker_readiness_items). */
export type ReadinessStatus =
  | "not_required"
  | "needed"
  | "missing"
  | "received"
  | "checked"
  | "rejected"
  | "expired";

export const READINESS_STATUSES: readonly ReadinessStatus[] = [
  "not_required",
  "needed",
  "missing",
  "received",
  "checked",
  "rejected",
  "expired",
] as const;

export interface ReadinessItem {
  itemKey: string;
  label: string;
  status: ReadinessStatus;
  note: string | null;
}

/** Real, manager-readable project summary fields (schema-backed only). */
export interface ProjectSummary {
  id: string;
  title: string | null;
  city: string | null;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
}

/** Per-worker operations row, derived from manager-readable signals only. */
export interface WorkerOps {
  workerId: string;
  workerProfileId: string;
  name: string;
  assignedAt: string;
  journalEntries: number;
  declaredSkills: number;
  confirmedSkills: number;
  openReviewItems: number;
  lastActivity: string | null;
  /** Ready ONLY according to the fields actually checked (see notes/readiness). */
  ready: boolean;
  /** Honest, explainable reason codes this worker is not yet "ready". */
  missing: string[];
  needsFollowUp: boolean;
  /** Manager-set operational status (v2). null = not set yet. */
  operationalStatus: OperationalStatus | null;
  /** Manager-maintained readiness/document checklist for this project worker (v2). */
  readinessItems: ReadinessItem[];
  /** Checklist roll-ups (counts of the real item rows). */
  docsMissing: number; // 'needed' or 'missing'
  docsReceived: number; // 'received'
  docsChecked: number; // 'checked'
  docsBlocked: number; // 'rejected' or 'expired'
}

export interface OpsCounters {
  totalAssigned: number;
  ready: number;
  needsDeclaredSkills: number;
  needsEvidence: number;
  needsFollowUp: number;
  openReviewItems: number;
  instructionsSent: number;
  /** Count of workers per manager-set operational status (v2). */
  byOperationalStatus: Record<OperationalStatus, number>;
  /** Workers with at least one outstanding (needed/missing) checklist item. */
  withMissingDocs: number;
  docsMissing: number;
  docsReceived: number;
  docsChecked: number;
  docsBlocked: number;
}

export interface ProjectOperations {
  project: ProjectSummary;
  workers: WorkerOps[];
  counters: OpsCounters;
}

/** Raw signal shape consumed by the pure derivation (DB-free, testable). */
export interface WorkerOpsInput {
  workerId: string;
  workerProfileId: string;
  name: string;
  /** True when `name` is a real stored name, not the id-prefix fallback. */
  hasRealName: boolean;
  assignedAt: string;
  readiness: WorkerReadiness;
  /** v2: manager-set operational status, or null if none set. */
  operationalStatus?: OperationalStatus | null;
  /** v2: manager-maintained checklist items for this project worker. */
  readinessItems?: ReadinessItem[];
}

function emptyStatusCounts(): Record<OperationalStatus, number> {
  return {
    candidate: 0,
    contacted: 0,
    interested: 0,
    documents_needed: 0,
    ready: 0,
    assigned: 0,
    unavailable: 0,
    rejected: 0,
  };
}

/**
 * PURE: derive one worker's honest operations row. Derived "ready" means ONLY
 * that the three fields we actually checked are present — a real name, at least
 * one declared skill, and at least one recorded work-evidence entry. It is never
 * a verification, a document approval, or an AI judgement. The manager-set
 * operationalStatus and checklist are carried through verbatim (no inference).
 */
export function deriveWorkerOps(input: WorkerOpsInput): WorkerOps {
  const { readiness } = input;
  const missing: string[] = [];
  if (!input.hasRealName) missing.push("name");
  if (readiness.declaredSkills <= 0) missing.push("declared_skills");
  if (readiness.journalEntries <= 0) missing.push("work_evidence");

  const needsFollowUp = readiness.lastActivity == null;

  const items = input.readinessItems ?? [];
  const countWith = (preds: ReadinessStatus[]) =>
    items.filter((i) => preds.includes(i.status)).length;

  return {
    workerId: input.workerId,
    workerProfileId: input.workerProfileId,
    name: input.name,
    assignedAt: input.assignedAt,
    journalEntries: readiness.journalEntries,
    declaredSkills: readiness.declaredSkills,
    confirmedSkills: readiness.confirmedSkills,
    openReviewItems: readiness.openReviewItems,
    lastActivity: readiness.lastActivity,
    ready: missing.length === 0,
    missing,
    needsFollowUp,
    operationalStatus: input.operationalStatus ?? null,
    readinessItems: items,
    docsMissing: countWith(["needed", "missing"]),
    docsReceived: countWith(["received"]),
    docsChecked: countWith(["checked"]),
    docsBlocked: countWith(["rejected", "expired"]),
  };
}

/** PURE: roll per-worker rows up into honest project counters. */
export function deriveOpsCounters(
  workers: WorkerOps[],
  instructionsSent: number,
): OpsCounters {
  const byOperationalStatus = emptyStatusCounts();
  for (const w of workers) {
    if (w.operationalStatus) byOperationalStatus[w.operationalStatus] += 1;
  }
  return {
    totalAssigned: workers.length,
    ready: workers.filter((w) => w.ready).length,
    needsDeclaredSkills: workers.filter((w) => w.missing.includes("declared_skills")).length,
    needsEvidence: workers.filter((w) => w.missing.includes("work_evidence")).length,
    needsFollowUp: workers.filter((w) => w.needsFollowUp).length,
    openReviewItems: workers.reduce((n, w) => n + w.openReviewItems, 0),
    instructionsSent: Math.max(0, instructionsSent),
    byOperationalStatus,
    withMissingDocs: workers.filter((w) => w.docsMissing > 0).length,
    docsMissing: workers.reduce((n, w) => n + w.docsMissing, 0),
    docsReceived: workers.reduce((n, w) => n + w.docsReceived, 0),
    docsChecked: workers.reduce((n, w) => n + w.docsChecked, 0),
    docsBlocked: workers.reduce((n, w) => n + w.docsBlocked, 0),
  };
}
