"use server";

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  fitsPreferencesByteBudget,
  isDashboardPreferencesContext,
  sanitizeCardPrefs,
} from "@/lib/dashboard/dashboard-preferences-shared";

/**
 * Server-side dashboard card preference WRITE (Company Architecture
 * Completion, Sprint v2 §5). Upserts the caller's OWN
 * `dashboard_preferences` row (owner-only RLS, migration 20260714211000).
 *
 * Defense-in-depth: the payload is sanitized to the bounded ids-only shape
 * and byte-budget-checked BEFORE the write; the DB CHECK
 * (pg_column_size <= 8192) and owner-only RLS back it up.
 *
 * Honest degradation: 42P01/PGRST205 (migration unapplied) → the caller
 * keeps device-local behaviour; the result says so instead of pretending
 * the preference persisted.
 */

const RELATION_NOT_FOUND_CODE = "42P01";
const POSTGREST_MISSING_TABLE_CODE = "PGRST205";

// dashboard_preferences is not in the generated DB types until the
// owner-gated migration is applied (owned-organizations pattern).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type SaveDashboardCardPrefsResult =
  | { ok: true }
  | {
      ok: false;
      code: "not-authenticated" | "invalid" | "unavailable" | "error";
    };

export async function saveDashboardCardPreferences(
  context: string,
  input: unknown,
): Promise<SaveDashboardCardPrefsResult> {
  if (!isDashboardPreferencesContext(context)) {
    return { ok: false, code: "invalid" };
  }
  const prefs = sanitizeCardPrefs(input);
  if (!fitsPreferencesByteBudget(prefs)) {
    return { ok: false, code: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not-authenticated" };

  const { error } = await asAny(supabase)
    .from("dashboard_preferences")
    .upsert(
      {
        profile_id: user.id,
        context,
        preferences: { moduleCards: prefs },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,context" },
    );

  if (error) {
    if (
      error.code === RELATION_NOT_FOUND_CODE ||
      error.code === POSTGREST_MISSING_TABLE_CODE
    ) {
      return { ok: false, code: "unavailable" };
    }
    console.error("[saveDashboardCardPreferences] write failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, code: "error" };
  }
  return { ok: true };
}
