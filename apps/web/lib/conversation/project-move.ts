"use server";

import "server-only";

import { getEmployerWorkerAvailability, unavailabilityOverlaps } from "@/lib/planning/employer-availability";
import { deriveProjectReadinessRatio } from "@/lib/projects/operations-centre-model";
import { getProjectOperations } from "@/lib/projects/operations";
import { loadProjectsForResult } from "@/lib/projects/project-workspace";
import { DEFAULT_READINESS_ITEM_KEYS } from "@/lib/projects/readiness-items";
import { OPEN_WORK_TASK_STATUSES } from "@/lib/tasks/task-model";
import { listProjectTasks } from "@/lib/tasks/tasks";

import type { MoveOptionsResult, MoveProjectOption, MoveWhatIfResult, MoveWorkerOption } from "./project-move-contract";

/** Bounded: the what-if reads every project's operations once. */
const MOVE_PROJECT_LIMIT = 12;

/**
 * §11 (owner contract 2026-09-04): "MOVE PERSON PROJECT X → PROJECT Y — show
 * consequences on BOTH sides; only confirmation changes canonical state."
 *
 * The options: the company's projects (the SAME list the panel shows) and
 * every ACTIVE assignment on them, read through the operations centre's own
 * read (`getProjectOperations`, RLS-scoped: a project the caller may not
 * manage answers null and is skipped). No new table, no cached roster.
 */
export async function loadProjectMoveOptionsForChat(): Promise<MoveOptionsResult> {
  const list = await loadProjectsForResult();
  if (list.kind === "no-company-context") return { kind: "no-company" };
  if (list.kind === "blocked") return { kind: "unavailable" };
  if (list.kind === "empty") return { kind: "ok", workers: [], projects: [] };

  const projects: MoveProjectOption[] = [];
  const workers: MoveWorkerOption[] = [];
  for (const row of list.projects.slice(0, MOVE_PROJECT_LIMIT)) {
    const ops = await getProjectOperations(row.projectId);
    if (!ops) continue;
    projects.push({
      projectId: row.projectId,
      title: row.title,
      city: ops.project.city,
      country: ops.project.country,
      headcount: ops.workers.length,
      startDate: ops.project.startDate,
      endDate: ops.project.endDate,
    });
    for (const w of ops.workers) {
      workers.push({
        workerProfileId: w.workerProfileId,
        workerId: w.workerId,
        name: w.name,
        projectId: row.projectId,
        projectTitle: row.title,
      });
    }
  }
  return { kind: "ok", workers, projects };
}

/**
 * The consequences of moving ONE person from project X to project Y, each
 * from a canonical read the operations centre already performs:
 *   - headcount on both sides (active assignments ± 1);
 *   - the person's OPEN work packages on X (`listProjectTasks`, assignee) —
 *     they are not reassigned by a move, so the manager sees what stays;
 *   - the per-project readiness checklist: X's checked/total for this person,
 *     Y's starts empty (the default item set);
 *   - unavailability spans overlapping Y's dates (the employer leave model);
 *   - whether the country changes (document requirements differ by country).
 * Nothing is written. A source that does not answer yields null, said as such.
 */
export async function loadProjectMoveWhatIfForChat(input: {
  workerProfileId: string;
  fromProjectId: string;
  toProjectId: string;
}): Promise<MoveWhatIfResult> {
  const workerProfileId = String(input.workerProfileId ?? "").trim();
  const fromProjectId = String(input.fromProjectId ?? "").trim();
  const toProjectId = String(input.toProjectId ?? "").trim();
  if (!workerProfileId || !fromProjectId || !toProjectId || fromProjectId === toProjectId) {
    return { kind: "not-found" };
  }

  const [from, to] = await Promise.all([getProjectOperations(fromProjectId), getProjectOperations(toProjectId)]);
  if (!from || !to) return { kind: "unavailable" };
  const worker = from.workers.find((w) => w.workerProfileId === workerProfileId);
  if (!worker) return { kind: "not-found" };
  const alreadyThere = to.workers.some((w) => w.workerProfileId === workerProfileId);

  const [tasks, availability] = await Promise.all([listProjectTasks(fromProjectId), getEmployerWorkerAvailability()]);
  const openTasksForWorker =
    tasks.status === "ok"
      ? tasks.tasks.filter(
          (t) =>
            (OPEN_WORK_TASK_STATUSES as readonly string[]).includes(t.status) &&
            t.assigneeProfileId === workerProfileId,
        ).length
      : 0;

  const ratio = deriveProjectReadinessRatio([worker]);

  let unavailabilitySpans: number | null = null;
  if (availability.status === "ok" && to.project.startDate && to.project.endDate) {
    const window = { startDate: to.project.startDate, endDate: to.project.endDate };
    unavailabilitySpans = availability.unavailability.filter(
      (u) => u.workerId === worker.workerId && unavailabilityOverlaps(window, u.item),
    ).length;
  }

  return {
    kind: "ok",
    whatIf: {
      workerName: worker.name,
      workerProfileId,
      from: {
        projectId: fromProjectId,
        title: from.project.title ?? "",
        country: from.project.country,
        headcountBefore: from.workers.length,
        headcountAfter: Math.max(0, from.workers.length - 1),
        openTasksForWorker,
        readinessChecked: ratio.checked,
        readinessTotal: ratio.total,
      },
      to: {
        projectId: toProjectId,
        title: to.project.title ?? "",
        country: to.project.country,
        headcountBefore: to.workers.length,
        headcountAfter: alreadyThere ? to.workers.length : to.workers.length + 1,
        startDate: to.project.startDate,
        endDate: to.project.endDate,
        readinessTotal: DEFAULT_READINESS_ITEM_KEYS.length,
        unavailabilitySpans,
      },
      countryChanges: (from.project.country ?? null) !== (to.project.country ?? null),
    },
  };
}
