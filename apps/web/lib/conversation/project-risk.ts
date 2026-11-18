"use server";

import "server-only";

import { loadProjectDetailForResult, loadProjectsForResult } from "@/lib/projects/project-workspace";
import { loadProjectScanDetails } from "@/lib/projects/project-scan";
import type { ProjectListRow, ProjectScanDetailResult } from "@/lib/projects/project-result-contract";

import {
  PROJECT_RISK_SCAN_LIMIT,
  type ProjectRiskChatResult,
  type ProjectRiskRow,
} from "@/lib/conversation/project-risk-contract";

/**
 * "Kuris projektas rizikoje?" (owner contract §4A / §11 / §16 — PROGRESS /
 * READINESS / RISK by sentence, and matching that continues after a gap).
 * The company's projects (`loadProjectsForResult`) and, for each, the SAME
 * detail read the project panel performs (`loadProjectDetailForResult`:
 * roster, pulse, stages) — nothing computed twice, nothing written. Projects
 * that are finished are left out; the rest are ordered by how many real
 * signals they carry, most first. Bounded.
 */
export async function loadProjectRiskForChat(): Promise<ProjectRiskChatResult> {
  return scanProjectRisk((scanned) => Promise.all(scanned.map((p) => loadProjectDetailForResult(p.projectId))));
}

/**
 * The SAME answer for the company home's project field (perf 2026-10-22):
 * identical rows, built by the same derivation below, but every scanned
 * project's roster, teams, checklist, tasks and stages are read in ONE batched
 * read each (`loadProjectScanDetails`) instead of one full panel detail read
 * per project — the per-project fan-out that made a large organization's
 * company home take 13–24 s.
 */
export async function loadProjectRiskForHome(): Promise<ProjectRiskChatResult> {
  return scanProjectRisk((scanned) => loadProjectScanDetails(scanned));
}

async function scanProjectRisk(
  readDetails: (scanned: readonly ProjectListRow[]) => Promise<readonly ProjectScanDetailResult[]>,
): Promise<ProjectRiskChatResult> {
  const projects = await loadProjectsForResult();
  if (projects.kind === "no-company-context") return { kind: "no-company" };
  if (projects.kind === "empty") return { kind: "empty" };
  if (projects.kind !== "projects") return { kind: "error" };
  try {
    const live = projects.projects.filter((p) => p.status !== "completed");
    if (live.length === 0) return { kind: "empty" };
    const scanned = live.slice(0, PROJECT_RISK_SCAN_LIMIT);
    const details = await readDetails(scanned);
    const rows: ProjectRiskRow[] = [];
    scanned.forEach((p, i) => {
      const d = details[i];
      if (!d || d.kind !== "project") return;
      const pr = d.project;
      const pulse = pr.pulse;
      const stagesBlocked = pr.stages === null ? null : pr.stages.filter((s) => s.status === "blocked").length;
      const nobodyOnLiveProject = pr.status === "live" && pr.assignmentTotal === 0;
      // Documents are not a project risk score (decision 0021 extension,
      // 2026-10-24): the count of people with rows a manager marked missing
      // is still SHOWN (workersWithMissingDocs below), never summed into the
      // order.
      const signals =
        (pulse ? pulse.tasksOverdue : 0) +
        (stagesBlocked ?? 0) +
        (nobodyOnLiveProject ? 1 : 0);
      rows.push({
        projectId: pr.projectId,
        title: pr.title,
        status: pr.status,
        people: pr.assignmentTotal,
        pulseKnown: pulse !== null,
        tasksOpen: pulse?.tasksOpen ?? 0,
        tasksOverdue: pulse?.tasksOverdue ?? 0,
        stagesBlocked,
        workersWithMissingDocs: pulse?.workersWithMissingDocs ?? 0,
        readinessChecked: pulse?.readinessChecked ?? 0,
        readinessTotal: pulse?.readinessTotal ?? 0,
        nobodyOnLiveProject,
        signals,
        // QA Q-3: already read above (the panel's detail read) — carried, not re-read.
        stages: pr.stages,
        stageTotal: pr.stageTotal,
        peopleNames: pr.assignments.map((a) => a.name),
      });
    });
    rows.sort((a, b) => b.signals - a.signals || a.title.localeCompare(b.title));
    return { kind: "ok", rows, total: live.length };
  } catch {
    return { kind: "error" };
  }
}
