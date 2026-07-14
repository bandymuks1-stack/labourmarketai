import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { WorkerEducationEntry } from "./worker-education-model";

/**
 * Read service for the user's own self-declared education entries —
 * worker_education from DRAFT migration 20260714160000 (human-gated, NOT
 * applied yet). Owner-scoped: RLS restricts to profile_id = auth.uid().
 *
 * Graceful degradation: until the owner applies the draft the table answers
 * 42P01 (or PGRST205) — surfaced as `kind: "needs-migration"` so the section
 * explains itself honestly instead of crashing SSR or faking an empty list.
 */

const NOT_APPLIED_CODES = new Set(["42P01", "PGRST205"]);

// worker_education is not in the generated Database type until the draft is
// applied and `pnpm db:types` runs — cast at the boundary (repo convention).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type WorkerEducationRead =
  | { kind: "ok"; entries: WorkerEducationEntry[] }
  | { kind: "needs-migration" }
  | { kind: "unauthenticated" };

export async function getOwnWorkerEducation(): Promise<WorkerEducationRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  const { data, error } = await asAny(supabase)
    .from("worker_education")
    .select(
      "id, institution_name, program_or_field, education_type_slug, start_year, end_year, is_current, note",
    )
    .eq("profile_id", user.id)
    .order("end_year", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (error) {
    if (NOT_APPLIED_CODES.has(error.code)) return { kind: "needs-migration" };
    console.error("[worker-education] read failed:", error.code, error.message);
    return { kind: "ok", entries: [] };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    institution_name: string;
    program_or_field: string | null;
    education_type_slug: string;
    start_year: number | null;
    end_year: number | null;
    is_current: boolean | null;
    note: string | null;
  }>;

  return {
    kind: "ok",
    entries: rows.map((r) => ({
      id: r.id,
      institutionName: r.institution_name,
      programOrField: r.program_or_field,
      educationTypeSlug: r.education_type_slug,
      startYear: r.start_year,
      endYear: r.end_year,
      isCurrent: r.is_current === true,
      note: r.note,
    })),
  };
}
