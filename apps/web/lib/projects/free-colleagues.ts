import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listManagedWorkers } from "@/lib/instructions/instructions";
import { findWorkersFreeInWindow } from "@/lib/planning/worker-reservation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/**
 * ALTERNATIVES — roster colleagues confirmed free across the same dates.
 * Never throws and never blocks: any failure is simply "no alternatives
 * listed", which is what the product said before this step existed.
 */
export async function freeColleagues(
  supabase: SupabaseClient,
  assignedProfileId: string,
  projectId: string,
  window: { startDate: string | null; endDate: string | null },
): Promise<{ profileId: string; name: string }[]> {
  try {
    const roster = (await listManagedWorkers()).filter((w) => w.profileId !== assignedProfileId);
    if (roster.length === 0) return [];
    const { data: rows } = await asAny(supabase)
      .from("workers")
      .select("id, profile_id")
      .in(
        "profile_id",
        roster.map((w) => w.profileId),
      );
    const idByProfile = new Map<string, string>(
      ((rows ?? []) as { id: string; profile_id: string }[]).map((r) => [r.profile_id, r.id]),
    );
    const free = new Set(
      await findWorkersFreeInWindow({
        workerIds: [...idByProfile.values()],
        window,
        exclude: [projectId],
      }),
    );
    return roster
      .filter((w) => {
        const id = idByProfile.get(w.profileId);
        return id ? free.has(id) : false;
      })
      .slice(0, 5);
  } catch (error) {
    console.error("[projects] free colleagues failed:", error);
    return [];
  }
}
