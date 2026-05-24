"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Soft cap — keeps the column from accidentally absorbing a whole novel. */
const MAX_PROFILE_TEXT_LEN = 4000;

/**
 * Persist the registered user's free-text self-description into the
 * owner-only `profiles.profile_text` column (migration 0014). This is the
 * text the user wrote in the text-first composer — the *claim* (§3 of the
 * core-loop spec), not a verified fact. Suggestions extracted from it remain
 * separate (`worker_skills`) and require per-card confirm.
 *
 * IMPORTANT — privacy posture:
 *   - profiles RLS is owner-only (id = auth.uid()), so this narrative is
 *     never visible to employers/agencies/companies/managers/teams.
 *   - We deliberately do NOT mirror the text into `workers.bio` or
 *     `workers.headline` — those columns are readable by every employer via
 *     `workers_select` (0001), so they remain reserved for explicit
 *     professional summaries the user authors with full knowledge of who
 *     can see them. That UI is a separate slice.
 */
export async function saveWorkerProfileText(rawText: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const trimmed = (rawText ?? "").trim();
  if (trimmed.length === 0) throw new Error("Empty text");
  const profileText = trimmed.slice(0, MAX_PROFILE_TEXT_LEN);

  const { error } = await supabase
    .from("profiles")
    .update({ profile_text: profileText })
    .eq("id", user.id);
  if (error) {
    console.error("[profile] save profile_text failed:", error.message);
    throw new Error(`save failed: ${error.message}`);
  }

  // Profile read model is server-rendered; revalidate so the next navigation
  // sees the prefilled composer.
  revalidatePath("/", "layout");
}
