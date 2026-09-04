"use server";

import "server-only";

import { listWorkerProjects } from "@/lib/projects/worker-project-access";

import {
  WORKER_PROJECTS_CHAT_LIMIT,
  type WorkerProjectsChatResult,
} from "@/lib/conversation/worker-projects-contract";

/**
 * The WORKER's own projects, for the chat (owner contract 2026-09-04 §11 —
 * "where people are assigned", from the person's side). Prod walk 2026-09-05:
 * an assigned worker typing "mano projektai" was told "you are in the
 * personal space, no company projects here" — true for an employer, wrong
 * for a worker whose assignment is real. The SAME read the worker's project
 * page uses (`listWorkerProjects`, RLS-scoped to the worker's own
 * assignments); no ranking, no write, capped for display.
 */
export async function loadWorkerProjectsForChat(): Promise<WorkerProjectsChatResult> {
  try {
    const rows = await listWorkerProjects();
    if (rows.length === 0) return { kind: "empty" };
    const projects = rows
      .slice()
      .sort((a, b) => (a.assignmentStatus === b.assignmentStatus ? 0 : a.assignmentStatus === "active" ? -1 : 1))
      .slice(0, WORKER_PROJECTS_CHAT_LIMIT)
      .map((r) => ({
        projectId: r.projectId,
        title: r.title?.trim() || "—",
        place: [r.city, r.country].filter(Boolean).join(", ") || null,
        assignmentStatus: r.assignmentStatus,
      }));
    return { kind: "ok", projects, activeCount: rows.filter((r) => r.assignmentStatus === "active").length };
  } catch {
    return { kind: "error" };
  }
}
