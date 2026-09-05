import type { OperationalStatus } from "@/lib/projects/operations-derive";
import type { ProjectStatus } from "@/lib/projects/project-lifecycle-model";

/** How many assigned people the answer names before summarising the rest. */
export const READINESS_CHAT_WORKER_LIMIT = 8;
/** How many checklist labels one person's line carries. */
export const READINESS_CHAT_ITEM_LIMIT = 4;
/** How many projects the ask offers when the sentence names none or several. */
export const READINESS_CHAT_ASK_LIMIT = 4;

/** The three derived "missing" reason codes the operations centre computes
 *  (`deriveWorkerOps`): a real name, at least one declared skill, at least
 *  one work-evidence entry. Never a verification, never a document approval. */
export type ReadinessMissingCode = "name" | "declared_skills" | "work_evidence";

/** One manager-kept checklist row: its stored key and label, verbatim. */
export interface ReadinessChatItem {
  readonly key: string;
  readonly label: string;
}

/**
 * One assigned person's readiness, exactly as the operations page shows it:
 * the derived reason codes, the manager-maintained checklist rows that are
 * still `needed` / `missing` (their stored labels, verbatim), the rows that
 * are `rejected` / `expired`, and the checked/total ratio of REAL rows.
 * No document CONTENT crosses here — only the checklist the manager keeps.
 */
export interface ReadinessChatWorker {
  readonly workerProfileId: string;
  readonly name: string;
  readonly ready: boolean;
  readonly missing: readonly ReadinessMissingCode[];
  readonly itemsMissing: readonly ReadinessChatItem[];
  readonly itemsBlocked: readonly ReadinessChatItem[];
  /** Rows the manager marked received but not yet checked — the review step (§12). */
  readonly itemsReceived: readonly ReadinessChatItem[];
  readonly checked: number;
  readonly total: number;
  readonly operationalStatus: OperationalStatus | null;
  /** The person's newest answer in the instruction thread AFTER the latest instruction on this project; null = none yet. */
  readonly reply: { readonly text: string; readonly at: string } | null;
}

export interface ReadinessChatProjectOption {
  readonly projectId: string;
  readonly title: string;
  readonly status: ProjectStatus | null;
}

export type ProjectReadinessChatResult =
  | {
      readonly kind: "ok";
      readonly projectId: string;
      readonly title: string;
      readonly workers: readonly ReadinessChatWorker[];
      readonly workerTotal: number;
      readonly readyCount: number;
      /** Any checklist row exists on this project at all (0/0 = nothing tracked yet). */
      readonly checklistTracked: boolean;
    }
  | { readonly kind: "ask"; readonly projects: readonly ReadinessChatProjectOption[] }
  | { readonly kind: "not-found"; readonly projects: readonly ReadinessChatProjectOption[] }
  | { readonly kind: "empty" }
  | { readonly kind: "no-company" }
  | { readonly kind: "error" };
