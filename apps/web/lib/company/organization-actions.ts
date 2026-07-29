"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getOwnedOrganizations } from "@/lib/company/owned-organizations";
import {
  ACTIVE_WORKSPACE_COOKIE,
  getWorkspaceContext,
} from "@/lib/company/active-organization";

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

  // App-level membership check first — a foreign org id never reaches the
  // DB or the cookie. EVERY membership counts (owner audit P0.1): owned
  // organizations AND active engagement memberships — the same list the
  // workspace chip renders, so a row it offers can always be switched to.
  const [owned, workspace] = await Promise.all([
    getOwnedOrganizations(),
    getWorkspaceContext(null),
  ]);
  const isMember =
    (owned.kind === "ok" &&
      owned.organizations.some((o) => o.id === organizationId)) ||
    workspace.workspaces.some(
      (w) => w.kind === "organization" && w.id === organizationId,
    );
  if (!isMember) {
    return { ok: false, code: "not-member" };
  }

  // The SERVER-SIDE session pointer (owner audit P0.1): an httpOnly cookie,
  // set only after membership validation, read back server-side on every
  // request. This makes switching REAL today; the owner-gated migration
  // 20260714210000 adds the durable cross-device pointer on top of it.
  const jar = await cookies();
  jar.set(ACTIVE_WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  const { error } = await asAny(supabase)
    .from("profiles")
    .update({ active_organization_id: organizationId })
    .eq("id", user.id);
  if (error && error.code !== UNDEFINED_COLUMN_CODE) {
    if (error.code === NOT_MEMBER_CODE) {
      // The DB trigger disagrees with the app-level check — trust the DB and
      // roll the session pointer back.
      jar.delete(ACTIVE_WORKSPACE_COOKIE);
      return { ok: false, code: "not-member" };
    }
    console.error("[switchActiveOrganization] update failed", {
      code: error.code,
      message: error.message,
    });
    jar.delete(ACTIVE_WORKSPACE_COOKIE);
    return { ok: false, code: "error" };
  }
  // 42703 (column not applied yet) is NOT a failure any more: the validated
  // session pointer is set, so the switch is real for this session.

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Switch back to the PERSONAL workspace (real-user workflow rebuild W1) —
 * clears the active-organization pointer. Same honest degradation contract as
 * switchActiveOrganization: while the owner-gated migration is unapplied the
 * UPDATE fails with 42703 → { ok: false, code: "needs-migration" } and
 * nothing is faked client-side.
 */
export async function clearActiveOrganization(): Promise<SwitchOrganizationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not-authenticated" };

  // Session pointer first — clearing it returns this session to the
  // personal workspace immediately, migration or not (owner audit P0.1).
  const jar = await cookies();
  jar.delete(ACTIVE_WORKSPACE_COOKIE);

  const { error } = await asAny(supabase)
    .from("profiles")
    .update({ active_organization_id: null })
    .eq("id", user.id);
  if (error && error.code !== UNDEFINED_COLUMN_CODE) {
    console.error("[clearActiveOrganization] update failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, code: "error" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
