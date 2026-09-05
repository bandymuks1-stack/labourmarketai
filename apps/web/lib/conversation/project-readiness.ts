"use server";

import "server-only";

import { getProjectOperations } from "@/lib/projects/operations";
import { deriveReadinessRatio } from "@/lib/projects/operations-centre-model";
import { loadProjectsForResult } from "@/lib/projects/project-workspace";
import { listProjectInstructionReplies, type InstructionReply } from "@/lib/instructions/instructions";

import {
  READINESS_CHAT_ASK_LIMIT,
  READINESS_CHAT_ITEM_LIMIT,
  READINESS_CHAT_WORKER_LIMIT,
  type ProjectReadinessChatResult,
  type ReadinessChatProjectOption,
  type ReadinessChatWorker,
  type ReadinessMissingCode,
} from "@/lib/conversation/project-readiness-contract";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_CODES: readonly ReadinessMissingCode[] = ["name", "declared_skills", "work_evidence"];

/**
 * "Kas trūksta projektui X?" / "ar komanda pasiruošusi?" (owner contract §11
 * READINESS, §12 documents first-class, §16 continue after the gap). The
 * project is the one the sentence names among the company's LIVE projects
 * (`loadProjectsForResult`); one live project needs no name; several without
 * a name → ask. The answer is the operations centre's OWN per-person read
 * (`getProjectOperations`, RLS-scoped: a project the caller may not manage
 * returns null → not-found): derived reason codes, the manager-kept checklist
 * rows still needed / missing (labels verbatim), the rejected / expired
 * rows, checked/total. No ranking, no score, no write.
 */
export async function loadProjectReadinessForChat(input: {
  projectId: string | null;
  sentence: string;
}): Promise<ProjectReadinessChatResult> {
  const projects = await loadProjectsForResult();
  if (projects.kind === "no-company-context") return { kind: "no-company" };
  if (projects.kind === "empty") return { kind: "empty" };
  if (projects.kind !== "projects") return { kind: "error" };
  const live: ReadinessChatProjectOption[] = projects.projects
    .filter((p) => p.status !== "completed")
    .map((p) => ({ projectId: p.projectId, title: p.title, status: p.status }));
  if (live.length === 0) return { kind: "empty" };

  let projectId = input.projectId && UUID_RX.test(input.projectId) ? input.projectId : null;
  if (!projectId) {
    const lower = input.sentence.toLowerCase();
    const named = live.filter((p) => p.title.length >= 3 && lower.includes(p.title.toLowerCase()));
    if (named.length === 1) projectId = named[0].projectId;
    else if (named.length > 1) return { kind: "ask", projects: named.slice(0, READINESS_CHAT_ASK_LIMIT) };
    else if (live.length === 1) projectId = live[0].projectId;
    else return { kind: "ask", projects: live.slice(0, READINESS_CHAT_ASK_LIMIT) };
  }

  try {
    const ops = await getProjectOperations(projectId);
    if (!ops) return { kind: "not-found", projects: live.slice(0, READINESS_CHAT_ASK_LIMIT) };
    // The people's answers in the instruction threads (the instruction channel's own read; empty on failure).
    const replies = await listProjectInstructionReplies(projectId).catch(() => new Map<string, InstructionReply>());
    const workers: ReadinessChatWorker[] = ops.workers.map((w) => {
      const ratio = deriveReadinessRatio(w.readinessItems);
      return {
        workerProfileId: w.workerProfileId,
        name: w.name,
        ready: w.ready && w.docsMissing === 0 && w.docsBlocked === 0,
        missing: w.missing.filter((c): c is ReadinessMissingCode => (MISSING_CODES as readonly string[]).includes(c)),
        itemsMissing: w.readinessItems
          .filter((i) => i.status === "needed" || i.status === "missing")
          .map((i) => ({ key: i.itemKey, label: i.label }))
          .slice(0, READINESS_CHAT_ITEM_LIMIT),
        itemsReceived: w.readinessItems
          .filter((i) => i.status === "received")
          .map((i) => ({ key: i.itemKey, label: i.label }))
          .slice(0, READINESS_CHAT_ITEM_LIMIT),
        itemsBlocked: w.readinessItems
          .filter((i) => i.status === "rejected" || i.status === "expired")
          .map((i) => ({ key: i.itemKey, label: i.label }))
          .slice(0, READINESS_CHAT_ITEM_LIMIT),
        checked: ratio.checked,
        total: ratio.total,
        operationalStatus: w.operationalStatus,
        reply: (() => { const r = replies.get(w.workerProfileId); return r ? { text: r.text, at: r.at } : null; })(),
      };
    });
    // the people who still need something first, then by name — the order the
    // question is really asking for; nothing is scored
    workers.sort((a, b) => (a.ready === b.ready ? a.name.localeCompare(b.name) : a.ready ? 1 : -1));
    return {
      kind: "ok",
      projectId,
      title: ops.project.title?.trim() || live.find((p) => p.projectId === projectId)?.title || "—",
      workers: workers.slice(0, READINESS_CHAT_WORKER_LIMIT),
      workerTotal: workers.length,
      readyCount: workers.filter((w) => w.ready).length,
      checklistTracked: ops.workers.some((w) => w.readinessItems.length > 0),
    };
  } catch {
    return { kind: "error" };
  }
}
