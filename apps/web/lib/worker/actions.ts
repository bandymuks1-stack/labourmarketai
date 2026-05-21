"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Set the current worker's PRIMARY profession. PR #5 removed profession
 * collection from onboarding, so this is now where a worker chooses it
 * (prerequisite for the profession-scoped skills picker). Demotes any existing
 * primary first so the single-primary invariant holds, then upserts the chosen
 * row. RLS (`owns_worker`) ensures a user can only touch their own worker.
 */
export async function setPrimaryProfession(professionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) throw new Error("No worker profile");

  // Demote current primary/primaries first (avoids any single-primary clash).
  await supabase
    .from("worker_professions")
    .update({ is_primary: false })
    .eq("worker_id", worker.id);

  const { data: existing } = await supabase
    .from("worker_professions")
    .select("id")
    .eq("worker_id", worker.id)
    .eq("profession_id", professionId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("worker_professions")
      .update({ is_primary: true })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("worker_professions")
      .insert({ worker_id: worker.id, profession_id: professionId, is_primary: true });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/", "layout");
}
