/**
 * The WORKER's own projects, for the chat (owner contract 2026-09-04 §11 —
 * "where people are assigned", from the person's side). Types + constants
 * only (a "use server" module exports async functions alone).
 */
import type { WorkerProjectAsk } from "@/lib/conversation/worker-project-asks";

export const WORKER_PROJECTS_CHAT_LIMIT = 5;

export interface WorkerChatProject {
  readonly projectId: string;
  readonly title: string;
  readonly place: string | null;
  readonly assignmentStatus: "active" | "ended";
  /** The manager's open checklist rows for THIS person on this project,
   *  joined with the person's own documents (§12: what the project still
   *  needs from me). Empty when nothing is open or nothing is tracked. */
  readonly asks: readonly WorkerProjectAsk[];
}

export type WorkerProjectsChatResult =
  | {
      readonly kind: "ok";
      readonly projects: readonly WorkerChatProject[];
      readonly activeCount: number;
      /** The first ask the person can close by recording a document: the chip. */
      readonly recordable: { readonly documentTypeSlug: string; readonly label: string } | null;
    }
  | { readonly kind: "empty" }
  | { readonly kind: "error" };
