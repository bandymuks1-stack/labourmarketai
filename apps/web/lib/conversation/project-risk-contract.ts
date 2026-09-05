import type { ProjectStatus } from "@/lib/projects/project-lifecycle-model";

/** How many projects the risk answer reads (the panel's own detail read each). */
export const PROJECT_RISK_SCAN_LIMIT = 6;
/** How many "open project" chips follow the answer. */
export const PROJECT_RISK_CHIP_LIMIT = 3;

/**
 * One project's risk picture — every number is the SAME canonical read the
 * project panel's pulse and the operations centre render. `pulseKnown=false`
 * means the reads were not available here (never a zero pretending to be a
 * fact). `signals` is a COUNT of real facts that need someone (overdue
 * tasks, blocked stages, people with missing documents, a live project with
 * nobody on it) — not a score, not a percentage, not a colour.
 */
export interface ProjectRiskRow {
  readonly projectId: string;
  readonly title: string;
  readonly status: ProjectStatus | null;
  readonly people: number;
  readonly pulseKnown: boolean;
  readonly tasksOpen: number;
  readonly tasksOverdue: number;
  /** Blocked stages, or null when stages are unreadable in this environment. */
  readonly stagesBlocked: number | null;
  readonly workersWithMissingDocs: number;
  readonly readinessChecked: number;
  readonly readinessTotal: number;
  readonly nobodyOnLiveProject: boolean;
  readonly signals: number;
}

export type ProjectRiskChatResult =
  | { readonly kind: "ok"; readonly rows: readonly ProjectRiskRow[]; readonly total: number }
  | { readonly kind: "empty" }
  | { readonly kind: "no-company" }
  | { readonly kind: "error" };
