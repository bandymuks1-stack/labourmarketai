import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { WorkerAchievementEntry } from "./worker-achievements-model";

/**
 * Read service for the user's own achievements + declared certificates —
 * worker_achievements from DRAFT migration 20260714160000 (human-gated, NOT
 * applied yet). Owner-scoped via RLS (profile_id = auth.uid()).
 *
 * Graceful degradation: 42P01/PGRST205 → `needs-migration` (honest section
 * state, never a fake empty list, never an SSR crash).
 */

const NOT_APPLIED_CODES = new Set(["42P01", "PGRST205"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type WorkerAchievementsRead =
  | { kind: "ok"; entries: WorkerAchievementEntry[] }
  | { kind: "needs-migration" }
  | { kind: "unauthenticated" };

export async function getOwnWorkerAchievements(): Promise<WorkerAchievementsRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  const { data, error } = await asAny(supabase)
    .from("worker_achievements")
    .select(
      "id, title, description, achieved_at, achievement_type_slug, confirmed_by_manager",
    )
    .eq("profile_id", user.id)
    .order("achieved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (NOT_APPLIED_CODES.has(error.code)) return { kind: "needs-migration" };
    console.error(
      "[worker-achievements] read failed:",
      error.code,
      error.message,
    );
    return { kind: "ok", entries: [] };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    achieved_at: string | null;
    achievement_type_slug: string;
    confirmed_by_manager: boolean | null;
  }>;

  return {
    kind: "ok",
    entries: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      achievedAt: r.achieved_at,
      achievementTypeSlug: r.achievement_type_slug,
      confirmedByManager: r.confirmed_by_manager === true,
    })),
  };
}
