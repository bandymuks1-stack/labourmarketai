"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  classifyLanguagesError,
  parseWorkerLanguage,
  parseWorkerLanguageLevel,
} from "./worker-languages-model";

/**
 * Server actions for the worker's self-stated languages. The ONLY write paths
 * are the two owner-scoped SECURITY DEFINER RPCs from DRAFT migration
 * 20260711250000 (PR #720 — human-gated, NOT applied yet):
 *   * save_worker_language_v1(p_lang, p_level) — upsert one language;
 *   * remove_worker_language_v1(p_lang) — remove one language.
 * Both re-validate the closed vocabularies server-side and touch only the
 * caller's own rows. No direct table writes exist anywhere.
 *
 * Until the owner applies the draft, the DB answers 42883/PGRST202/42P01 —
 * classified as "needs_migration" so the UI can say honestly that the section
 * is not enabled yet and nothing was saved.
 *
 * Tagged returns (never throw across the server-action boundary — Next.js
 * prod strips thrown Error messages), same convention as
 * lib/worker/availability-prefs-actions.ts.
 */

export type WorkerLanguageActionResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "needs_migration"
        | "unauthenticated"
        | "no_worker"
        | "invalid"
        | "error";
    };

// The RPCs are not in the generated Database type until the draft is applied
// and `pnpm db:types` runs — cast at the boundary (same pattern as
// availability-prefs-actions.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

function classify(code: string | undefined): WorkerLanguageActionResult {
  const mapped = classifyLanguagesError(code);
  if (mapped === "error" && code === "22023") {
    // 22023 is the RPC's own closed-set rejection — an input problem.
    return { ok: false, code: "invalid" };
  }
  return { ok: false, code: mapped };
}

export async function saveWorkerLanguageAction(
  _prev: WorkerLanguageActionResult | null,
  formData: FormData,
): Promise<WorkerLanguageActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const lang = parseWorkerLanguage(String(formData.get("lang") ?? ""));
  const level = parseWorkerLanguageLevel(String(formData.get("level") ?? ""));
  if (!lang || !level) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("save_worker_language_v1", {
    p_lang: lang,
    p_level: level,
  });

  if (error) {
    const result = classify(error.code);
    if (result.ok === false && result.code === "error") {
      console.error("[worker-languages] save failed:", error.code, error.message);
    }
    return result;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeWorkerLanguageAction(
  _prev: WorkerLanguageActionResult | null,
  formData: FormData,
): Promise<WorkerLanguageActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const lang = parseWorkerLanguage(String(formData.get("lang") ?? ""));
  if (!lang) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("remove_worker_language_v1", {
    p_lang: lang,
  });

  if (error) {
    const result = classify(error.code);
    if (result.ok === false && result.code === "error") {
      console.error("[worker-languages] remove failed:", error.code, error.message);
    }
    return result;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
