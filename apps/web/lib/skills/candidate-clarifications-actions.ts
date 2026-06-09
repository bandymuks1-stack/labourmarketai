"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { normalizeSkillLabel } from "@/lib/skills/candidate-skills";

/**
 * Candidate skill clarification write action (slice skill-clarify-capture-v1).
 * Owner-scoped via RLS — the upsert carries profile_id = auth.uid(); the RLS
 * with-check enforces it (no SECURITY DEFINER needed). No fabrication: blanks
 * stay null; nothing is verified or AI-mapped.
 */

const UNDEFINED_TABLE = "42P01";

export type ClarificationActionResult =
  | { ok: true }
  | { ok: false; code: "auth" | "invalid" | "needs_migration" | "error" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function saveCandidateClarificationAction(
  _prev: ClarificationActionResult | null,
  formData: FormData,
): Promise<ClarificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const label = String(formData.get("label") ?? "").trim();
  if (label.length === 0) return { ok: false, code: "invalid" };
  const normalized = normalizeSkillLabel(label);
  const clean = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length > 0 ? v.slice(0, 500) : null;
  };

  const { error } = await asAny(supabase)
    .from("skill_candidate_clarifications")
    .upsert(
      {
        profile_id: user.id,
        label: label.slice(0, 200),
        normalized_label: normalized,
        related_to: clean("related_to"),
        tools_materials: clean("tools_materials"),
        often_with: clean("often_with"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,normalized_label" },
    );

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, code: "needs_migration" };
    console.error("[skills] clarify save failed:", error.message);
    return { ok: false, code: "error" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
