import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  sanitizeCardPrefs,
  type DashboardCardPrefs,
  type DashboardPreferencesContext,
} from "@/lib/dashboard/dashboard-preferences-shared";

/**
 * Server-side dashboard card preference READ (Company Architecture
 * Completion, Sprint v2 §5). Backed by the owner-gated migration
 * 20260714211000 (`dashboard_preferences`, owner-only RLS).
 *
 * Honest degradation: until the migration is applied the read fails with
 * 42P01/PGRST205 → returns { kind: "unavailable" } and the grid keeps the
 * PR #751 device-local localStorage behaviour. Nothing is faked; a missing
 * row for an onboarded table returns empty prefs (registry default order).
 */

const RELATION_NOT_FOUND_CODE = "42P01";
const POSTGREST_MISSING_TABLE_CODE = "PGRST205";

// dashboard_preferences ships in the owner-gated migration 20260714211000 —
// not in the generated DB types until applied (owned-organizations pattern).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type DashboardCardPrefsRead =
  | { kind: "ok"; prefs: DashboardCardPrefs | null }
  | { kind: "unavailable" };

export async function getDashboardCardPreferences(
  context: DashboardPreferencesContext,
): Promise<DashboardCardPrefsRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unavailable" };

  const { data, error } = await asAny(supabase)
    .from("dashboard_preferences")
    .select("preferences")
    .eq("profile_id", user.id)
    .eq("context", context)
    .maybeSingle();

  if (error) {
    // 42P01 / PGRST205 = migration unapplied; ANY other failure also
    // degrades to the local behaviour — a display preference read must
    // never break the dashboard.
    if (
      error.code !== RELATION_NOT_FOUND_CODE &&
      error.code !== POSTGREST_MISSING_TABLE_CODE
    ) {
      console.error("[getDashboardCardPreferences] read failed", {
        code: error.code,
        message: error.message,
      });
    }
    return { kind: "unavailable" };
  }

  if (!data) return { kind: "ok", prefs: null };
  const raw = (data as { preferences?: unknown }).preferences;
  const moduleCards =
    typeof raw === "object" && raw !== null
      ? (raw as { moduleCards?: unknown }).moduleCards
      : null;
  return { kind: "ok", prefs: sanitizeCardPrefs(moduleCards) };
}
