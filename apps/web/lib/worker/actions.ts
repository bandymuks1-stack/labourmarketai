"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeSelfDeclaredProfession,
  recordableInputLanguage,
} from "@/lib/worker/self-declared-profession";

/**
 * Set the current worker's PRIMARY profession. PR #5 removed profession
 * collection from onboarding, so this is now where a worker chooses it
 * (prerequisite for the profession-scoped skills picker). Demotes any existing
 * primary first so the single-primary invariant holds, then upserts the chosen
 * row. RLS (`owns_worker`) ensures a user can only touch their own worker.
 */
/**
 * Set the PRIMARY profession from a catalogue SLUG the person confirmed in
 * the text-first flow (2026-09-17 fast path to matchability). The slug is
 * resolved against the active `professions` catalogue server-side; an
 * unknown slug is a no-op that returns false, never an insert of a guess.
 * Everything else is `setPrimaryProfession`.
 */
export async function setPrimaryProfessionBySlug(slug: string): Promise<boolean> {
  if (typeof slug !== "string" || !/^[a-z0-9_]{2,64}$/.test(slug)) return false;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("professions")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  const id = (row as { id?: string } | null)?.id ?? null;
  if (!id) return false;
  await setPrimaryProfession(id);
  return true;
}

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

async function currentWorkerId() {
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
  return { supabase, workerId: worker.id };
}

/**
 * Add an ADDITIONAL work direction (is_primary = false). The first choice is
 * never a lock (§1): a worker can hold several directions and declare skills
 * from each. Idempotent — does nothing if the row already exists. Does NOT
 * touch the primary.
 */
export async function addWorkerDirection(professionId: string): Promise<void> {
  const { supabase, workerId } = await currentWorkerId();
  const { data: existing } = await supabase
    .from("worker_professions")
    .select("id")
    .eq("worker_id", workerId)
    .eq("profession_id", professionId)
    .maybeSingle();
  if (existing) return;
  const { error } = await supabase
    .from("worker_professions")
    .insert({ worker_id: workerId, profession_id: professionId, is_primary: false });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/**
 * Remove a work direction. Refuses to remove the PRIMARY (switch primary
 * first). The worker's saved skills are NOT deleted — they persist independently.
 */
export async function removeWorkerDirection(professionId: string): Promise<void> {
  const { supabase, workerId } = await currentWorkerId();
  const { data: row } = await supabase
    .from("worker_professions")
    .select("id, is_primary")
    .eq("worker_id", workerId)
    .eq("profession_id", professionId)
    .maybeSingle();
  if (!row) return;
  if (row.is_primary) throw new Error("Cannot remove the primary direction");
  const { error } = await supabase
    .from("worker_professions")
    .delete()
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/**
 * ── THE PERSON'S OWN WORDS, on their profile ───────────────────────────────
 *
 * Onboarding tells people "Vėliau galėsite jas papildyti" and the profile has
 * to keep that promise (Codex P1 on #1880): without a writer here the words
 * could only ever be entered once, in the first minutes of an account, and a
 * failed insert or a later change had no route back. The registry directions
 * above cannot serve this — they take a catalogue id, which is exactly what a
 * profession the registry does not carry has no way of producing.
 *
 * Same table, same `worker_professions_write` policy (`owns_worker`), no new
 * grant and no new RPC. The words are stored verbatim; `normalized_label` is
 * GENERATED in the database and never written here.
 */
export async function addOwnProfession(
  formData: FormData,
): Promise<{ ok: boolean; reason?: "invalid" | "duplicate" | "failed" }> {
  const words = normalizeSelfDeclaredProfession(
    formData.get("label") as string | null,
  );
  if (!words) return { ok: false, reason: "invalid" };
  // The language of THIS session, submitted by the form — never detected from
  // the words, never defaulted (SEP-7).
  const language = recordableInputLanguage(formData.get("locale") as string | null);
  const { supabase, workerId } = await currentWorkerId();
  const { error } = await supabase
    .from("worker_professions")
    .insert({ worker_id: workerId, label: words, original_language: language });
  if (error) {
    // 23505 = they already hold these words; nothing is lost and nothing to do.
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    console.error("[addOwnProfession] insert failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, reason: "failed" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Remove ONE self-declared profession, by its own row id. Scoped to the
 * caller's worker and to rows that actually carry words, so this can never
 * reach a registry direction (those have their own removal path, which keeps
 * the primary and the skills attached to it).
 */
export async function removeOwnProfession(rowId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(rowId)) return;
  const { supabase, workerId } = await currentWorkerId();
  const { error } = await supabase
    .from("worker_professions")
    .delete()
    .eq("id", rowId)
    .eq("worker_id", workerId)
    .not("label", "is", null);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
