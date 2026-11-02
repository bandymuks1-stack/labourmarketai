import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readTeamAssignedPeople, type TeamAssignedPersonRow } from "@/lib/projects/assigned-people";
import { assignedPeopleOf, toProjectAssignments, type AssignmentRow } from "@/lib/projects/projects";
import {
  composeProjectOperations,
  opsAssignmentsOf,
  readActiveAssignmentRowsForProjects,
  readReadinessItemsForProjects,
  toOpsAssignmentRows,
} from "@/lib/projects/operations";
import { deriveProjectReadinessRatio } from "@/lib/projects/operations-centre-model";
import { listProjectStagesForProjects } from "@/lib/projects/stages";
import type { ProjectStagesData } from "@/lib/projects/stages-model";
import { listProjectTasksForProjects } from "@/lib/tasks/tasks";
import { isOverdue, OPEN_WORK_TASK_STATUSES } from "@/lib/tasks/task-model";
import {
  PROJECT_ASSIGNMENT_LIMIT,
  PROJECT_STAGE_LIMIT,
  type ProjectListRow,
  type ProjectScanDetail,
  type ProjectScanDetailResult,
  type ProjectStageRow,
} from "@/lib/projects/project-result-contract";

/**
 * THE BATCHED PROJECT SCAN (perf 2026-10-22) — the company home's project
 * field and its risk ordering, for every scanned project at ONCE.
 *
 * The scan used to run the project panel's full detail read once per project
 * (`loadProjectDetailForResult`: header row, authority, roster, teams,
 * readiness, statuses, checklist, instruction count, professions, today's
 * entries, gallery, tasks, stages — about a dozen round trips per project,
 * six projects deep). On a large organization that was the 13–24 s company
 * home. This reads the SAME sources with one `.in(project_id, ids)` read each
 * — roster, teams, checklist, tasks, stages — and builds each project's answer
 * with the SAME pure rules the per-project readers use
 * (`toProjectAssignments` + `assignedPeopleOf` for the people,
 * `toOpsAssignmentRows` + `opsAssignmentsOf` + `composeProjectOperations` +
 * `deriveProjectReadinessRatio` for the checklist numbers, the same task and
 * stage mapping). Nothing the scan does not show is read: the authority
 * check, the gallery, today's entries and the professions feed only the
 * project PANEL, which keeps its own per-project read.
 *
 * Honest degradation stays PER PROJECT and identical to the detail read:
 *   - an unreadable roster/team read fails the projects (the detail read
 *     answered "blocked"); the scan then leaves them out, exactly as before;
 *   - an unreadable checklist or task read makes the pulse UNKNOWN (null),
 *     never a zero; a missing stage store is `null` stages, not `[]`;
 *   - a batched read that is not provably complete (row cap) falls back to the
 *     per-project read inside its own reader.
 *
 * `scanned` are rows of `loadProjectsForResult` — already the caller's own,
 * RLS-readable projects of the acting organization; their title and status
 * are the same columns the detail read's header row carries.
 */
export async function loadProjectScanDetails(
  scanned: readonly ProjectListRow[],
): Promise<ProjectScanDetailResult[]> {
  if (scanned.length === 0) return [];
  const blocked = (): ProjectScanDetailResult[] => scanned.map(() => ({ kind: "blocked" }));
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return blocked();

    const ids = scanned.map((p) => p.projectId);
    // ONE wave: every source the scan shows, for every project.
    const [rosterRows, team, itemsRead, tasksRead, stagesRead] = await Promise.all([
      readActiveAssignmentRowsForProjects(supabase, ids),
      // Teams stay PER PROJECT (in parallel — still this one wave): the team
      // reader's bounds (500 assignments, member RPC pages, the 1,000-row
      // response cap) apply to the project set it is given, so one batched
      // call over six large teams could silently drop people and show a
      // staffed project as unstaffed. Per project, each keeps exactly the
      // bounds the detail read had.
      Promise.all(ids.map((id) => readTeamAssignedPeople(supabase, [id]))).then((parts) => parts.flat()),
      // A thrown checklist / task read is an UNKNOWN pulse, not a failed scan.
      readReadinessItemsForProjects(supabase, ids).catch(() => null),
      listProjectTasksForProjects(ids).catch(() => null),
      listProjectStagesForProjects(ids).catch(() => null),
    ]);

    return scanned.map((p): ProjectScanDetailResult => {
      const rows = rosterRows.get(p.projectId);
      const rawRoster = rows && !rows.error ? (rows.data ?? []) : [];
      const project: ProjectScanDetail = {
        projectId: p.projectId,
        title: p.title,
        status: p.status,
        ...people(p.projectId, rawRoster, team),
        ...stagesOf(stagesRead?.get(p.projectId)),
        pulse: pulseOf(p, rawRoster, team, itemsRead, tasksRead),
      };
      return { kind: "project", project };
    });
  } catch {
    // A thrown roster / team read: the detail read answered "blocked".
    return blocked();
  }
}

/** `listProjectAssignedPeople`, from the batched rows. */
function people(
  projectId: string,
  rawRoster: readonly unknown[],
  team: readonly TeamAssignedPersonRow[],
): Pick<ProjectScanDetail, "assignments" | "assignmentTotal"> {
  const assigned = assignedPeopleOf(projectId, toProjectAssignments(rawRoster as AssignmentRow[]), team);
  return {
    assignments: assigned.slice(0, PROJECT_ASSIGNMENT_LIMIT),
    assignmentTotal: assigned.length,
  };
}

/** The detail read's stage rule: not applied → null; applied → the first
 *  PROJECT_STAGE_LIMIT stages and the whole count. */
function stagesOf(
  data: ProjectStagesData | undefined,
): Pick<ProjectScanDetail, "stages" | "stageTotal"> {
  if (!data || !data.applied) return { stages: null, stageTotal: null };
  const stages: ProjectStageRow[] = data.stages.slice(0, PROJECT_STAGE_LIMIT).map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    stageOrder: s.stageOrder,
    plannedStart: s.plannedStart,
    plannedEnd: s.plannedEnd,
    actualStart: s.actualStart,
    actualEnd: s.actualEnd,
    blockedReason: s.blockedReason,
  }));
  return { stages, stageTotal: data.stages.length };
}

/** The detail read's pulse numbers the scan shows — the SAME derivation as
 *  `loadProjectDetailForResult` (open / overdue tasks, the roster's checklist
 *  ratio, people with a missing document). Null whenever a source is unknown. */
function pulseOf(
  p: ProjectListRow,
  rawRoster: readonly unknown[],
  team: readonly TeamAssignedPersonRow[],
  itemsRead: Awaited<ReturnType<typeof readReadinessItemsForProjects>> | null,
  tasksRead: Awaited<ReturnType<typeof listProjectTasksForProjects>> | null,
): ProjectScanDetail["pulse"] {
  try {
    const tasks = tasksRead?.get(p.projectId);
    if (!itemsRead || !tasks || tasks.status !== "ok") return null;
    // The operations roster and its checklist — only the checklist-derived
    // numbers are read off it (they depend on nothing else), so the per-worker
    // readiness signals, statuses and instruction count the operations PAGE
    // shows are not read here.
    const ops = composeProjectOperations(
      {
        id: p.projectId,
        title: p.title,
        city: p.city,
        country: null,
        startDate: null,
        endDate: null,
        status: p.status,
      },
      opsAssignmentsOf(p.projectId, toOpsAssignmentRows(rawRoster), team),
      new Map(),
      new Map(),
      itemsRead.get(p.projectId) ?? new Map(),
      0,
    );
    const now = new Date();
    const open = tasks.tasks.filter((t) => (OPEN_WORK_TASK_STATUSES as readonly string[]).includes(t.status));
    const ratio = deriveProjectReadinessRatio(ops.workers);
    return {
      tasksOpen: open.length,
      tasksOverdue: open.filter((t) => isOverdue(t.dueAt, now)).length,
      readinessChecked: ratio.checked,
      readinessTotal: ratio.total,
      workersWithMissingDocs: ops.counters.withMissingDocs,
    };
  } catch {
    return null;
  }
}
