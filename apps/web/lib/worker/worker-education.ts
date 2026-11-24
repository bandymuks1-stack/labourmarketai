import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  EDUCATION_COLUMNS,
  educationEntryFromRow,
  type WorkerEducationEntry,
} from "./worker-education-model";

/**
 * Read service for the user's own self-declared education entries —
 * `worker_education`, **APPLIED in production 2026-07-16** (ledger
 * `20260716195418`, verified against `schema_migrations` on 2026-09-07; 4 real
 * rows). Owner-scoped: RLS restricts to `profile_id = auth.uid()`.
 *
 * This header said "DRAFT ... NOT applied yet" for seven weeks after the
 * migration shipped, and that sentence is why the capability kept being
 * re-reported as missing. Apply status belongs to the database, not to a
 * comment: read `supabase_migrations.schema_migrations` (or
 * `docs/migrations/production-ledger-snapshot.json`) before believing any
 * line like the one this replaced.
 *
 * Graceful degradation is KEPT, not because the table is missing here, but
 * because it may be on a fresh or local database: 42P01 (or PGRST205) is
 * surfaced as `kind: "needs-migration"` so the section explains itself instead
 * of crashing SSR or faking an empty list.
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
    .select(EDUCATION_COLUMNS)
    .eq("profile_id", user.id)
    .order("end_year", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (error) {
    if (NOT_APPLIED_CODES.has(error.code)) return { kind: "needs-migration" };
    console.error("[worker-education] read failed:", error.code, error.message);
    return { kind: "ok", entries: [] };
  }

  return {
    kind: "ok",
    entries: ((data ?? []) as Parameters<typeof educationEntryFromRow>[0][]).map(educationEntryFromRow),
  };
}
