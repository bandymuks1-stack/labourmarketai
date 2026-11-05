"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  classifyEducationError,
  EDUCATION_COLUMNS,
  EDUCATION_MAX_ROWS,
  educationEntryFromRow,
  findSameEducation,
  validateEducationInput,
  type WorkerEducationEntry,
} from "./worker-education-model";

/**
 * Server actions for self-declared education entries. Writes go through the
 * owner-only RLS on worker_education (DRAFT migration 20260714160000 —
 * APPLIED, ledger `20260716195418`): direct inserts/updates/deletes are permitted
 * ONLY on the caller's own rows (profile_id = auth.uid(), enforced by the
 * insert/update WITH CHECK policies).
 *
 * Tagged returns (never throw across the server-action boundary), same
 * convention as worker-languages-actions.ts. Until the owner applies the
 * draft the DB answers 42P01/PGRST205 → "needs_migration".
 */

export type WorkerEducationActionResult =
  | { ok: true; id?: string; entry?: WorkerEducationEntry }
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
    const { data: ownRows, error: ownError } = await asAny(supabase)
      .from("worker_education")
      .select(EDUCATION_COLUMNS)
      .eq("profile_id", user.id);
    if (ownError) return mapError(ownError.code);
    const own = ((ownRows ?? []) as Parameters<typeof educationEntryFromRow>[0][]).map(educationEntryFromRow);
    // Already stated: the save answers with that row, it does not store it twice.
    const already = findSameEducation(own, input);
    if (already) return { ok: true, id: already.id, entry: already };
    // App-side row cap (the table itself has no cap).
    if (own.length >= EDUCATION_MAX_ROWS) return { ok: false, code: "limit" };

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
      .select(EDUCATION_COLUMNS)
      .single();
    if (error) {
      const mapped = mapError(error.code);
      if (mapped.ok === false && mapped.code === "error") {
        console.error("[worker-education] insert failed:", error.code, error.message);
      }
      return mapped;
    }
    revalidatePath("/", "layout");
    const entry = educationEntryFromRow(data as Parameters<typeof educationEntryFromRow>[0]);
    return { ok: true, id: entry.id, entry };
  }

  const { data: updated, error } = await asAny(supabase)
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
    .eq("profile_id", user.id)
    .select(EDUCATION_COLUMNS)
    .maybeSingle();
  if (error) {
    const mapped = mapError(error.code);
    if (mapped.ok === false && mapped.code === "error") {
      console.error("[worker-education] update failed:", error.code, error.message);
    }
    return mapped;
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    id,
    entry: updated ? educationEntryFromRow(updated as Parameters<typeof educationEntryFromRow>[0]) : undefined,
  };
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
