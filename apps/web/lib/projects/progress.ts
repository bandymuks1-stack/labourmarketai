import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { deriveProjectProgress, type ProjectProgress } from "./progress-model";

/**
 * Project progress read-model (train D) — DERIVED at read time from the two
 * real execution stores, never persisted:
 *
 *   - work_tasks   linked to the project (done vs open, cancelled excluded);
 *   - project_stages (done vs planned/in_progress/blocked, cancelled
 *     excluded).
 *
 * No stored "progress" number exists anywhere — the value can never drift
 * from the truth because it IS the truth, recomputed per render (the
 * capacity/derived-spine precedent). RLS scopes every read to what the
 * caller may see; a store that is absent or unreadable contributes zero
 * counts and the UI simply shows "no measurable progress yet".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_LIMIT = 1000;

export type { ProjectProgress } from "./progress-model";

/** Per-project progress for a bounded set of projects — ONE query per
 *  store, grouped in memory. Missing stores degrade to zero counts. */
export async function getProjectsProgress(
  projectIds: readonly string[],
): Promise<Readonly<Record<string, ProjectProgress>>> {
  const ids = projectIds.filter((id) => UUID_RX.test(id)).slice(0, 100);
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const [tasksRes, stagesRes] = await Promise.all([
    asAny(supabase)
      .from("work_tasks")
      .select("project_id, status")
      .in("project_id", ids)
      .limit(READ_LIMIT),
    asAny(supabase)
      .from("project_stages")
      .select("project_id, status")
      .in("project_id", ids)
      .limit(READ_LIMIT),
  ]);

  type SlimRow = { project_id: string | null; status: string };
  const taskRows: SlimRow[] = tasksRes.error ? [] : ((tasksRes.data ?? []) as SlimRow[]);
  const stageRows: SlimRow[] = stagesRes.error
    ? []
    : ((stagesRes.data ?? []) as SlimRow[]);

  const out: Record<string, ProjectProgress> = {};
  for (const id of ids) {
    out[id] = deriveProjectProgress(
      taskRows.filter((r) => r.project_id === id).map((r) => r.status),
      stageRows.filter((r) => r.project_id === id).map((r) => r.status),
    );
  }
  return out;
}
