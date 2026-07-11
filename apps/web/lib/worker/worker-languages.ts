import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  parseWorkerLanguage,
  parseWorkerLanguageLevel,
  WORKER_LANGUAGES,
  type WorkerLanguageEntry,
} from "./worker-languages-model";

/**
 * Read service for the worker's own self-stated languages — the
 * worker_languages table from DRAFT migration 20260711250000 (PR #720 —
 * human-gated, NOT applied yet). Owner-scoped: reads ONLY the signed-in
 * worker's own rows (worker_id resolved from the caller's workers row; RLS
 * additionally enforces can_view_worker).
 *
 * Graceful degradation: until the owner applies the draft migration the
 * table does not exist and PostgREST answers 42P01 — we surface
 * `kind: "needs-migration"` so the section explains itself honestly instead
 * of crashing SSR or rendering a fake empty list.
 */

const RELATION_NOT_FOUND_CODE = "42P01";

// worker_languages is not in the generated Database type until the draft is
// applied and `pnpm db:types` runs — cast at the boundary, same pattern as
// lib/worker/availability-prefs.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type WorkerLanguagesRead =
  | { kind: "ok"; languages: WorkerLanguageEntry[] }
  | { kind: "needs-migration" }
  | { kind: "no-worker" };

/** Load the signed-in worker's own saved languages (self-stated). */
export async function getOwnWorkerLanguages(): Promise<WorkerLanguagesRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return { kind: "no-worker" };

  const { data, error } = await asAny(supabase)
    .from("worker_languages")
    .select("lang, level")
    .eq("worker_id", worker.id);

  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) {
      return { kind: "needs-migration" };
    }
    console.error("[worker-languages] read failed:", error.code, error.message);
    // Unknown read failure: render the section empty rather than crash the
    // page — writes go through the RPCs, which report their own honest state.
    return { kind: "ok", languages: [] };
  }

  const rows = (data ?? []) as Array<{ lang: string | null; level: string | null }>;
  const languages = rows
    .map((r) => {
      // Validate against the closed vocabularies — a drifted DB value is
      // dropped rather than rendered as an unknown chip.
      const lang = parseWorkerLanguage(r.lang);
      const level = parseWorkerLanguageLevel(r.level);
      return lang && level ? { lang, level } : null;
    })
    .filter((e): e is WorkerLanguageEntry => e !== null)
    // Stable canonical order (the closed set's order), independent of insert order.
    .sort(
      (a, b) => WORKER_LANGUAGES.indexOf(a.lang) - WORKER_LANGUAGES.indexOf(b.lang),
    );

  return { kind: "ok", languages };
}
