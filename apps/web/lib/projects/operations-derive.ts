import type { WorkerReadiness } from "@/lib/company/worker-readiness";

/**
 * Pure, DB-free operations derivations (slice pilot-ops-launch-v1). Kept apart
 * from operations.ts (which is "server-only") so the honesty logic is directly
 * unit-testable. No I/O, no fabrication — every output is a function of real,
 * already-read signals.
 */

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
}

export interface OpsCounters {
  totalAssigned: number;
  ready: number;
  needsDeclaredSkills: number;
  needsEvidence: number;
  needsFollowUp: number;
  openReviewItems: number;
  instructionsSent: number;
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
}

/**
 * PURE: derive one worker's honest operations row. "Ready" means ONLY that the
 * three fields we actually checked are present — a real name, at least one
 * declared skill, and at least one recorded work-evidence entry. It is never a
 * verification, a document approval, or an AI judgement.
 */
export function deriveWorkerOps(input: WorkerOpsInput): WorkerOps {
  const { readiness } = input;
  const missing: string[] = [];
  if (!input.hasRealName) missing.push("name");
  if (readiness.declaredSkills <= 0) missing.push("declared_skills");
  if (readiness.journalEntries <= 0) missing.push("work_evidence");

  const needsFollowUp = readiness.lastActivity == null;

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
  };
}

/** PURE: roll per-worker rows up into honest project counters. */
export function deriveOpsCounters(
  workers: WorkerOps[],
  instructionsSent: number,
): OpsCounters {
  return {
    totalAssigned: workers.length,
    ready: workers.filter((w) => w.ready).length,
    needsDeclaredSkills: workers.filter((w) => w.missing.includes("declared_skills")).length,
    needsEvidence: workers.filter((w) => w.missing.includes("work_evidence")).length,
    needsFollowUp: workers.filter((w) => w.needsFollowUp).length,
    openReviewItems: workers.reduce((n, w) => n + w.openReviewItems, 0),
    instructionsSent: Math.max(0, instructionsSent),
  };
}
