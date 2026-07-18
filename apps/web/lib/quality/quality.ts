import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  isCorrectionOutcome,
  isDefectCategory,
  isDefectSeverity,
  isDefectStatus,
  type Defect,
  type DefectCorrection,
  type ProjectDefectsData,
} from "@/lib/quality/quality-model";

/**
 * Delivery & Quality read model (Wagon 11). Defects for one project (RLS: the
 * project's manager, the reporter, or admin) plus each defect's correction
 * records. Honest degradation on a missing relation.
 */

export * from "@/lib/quality/quality-model";

const RELATION_NOT_FOUND = "42P01";
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function getProjectDefects(projectId: string): Promise<ProjectDefectsData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const dRes = await asAny(supabase)
    .from("defects")
    .select("id, category, severity, description, location, status, due_date")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (dRes.error) {
    if (dRes.error.code === RELATION_NOT_FOUND || dRes.error.code === UNDEFINED_COLUMN) {
      return { applied: false };
    }
    return { applied: true, defects: [] };
  }

  type DRow = { id: string; category: string; severity: string; description: string; location: string | null; status: string; due_date: string | null };
  const rows = ((dRes.data ?? []) as DRow[]).filter(
    (r) => isDefectCategory(r.category) && isDefectSeverity(r.severity) && isDefectStatus(r.status),
  );

  // Corrections for the visible defects (one query).
  const ids = rows.map((r) => r.id);
  const correctionsByDefect = new Map<string, DefectCorrection[]>();
  if (ids.length > 0) {
    const cRes = await asAny(supabase)
      .from("defect_corrections")
      .select("id, defect_id, work_performed, materials, outcome, completed_at")
      .in("defect_id", ids)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (!cRes.error) {
      type CRow = { id: string; defect_id: string; work_performed: string; materials: string | null; outcome: string; completed_at: string | null };
      for (const c of (cRes.data ?? []) as CRow[]) {
        if (!isCorrectionOutcome(c.outcome)) continue;
        const list = correctionsByDefect.get(c.defect_id) ?? [];
        list.push({
          id: c.id,
          workPerformed: c.work_performed,
          materials: c.materials,
          outcome: c.outcome,
          completedAt: c.completed_at,
        });
        correctionsByDefect.set(c.defect_id, list);
      }
    }
  }

  const defects: Defect[] = rows.map((r) => ({
    id: r.id,
    category: r.category as Defect["category"],
    severity: r.severity as Defect["severity"],
    description: r.description,
    location: r.location,
    status: r.status as Defect["status"],
    dueDate: r.due_date,
    corrections: correctionsByDefect.get(r.id) ?? [],
  }));

  return { applied: true, defects };
}
