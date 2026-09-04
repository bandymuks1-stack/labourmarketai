/**
 * The WORKER's own projects, for the chat (owner contract 2026-09-04 §11 —
 * "where people are assigned", from the person's side). Types + constants
 * only (a "use server" module exports async functions alone).
 */
export const WORKER_PROJECTS_CHAT_LIMIT = 5;

export interface WorkerChatProject {
  readonly projectId: string;
  readonly title: string;
  readonly place: string | null;
  readonly assignmentStatus: "active" | "ended";
}

export type WorkerProjectsChatResult =
  | { readonly kind: "ok"; readonly projects: readonly WorkerChatProject[]; readonly activeCount: number }
  | { readonly kind: "empty" }
  | { readonly kind: "error" };
