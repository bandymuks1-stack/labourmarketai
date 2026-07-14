"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  ACHIEVEMENTS_MAX_ROWS,
  classifyAchievementsError,
  validateAchievementInput,
} from "./worker-achievements-model";

/**
 * Server actions for self-declared achievements / declared certificates.
 * Direct table writes under owner-only RLS (worker_achievements, DRAFT
 * migration 20260714160000 — human-gated, NOT applied yet).
 *
 * HONESTY: `confirmed_by_manager` is never written here — the migration's
 * column grants exclude it, so even a crafted request cannot set it.
 *
 * Tagged returns, never throw (repo server-action convention).
 */

export type WorkerAchievementActionResult =
  | { ok: true; id?: string }
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
    const { count, error: countError } = await asAny(supabase)
      .from("worker_achievements")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id);
    if (countError) return mapError(countError.code);
    if ((count ?? 0) >= ACHIEVEMENTS_MAX_ROWS) return { ok: false, code: "limit" };

    const { data, error } = await asAny(supabase)
      .from("worker_achievements")
      .insert({
        profile_id: user.id,
        title: input.title,
        description: input.description,
        achieved_at: input.achievedAt,
        achievement_type_slug: input.achievementTypeSlug,
      })
      .select("id")
      .single();
    if (error) {
      const mapped = mapError(error.code);
      if (mapped.ok === false && mapped.code === "error") {
        console.error("[worker-achievements] insert failed:", error.code, error.message);
      }
      return mapped;
    }
    revalidatePath("/", "layout");
    return { ok: true, id: (data as { id: string } | null)?.id };
  }

  const { error } = await asAny(supabase)
    .from("worker_achievements")
    .update({
      title: input.title,
      description: input.description,
      achieved_at: input.achievedAt,
      achievement_type_slug: input.achievementTypeSlug,
    })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) {
    const mapped = mapError(error.code);
    if (mapped.ok === false && mapped.code === "error") {
      console.error("[worker-achievements] update failed:", error.code, error.message);
    }
    return mapped;
  }
  revalidatePath("/", "layout");
  return { ok: true, id };
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
