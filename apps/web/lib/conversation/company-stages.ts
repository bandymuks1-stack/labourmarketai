"use server";

import "server-only";

import { loadProjectsForResult } from "@/lib/projects/project-workspace";
import { listProjectStages } from "@/lib/projects/stages";

import {
  COMPANY_STAGES_PROJECT_SCAN_LIMIT,
  type CompanyChatStage,
  type CompanyStagesChatResult,
} from "@/lib/conversation/company-stages-contract";

/**
 * The company's project stages, flat, for the chat (owner contract §11 —
 * PROGRESS by sentence). The SAME reads the project panel and the operations
 * page perform: the company's projects (`loadProjectsForResult`, employer
 * context resolved server-side) and each project's stages
 * (`listProjectStages`, RLS-scoped). Bounded; no ranking; no write.
 */
export async function loadCompanyStagesForChat(): Promise<CompanyStagesChatResult> {
  const projects = await loadProjectsForResult();
  if (projects.kind === "no-company-context") return { kind: "no-company" };
  if (projects.kind !== "projects") return projects.kind === "empty" ? { kind: "ok", stages: [] } : { kind: "error" };
  try {
    const scanned = projects.projects.slice(0, COMPANY_STAGES_PROJECT_SCAN_LIMIT);
    const per = await Promise.all(scanned.map(async (p) => ({ p, data: await listProjectStages(p.projectId) })));
    if (per.some((x) => !x.data.applied)) return { kind: "needs-migration" };
    const stages: CompanyChatStage[] = per.flatMap(({ p, data }) =>
      (data.applied ? data.stages : []).map((s) => ({
        stageId: s.id,
        name: s.name,
        status: s.status,
        projectId: p.projectId,
        projectTitle: p.title,
      })),
    );
    return { kind: "ok", stages };
  } catch {
    return { kind: "error" };
  }
}
