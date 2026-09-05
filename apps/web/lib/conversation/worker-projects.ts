"use server";

import "server-only";

import { firstRecordableAsk } from "@/lib/projects/worker-project-asks";
import { listWorkerProjects, loadOwnProjectAsks } from "@/lib/projects/worker-project-access";

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
 *
 * §12 — what each project still needs from THIS person: the ONE domain read
 * the instructions page renders too (`loadOwnProjectAsks`: the manager's
 * open checklist rows for the person, the person's own documents, the
 * manager's latest instruction per project). A failed read leaves the asks
 * empty — it never invents a need or a document.
 */
export async function loadWorkerProjectsForChat(): Promise<WorkerProjectsChatResult> {
  try {
    const rows = await listWorkerProjects();
    if (rows.length === 0) return { kind: "empty" };
    const shown = rows
      .slice()
      .sort((a, b) => (a.assignmentStatus === b.assignmentStatus ? 0 : a.assignmentStatus === "active" ? -1 : 1))
      .slice(0, WORKER_PROJECTS_CHAT_LIMIT);
    const activeIds = shown.filter((r) => r.assignmentStatus === "active").map((r) => r.projectId);
    const own = await loadOwnProjectAsks(activeIds).catch(() => new Map());
    const projects = shown.map((r) => ({
      projectId: r.projectId,
      title: r.title?.trim() || "—",
      place: [r.city, r.country].filter(Boolean).join(", ") || null,
      assignmentStatus: r.assignmentStatus,
      asks: own.get(r.projectId)?.asks ?? [],
      instruction: own.get(r.projectId)?.instruction ?? null,
    }));
    const firstProject = projects.find((p) => firstRecordableAsk([p.asks]) !== null) ?? null;
    const first = firstProject ? firstRecordableAsk([firstProject.asks]) : null;
    return {
      kind: "ok",
      projects,
      activeCount: rows.filter((r) => r.assignmentStatus === "active").length,
      recordable:
        first && first.documentTypeSlug && firstProject
          ? { documentTypeSlug: first.documentTypeSlug, label: first.label, projectId: firstProject.projectId }
          : null,
    };
  } catch {
    return { kind: "error" };
  }
}
