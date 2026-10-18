"use server";

import "server-only";

import { loadProjectsForResult } from "@/lib/projects/project-workspace";
import { listMyTasks, listProjectTasks } from "@/lib/tasks/tasks";
import { OPEN_WORK_TASK_STATUSES } from "@/lib/tasks/task-model";

import {
  TASKS_CHAT_LIMIT,
  TASKS_CHAT_PROJECT_SCAN_LIMIT,
  type ChatOpenTask,
  type OpenTasksChatResult,
} from "@/lib/conversation/company-tasks-contract";

/**
 * The OPEN tasks a sentence may name (owner contract §14 — WORK PERFORMED →
 * RESULT by sentence). Two canonical reads, nothing else:
 *   • `listMyTasks()` — assigned to me or created by me (the tasks page's
 *     "my tasks" view) — so a WORKER can close the task they were given;
 *   • `listProjectTasks(projectId)` for the company's projects when the
 *     person acts for a company (`loadProjectsForResult`, employer context
 *     resolved server-side; RLS scopes each project's rows to its managers).
 * Merged by id, open statuses only, bounded. No ranking; no write.
 */
export async function loadOpenTasksForChat(): Promise<OpenTasksChatResult> {
  try {
    const mine = await listMyTasks();
    if (mine.status === "needs-migration") return { kind: "needs-migration" };
    if (mine.status === "not-authed") return { kind: "error" };

    const byId = new Map<string, ChatOpenTask>();
    const isOpen = (s: string) => (OPEN_WORK_TASK_STATUSES as readonly string[]).includes(s);
    for (const t of mine.tasks) {
      if (!isOpen(t.status)) continue;
      byId.set(t.id, { taskId: t.id, title: t.title, status: t.status, projectId: t.projectId ?? null, projectTitle: null, mine: true });
    }

    const projects = await loadProjectsForResult();
    if (projects.kind === "projects") {
      const scanned = projects.projects.slice(0, TASKS_CHAT_PROJECT_SCAN_LIMIT);
      const per = await Promise.all(scanned.map(async (p) => ({ p, res: await listProjectTasks(p.projectId) })));
      for (const { p, res } of per) {
        if (res.status !== "ok") continue;
        for (const t of res.tasks) {
          if (!isOpen(t.status)) continue;
          const prev = byId.get(t.id);
          byId.set(t.id, {
            taskId: t.id,
            title: t.title,
            status: t.status,
            projectId: p.projectId,
            projectTitle: p.title,
            mine: prev?.mine ?? false,
          });
        }
      }
      // a "my task" on a scanned project gets its project title too
      const titles = new Map(scanned.map((p) => [p.projectId, p.title] as const));
      for (const [id, t] of byId) {
        if (t.projectId && !t.projectTitle && titles.has(t.projectId)) {
          byId.set(id, { ...t, projectTitle: titles.get(t.projectId) ?? null });
        }
      }
    }
    return { kind: "ok", tasks: [...byId.values()].slice(0, TASKS_CHAT_LIMIT) };
  } catch {
    return { kind: "error" };
  }
}
