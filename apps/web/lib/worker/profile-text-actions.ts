"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Soft caps — keep the column from accidentally absorbing a whole novel. */
const MAX_BIO_LEN = 4000;
const MAX_HEADLINE_LEN = 200;

/**
 * Persist the worker's free-text self-description into `workers.bio` (and the
 * first non-empty line as `headline`). This is the text the user wrote in the
 * text-first composer — the *claim*, not a verified fact (§3 of the core-loop
 * spec). Suggestions extracted from it remain separate (`worker_skills`).
 *
 * Owner-only at the DB level: workers_update RLS already restricts rows to
 * `profile_id = auth.uid()`; migration 0014 supplies the missing GRANT.
 */
export async function saveWorkerProfileText(rawText: string): Promise<void> {
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

  const trimmed = (rawText ?? "").trim();
  if (trimmed.length === 0) throw new Error("Empty text");
  const bio = trimmed.slice(0, MAX_BIO_LEN);
  const firstLine = bio.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const headline = firstLine.length > 0 ? firstLine.slice(0, MAX_HEADLINE_LEN) : null;

  const { error } = await supabase
    .from("workers")
    .update({ bio, headline })
    .eq("id", worker.id);
  if (error) {
    console.error("[worker] save profile text failed:", error.message);
    throw new Error(`save failed: ${error.message}`);
  }

  // Profile read model is server-rendered; revalidate so the next navigation
  // sees the prefilled composer.
  revalidatePath("/", "layout");
}
