import type { WorkTaskStatus } from "@/lib/tasks/task-model";

/** How many of the company's projects the chat scans for open tasks. */
export const TASKS_CHAT_PROJECT_SCAN_LIMIT = 10;
/** How many open tasks the chat keeps (nearest due first, as the reads order). */
export const TASKS_CHAT_LIMIT = 60;

/** One OPEN task as the chat may name it — the same row the tasks page lists. */
export interface ChatOpenTask {
  readonly taskId: string;
  readonly title: string;
  readonly status: WorkTaskStatus;
  readonly projectId: string | null;
  readonly projectTitle: string | null;
  /** Assigned to me or created by me (the "my tasks" read said so). */
  readonly mine: boolean;
}

export type OpenTasksChatResult =
  | { readonly kind: "ok"; readonly tasks: readonly ChatOpenTask[] }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };
