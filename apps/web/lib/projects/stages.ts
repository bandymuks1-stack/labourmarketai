import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Project stages read model (Wagon 6 — Project Operations Core, slice 1).
 *
 * Ordered sub-phases of the EXISTING project spine (`projects`) — the new
 * `project_stages` table (migration 20260718140000). Managers read every stage
 * of a project they manage (canonical `can_manage_project`); an actively
 * assigned worker reads read-only. Writes are RPC-only (manager-gated
 * SECURITY DEFINER). No fabricated progress percentage — a stage carries only
 * real status + real dates.
 *
 * Honest degradation: while the owner-gated migration is unapplied the read
 * sees 42P01 and returns { applied: false } — the panel then shows the honest
 * "not yet available" state and NOTHING is faked.
 */

import {
  STAGE_STATUSES,
  isStageStatus,
  type ProjectStage,
  type ProjectStagesData,
  type StageStatus,
} from "@/lib/projects/stages-model";

export {
  STAGE_STATUSES,
  isStageStatus,
  type ProjectStage,
  type ProjectStagesData,
  type StageStatus,
} from "@/lib/projects/stages-model";

const RELATION_NOT_FOUND_CODE = "42P01";
const UNDEFINED_COLUMN_CODE = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export async function listProjectStages(
  projectId: string,
): Promise<ProjectStagesData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const res = await asAny(supabase)
    .from("project_stages")
    .select(
      "id, name, stage_order, status, planned_start, planned_end, actual_start, actual_end, blocked_reason, completion_criteria",
    )
    .eq("project_id", projectId)
    .order("stage_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  if (res.error) {
    if (
      res.error.code === RELATION_NOT_FOUND_CODE ||
      res.error.code === UNDEFINED_COLUMN_CODE
    ) {
      return { applied: false };
    }
    return { applied: true, stages: [], error: res.error.message };
  }

  type Row = {
    id: string;
    name: string;
    stage_order: number | null;
    status: string;
    planned_start: string | null;
    planned_end: string | null;
    actual_start: string | null;
    actual_end: string | null;
    blocked_reason: string | null;
    completion_criteria: string | null;
  };

  const stages: ProjectStage[] = ((res.data ?? []) as Row[])
    .filter((r) => isStageStatus(r.status))
    .map((r) => ({
      id: r.id,
      name: r.name,
      stageOrder: r.stage_order ?? 0,
      status: r.status as StageStatus,
      plannedStart: r.planned_start,
      plannedEnd: r.planned_end,
      actualStart: r.actual_start,
      actualEnd: r.actual_end,
      blockedReason: r.blocked_reason,
      completionCriteria: r.completion_criteria,
    }));

  return { applied: true, stages, error: null };
}
