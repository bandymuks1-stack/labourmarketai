"use server";

import "server-only";

import { listMyDocuments } from "@/lib/documents/readiness";
import { listWorkerInstructions } from "@/lib/instructions/instructions";
import { getOwnWorkerId, listOwnReadinessItems, listWorkerProjects } from "@/lib/projects/worker-project-access";

import { deriveWorkerProjectAsks, firstRecordableAsk, type WorkerProjectAsk } from "@/lib/conversation/worker-project-asks";
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
 * §12 — what each project still needs from THIS person: the manager's open
 * checklist rows for the person (`listOwnReadinessItems`, the person's own
 * rows under `pwri_select`) joined with the person's own documents
 * (`listMyDocuments`, the documents page's read) by the readiness-item →
 * document-type map. Two bounded reads more; an unavailable read leaves the
 * asks empty — it never invents a need or a document.
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
    let asks: Map<string, WorkerProjectAsk[]> = new Map();
    const instructions = new Map<string, { conversationId: string; authorName: string | null; text: string }>();
    if (activeIds.length > 0) {
      try {
        const workerId = await getOwnWorkerId();
        const [items, docs] = await Promise.all([
          workerId ? listOwnReadinessItems(workerId, activeIds) : Promise.resolve([]),
          listMyDocuments(),
        ]);
        if (items.length > 0) {
          asks = deriveWorkerProjectAsks(items, docs.kind === "ok" ? docs.documents : [], new Date());
          // The manager's instruction per project — the instructions page's
          // own read (RLS: only threads the person participates in), newest
          // first; the first row per project is the latest instruction.
          const read = await listWorkerInstructions();
          if (read.kind === "ok") {
            for (const ins of read.instructions) {
              if (ins.projectId && !instructions.has(ins.projectId)) {
                instructions.set(ins.projectId, { conversationId: ins.conversationId, authorName: ins.authorName, text: ins.originalText.split("\n")[0].slice(0, 160) });
              }
            }
          }
        }
      } catch {
        /* asks stay empty — a failed read never invents a need */
      }
    }
    const projects = shown.map((r) => ({
      projectId: r.projectId,
      title: r.title?.trim() || "—",
      place: [r.city, r.country].filter(Boolean).join(", ") || null,
      assignmentStatus: r.assignmentStatus,
      asks: asks.get(r.projectId) ?? [],
      instruction: instructions.get(r.projectId) ?? null,
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
