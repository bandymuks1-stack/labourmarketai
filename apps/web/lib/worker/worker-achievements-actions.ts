"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  ACHIEVEMENT_COLUMNS,
  ACHIEVEMENTS_MAX_ROWS,
  achievementEntryFromRow,
  classifyAchievementsError,
  findSameAchievement,
  validateAchievementInput,
  type WorkerAchievementEntry,
} from "./worker-achievements-model";

/**
 * Server actions for self-declared achievements / declared certificates.
 * Direct table writes under owner-only RLS (worker_achievements, DRAFT
 * migration 20260714160000 — APPLIED, ledger `20260716195418`).
 *
 * HONESTY: `confirmed_by_manager` is never written here — the migration's
 * column grants exclude it, so even a crafted request cannot set it.
 *
 * Tagged returns, never throw (repo server-action convention).
 */

export type WorkerAchievementActionResult =
  | { ok: true; id?: string; entry?: WorkerAchievementEntry }
  | {
      ok: false;
      code: "needs_migration" | "unauthenticated" | "invalid" | "limit" | "error";
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

function mapError(code: string | undefined): WorkerAchievementActionResult {
  const mapped = classifyAchievementsError(code);
  if (mapped === "error" && (code === "23514" || code === "23503")) {
    return { ok: false, code: "invalid" };
  }
  return { ok: false, code: mapped };
}

export async function saveWorkerAchievementAction(
  _prev: WorkerAchievementActionResult | null,
  formData: FormData,
): Promise<WorkerAchievementActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const input = validateAchievementInput({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    achievedAt: String(formData.get("achieved_at") ?? ""),
    achievementTypeSlug: String(formData.get("achievement_type_slug") ?? "achievement"),
  });
  if (!input) return { ok: false, code: "invalid" };

  const id = String(formData.get("id") ?? "").trim();

  if (id === "") {
    const { data: ownRows, error: ownError } = await asAny(supabase)
      .from("worker_achievements")
      .select(ACHIEVEMENT_COLUMNS)
      .eq("profile_id", user.id);
    if (ownError) return mapError(ownError.code);
    const own = ((ownRows ?? []) as Parameters<typeof achievementEntryFromRow>[0][]).map(achievementEntryFromRow);
    // Already stated: the save answers with that row, it does not store it twice.
    const already = findSameAchievement(own, input);
    if (already) return { ok: true, id: already.id, entry: already };
    if (own.length >= ACHIEVEMENTS_MAX_ROWS) return { ok: false, code: "limit" };

    const { data, error } = await asAny(supabase)
      .from("worker_achievements")
      .insert({
        profile_id: user.id,
        title: input.title,
        description: input.description,
        achieved_at: input.achievedAt,
        achievement_type_slug: input.achievementTypeSlug,
      })
      .select(ACHIEVEMENT_COLUMNS)
      .single();
    if (error) {
      // Another request stored the same row first: answer with that row.
      if (error.code === "23505") {
        const { data: now } = await asAny(supabase).from("worker_achievements").select(ACHIEVEMENT_COLUMNS).eq("profile_id", user.id);
        const stored = findSameAchievement(((now ?? []) as Parameters<typeof achievementEntryFromRow>[0][]).map(achievementEntryFromRow), input);
        return stored ? { ok: true, id: stored.id, entry: stored } : { ok: true };
      }
      const mapped = mapError(error.code);
      if (mapped.ok === false && mapped.code === "error") {
        console.error("[worker-achievements] insert failed:", error.code, error.message);
      }
      return mapped;
    }
    revalidatePath("/", "layout");
    const entry = achievementEntryFromRow(data as Parameters<typeof achievementEntryFromRow>[0]);
    return { ok: true, id: entry.id, entry };
  }

  const { data: updated, error } = await asAny(supabase)
    .from("worker_achievements")
    .update({
      title: input.title,
      description: input.description,
      achieved_at: input.achievedAt,
      achievement_type_slug: input.achievementTypeSlug,
    })
    .eq("id", id)
    .eq("profile_id", user.id)
    .select(ACHIEVEMENT_COLUMNS)
    .maybeSingle();
  if (error) {
    // Edited into the same words as another row: nothing changed, and it does not say saved.
    if (error.code === "23505") return { ok: false, code: "invalid" };
    const mapped = mapError(error.code);
    if (mapped.ok === false && mapped.code === "error") {
      console.error("[worker-achievements] update failed:", error.code, error.message);
    }
    return mapped;
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    id,
    entry: updated ? achievementEntryFromRow(updated as Parameters<typeof achievementEntryFromRow>[0]) : undefined,
  };
}

export async function removeWorkerAchievementAction(
  _prev: WorkerAchievementActionResult | null,
  formData: FormData,
): Promise<WorkerAchievementActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const id = String(formData.get("id") ?? "").trim();
  if (id === "") return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase)
    .from("worker_achievements")
    .delete()
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) {
    const mapped = mapError(error.code);
    if (mapped.ok === false && mapped.code === "error") {
      console.error("[worker-achievements] delete failed:", error.code, error.message);
    }
    return mapped;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
