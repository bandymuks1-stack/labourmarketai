import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Job/project handover passport shell (product-tree branch 19, train §8.8).
 *
 * The passport is an APPEND-ONLY record of real handover facts on the
 * EXISTING project spine (migration 20260705230000): manager notes and
 * DECLARED status stages. It reads ONLY the new project_handover_entries
 * table — responsible workers/company come from the operations view the
 * page already loads (project_worker_assignments), and the checklist stays
 * the EXISTING per-worker readiness checklist on the same page. No booking
 * system, no project system, no payment anything is duplicated here.
 *
 * Honest degradation: while the owner-gated migration is not applied, the
 * read sees 42P01 (relation missing) and reports { applied: false } — the
 * operations page then shows the shell's "not yet available" state and no
 * passport data is faked.
 *
 * Privacy: the read path is MANAGER-ONLY by RLS (can_manage_project). This
 * module additionally never selects the author column — no profile ids, no
 * contact fields ever leave the read service.
 */

import {
  HANDOVER_STATUSES,
  type HandoverEntry,
  type HandoverPassportData,
  type HandoverStatus,
} from "@/lib/projects/handover-passport-model";

export {
  HANDOVER_STATUSES,
  type HandoverEntry,
  type HandoverPassportData,
  type HandoverStatus,
} from "@/lib/projects/handover-passport-model";

const RELATION_NOT_FOUND_CODE = "42P01";
const UNDEFINED_COLUMN_CODE = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * Passport read model for one project. RLS scopes every row to a manager of
 * that project (or admin); a non-manager simply reads zero rows.
 */
export async function getHandoverPassport(
  projectId: string,
): Promise<HandoverPassportData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const res = await asAny(supabase)
    .from("project_handover_entries")
    .select("id, entry_type, status_value, body, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (res.error) {
    if (
      res.error.code === RELATION_NOT_FOUND_CODE ||
      res.error.code === UNDEFINED_COLUMN_CODE
    ) {
      return { applied: false };
    }
    return { applied: true, entries: [], declaredStatus: null, error: res.error.message };
  }

  type Row = {
    id: string;
    entry_type: string;
    status_value: string | null;
    body: string | null;
    created_at: string;
  };

  const entries: HandoverEntry[] = [];
  for (const r of (res.data ?? []) as Row[]) {
    if (r.entry_type !== "note" && r.entry_type !== "status") continue;
    const statusValue =
      r.status_value &&
      (HANDOVER_STATUSES as readonly string[]).includes(r.status_value)
        ? (r.status_value as HandoverStatus)
        : null;
    if (r.entry_type === "status" && statusValue === null) continue;
    entries.push({
      id: r.id,
      entryType: r.entry_type,
      statusValue,
      body: r.body ?? null,
      createdAt: r.created_at,
    });
  }

  const latestStatus = entries.find((e) => e.entryType === "status");
  return {
    applied: true,
    entries,
    declaredStatus: latestStatus?.statusValue ?? null,
    error: null,
  };
}
