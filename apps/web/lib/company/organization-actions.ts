"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getOwnedOrganizations } from "@/lib/company/owned-organizations";

/**
 * Switch the ACTIVE organization for the current profile (Company
 * Architecture Completion, Sprint v2 §5). Server-side only — the pointer is
 * `profiles.active_organization_id` (owner-gated migration 20260714210000),
 * never localStorage.
 *
 * Defense-in-depth ordering:
 *   1. app-level membership check (owned organizations, RLS-scoped);
 *   2. DB-level validation trigger (validate_active_organization) rejects
 *      any non-membership value even if this action is bypassed.
 *
 * Honest degradation: while the migration is unapplied the UPDATE fails with
 * 42703 → returns { ok: false, code: "needs-migration" }; the caller keeps
 * the single-company behaviour (no fake switch).
 */

const UNDEFINED_COLUMN_CODE = "42703";
const NOT_MEMBER_CODE = "42501";

// active_organization_id ships in the owner-gated migration 20260714210000 —
// not in the generated DB types until applied (owned-organizations pattern).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type SwitchOrganizationResult =
  | { ok: true }
  | {
      ok: false;
      code: "not-authenticated" | "not-member" | "needs-migration" | "error";
    };

export async function switchActiveOrganization(
  organizationId: string,
): Promise<SwitchOrganizationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not-authenticated" };

  // App-level membership check first — a foreign org id never reaches the DB.
  const owned = await getOwnedOrganizations();
  if (
    owned.kind !== "ok" ||
    !owned.organizations.some((o) => o.id === organizationId)
  ) {
    return { ok: false, code: "not-member" };
  }

  const { error } = await asAny(supabase)
    .from("profiles")
    .update({ active_organization_id: organizationId })
    .eq("id", user.id);
  if (error) {
    if (error.code === UNDEFINED_COLUMN_CODE) {
      return { ok: false, code: "needs-migration" };
    }
    if (error.code === NOT_MEMBER_CODE) {
      return { ok: false, code: "not-member" };
    }
    console.error("[switchActiveOrganization] update failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, code: "error" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
