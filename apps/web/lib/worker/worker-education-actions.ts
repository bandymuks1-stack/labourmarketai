"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  classifyEducationError,
  EDUCATION_MAX_ROWS,
  validateEducationInput,
} from "./worker-education-model";

/**
 * Server actions for self-declared education entries. Writes go through the
 * owner-only RLS on worker_education (DRAFT migration 20260714160000 —
 * human-gated, NOT applied yet): direct inserts/updates/deletes are permitted
 * ONLY on the caller's own rows (profile_id = auth.uid(), enforced by the
 * insert/update WITH CHECK policies).
 *
 * Tagged returns (never throw across the server-action boundary), same
 * convention as worker-languages-actions.ts. Until the owner applies the
 * draft the DB answers 42P01/PGRST205 → "needs_migration".
 */

export type WorkerEducationActionResult =
  | { ok: true; id?: string }
  | {
      ok: false;
      code: "needs_migration" | "unauthenticated" | "invalid" | "limit" | "error";
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

function mapError(code: string | undefined): WorkerEducationActionResult {
  const mapped = classifyEducationError(code);
  if (mapped === "error" && (code === "23514" || code === "23503")) {
    // CHECK / FK violation — bad input the model validation should have
    // caught; still an input problem, not a system failure.
    return { ok: false, code: "invalid" };
  }
  return { ok: false, code: mapped };
}

function readInput(formData: FormData) {
  return validateEducationInput({
    institutionName: String(formData.get("institution_name") ?? ""),
    programOrField: String(formData.get("program_or_field") ?? ""),
    educationTypeSlug: String(formData.get("education_type_slug") ?? ""),
    startYear: String(formData.get("start_year") ?? ""),
    endYear: String(formData.get("end_year") ?? ""),
    isCurrent: String(formData.get("is_current") ?? "") === "on" ||
      String(formData.get("is_current") ?? "") === "true",
    note: String(formData.get("note") ?? ""),
  });
}

export async function saveWorkerEducationAction(
  _prev: WorkerEducationActionResult | null,
  formData: FormData,
): Promise<WorkerEducationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const input = readInput(formData);
  if (!input) return { ok: false, code: "invalid" };

  const id = String(formData.get("id") ?? "").trim();

  if (id === "") {
    // App-side row cap (the table itself has no cap).
    const { count, error: countError } = await asAny(supabase)
      .from("worker_education")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id);
    if (countError) return mapError(countError.code);
    if ((count ?? 0) >= EDUCATION_MAX_ROWS) return { ok: false, code: "limit" };

    const { data, error } = await asAny(supabase)
      .from("worker_education")
      .insert({
        profile_id: user.id,
        institution_name: input.institutionName,
        program_or_field: input.programOrField,
        education_type_slug: input.educationTypeSlug,
        start_year: input.startYear,
        end_year: input.endYear,
        is_current: input.isCurrent,
        note: input.note,
      })
      .select("id")
      .single();
    if (error) {
      const mapped = mapError(error.code);
      if (mapped.ok === false && mapped.code === "error") {
        console.error("[worker-education] insert failed:", error.code, error.message);
      }
      return mapped;
    }
    revalidatePath("/", "layout");
    return { ok: true, id: (data as { id: string } | null)?.id };
  }

  const { error } = await asAny(supabase)
    .from("worker_education")
    .update({
      institution_name: input.institutionName,
      program_or_field: input.programOrField,
      education_type_slug: input.educationTypeSlug,
      start_year: input.startYear,
      end_year: input.endYear,
      is_current: input.isCurrent,
      note: input.note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) {
    const mapped = mapError(error.code);
    if (mapped.ok === false && mapped.code === "error") {
      console.error("[worker-education] update failed:", error.code, error.message);
    }
    return mapped;
  }
  revalidatePath("/", "layout");
  return { ok: true, id };
}

export async function removeWorkerEducationAction(
  _prev: WorkerEducationActionResult | null,
  formData: FormData,
): Promise<WorkerEducationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const id = String(formData.get("id") ?? "").trim();
  if (id === "") return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase)
    .from("worker_education")
    .delete()
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) {
    const mapped = mapError(error.code);
    if (mapped.ok === false && mapped.code === "error") {
      console.error("[worker-education] delete failed:", error.code, error.message);
    }
    return mapped;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
